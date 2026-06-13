"""
error_handlers.py
─────────────────
Custom FastAPI exception handlers for LearnPhish v5.

All handlers return a CONSISTENT JSON envelope:

  {
    "message":    "<human-readable string>",   ← what the frontend shows
    "error_code": "<snake_case_identifier>",   ← what the frontend switches on
    "status":     <int>,                       ← mirrors the HTTP status code
    "detail":     <str | None>                 ← optional raw detail for devs
  }

This shape is what useScanStore.parseHttpError() expects.
Every new error path MUST return this shape.

Registration in main.py
────────────────────────
    from error_handlers import register_error_handlers
    register_error_handlers(app)

Call this AFTER the app object is created but BEFORE the first endpoint is defined.
It replaces the default slowapi handler, so remove the line:
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
"""

import logging
import traceback

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger("learnphish")


# ─────────────────────────────────────────────────────────────────
# Helper — always build the same envelope shape
# ─────────────────────────────────────────────────────────────────
def _err(status: int, error_code: str, message: str, detail: str | None = None) -> JSONResponse:
    body = {"message": message, "error_code": error_code, "status": status}
    if detail:
        body["detail"] = detail
    return JSONResponse(status_code=status, content=body)


# ─────────────────────────────────────────────────────────────────
# 429 — Rate limit exceeded  (replaces slowapi's default handler)
# ─────────────────────────────────────────────────────────────────
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """
    Returns a structured 429 so the frontend can show a countdown.

    retry_after is parsed from the slowapi error string when available
    ("X per Y second" style) and falls back to 60 seconds.
    """
    retry_after = _parse_retry_after(str(exc.detail))

    response = JSONResponse(
        status_code=429,
        content={
            "message":     "Scan rate limit reached. Please wait before trying again.",
            "error_code":  "rate_limited",
            "status":      429,
            "retry_after": retry_after,
            "detail":      str(exc.detail),
        },
    )
    # RFC 7231 — Retry-After header so HTTP clients can also auto-back-off
    response.headers["Retry-After"] = str(retry_after)
    return response


def _parse_retry_after(detail: str) -> int:
    """
    Best-effort extraction of the window duration from a slowapi detail
    string like "5 per 1 second" or "200 per 1 minute".
    Falls back to 60 seconds when parsing fails.
    """
    import re
    try:
        m = re.search(r"per\s+(\d+)\s+(second|minute|hour)", detail, re.IGNORECASE)
        if not m:
            return 60
        amount, unit = int(m.group(1)), m.group(2).lower()
        multipliers = {"second": 1, "minute": 60, "hour": 3600}
        return amount * multipliers.get(unit, 1)
    except Exception:
        return 60


# ─────────────────────────────────────────────────────────────────
# 401 / 403 — Authentication / authorisation
# ─────────────────────────────────────────────────────────────────
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """
    Catches all HTTPExceptions raised anywhere in the app and wraps them
    into the standard envelope so the frontend never has to handle
    FastAPI's default {"detail": "..."} shape.
    """
    # Map known status codes to frontend-friendly error codes
    code_map = {
        400: "bad_request",
        401: "unauthorized",
        403: "unauthorized",
        404: "not_found",
        422: "invalid_url",       # Pydantic / URL validation failures
        429: "rate_limited",
        500: "server_error",
        503: "service_unavailable",
    }
    error_code = code_map.get(exc.status_code, "http_error")

    # Prefer a structured message already on the exception if it exists
    if isinstance(exc.detail, dict) and "message" in exc.detail:
        message = exc.detail["message"]
        detail  = exc.detail.get("detail")
    else:
        message = str(exc.detail)
        detail  = None

    return _err(exc.status_code, error_code, message, detail)


# ─────────────────────────────────────────────────────────────────
# 422 — Pydantic / request body validation (URL field missing, etc.)
# ─────────────────────────────────────────────────────────────────
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """
    FastAPI raises RequestValidationError when the request body fails
    Pydantic validation (e.g. URLRequest is missing the "url" field).
    The default 422 response uses {"detail": [...]} which the frontend
    doesn't know how to display — replace it with our envelope.
    """
    errors = exc.errors()
    # Pull the first field name that failed, e.g. "url"
    field = errors[0].get("loc", ["input"])[-1] if errors else "input"
    msg   = errors[0].get("msg", "Invalid input") if errors else "Invalid request body"

    return _err(
        422,
        "invalid_url",
        f"Validation error on field '{field}': {msg}",
        detail=str(errors),
    )


# ─────────────────────────────────────────────────────────────────
# 500 — Unhandled server exception (catch-all)
# ─────────────────────────────────────────────────────────────────
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Last-resort handler. Logs the full traceback and returns a clean 500
    so the frontend gets a structured error rather than a raw HTML page
    or an empty response.

    Detail (raw exception message) is included in the body so that devs
    inspecting network traffic can triage without opening logs.
    Trim if you don't want internal details leaking to production clients.
    """
    tb = traceback.format_exc()
    logger.error("Unhandled exception on %s %s:\n%s", request.method, request.url, tb)

    return _err(
        500,
        "server_error",
        "An unexpected server error occurred. Please try again.",
        detail=str(exc),   # Remove this line in production if you prefer opacity
    )


# ─────────────────────────────────────────────────────────────────
# Registration helper
# ─────────────────────────────────────────────────────────────────
def register_error_handlers(app) -> None:
    """
    Attach all custom handlers to the FastAPI app.

    Call this immediately after the app object is created:

        app = FastAPI(...)
        register_error_handlers(app)

    IMPORTANT: Remove the old line
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    from main.py — this registration replaces it.
    """
    app.add_exception_handler(RateLimitExceeded,          rate_limit_handler)
    app.add_exception_handler(HTTPException,               http_exception_handler)
    app.add_exception_handler(RequestValidationError,      validation_exception_handler)
    app.add_exception_handler(Exception,                   unhandled_exception_handler)
