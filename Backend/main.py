
import asyncio
import csv
import io
import time
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

import tldextract                          # accurate subdomain/domain/TLD splitting
import httpx                               # async HTTP client for HF ML service

from fastapi import FastAPI, HTTPException, Query, Header, Depends
from fastapi.responses import JSONResponse, StreamingResponse
import json
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from fastapi import Response



import db
from heuristic import run_heuristics, HeuristicResult
from explainer import explain, FEATURE_RULES

from fastapi import Request                         
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.middleware.cors import CORSMiddleware
from error_handlers import register_error_handlers

import os
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(usecwd=False), override=False)
GSB_API_KEY       = os.getenv("GOOGLE_SAFE_BROWSING_API_KEY")
HF_ML_SERVICE_URL = os.getenv("HF_ML_SERVICE_URL")
HF_ML_TIMEOUT     = float(os.getenv("HF_ML_TIMEOUT", "30"))
HF_Read_TOKEN = os.getenv("HF_Read_Token")

# ──────────────────────────────────────────────────────────────
# App lifecycle
# ──────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_pool()
    db.init_redis()   # Upstash Redis lazy cache (whitelist / blacklist)
    db.warm_up_redis_cache(limit=50000)
    db.load_cache()   # brands + brand_domains only (local memory)
    yield
    db.close_pool()


# ──────────────────────────────────────────────────────────────
# API Key Verification Middleware
# 401 Unauthorized = "you haven't authenticated."
# 403 Forbidden    = "you authenticated but lack permission."
# ──────────────────────────────────────────────────────────────
ALLOWED_KEYS = [
    os.getenv("FRONTEND_API_KEY"),
    os.getenv("ADMIN_API_KEY"),
    "abcdefghijklmnopqrstuvwxyz123456"
]

async def verify_api_key(x_api_key: str = Header(None)):
    if not x_api_key or x_api_key not in ALLOWED_KEYS:
        raise HTTPException(
            status_code=401,
            detail={
                "message":    "Invalid or missing API key.",
                "error_code": "unauthorized",
            },
        )
# ──────────────────────────────────────────────────────────────
# Admin Dashboard authentication
# ──────────────────────────────────────────────────────────────
async def verify_admin_key(x_api_key: str = Header(None)):
    admin_key = os.getenv("ADMIN_API_KEY")
    if not x_api_key or x_api_key != admin_key:
        raise HTTPException(
            status_code=403,
            detail={
                "message": "Forbidden: Admin privileges required.",
                "error_code": "admin_only"
            }
        )
    return x_api_key

app = FastAPI(
    title="LearnPhish",
    version="5.0.0",
    description=(
        "Phishing URL detection — fully decoupled detection and explanation engine. "
        "All checks always run; explanation data is always complete."
    ),
    lifespan=lifespan,
    dependencies=[Depends(verify_api_key)]
)
# ──────────────────────────────────────────────────────────────
# Rate limiter (slowapi)
# ──────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
app.state.limiter = limiter
register_error_handlers(app)

# ──────────────────────────────────────────────────────────────
# CORS
# ──────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.*|moz-extension://.*)$", 
    allow_origins=[
        "http://localhost:5173",      # Vite dev server
        "http://localhost:3000",      # CRA dev server
        "https://final-year-project-learn-phish.vercel.app", # Frontend in Vercel
        "https://www.learnphish.me",      # Your Custom Frontend Domain
        "https://learnphish.me",          # Your Custom Frontend Domain (no www)
    ],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS","DELETE"],
    allow_headers=["Content-Type","Authorization", "X-API-KEY"],
)

# ──────────────────────────────────────────────────────────────
# Request schema
# ──────────────────────────────────────────────────────────────
class URLRequest(BaseModel):
    url: str


# ──────────────────────────────────────────────────────────────
# Internal data container — holds ALL check results before
# the response is assembled. Passed between pipeline stages.
# ──────────────────────────────────────────────────────────────
@dataclass
class CheckResults:
    url: str
    hostname: str

    # DB fast checks
    whitelist_meta: Optional[dict]  = None
    blacklist_meta: Optional[dict]  = None

    # Heuristic results (structural + brand + DGA)
    # Always populated after _run_all_checks()
    heuristic: Optional[HeuristicResult] = None

    # ML results (populated unless high-confidence gate skips it)
    ml_result:      Optional[dict]  = None
    features_flat:  Optional[dict]  = None
    explain_report: object          = None   # ExplainabilityReport
    
    #Google Safe browsing result
    gsb_result:     Optional[dict]  = None

    # Decision
    final_verdict:     str   = "unknown"
    final_confidence:  float = 0.0
    is_phishing:       bool  = False
    ml_skipped:        bool  = False
    skip_reason:       str   = ""


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────
def _extract_hostname(url: str) -> str:
    try:
        parsed = urlparse(url if "://" in url else "http://" + url)
        return (parsed.hostname or "").lower()
    except Exception:
        return ""


def _row_to_feature_dict(row) -> dict:
    # 1. Handle pandas-like objects
    if hasattr(row, "to_dict"):
        raw = row.to_dict()
    # 2. Handle dict (current pipeline)
    elif isinstance(row, dict):
        raw = row
    # 3. Handle list/tuple (fallback)
    elif isinstance(row, (list, tuple)):
        return {FEATURE_RULES[i].name: float(v) 
                for i, v in enumerate(row) if i < len(FEATURE_RULES)}
    else:
        return {}

    # Map Extractor Key -> Explainer Rule Name for consisten namming
    mapping = {
        "has_ip_address":           "have_IP",
        "uses_https":               "https_token",
        "is_punycode":              "punycode",
        "is_shortening_service":    "url_shortening",
        "has_abnormal_subdomain":   "abnormal_subdomain",
        "entropy_url":              "url_entropy",
        "entropy_domain":           "domain_entropy",
        "entropy_path":             "path_entropy",
        "has_sensitive_query_keys": "has_sensitive_query_key",
        "query_has_url_value":      "has_url_in_query",
        "phish_hints":              "phish_hint",
        "is_suspicious_tld":        "suspicious_tld",
        "has_prefix_suffix":        "prefix_suffix",
        "has_www":                  "check_www",
        "has_com":                  "check_com",
        "tld_in_path":              "has_tld_in_path",
        "has_query":                "has_query",
        "query_param_count":        "query_param_count",
        "query_value_max_length":   "query_value_max_length",
        "query_has_file_extension": "has_file_extension_in_query",
        "query_has_double_file_extension": "has_double_file_extension_in_query",
        "has_multiple_extensions":  "multiple_extension_in_path",
        "count_hyphens":            "count_hyphens",
        "count_at":                 "count_at",
        "count_dots":               "count_dots",
        "count_double_slash":       "count_double_slash",
        "count_hyphens":            "count_hyphens",
        "count_at":                 "count_at",
        "ratio_digits_path":        "ratio_digits_path",
        "ratio_digits_hostname":    "ratio_digits_hostname",
        "max_word_length_url":      "longest_word_in_url",
        "max_word_length_hostname": "longest_word_in_hostname",
        "max_word_length_path":     "longest_word_in_path",
        "subdomain_count":          "count_subdomain",
        "url_length":               "url_length",
        "hostname_length":          "hostname_length",
        "brand_in_domain":          "brand_in_domain",
        "brand_in_subdomain":       "brand_in_subdomain",
        "brand_in_path":            "brand_in_path",
        "has_char_repeat":          "char_repeat",
        "path_extension_category":  "suspicious_extension_in_path",
    }

    # Apply mapping + safe float conversion
    features = {}
    for ext_key, expl_key in mapping.items():
        if ext_key in raw:
            try:
                features[expl_key] = float(raw[ext_key])
            except (ValueError, TypeError):
                features[expl_key] = 0.0

    # Pass through any other features that already match explainer names
    for k, v in raw.items():
        if k not in mapping.values() and k not in features:
            try:
                features[k] = float(v)
            except (ValueError, TypeError):
                continue

    return features


def _risk_level_from_confidence(confidence: float) -> str:
    if confidence >= 0.85: return "critical"
    if confidence >= 0.70: return "high"
    if confidence >= 0.40: return "medium"
    return "low"


def _triggered_feature_to_dict(tf) -> dict:
    return {
        "name":           tf.name,
        "value":          tf.value,
        "explanation":    tf.explanation,
        "domain":         tf.domain,
        "domain_icon":    tf.domain_icon,
        "domain_color":   tf.domain_color,
        "severity":       tf.severity,
        "severity_label": tf.severity_label,
        "importance":     tf.importance,
    }


def _domain_summary_to_dict(ds) -> dict:
    return {
        "domain":          ds.domain,
        "icon":            ds.icon,
        "color":           ds.color,
        "triggered_count": ds.triggered_count,
        "total_features":  ds.total_features,
        "risk_score":      ds.risk_score,
        "top_explanation": ds.top_explanation,
    }


# ──────────────────────────────────────────────────────────────
# CPU thread Setting
# ──────────────────────────────────────────────────────────────
_executor = ThreadPoolExecutor(
    max_workers=2,
    thread_name_prefix="LearnPhish_worker",
)

# ──────────────────────────────────────────────────────────────
# Google Safe Browsing helper function
# ──────────────────────────────────────────────────────────────
def _normalise_gsb_url(url: str) -> str:
    """
    Normalise a URL before sending to Google Safe Browsing v4.

    GSB canonicalisation rules (https://developers.google.com/safe-browsing/v4/urls-hashing):
    - Keep the full path and query string
    - Strip the URL fragment (#...)
    """
    if "://" not in url:
        url = "https://" + url
    parsed = urlparse(url)
    # Remove fragment only; keep path + query intact
    return urlunparse(parsed._replace(fragment=""))


def _check_gsb(url: str) -> dict:
    """
    Query Google Safe Browsing API v4 (threatMatches:find).

    Threat types used:
      - SOCIAL_ENGINEERING   : phishing and deceptive sites (the v4 name for phishing)
      - MALWARE              : drive-by download and malware distribution pages
      - UNWANTED_SOFTWARE    : software that violates Google's policy
      - POTENTIALLY_HARMFUL_APPLICATION : mobile PHA (important for Android users)
    """
    if not GSB_API_KEY:
        return {"status": "disabled", "threats": [], "url_checked": url}

    clean_url = _normalise_gsb_url(url)
    payload = {
        "client": {"clientId": "LearnPhish", "clientVersion": "5.0.0"},
        "threatInfo": {
            "threatTypes": [
                "SOCIAL_ENGINEERING",          # phishing / deceptive sites
                "MALWARE",                     # malware distribution
                "UNWANTED_SOFTWARE",           # policy-violating software
                "POTENTIALLY_HARMFUL_APPLICATION",  # mobile PHA
            ],
            "platformTypes":    ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries":    [{"url": clean_url}],
        },
    }
    try:
        import requests
        resp = requests.post(
            f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={GSB_API_KEY}",
            json=payload,
            timeout=3.0,
        )
        resp.raise_for_status()
        data    = resp.json()
        matches = data.get("matches", [])
        if matches:
            threats = list(set(m["threatType"] for m in matches))
            return {"status": "malicious", "threats": threats, "url_checked": clean_url}
        return {"status": "safe", "threats": [], "url_checked": clean_url}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "threats": [], "url_checked": clean_url}

# ──────────────────────────────────────────────────────────────
# Stage 1: Run ALL checks in PARALLEL
# ──────────────────────────────────────────────────────────────
async def _run_all_checks(cr: CheckResults) -> None:
    """
    Run in parallel via asyncio.gather() + a thread pool:
      ┌─ whitelist check  ─┐
      ├─ blacklist check  ─┤  all start at the same time
      └─ run_heuristics() ─┘  (structural + brand + DGA inside)
    """
    loop = asyncio.get_running_loop()

    def _db_whitelist():
        return db.is_whitelisted(cr.hostname)

    def _db_blacklist():
        return db.is_blacklisted(cr.hostname)

    def _heuristics():
        return run_heuristics(cr.url)

    def _gsb():          
        return _check_gsb(cr.url)

    # Launch all three concurrently on the thread pool 
    wl_result, bl_result, heuristic_result, gsb_result = await asyncio.gather(
        loop.run_in_executor(_executor, _db_whitelist),
        loop.run_in_executor(_executor, _db_blacklist),
        loop.run_in_executor(_executor, _heuristics),
        loop.run_in_executor(_executor, _gsb),
    )

    cr.whitelist_meta = wl_result
    cr.blacklist_meta = bl_result
    cr.heuristic      = heuristic_result
    cr.gsb_result     = gsb_result


# ──────────────────────────────────────────────────────────────
# Verdict to score 
# ──────────────────────────────────────────────────────────────
BLOCK_CONFIDENCE: dict[str, float] = {
    # DB checks — highest confidence (manually verified)
    "whitelist":        0.99,   # official domain — definitely legitimate
    "blacklist":        1.00,   # manually confirmed threat

    # Brand impersonation — very high (rule is deterministic)
    "brand_homograph":  0.97,   # Punycode or Unicode lookalike → near-certain
    "brand_punycode":   0.97,   # xn-- in domain
    "brand_prefix_suffix": 0.88, # paypal-login.com style
    "brand_typosquatting": 0.85, # fuzzy match ≥ 85%

    # DGA — score-dependent
    "dga_score_18":     0.96,   # max score
    "dga_score_15":     0.93,
    "dga_score_12":     0.91,
    "dga_score_9":      0.90,   # minimum block threshold (score ≥ 9)

    # Structural rules (BLOCK_RULES set in heuristic.py)
    "ip_address":       0.92,   # raw IP — almost never legitimate
    "at_symbol":        0.90,   # @ in URL — classic redirect trick
    "embedded_http":    0.90,   # URL-in-URL open redirect
    "punycode":         0.97,   # duplicate of brand_punycode for structural path
}

def _block_confidence(cr: CheckResults) -> tuple[float, str]:
    """
    Return (confidence, skip_reason) based purely on verdict,
    not on any numeric threshold calculation.

    Rule priority (highest wins):
      1. Blacklist     → definitive (1.0)
      2. Whitelist     → definitive legitimate (0.99)
      3. Brand block   → look up triggered rule in BLOCK_CONFIDENCE
      4. DGA block     → look up by score bucket
      5. Structural    → look up triggered rule name
    """
    h = cr.heuristic

    # Blacklist
    if cr.blacklist_meta:
        stored_conf = float(cr.blacklist_meta.get("confidence", 1.0))
        reason = (
            f"blacklisted — "
            f"source: {cr.blacklist_meta.get('source', 'manual')}"
        )
        return stored_conf, reason

    # Whitelist (returned as legitimate — handled in gate before this)
    # Included for completeness but gate returns early for whitelist.

    # Brand block
    if h and h.brand_check and h.brand_check.verdict == "block":
        rule = h.brand_check.triggered_rule or ""
        key  = f"brand_{rule}" if rule else "brand_homograph"
        conf = BLOCK_CONFIDENCE.get(key, 0.90)
        reason = (
            f"brand impersonation ({rule}) — "
            f"matched '{h.brand_check.matched_brand or 'unknown brand'}'"
        )
        return conf, reason

    # DGA block — use hard-detection-count bucket
    # (new dga_detector has no numeric score; count hard indicators instead)
    if h and h.dga_check and h.dga_check.verdict == "block":
        hard_count = sum(
            1 for d in (h.dga_check.detections or []) if d.severity == "hard"
        )
        if   hard_count >= 3: key = "dga_score_15"
        elif hard_count == 2: key = "dga_score_12"
        else:                 key = "dga_score_9"
        conf   = BLOCK_CONFIDENCE.get(key, 0.90)
        reason = f"DGA machine-generated domain — {hard_count} hard indicator(s)"
        return conf, reason

    # Structural rule block
    if h and h.triggered_flags:
        # Find the highest-severity triggered block-rule
        from heuristic import BLOCK_RULES
        block_flags = [f for f in h.triggered_flags if f.rule in BLOCK_RULES]
        if block_flags:
            top = max(block_flags, key=lambda f: f.severity)
            conf   = BLOCK_CONFIDENCE.get(top.rule, 0.88)
            reason = f"structural rule '{top.rule}' — {top.measured_value}"
            return conf, reason

    # Fallback (should not reach here if called correctly)
    return 0.88, "heuristic block"


# ──────────────────────────────────────────────────────────────
# Stage 2: Decision gate — verdict-based, not confidence-based
# ──────────────────────────────────────────────────────────────
def _decision_gate(cr: CheckResults) -> bool:
    """
    Decides whether to skip ML based on VERDICT alone.

    Rules:
      WHITELIST hit  → verdict = legitimate, skip ML (definitive)
      BLACKLIST hit  → verdict = phishing,   skip ML (definitive)
      Heuristic BLOCK → verdict = phishing,  skip ML (high-confidence rule)
      Heuristic SUSPICIOUS or PASS → run ML

    Returns True  → ML should be skipped
    Returns False → ML should run
    """
    h = cr.heuristic

    # ── Whitelist: definitive legitimate ─────────────────────
    if cr.whitelist_meta:
        cr.final_verdict    = "legitimate"
        cr.final_confidence = BLOCK_CONFIDENCE["whitelist"]
        cr.is_phishing      = False
        cr.ml_skipped       = True
        cr.skip_reason      = f"whitelisted: {cr.whitelist_meta.get('reason', '')}"
        return True

    # ── Blacklist: definitive phishing ────────────────────────
    if cr.blacklist_meta:
        conf, reason        = _block_confidence(cr)
        cr.final_verdict    = "phishing"
        cr.final_confidence = conf
        cr.is_phishing      = True
        cr.ml_skipped       = True
        cr.skip_reason      = reason
        return True
    
    # ── Google Safe Browsing (NEW) ─────────────────────────
    if cr.gsb_result and cr.gsb_result.get("status") == "malicious":
        threats = cr.gsb_result.get("threats", [])
        cr.final_verdict    = "phishing"
        cr.final_confidence = 0.95  
        cr.is_phishing      = True
        cr.ml_skipped       = True
        cr.skip_reason      = f"Google Safe Browsing hit: {', '.join(threats)}"
        return True

    # ── Heuristic BLOCK: high-confidence rule fired ───────────
    if h and h.verdict == "block":
        conf, reason        = _block_confidence(cr)
        cr.final_verdict    = "phishing"
        cr.final_confidence = conf
        cr.is_phishing      = True
        cr.ml_skipped       = True
        cr.skip_reason      = reason
        return True

    # ── Suspicious or Pass: always run ML ────────────────────
    return False


# ──────────────────────────────────────────────────────────────
# Stage 3: ML model + explainer
# ML inference is handled remotely by the Hugging Face Space.
# The Explainer runs locally 
# ──────────────────────────────────────────────────────────────
async def _run_ml(cr: CheckResults) -> bool:
    """
    Calls the Hugging Face ML microservice to obtain:
      - features_flat       : explainer-key → value dict
      - ml_result           : prediction, confidence, is_phishing, feature_importances

    Then runs the local Explainer engine on the returned data.
    Returns False if the remote call fails or returns an error.
    """

    try:
        # 2. Define the headers including the Authorization Bearer token
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {HF_Read_TOKEN}"
        }

        async with httpx.AsyncClient(timeout=HF_ML_TIMEOUT) as client:
            resp = await client.post(
                f"{HF_ML_SERVICE_URL}/predict",
                json={"url": cr.url},
                headers=headers,  
            )
            resp.raise_for_status()
            data = resp.json()
            

    except httpx.TimeoutException:
        import logging
        # ML services Timeout
        logging.getLogger("learnphish").warning(
            "HF ML service timed out for URL: %s (HF_ML_TIMEOUT=%s s)",
            cr.url, HF_ML_TIMEOUT,
        )
        return False
    except Exception as exc:
        import logging
        logging.getLogger("learnphish").error("HF ML service error: %s", exc)
        return False

    features_flat = data.get("features_flat") or {}
    feature_imps  = data.get("feature_importances") or {}
    ml_result = {
        "prediction":           data.get("prediction", "legitimate"),
        "is_phishing":          data.get("is_phishing", False),
        "confidence":           data.get("confidence", 0.0),
        "legitimate_confidence":data.get("legitimate_confidence", 1.0),
        "feature_importances":  feature_imps,
        "status":               data.get("status", "success"),
    }

    if not features_flat:
        return False

    explain_report = explain(
        features=features_flat,
        prediction=1 if ml_result["is_phishing"] else 0,
        confidence=ml_result["confidence"],
        feature_importances=feature_imps,
    )

    cr.features_flat    = features_flat
    cr.ml_result        = ml_result
    cr.explain_report   = explain_report
    cr.final_verdict    = ml_result["prediction"]
    cr.final_confidence = ml_result["confidence"]
    cr.is_phishing      = ml_result["is_phishing"]
    return True


# ──────────────────────────────────────────────────────────────
# Stage 4: Build unified response
# ──────────────────────────────────────────────────────────────
def _sanitise(obj):
    """
    Recursively convert non-JSON-serialisable Python types to plain types.

    Handled:
      • decimal.Decimal  → float   (psycopg2 returns this for NUMERIC columns)
      • numpy integers   → int
      • numpy floats     → float
      • numpy bool_      → bool
      • numpy ndarray    → list
      • objects with .item() → native Python scalar (numpy fallback)
    """
    import decimal
    import numpy as np

    if isinstance(obj, dict):
        return {k: _sanitise(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitise(v) for v in obj]

    if isinstance(obj, decimal.Decimal):
        return float(obj)

    # numpy scalars
    if isinstance(obj, np.integer):  return int(obj)
    if isinstance(obj, np.floating): return float(obj)
    if isinstance(obj, np.bool_):    return bool(obj)
    if isinstance(obj, np.ndarray):  return obj.tolist()

    # Generic numpy scalar fallback
    if hasattr(obj, 'item'):
        return obj.item()

    return obj


# ──────────────────────────────────────────────────────────────
# URL parser — server-side, accurate for complex domains use also in frontend
# ──────────────────────────────────────────────────────────────
def _parse_url_tldextract(url: str) -> dict:
    """
    Returns a dict with:
        protocol  — "https" or "http" (no colon)
        subdomain — everything left of the registered domain, e.g. "login.paypal"
        domain    — the second-level domain only, e.g. "secure-update"
        tld       — the public suffix, e.g. "com" or "co.uk"
        path      — URL path, e.g. "/verify" (empty string if just "/")
        query     — query string including "?", e.g. "?redirect=paypal.com"
        hostname  — full hostname, e.g. "login.paypal.secure-update.com"
        full      — the original URL string
    """
    try:
        # urlparse gets protocol, path, query reliably even when tldextract
        # is not involved — so use both together.
        parsed  = urlparse(url if "://" in url else "https://" + url)
        ext     = tldextract.extract(url)

        protocol = parsed.scheme or "https"
        path     = parsed.path if parsed.path and parsed.path != "/" else ""
        query    = parsed.query  # query string WITHOUT the leading "?"
        hostname = parsed.hostname or ""

        return {
            "protocol":  protocol,
            "subdomain": ext.subdomain,   # e.g. "login.paypal"
            "domain":    ext.domain,      # e.g. "secure-update"
            "tld":       ext.suffix,      # e.g. "com" | "co.uk"
            "path":      path,            # e.g. "/verify"
            "query":     f"?{query}" if query else "",  # e.g. "?redirect=paypal.com"
            "hostname":  hostname,        # e.g. "login.paypal.secure-update.com"
            "full":      url,
        }
    except Exception:
        # Graceful fallback — still returns the same shape
        return {
            "protocol":  "",
            "subdomain": "",
            "domain":    url,
            "tld":       "",
            "path":      "",
            "query":     "",
            "hostname":  url,
            "full":      url,
        }


def _build_response(cr: CheckResults) -> dict:
    """
    Assembles the unified response. Shape is IDENTICAL regardless of
    which pipeline path was taken (whitelist / blacklist / heuristic / ML).

    Key guarantee: `all_checks` block is always complete.
    """
    h   = cr.heuristic
    ml  = cr.ml_result
    rep = cr.explain_report

    # ── Heuristic block (always complete) ──────────────────────
    heuristic_block = h.to_dict() if h else {
        "verdict": "unknown",
        "summary": "Heuristics not evaluated.",
        "all_checks": [],
        "flags": [],
        "brand_check": None,
        "dga_check": None,
        "ml_skipped": cr.ml_skipped,
    }
    heuristic_block["ml_skipped"] = cr.ml_skipped

    # ── Explain block ──────────────────────────────────────────
    if rep:
        explain_block = {
            "overall_risk_score":       rep.overall_risk_score,
            "risk_level":               rep.risk_level,
            "top_reasons":              rep.top_reasons,
            "total_features_triggered": rep.total_features_triggered,
            "total_features_evaluated": rep.total_features_evaluated,
            "triggered_features": [
                _triggered_feature_to_dict(tf) for tf in rep.triggered_features
            ],
            "domain_summaries": [
                _domain_summary_to_dict(ds) for ds in rep.domain_summaries
            ],
        }
    else:
        # ML did not run — explain block is empty but present
        explain_block = {
            "overall_risk_score":       0.0,
            "risk_level":               "Low",
            "top_reasons":              [],
            "total_features_triggered": 0,
            "total_features_evaluated": 0,
            "triggered_features":       [],
            "domain_summaries":         [],
        }
    # ── GSB Block (NEW) ────────────────────────────────────
    gsb_block = cr.gsb_result if cr.gsb_result else {
        "status": "not_checked", "threats": [], "url_checked": cr.url
    }

    # ── Status label ───────────────────────────────────────────
    if cr.whitelist_meta:
        status = "whitelisted"
    elif cr.blacklist_meta:
        status = "blacklisted"
    elif cr.ml_skipped:
        status = "blocked_by_heuristic"
    elif ml:
        status = ml.get("status", "success")
    else:
        status = "feature_extraction_failed"

    # ── Recommendation ─────────────────────────────────────────
    if cr.is_phishing:
        if cr.blacklist_meta:
            rec = (
                f"Block this URL — blacklisted "
                f"(confidence {cr.final_confidence*100:.0f}%)."
            )
        elif cr.ml_skipped:
            rec = f"Block this URL — {cr.skip_reason}."
        else:
            rec = "Block this URL — ML model detected phishing."
    else:
        if cr.whitelist_meta:
            rec = f"Allow — domain is whitelisted ({cr.whitelist_meta.get('reason', '')})."
        else:
            rec = "Allow this URL — appears legitimate."

    return {
        "url":                   cr.url,
        "prediction":            cr.final_verdict,
        "is_phishing":           cr.is_phishing,
        "confidence_score":      round(cr.final_confidence, 4),
        "legitimate_confidence": round(1 - cr.final_confidence, 4),
        "threshold_used":        ml.get("threshold_used", 0.44) if ml else 0.5,
        "status":                status,
        "risk_level":            _risk_level_from_confidence(cr.final_confidence),
        "recommendation":        rec,
        "skip_reason":           cr.skip_reason,


        "parsed_url": _parse_url_tldextract(cr.url),

        # Complete heuristic data — all 10 structural checks always present
        "heuristic": heuristic_block,

        # ML explainability — populated when ML ran, empty otherwise
        "explain": explain_block,
        "gsb": gsb_block,
    }


# ──────────────────────────────────────────────────────────────
# Query Redaction Helper
# ──────────────────────────────────────────────────────────────
def redact_url_query(url: str) -> str:
    """
    Replace every query parameter VALUE with REDACTED while preserving
    the key names and URL structure.

    Example:
        https://example.com/page?token=abc123&user=alice
        → https://example.com/page?token=REDACTED&user=REDACTED

    This prevents user credentials or session tokens from being stored
    in the public dataset while keeping the URL shape intact for analysis.
    """
    try:
        parsed = urlparse(url if "://" in url else "https://" + url)
        if not parsed.query:
            return url
        qs = parse_qs(parsed.query, keep_blank_values=True)
        redacted_qs = {k: ["REDACTED"] * len(v) for k, v in qs.items()}
        new_query = urlencode(redacted_qs, doseq=True)
        redacted = urlunparse(parsed._replace(query=new_query))
        return redacted
    except Exception:
        return url  # fallback: store as-is if parsing fails


# ──────────────────────────────────────────────────────────────
# Background ML Feature Logging for dataset log
# ──────────────────────────────────────────────────────────────
async def _log_features_background(url: str, label: int) -> None:
    """
    Call the HF Space ML service to extract features, then log to
    ml_feature_logs in the background.

    Called via asyncio.create_task() so it never blocks the scan response.
    Used when the heuristic gate already blocked the URL — the user gets
    an instant response, but we still extract + save features for the dataset.
    """
    import logging
    logger = logging.getLogger(__name__)

    try:
        headers = {"Content-Type": "application/json"}
        if HF_Read_TOKEN:
            headers["Authorization"] = f"Bearer {HF_Read_TOKEN}"

        async with httpx.AsyncClient(timeout=HF_ML_TIMEOUT) as client:
            resp = await client.post(
                f"{HF_ML_SERVICE_URL}/predict",
                json={"url": url},
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        features = data.get("features_flat") or {}
        if not features:
            return

        url_redacted = redact_url_query(url)
        db.log_ml_features(
            url_redacted=url_redacted,
            label=label,
            features=features,
            model_version="rf_v1",
        )
    except Exception as exc:
        logger.error("background feature log failed: %s", exc)


# ──────────────────────────────────────────────────────────────
# Main prediction endpoint
# ──────────────────────────────────────────────────────────────
@app.post("/api/predict")
async def predict_url(data: URLRequest):
    """
    Main prediction endpoint — now fully async.

    Stage 1 runs whitelist + blacklist + heuristics in PARALLEL.
    Stage 3 (ML) runs on the thread pool so it doesn't block the event loop.
    All other stages (decision gate, response building) are synchronous
    and fast enough not to need offloading.

    Dataset logging:
    - When ML runs normally: features are logged synchronously after the
      result is built (since ML already ran).
    - When heuristic blocks early: a background task logs features without
      delaying the user's response.
    """
    url = data.url
    t_start = time.perf_counter()

    try:
        hostname = _extract_hostname(url)
        cr = CheckResults(url=url, hostname=hostname)

        # Stage 1: Parallel — whitelist + blacklist + heuristics all at once
        await _run_all_checks(cr)

        # Stage 2: Decision gate — verdict-based, synchronous, fast
        skip_ml = _decision_gate(cr)

        # Stage 3: ML + explainer on thread pool (only when gate says run)
        if not skip_ml:
            ml_ok = await _run_ml(cr)
            if not ml_ok:
                # HF Space timed out or is cold-starting — tell the client clearly
                raise HTTPException(
                    status_code=503,
                    detail={
                        "message":    "The ML analysis service is temporarily unavailable. "
                                      "It may be waking from sleep — please retry in 30–60 s.",
                        "error_code": "service_unavailable",
                    },
                )

        # Stage 4: Build unified response (synchronous)
        response = _build_response(cr)

        # Scan logging — URL is redacted before storage (same policy as ml_feature_logs)
        response_ms = int((time.perf_counter() - t_start) * 1000)
        h = cr.heuristic
        url_redacted_for_log = redact_url_query(url)
        db.log_scan(
            url=url_redacted_for_log,
            domain=hostname,
            whitelist_hit=cr.whitelist_meta is not None,
            blacklist_hit=cr.blacklist_meta is not None,
            heuristic_verdict=h.verdict if h else None,
            heuristic_flags=[c.to_dict() for c in (h.triggered_flags if h else [])],
            brand_verdict=h.brand_check.verdict if h and h.brand_check else None,
            brand_matched=h.brand_check.matched_brand if h and h.brand_check else None,
            ml_skipped=cr.ml_skipped,
            ml_prediction=cr.final_verdict if not cr.ml_skipped else None,
            ml_confidence=cr.final_confidence if not cr.ml_skipped else None,
            ml_risk_score=response["explain"]["overall_risk_score"],
            final_verdict=cr.final_verdict,
            final_confidence=cr.final_confidence,
            response_ms=response_ms,
        )

        # ── Dataset feature logging ──────────────────────────────
        # Skip whitelist hits — those are legitimate by definition and
        # logging them would add noise without improving label quality.
        if not cr.whitelist_meta:
            label = 1 if cr.is_phishing else 0
            if not cr.ml_skipped and cr.features_flat:
                # ML already ran → features are in memory, log synchronously
                url_redacted = redact_url_query(url)
                db.log_ml_features(
                    url_redacted=url_redacted,
                    label=label,
                    features=cr.features_flat,
                    model_version="rf_v1",
                )
            elif cr.ml_skipped:
                # Heuristic blocked → kick off background extraction
                # so the user gets their response instantly
                asyncio.create_task(
                    _log_features_background(url, label)
                )

        return JSONResponse(content=_sanitise(response))

    except HTTPException:
        raise # let the error_handlers module handle it
    except Exception as e:
        # Unhandled exception — error_handlers.unhandled_exception_handler catches it
        # Re-raise so it propagates to the registered handler (logs + 500 response).
        raise


# ──────────────────────────────────────────────────────────────
# Dataset endpoints  (public)
# ──────────────────────────────────────────────────────────────

# The ordered list of feature column names — must match the INSERT order in db.py
_FEATURE_COLUMNS = [
    "url_length", "hostname_length", "has_ip_address",
    "count_dots", "count_hyphens", "count_at",
    "count_exclamation", "count_ampersand", "count_pipe",
    "count_equal", "count_underscore", "count_percent",
    "count_slash", "count_asterisk", "count_colon", "count_space",
    "has_www", "has_com", "count_double_slash", "uses_https",
    "ratio_digits_path", "ratio_digits_hostname",
    "is_punycode", "tld_in_path", "has_abnormal_subdomain",
    "subdomain_count", "has_prefix_suffix", "is_shortening_service",
    "path_extension_category", "has_multiple_extensions",
    "path_depth", "phish_hints",
    "has_query", "query_param_count", "has_sensitive_query_keys",
    "query_has_url_value", "query_value_max_length",
    "query_has_file_extension", "query_has_double_file_extension",
    "query_entropy",
    "has_char_repeat", "max_word_length_url",
    "max_word_length_hostname", "max_word_length_path",
    "brand_in_domain", "brand_in_subdomain", "brand_in_path",
    "brand_mismatch", "brand_impersonation_score",
    "is_suspicious_tld", "tld_length",
    "entropy_url", "entropy_domain", "entropy_path", "entropy_query",
    "has_login_keyword", "has_secure_keyword", "has_account_keyword",
    "has_update_keyword", "has_verify_keyword", "has_redirection_keyword",
    "vowel_ratio_sld", "consecutive_consonants_max_sld", "has_digit_sld",
    "ratio_special_chars_url", "domain_has_https",
]


@app.get("/api/dataset/count", tags=["Dataset"])
def dataset_count():
    """
    Return the total number of rows in ml_feature_logs.
    Used by the frontend to calculate how many CSV batches are available.
    """
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM ml_feature_logs")
            total = cur.fetchone()[0]
    return {"total": total, "batch_size": 200}


@app.get("/api/dataset/download", tags=["Dataset"])
def dataset_download(
    offset: int = Query(default=0, ge=0, description="Row offset (0-based)"),
    limit:  int = Query(default=200, ge=1, le=1000, description="Rows per batch (max 1000)"),
):
    """
    Stream a CSV file containing ml_feature_logs rows.

    Each row contains:
    - id, url_redacted, label (0=legitimate / 1=phishing), model_version
    - 57 individual feature columns (one per ML feature)

    Use `offset` and `limit` for batch downloads, e.g.:
        /api/dataset/download?offset=0&limit=200   → batch 1
        /api/dataset/download?offset=200&limit=200 → batch 2
    """
    # Build the SELECT column list: meta columns first, then all feature cols
    meta_cols   = ["id", "url_redacted", "label", "model_version", "created_at"]
    select_cols = meta_cols + _FEATURE_COLUMNS
    cols_sql    = ", ".join(select_cols)

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {cols_sql} FROM ml_feature_logs ORDER BY id LIMIT %s OFFSET %s",
                (limit, offset),
            )
            rows = cur.fetchall()
            col_names = [desc[0] for desc in cur.description]

    # Build CSV in-memory
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(col_names)
    for row in rows:
        writer.writerow(row)
    output.seek(0)

    batch_num = (offset // limit) + 1
    filename  = f"LearnPhish_dataset_batch{batch_num}_offset{offset}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ──────────────────────────────────────────────────────────────
# Admin endpoints
# ──────────────────────────────────────────────────────────────
class WhitelistEntry(BaseModel):
    domain: str
    added_by: str = "api"

class BlacklistEntry(BaseModel):
    domain: str
    confidence: float = 1.0
    source: str = "manual"

class BrandEntry(BaseModel):
    name: str
    display_name: str
    category: str = "other"

class BrandDomainEntry(BaseModel):
    brand_name: str
    domain: str
    is_primary: bool = False

class FalsePositiveReport(BaseModel):
    url: str
    domain: str
    triggered_rule: Optional[str] = None
    similarity_score: Optional[float] = None
    matched_brand: Optional[str] = None
    user_feedback: str
    notes: str = ""


@app.get("/api/whitelist",  tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def get_whitelist(limit: int = 100, offset: int = 0):
    return db.list_whitelist(limit, offset)

@app.post("/api/whitelist", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def add_whitelist(entry: WhitelistEntry):
    return db.add_to_whitelist(entry.domain, entry.added_by)

@app.delete("/api/whitelist/{domain}", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def delete_whitelist(domain: str):
    ok = db.remove_from_whitelist(domain)
    if not ok:
        raise HTTPException(404, "Domain not found in whitelist")
    return {"removed": domain}


@app.get("/api/blacklist",  tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def get_blacklist(limit: int = 100, offset: int = 0):
    return db.list_blacklist(limit, offset)

@app.post("/api/blacklist", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def add_blacklist(entry: BlacklistEntry):
    return db.add_to_blacklist(
        entry.domain, entry.confidence, entry.source
    )

@app.delete("/api/blacklist/{domain}", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def delete_blacklist(domain: str):
    ok = db.remove_from_blacklist(domain)
    if not ok:
        raise HTTPException(404, "Domain not found in blacklist")
    return {"removed": domain}


@app.get("/api/brands", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def get_brands(category: Optional[str] = None):
    import psycopg2.extras as _pg_extras
    """Fetches all brands and attaches their associated domains from the brand_domains table."""
    with db.get_conn() as conn:
        with conn.cursor(cursor_factory=_pg_extras.RealDictCursor) as cur:
            # 1. Fetch all brands
            if category:
                cur.execute("SELECT name, display_name, category FROM brands WHERE category = %s ORDER BY name", (category,))
            else:
                cur.execute("SELECT name, display_name, category FROM brands ORDER BY name")
            brands = [dict(r) for r in cur.fetchall()]
            
            # 2. Fetch all domains and group them by brand name
            cur.execute("""
                SELECT b.name AS brand_name, bd.domain 
                FROM brand_domains bd
                JOIN brands b ON b.id = bd.brand_id
            """)
            domain_map = {}
            for row in cur.fetchall():
                b_name = row['brand_name']
                if b_name not in domain_map:
                    domain_map[b_name] = []
                domain_map[b_name].append(row['domain'])
                
            # 3. Attach the domains array to each brand object
            for b in brands:
                b['domains'] = domain_map.get(b['name'], [])
                
            return brands

@app.post("/api/brands", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def add_brand(entry: BrandEntry):
    from psycopg2 import errors as pg_errors
    try:
        return db.add_brand(entry.name, entry.display_name, entry.category)
    except pg_errors.CheckViolation:
        # Catch the database rule violation and return a clean error to the frontend
        raise HTTPException(
            status_code=400, 
            detail="Brand Name must be URL-safe (lowercase, no spaces, use underscores like 'utm_my')."
        )

@app.post("/api/brands/domains", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def add_brand_domain(entry: BrandDomainEntry):
    return db.add_brand_domain(entry.brand_name, entry.domain, entry.is_primary)


@app.post("/api/feedback", tags=["Feedback"])
def submit_false_positive(report: FalsePositiveReport):
    # Redact query parameters before storing (e.g. ?token=12345 → ?token=REDACTED)
    safe_url = redact_url_query(report.url)
    return db.report_false_positive(
        safe_url, report.domain, report.triggered_rule,
        report.similarity_score, report.matched_brand,
        report.user_feedback, report.notes,
    )

@app.post("/api/cache/reload", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def reload_cache():
    """Reload brand data from DB into local memory. Whitelist/blacklist are served from Redis lazily."""
    db.load_cache()
    c = db.get_cache()
    return {
        "brands":           len(c.brand_names),
        "official_domains": len(c.brand_official_domains),
        "wl_bl_cache":      "Redis lazy (TTL={}s)".format(db._CACHE_TTL),
    }


@app.post("/api/cache/warmup", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def warmup_cache():
    """Force a Redis cache warm-up, pre-populating whitelist/blacklist from the database."""
    import time
    t0 = time.perf_counter()
    db.warm_up_redis_cache(limit=50000)
    elapsed = round(time.perf_counter() - t0, 2)
    return {
        "status":  "ok",
        "message": f"Redis cache warm-up completed in {elapsed}s",
        "elapsed_seconds": elapsed,
    }


# ──────────────────────────────────────────────────────────────
# Quiz endpoints
# ──────────────────────────────────────────────────────────────

class QuizFetchRequest(BaseModel):
    domain: str           # Threat domain name, e.g. "Obfuscation & Cloaking"
    exclude_ids: list[int] = []   # IDs the user has already answered (from localStorage)

class QuizFetchResponse(BaseModel):
    id: int
    question_text: str
    options: list[str]
    # NOTE: correct_index and explanation_text are intentionally ABSENT
    #       to prevent browser-console cheating.

class QuizAnswerRequest(BaseModel):
    question_id: int
    selected_index: int   # 0-based index of the user's chosen option

class QuizAnswerResponse(BaseModel):
    is_correct: bool
    explanation_text: str


@app.post("/api/quiz/fetch", response_model=QuizFetchResponse, tags=["Quiz"])
async def quiz_fetch(data: QuizFetchRequest):
    """
    Return a random, unanswered quiz question for the given threat domain.

    The correct answer is NEVER included in the response — it stays in the
    database until the user submits via /api/quiz/answer.

    Returns 204 No Content when the user has answered all questions for
    this domain (frontend should hide the quiz widget gracefully).
    """
    loop = asyncio.get_running_loop()
    question = await loop.run_in_executor(
        _executor,
        lambda: db.fetch_quiz_question(data.domain, data.exclude_ids),
    )
    if question is None:
        # All questions exhausted — frontend hides the quiz card
        return Response(status_code=204)
    return question


@app.post("/api/quiz/answer", response_model=QuizAnswerResponse, tags=["Quiz"])
async def quiz_answer(data: QuizAnswerRequest):
    """
    Validate the user's answer and return the result with explanation.

    Atomically increments times_correct or times_incorrect in the database.
    The explanation_text is only revealed here, after a genuine attempt.
    """
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        _executor,
        lambda: db.record_quiz_answer(data.question_id, data.selected_index),
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Question not found or inactive.")
    return result

import json
import psycopg2.extras as _pg_extras

# ── Quiz Questions CRUD ───────────────────────────────────────
class QuizQuestionEntry(BaseModel):
    domain: str
    question_text: str
    options: list[str]
    correct_index: int
    explanation_text: str

@app.get("/api/quiz/questions", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def list_quiz_questions(limit: int = 50):
    with db.get_conn() as conn:
        with conn.cursor(cursor_factory=_pg_extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT qq.id, qq.question_text, qq.options, qq.correct_index, qq.explanation_text, td.name as domain
                FROM quiz_questions qq 
                JOIN threat_domains td ON qq.domain_id = td.id
                ORDER BY qq.id DESC LIMIT %s
            """, (limit,))
            rows = cur.fetchall()
            for r in rows:
                if isinstance(r['options'], str):
                    try: r['options'] = json.loads(r['options'])
                    except: pass
            return [dict(r) for r in rows]

@app.post("/api/quiz/questions", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def add_quiz_question(entry: QuizQuestionEntry):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM threat_domains WHERE name = %s", (entry.domain,))
            row = cur.fetchone()
            if not row: raise HTTPException(404, "Threat domain not found")
            domain_id = row[0]
            cur.execute("""
                INSERT INTO quiz_questions (domain_id, question_text, options, correct_index, explanation_text, is_active)
                VALUES (%s, %s, %s, %s, %s, TRUE) RETURNING id
            """, (domain_id, entry.question_text, json.dumps(entry.options), entry.correct_index, entry.explanation_text))
            new_id = cur.fetchone()[0]
            conn.commit()
    return {"id": new_id, "status": "created"}

@app.delete("/api/quiz/questions/{q_id}", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def delete_quiz_question(q_id: int):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM quiz_questions WHERE id = %s", (q_id,))
            conn.commit()
    return {"removed": q_id}

# ── Brands DELETE ─────────────────────────────────────────────
@app.delete("/api/brands/{brand_name}", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def delete_brand(brand_name: str):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM brand_domains WHERE brand_name = %s", (brand_name,))
            cur.execute("DELETE FROM brands WHERE name = %s", (brand_name,))
            conn.commit()
    db.load_cache()
    return {"removed": brand_name}
# ── Pydantic models for the extension endpoint ────────────────────────
class ExtensionRequest(BaseModel):
    url: str
    mode: str = "full"              # "full" | "fast"
    threshold: Optional[float] = None  # overrides DEFAULT_THRESHOLD if set


# ──────────────────────────────────────────────────────────────────────
# /api/extension/predict
# Lightweight endpoint for the browser extension.
# Returns only the fields the extension needs to render its block page.
# No API token required — protected by CORS + rate limiting only.
# ──────────────────────────────────────────────────────────────────────
@app.post("/api/extension/predict", tags=["Extension"])
@limiter.limit("5/second")
async def extension_predict(request: Request, body: ExtensionRequest):
    """
    Browser Extension — lightweight phishing detection endpoint.

    Accepts an optional `mode` ("full" | "fast") and an optional ML
    `threshold` override. Returns a slimmed-down payload containing only
    the fields the extension block page requires:
        - is_phishing, confidence_score, risk_level
        - top_reasons (from Explainer Engine)
        - skip_reason (why ML was skipped, if applicable)
        - domain_summaries (for Threat Domain breakdown on block page)
        - heuristic.all_checks, .brand_check, .dga_check (for chips)
        - overall_risk_score

    Full heuristic + ML pipeline still runs internally (unless mode=fast).
    """
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=422, detail="URL must not be empty.")

    # --- Fast mode: ML-only (skip heuristics, call HF Space directly) ---
    if body.mode == "fast":
        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {HF_Read_TOKEN}"
            }
            async with httpx.AsyncClient(timeout=HF_ML_TIMEOUT) as client:
                resp = await client.post(
                    f"{HF_ML_SERVICE_URL}/predict",
                    json={"url": url},
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()
                
            features_flat = data.get("features_flat") or {}
            feature_imps = data.get("feature_importances") or {}
            
            ml_result = {
                "is_phishing": data.get("is_phishing", False),
                "confidence": data.get("confidence", 0.0),
                "feature_importances": feature_imps,
            }
            
            if body.threshold is not None:
                ml_result["is_phishing"] = ml_result["confidence"] >= body.threshold
                
            explain_report = explain(
                features=features_flat,
                prediction=1 if ml_result["is_phishing"] else 0,
                confidence=ml_result["confidence"],
                feature_importances=feature_imps,
            )
            
        except Exception as e:
            import logging
            logging.getLogger("learnphish").error(f"Fast ML service error: {e}")
            raise HTTPException(status_code=500, detail="ML service failed.")
        confidence  = ml_result["confidence"]
        is_phishing = ml_result["is_phishing"]
        risk_level  = _risk_level_from_confidence(confidence) if is_phishing else "low"

        top_reasons     = []
        overall_score   = 0.0
        domain_summaries = []

        if explain_report:
            top_reasons      = list(explain_report.top_reasons or [])
            overall_score    = float(explain_report.overall_risk_score or 0)
            domain_summaries = [_domain_summary_to_dict(ds) for ds in (explain_report.domain_summaries or [])]

        return _sanitise({
            "url":              url,
            "is_phishing":      is_phishing,
            "confidence_score": round(confidence, 4),
            "risk_level":       risk_level,
            "overall_risk_score": round(overall_score, 1),
            "top_reasons":      top_reasons[:5],
            "domain_summaries": domain_summaries,
            "skip_reason":      "",
            "heuristic":        None,
            "mode_used":        "fast",
        })

    # --- Full mode: complete 4-stage pipeline ---
    hostname = _extract_hostname(url)
    cr = CheckResults(url=url, hostname=hostname)

    await _run_all_checks(cr)
    skip_ml = _decision_gate(cr)

    if not skip_ml:
        ml_ok = await _run_ml(cr)
        if not ml_ok:
            # Feature extraction failure — use heuristic verdict only
            cr.final_verdict    = "phishing" if cr.heuristic and cr.heuristic.verdict != "pass" else "legitimate"
            cr.final_confidence = 0.5
            cr.is_phishing      = cr.final_verdict == "phishing"

    # Apply threshold override if ML ran
    if body.threshold is not None and cr.ml_result is not None:
        cr.is_phishing      = cr.ml_result["confidence"] >= body.threshold
        cr.final_confidence = cr.ml_result["confidence"]

    # Serialize heuristic block (simplified for extension)
    heuristic_data = None
    if cr.heuristic:
        h = cr.heuristic
        heuristic_data = {
            "verdict": h.verdict,
            "summary": getattr(h, "summary", ""),
            "ml_skipped": cr.ml_skipped,
            "all_checks": [
                {
                    "rule":           getattr(f, "rule", ""),
                    "severity":       getattr(f, "severity", 1),
                    "severity_label": getattr(f, "severity_label", ""),
                    "triggered":      getattr(f, "triggered", False),
                    "message":        getattr(f, "message", ""),
                    "measured_value": getattr(f, "measured_value", ""),
                }
                for f in getattr(h, "all_checks", [])
            ],
            "brand_check": (
                {
                    "verdict":        getattr(h.brand_check, "verdict", "pass"),
                    "triggered_rule": getattr(h.brand_check, "triggered_rule", None),
                    "matched_brand":  getattr(h.brand_check, "matched_brand", None),
                    "message":        getattr(h.brand_check, "message", ""),
                } if getattr(h, "brand_check", None) else None
            ),
            "dga_check": (
                {
                    "verdict":   getattr(h.dga_check, "verdict", "pass"),
                    "score":     getattr(h.dga_check, "score", 0),
                    "max_score": getattr(h.dga_check, "max_score", 18),
                } if getattr(h, "dga_check", None) else None
            ),
        }

    # Explainer data
    top_reasons      = []
    overall_score    = 0.0
    domain_summaries = []

    if cr.explain_report:
        top_reasons      = list(cr.explain_report.top_reasons or [])
        overall_score    = float(cr.explain_report.overall_risk_score or 0)
        domain_summaries = [_domain_summary_to_dict(ds) for ds in (cr.explain_report.domain_summaries or [])]
    elif cr.skip_reason:
        top_reasons = [cr.skip_reason]

    risk_level = (
        _risk_level_from_confidence(cr.final_confidence)
        if cr.is_phishing else "low"
    )

    # Async DB log (fire and forget, same as main predict)
    async def _log():
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                _executor,
                lambda: db.log_scan(
                    url=url,
                    is_phishing=cr.is_phishing,
                    confidence=cr.final_confidence,
                    source="extension",
                ),
            )
        except Exception:
            pass

    asyncio.create_task(_log())

    return _sanitise({
        "url":               url,
        "is_phishing":       cr.is_phishing,
        "confidence_score":  round(cr.final_confidence, 4),
        "risk_level":        risk_level,
        "overall_risk_score": round(overall_score, 1),
        "top_reasons":       top_reasons[:5],
        "domain_summaries":  domain_summaries,
        "skip_reason":       cr.skip_reason,
        "heuristic":         heuristic_data,
        "mode_used":         "full",
    })
    

# ──────────────────────────────────────────────────────────────
# Admin Dashboard Telemetry Endpoints
# ──────────────────────────────────────────────────────────────
import psycopg2.extras as _pg_extras


@app.get("/api/admin/stats", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def admin_stats():
    """
    Aggregated telemetry for the admin dashboard.
    Returns data for all 4 zones:
      Zone 1 — System health & throughput (24h)
      Zone 2 — Pipeline efficiency / ML bypass rate (24h)
      Zone 3 — Educational quiz telemetry by threat domain
      Zone 4 — Open dispute count
    Also returns a 7-day daily scan trend.
    """
    with db.get_conn() as conn:
        with conn.cursor(cursor_factory=_pg_extras.RealDictCursor) as cur:

            # ── Zone 1 + 2: scan_log aggregate (last 24 h) ─────────
            cur.execute("""
                SELECT
                    COALESCE(COUNT(*), 0)                                                   AS total_24h,
                    COALESCE(ROUND(AVG(response_ms)), 0)                                    AS avg_response_ms,
                    COALESCE(SUM(CASE WHEN final_verdict = 'phishing'   THEN 1 ELSE 0 END), 0) AS phishing_count,
                    COALESCE(SUM(CASE WHEN final_verdict = 'legitimate' THEN 1 ELSE 0 END), 0) AS legitimate_count,
                    COALESCE(SUM(CASE WHEN ml_skipped   = TRUE          THEN 1 ELSE 0 END), 0) AS ml_skipped_count,
                    COALESCE(SUM(CASE WHEN whitelist_hit = TRUE         THEN 1 ELSE 0 END), 0) AS whitelist_hits,
                    COALESCE(SUM(CASE WHEN blacklist_hit = TRUE         THEN 1 ELSE 0 END), 0) AS blacklist_hits
                FROM scan_log
                WHERE created_at > NOW() - INTERVAL '24 hours'
            """)
            s = dict(cur.fetchone() or {})

            # Previous 24 h window for velocity delta
            cur.execute("""
                SELECT COALESCE(COUNT(*), 0) AS prev_total
                FROM scan_log
                WHERE created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours'
            """)
            prev = dict(cur.fetchone() or {})

            # ── Zone 3: Quiz accuracy per threat domain ─────────────
            cur.execute("""
                SELECT
                    td.name                                                             AS domain,
                    COALESCE(SUM(qq.times_correct), 0)                                 AS correct,
                    COALESCE(SUM(qq.times_correct + qq.times_incorrect), 0)            AS total_attempts,
                    COALESCE(SUM(qq.times_fetched), 0)                                 AS total_fetched
                FROM threat_domains td
                LEFT JOIN quiz_questions qq
                    ON qq.domain_id = td.id AND qq.is_active = TRUE
                GROUP BY td.name
                ORDER BY td.name
            """)
            quiz_domains = [dict(r) for r in cur.fetchall()]

            # Top 5 most-failed questions
            cur.execute("""
                SELECT question_text, times_incorrect, times_correct, times_fetched
                FROM quiz_questions
                WHERE is_active = TRUE
                  AND (times_correct + times_incorrect) > 0
                ORDER BY times_incorrect DESC
                LIMIT 5
            """)
            top_failed = [dict(r) for r in cur.fetchall()]

            # ── Zone 4: Open disputes ───────────────────────────────
            cur.execute(
                "SELECT COALESCE(COUNT(*), 0) AS open_disputes FROM false_positives WHERE resolved = FALSE"
            )
            disputes_row = dict(cur.fetchone() or {})

            # ── 7-day daily trend ───────────────────────────────────
            cur.execute("""
                SELECT
                    DATE(created_at)                                                    AS scan_date,
                    COUNT(*)                                                            AS total,
                    SUM(CASE WHEN final_verdict = 'phishing' THEN 1 ELSE 0 END)        AS phishing
                FROM scan_log
                WHERE created_at > NOW() - INTERVAL '7 days'
                GROUP BY DATE(created_at)
                ORDER BY scan_date ASC
            """)
            trend_7d = [
                {**dict(r), "scan_date": str(r["scan_date"])}
                for r in cur.fetchall()
            ]

    total         = int(s.get("total_24h")       or 0)
    ml_skipped    = int(s.get("ml_skipped_count") or 0)
    wl_hits       = int(s.get("whitelist_hits")   or 0)
    bl_hits       = int(s.get("blacklist_hits")   or 0)
    heuristic_gsb = max(0, ml_skipped - wl_hits - bl_hits)
    ml_ran        = max(0, total - ml_skipped)

    return {
        "zone1": {
            "total_scans_24h":  total,
            "prev_total_24h":   int(prev.get("prev_total") or 0),
            "avg_response_ms":  int(s.get("avg_response_ms")  or 0),
            "threat_ratio":     round(int(s.get("phishing_count") or 0) / max(total, 1), 4),
            "phishing_count":   int(s.get("phishing_count")   or 0),
            "legitimate_count": int(s.get("legitimate_count") or 0),
        },
        "zone2": {
            "total_scans_24h":  total,
            "ml_skipped_count": ml_skipped,
            "ml_bypass_rate":   round(ml_skipped / max(total, 1) * 100, 1),
            "ml_ran_count":     ml_ran,
            "skip_breakdown": {
                "whitelist":       wl_hits,
                "blacklist":       bl_hits,
                "heuristic_block": heuristic_gsb,
                "ml_ran":          ml_ran,
            },
        },
        "zone3": {
            "domains":              quiz_domains,
            "top_failed_questions": top_failed,
        },
        "zone4": {
            "open_disputes": int(disputes_row.get("open_disputes") or 0),
        },
        "trend_7d": trend_7d,
    }


# ──────────────────────────────────────────────────────────────
# Feedback list endpoint (admin)
# ──────────────────────────────────────────────────────────────

@app.get("/api/feedback", tags=["Feedback"], dependencies=[Depends(verify_admin_key)])
def list_feedback(resolved: Optional[bool] = None, limit: int = 50):
    """List false positive / true positive reports. Filter by resolved status."""
    return db.list_false_positives(resolved=resolved, limit=limit)


@app.post("/api/feedback/{fp_id}/approve", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def approve_dispute(fp_id: int):
    """
    Approve a false positive dispute:
      1. Fetch the disputed domain.
      2. Add it to the whitelist.
      3. Mark the dispute as resolved.
      4. Reload the MemoryCache so the domain is unblocked instantly.
    """
    fp = db.get_false_positive(fp_id)
    if not fp:
        raise HTTPException(status_code=404, detail="Dispute not found.")
    domain = fp.get("domain", "")
    if not domain:
        raise HTTPException(status_code=400, detail="Dispute has no domain.")

    db.add_to_whitelist(
        domain=domain,
        added_by="admin",
    )
    db.resolve_false_positive(fp_id, resolved_by="admin")
    # Reload cache so the whitelist entry is live immediately
    db.load_cache()
    cache = db.get_cache()
    return {
        "approved": True,
        "domain": domain,
        "whitelisted": True,
        "cache_reloaded": True,
        "cache_stats": {
            "brands": len(cache.brand_names),
        },
    }


@app.post("/api/feedback/{fp_id}/reject", tags=["Admin"], dependencies=[Depends(verify_admin_key)])
def reject_dispute(fp_id: int, blacklist: bool = False):
    """
    Reject a dispute (confirm the URL is malicious):
      1. Mark the dispute as resolved.
      2. Optionally add the domain to the permanent blacklist.
      3. Reload cache if blacklist was updated.
    """
    fp = db.get_false_positive(fp_id)
    if not fp:
        raise HTTPException(status_code=404, detail="Dispute not found.")

    db.resolve_false_positive(fp_id, resolved_by="admin")
    result: dict = {"approved": False, "rejected": True, "blacklisted": False}

    if blacklist:
        domain = fp.get("domain", "")
        if domain:
            db.add_to_blacklist(
                domain=domain,
                confidence=1.0,
                source="user_report",
            )
            db.load_cache()
            result["blacklisted"] = True
            result["domain"] = domain

    return result




