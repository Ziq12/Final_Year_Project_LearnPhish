"""
db.py
─────
Database access layer for LearnPhish.

• Manages a psycopg2 connection pool (thread-safe).
• Loads brands, whitelist, and blacklist into memory at startup.
• Provides O(1) in-memory lookups for the hot path (no per-request DB calls).
• Exposes CRUD helpers for admin operations (add/remove entries, log scans, etc.).

Dependencies:
    pip install psycopg2-binary python-dotenv
"""

from __future__ import annotations

import json
import logging
import os
import time
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Generator, Optional

import psycopg2
import psycopg2.extras
from psycopg2 import pool as pg_pool
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(usecwd=False), override=False)  # searches upward from file location
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# Config (set via environment variables or .env file)
# ──────────────────────────────────────────────────────────────
DB_HOST     = os.getenv("DB_HOST",     "localhost")
DB_PORT     = int(os.getenv("DB_PORT", "5432"))
DB_NAME     = os.getenv("DB_NAME",     "postgres")
DB_USER     = os.getenv("DB_USER",     "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "changeme")
DB_SSLMODE  = os.getenv("DB_SSLMODE",  "prefer")   # 'require' for Supabase pooler
DB_MIN_CONN = int(os.getenv("DB_MIN_CONN", "1"))
DB_MAX_CONN = int(os.getenv("DB_MAX_CONN", "2"))

DSN = (
    f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} "
    f"user={DB_USER} password={DB_PASSWORD} "
    f"sslmode={DB_SSLMODE} "
    f"connect_timeout=10 application_name=LearnPhish"
)


# ──────────────────────────────────────────────────────────────
# Connection pool (initialised once at startup)
# ──────────────────────────────────────────────────────────────
_pool: Optional[pg_pool.ThreadedConnectionPool] = None


def init_pool() -> None:
    """Create the global connection pool. Call once at app startup."""
    global _pool
    _pool = pg_pool.ThreadedConnectionPool(DB_MIN_CONN, DB_MAX_CONN, DSN)
    logger.info(
        "DB pool initialised: %s@%s:%s/%s (min=%s max=%s)",
        DB_USER, DB_HOST, DB_PORT, DB_NAME, DB_MIN_CONN, DB_MAX_CONN,
    )


def close_pool() -> None:
    """Close all connections. Call at app shutdown."""
    if _pool:
        _pool.closeall()
        logger.info("DB pool closed.")


# ── Decimal-aware JSON encoder for Redis caching ──────────────────────────────
import decimal as _decimal

class _DecimalEncoder(json.JSONEncoder):
    """Converts decimal.Decimal to float so psycopg2 NUMERIC columns
    can be safely serialised to Redis with json.dumps."""
    def default(self, obj):
        if isinstance(obj, _decimal.Decimal):
            return float(obj)
        return super().default(obj)

def _dumps(obj: object) -> str:
    """json.dumps with Decimal support."""
    return json.dumps(obj, cls=_DecimalEncoder)


def _is_conn_alive(conn) -> bool:
    """
    Test whether a pooled connection is still usable.

    Supabase's transaction-mode pooler (port 6543) silently drops idle
    connections after ~5 minutes. psycopg2's ThreadedConnectionPool does
    NOT validate connections before handing them back out, so we must do
    it ourselves.

    We use conn.closed (0 = open at socket level) and then a cheap
    SELECT 1 to confirm the server is actually reachable.
    """
    if conn is None or conn.closed != 0:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.reset()   # rollback any leftover transaction state
        return True
    except Exception:
        return False


@contextmanager
def get_conn() -> Generator[psycopg2.extensions.connection, None, None]:
    """
    Yield a healthy connection from the pool.

    Handles two failure modes that the default ThreadedConnectionPool ignores:
      1. PoolError (pool exhausted)      → retry with back-off
      2. Stale connection (server closed)→ discard and open a fresh one

    The rollback in the except block is wrapped in its own try/except so
    that an already-dead connection doesn't raise a second InterfaceError
    and hide the original exception.
    """
    if _pool is None:
        raise RuntimeError("DB pool not initialised. Call init_pool() first.")

    conn = None
    last_err: Exception = RuntimeError("Could not obtain a DB connection.")

    for attempt in range(5):
        try:
            candidate = _pool.getconn()
        except pg_pool.PoolError as exc:
            last_err = exc
            time.sleep(0.1 * (attempt + 1))
            continue

        if _is_conn_alive(candidate):
            conn = candidate
            break
        else:
            # Discard the dead connection so the pool replaces it
            try:
                _pool.putconn(candidate, close=True)
            except Exception:
                pass
            last_err = RuntimeError("Stale connection discarded, retrying…")
            time.sleep(0.05)

    if conn is None:
        raise last_err

    try:
        yield conn
        conn.commit()
    except Exception as exc:
        try:
            conn.rollback()
        except Exception:
            # Connection already dead — safe to ignore rollback failure
            pass
        raise
    finally:
        _pool.putconn(conn)


@contextmanager
def get_cursor(conn=None) -> Generator[psycopg2.extensions.cursor, None, None]:
    """Context manager providing a dict-cursor from an optional connection."""
    if conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        yield cur
        cur.close()
    else:
        with get_conn() as c:
            cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            yield cur
            cur.close()


# ──────────────────────────────────────────────────────────────
# Upstash Redis — lazy cache for whitelist / blacklist
# ──────────────────────────────────────────────────────────────
_CACHE_TTL  = int(os.getenv("CACHE_TTL_SECONDS", "600"))  # 10 minutes
_WL_PREFIX  = "lp:wl:"
_BL_PREFIX  = "lp:bl:"
_MISS       = "__MISS__"   # sentinel: domain queried but not found

_redis = None  # upstash_redis.Redis instance, set by init_redis()


def init_redis() -> None:
    """Connect to Upstash Redis. Safe to call even if credentials are absent."""
    global _redis
    url   = os.getenv("UPSTASH_REDIS_REST_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
    if not url or not token:
        logger.warning("Upstash Redis not configured — whitelist/blacklist served directly from DB.")
        return
    try:
        from upstash_redis import Redis
        _redis = Redis(url=url, token=token)
        logger.info("Upstash Redis cache ready: %s  TTL=%ds", url, _CACHE_TTL)
    except Exception as exc:
        logger.warning("Upstash Redis init failed: %s", exc)


def _rget(key: str) -> Optional[str]:
    """Get a string value from Redis. Returns None on miss or error."""
    if _redis is None:
        return None
    try:
        return _redis.get(key)
    except Exception as exc:
        logger.debug("Redis GET error: %s", exc)
        return None


def _rset(key: str, value: str) -> None:
    """Set a string value in Redis with the global TTL. Silent on error."""
    if _redis is None:
        return
    try:
        _redis.set(key, value, ex=_CACHE_TTL)
    except Exception as exc:
        logger.debug("Redis SET error: %s", exc)


def _rdel(*keys: str) -> None:
    """Delete one or more Redis keys (cache invalidation). Silent on error."""
    if _redis is None or not keys:
        return
    try:
        _redis.delete(*keys)
    except Exception as exc:
        logger.debug("Redis DEL error: %s", exc)


# ──────────────────────────────────────────────────────────────
# In-memory cache  — brands only (needed for heuristic fuzzy match)
# Whitelist / blacklist are now served lazily via Redis + DB.
# ──────────────────────────────────────────────────────────────
@dataclass
class MemoryCache:
    brand_names:            set[str]                    = field(default_factory=set)
    brands_by_len:          defaultdict[int, list[str]] = field(default_factory=lambda: defaultdict(list))
    brand_official_domains: set[str]                    = field(default_factory=set)
    loaded_at:              float                       = 0.0


_cache = MemoryCache()


def load_cache() -> None:
    """
    Load brands + official brand domains into local memory at startup.
    Whitelist and blacklist are no longer pre-loaded — they are fetched
    lazily from DB and cached in Upstash Redis with a TTL.
    """
    global _cache
    t0 = time.perf_counter()

    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

            # ── Brands ───────────────────────────────────────
            cur.execute("SELECT name FROM brands WHERE is_active = TRUE")
            brand_names: set[str] = set()
            brands_by_len: defaultdict[int, list[str]] = defaultdict(list)
            for row in cur.fetchall():
                name = row["name"]
                brand_names.add(name)
                brands_by_len[len(name)].append(name)

            # ── Official brand domains ────────────────────────
            cur.execute("""
                SELECT bd.domain
                FROM brand_domains bd
                JOIN brands b ON b.id = bd.brand_id
                WHERE b.is_active = TRUE
            """)
            official: set[str] = {row["domain"] for row in cur.fetchall()}

    _cache = MemoryCache(
        brand_names=brand_names,
        brands_by_len=brands_by_len,
        brand_official_domains=official,
        loaded_at=time.perf_counter(),
    )

    elapsed = (time.perf_counter() - t0) * 1000
    logger.info(
        "Memory cache loaded: %d brands, %d official domains  (%.1f ms)",
        len(brand_names), len(official), elapsed,
    )


def get_cache() -> MemoryCache:
    """Return the current in-memory brand cache."""
    return _cache


# ──────────────────────────────────────────────────────────────
# Hot-path lookups  (called per request, fully in-memory)
# ──────────────────────────────────────────────────────────────

def _registered_domain(hostname: str) -> str:
    """
    Extract the registered domain (SLD + TLD) from a full hostname.
    e.g. "www.google.com"      → "google.com"
         "login.paypal.com"    → "paypal.com"
         "google.com"          → "google.com"
         "bbc.co.uk"           → "bbc.co.uk"  (tldextract handles PSL)

    Uses tldextract when available; falls back to last two labels.
    """
    hostname = hostname.lower().strip()
    try:
        import tldextract
        ext = tldextract.extract(hostname)
        if ext.domain and ext.suffix:
            return f"{ext.domain}.{ext.suffix}"
    except Exception:
        pass
    # Fallback: last two dot-separated labels
    parts = hostname.rstrip(".").split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else hostname


def _lookup_wl_db(domain: str) -> Optional[dict]:
    """Query the DB for a single active whitelist entry. Returns None if missing."""
    try:
        with get_conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT domain, added_by FROM v_active_whitelist WHERE domain = lower(%s)",
                    (domain,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
    except Exception as exc:
        logger.error("is_whitelisted DB query failed: %s", exc)
        return None


def _lookup_bl_db(domain: str) -> Optional[dict]:
    """Query the DB for a single active blacklist entry. Returns None if missing."""
    try:
        with get_conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT domain, confidence, source FROM v_active_blacklist WHERE domain = lower(%s)",
                    (domain,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
    except Exception as exc:
        logger.error("is_blacklisted DB query failed: %s", exc)
        return None


def is_whitelisted(hostname: str) -> Optional[dict]:
    """
    Lazy Redis-backed whitelist lookup.
    Order: official brand domains (local) → Redis → DB → cache result in Redis.
    A whitelist entry for 'google.com' automatically covers all subdomains.
    """
    h = hostname.lower()
    reg = _registered_domain(h)

    # 1. Official brand domains are always in local memory (tiny, never expire)
    if h in _cache.brand_official_domains or reg in _cache.brand_official_domains:
        return {"domain": reg, "added_by": "brand_official"}

    # 2. Check Redis, then DB for both full hostname and registered domain
    for key_domain in ([h, reg] if reg != h else [h]):
        rkey = f"{_WL_PREFIX}{key_domain}"
        cached = _rget(rkey)
        if cached == _MISS:
            return None                     # known not-whitelisted, skip DB
        if cached:
            try:
                return json.loads(cached)   # Redis hit
            except Exception:
                pass
        # Redis miss → query DB
        result = _lookup_wl_db(key_domain)
        if result is not None:
            _rset(rkey, _dumps(result))
            return result
        # Cache the negative so we don't hit DB again within TTL
        _rset(rkey, _MISS)

    return None


def is_blacklisted(hostname: str) -> Optional[dict]:
    """
    Lazy Redis-backed blacklist lookup.
    Order: Redis → DB → cache result in Redis.
    A blacklist entry for 'evil.com' automatically blocks all subdomains.
    """
    h = hostname.lower()
    reg = _registered_domain(h)

    for key_domain in ([h, reg] if reg != h else [h]):
        rkey = f"{_BL_PREFIX}{key_domain}"
        cached = _rget(rkey)
        if cached == _MISS:
            return None
        if cached:
            try:
                return json.loads(cached)
            except Exception:
                pass
        result = _lookup_bl_db(key_domain)
        if result is not None:
            _rset(rkey, _dumps(result))
            return result
        _rset(rkey, _MISS)

    return None


def get_brand_names() -> set[str]:
    """Return set of active brand names for fuzzy matching."""
    return _cache.brand_names


def get_brands_by_len() -> defaultdict[int, list[str]]:
    """Return length-indexed brand dict for fast candidate retrieval."""
    return _cache.brands_by_len


def is_official_domain(domain: str) -> bool:
    """True if domain is an officially registered brand domain."""
    return domain.lower() in _cache.brand_official_domains


# ──────────────────────────────────────────────────────────────
# CRUD — Brands
# ──────────────────────────────────────────────────────────────

def add_brand(name: str, display_name: str, category: str = "other") -> dict:
    """Insert a new brand. Returns the created row."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO brands (name, display_name, category)
                VALUES (lower(%s), %s, %s)
                ON CONFLICT (name) DO UPDATE
                    SET display_name = EXCLUDED.display_name,
                        category     = EXCLUDED.category,
                        is_active    = TRUE,
                        updated_at   = NOW()
                RETURNING *
                """,
                (name, display_name, category),
            )
            row = dict(cur.fetchone())
    load_cache()
    return row


def deactivate_brand(name: str) -> bool:
    """Soft-delete a brand by setting is_active = FALSE."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE brands SET is_active = FALSE, updated_at = NOW() WHERE name = lower(%s)",
                (name,),
            )
            affected = cur.rowcount
    if affected:
        load_cache()
    return affected > 0


def list_brands(category: Optional[str] = None) -> list[dict]:
    """List all active brands, optionally filtered by category."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if category:
                cur.execute(
                    "SELECT * FROM brands WHERE is_active = TRUE AND category = %s ORDER BY name",
                    (category,),
                )
            else:
                cur.execute(
                    "SELECT * FROM brands WHERE is_active = TRUE ORDER BY category, name"
                )
            return [dict(r) for r in cur.fetchall()]


# ──────────────────────────────────────────────────────────────
# CRUD — Brand Domains
# ──────────────────────────────────────────────────────────────

def add_brand_domain(brand_name: str, domain: str, is_primary: bool = False) -> dict:
    """Add an official domain for a brand."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO brand_domains (brand_id, domain, is_primary)
                SELECT id, lower(%s), %s FROM brands WHERE name = lower(%s)
                ON CONFLICT (domain) DO UPDATE
                    SET is_primary = EXCLUDED.is_primary
                RETURNING *
                """,
                (domain, is_primary, brand_name),
            )
            row = dict(cur.fetchone())
    load_cache()
    return row


def list_brand_domains(brand_name: str) -> list[dict]:
    """Return all official domains for a brand."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT bd.* FROM brand_domains bd
                JOIN brands b ON b.id = bd.brand_id
                WHERE b.name = lower(%s)
                ORDER BY bd.is_primary DESC, bd.domain
                """,
                (brand_name,),
            )
            return [dict(r) for r in cur.fetchall()]


# ──────────────────────────────────────────────────────────────
# CRUD — Whitelist
# ──────────────────────────────────────────────────────────────

def add_to_whitelist(
    domain: str,
    added_by: str = "api",
) -> dict:
    """Add or reactivate a domain in the whitelist."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO domain_whitelist (domain, added_by)
                VALUES (lower(%s), %s)
                ON CONFLICT (domain) DO UPDATE
                    SET added_by   = EXCLUDED.added_by,
                        is_active  = TRUE,
                        updated_at = NOW()
                RETURNING *
                """,
                (domain, added_by),
            )
            row = dict(cur.fetchone())
    _rdel(f"{_WL_PREFIX}{domain.lower()}")
    return row


def remove_from_whitelist(domain: str) -> bool:
    """Soft-remove: set is_active = FALSE and evict from Redis cache."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE domain_whitelist SET is_active = FALSE, updated_at = NOW() WHERE domain = lower(%s)",
                (domain,),
            )
            affected = cur.rowcount
    if affected:
        _rdel(f"{_WL_PREFIX}{domain.lower()}")
    return affected > 0


def list_whitelist(limit: int = 100, offset: int = 0) -> list[dict]:
    """Paginated whitelist listing (active entries only)."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM v_active_whitelist ORDER BY domain LIMIT %s OFFSET %s",
                (limit, offset),
            )
            return [dict(r) for r in cur.fetchall()]


# ──────────────────────────────────────────────────────────────
# CRUD — Blacklist
# ──────────────────────────────────────────────────────────────

def add_to_blacklist(
    domain: str,
    confidence: float = 1.0,
    source: str = "manual",
) -> dict:
    """Add or update a domain in the blacklist."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO domain_blacklist
                    (domain, confidence, source, last_confirmed_at)
                VALUES (lower(%s), %s, %s, NOW())
                ON CONFLICT (domain) DO UPDATE
                    SET confidence        = EXCLUDED.confidence,
                        source            = EXCLUDED.source,
                        is_active         = TRUE,
                        last_confirmed_at = NOW(),
                        updated_at        = NOW()
                RETURNING *
                """,
                (domain, confidence, source),
            )
            row = dict(cur.fetchone())
    _rdel(f"{_BL_PREFIX}{domain.lower()}")
    return row


def remove_from_blacklist(domain: str) -> bool:
    """Soft-remove from blacklist and evict from Redis cache."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE domain_blacklist SET is_active = FALSE, updated_at = NOW() WHERE domain = lower(%s)",
                (domain,),
            )
            affected = cur.rowcount
    if affected:
        _rdel(f"{_BL_PREFIX}{domain.lower()}")
    return affected > 0


def list_blacklist(
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """Paginated blacklist listing (active entries only)."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT * FROM v_active_blacklist
                ORDER BY confidence DESC, domain
                LIMIT %s OFFSET %s
                """,
                (limit, offset),
            )
            return [dict(r) for r in cur.fetchall()]


# ──────────────────────────────────────────────────────────────
# CRUD — False Positives
# ──────────────────────────────────────────────────────────────

def report_false_positive(
    url: str,
    domain: str,
    triggered_rule: Optional[str],
    similarity_score: Optional[float],
    matched_brand: Optional[str],
    user_feedback: str,
    notes: str = "",
) -> dict:
    """Record a user-reported false positive."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO false_positives
                    (url, domain, triggered_rule, similarity_score,
                     matched_brand, user_feedback, notes)
                VALUES (%s, lower(%s), %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (url, domain, triggered_rule, similarity_score,
                 matched_brand, user_feedback, notes),
            )
            return dict(cur.fetchone())


def resolve_false_positive(fp_id: int, resolved_by: str) -> bool:
    """Mark a false positive as resolved."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE false_positives
                SET resolved = TRUE, resolved_by = %s, resolved_at = NOW()
                WHERE id = %s
                """,
                (resolved_by, fp_id),
            )
            return cur.rowcount > 0


def list_false_positives(resolved: Optional[bool] = None, limit: int = 50) -> list[dict]:
    """List false positive reports, optionally filtered by resolved status."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if resolved is None:
                cur.execute(
                    "SELECT * FROM false_positives ORDER BY created_at DESC LIMIT %s",
                    (limit,),
                )
            else:
                cur.execute(
                    """
                    SELECT * FROM false_positives
                    WHERE resolved = %s
                    ORDER BY created_at DESC LIMIT %s
                    """,
                    (resolved, limit),
                )
            return [dict(r) for r in cur.fetchall()]


def get_false_positive(fp_id: int) -> Optional[dict]:
    """Fetch a single false positive report by ID."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM false_positives WHERE id = %s",
                (fp_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


# ──────────────────────────────────────────────────────────────
# Scan logging
# ──────────────────────────────────────────────────────────────

def log_scan(
    url: str,
    domain: str,
    whitelist_hit: bool,
    blacklist_hit: bool,
    heuristic_verdict: Optional[str],
    heuristic_flags: Optional[list],
    brand_verdict: Optional[str],
    brand_matched: Optional[str],
    ml_skipped: bool,
    ml_prediction: Optional[str],
    ml_confidence: Optional[float],
    ml_risk_score: Optional[float],
    final_verdict: str,
    final_confidence: Optional[float],
    response_ms: Optional[int] = None,
) -> None:
    """Append a row to scan_log. Fire-and-forget — errors are logged, not raised."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO scan_log (
                        url, domain,
                        whitelist_hit, blacklist_hit,
                        heuristic_verdict, heuristic_flags,
                        brand_verdict, brand_matched,
                        ml_skipped, ml_prediction, ml_confidence, ml_risk_score,
                        final_verdict, final_confidence, response_ms
                    ) VALUES (
                        %s, lower(%s),
                        %s, %s,
                        %s, %s::jsonb,
                        %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s
                    )
                    """,
                    (
                        url, domain,
                        whitelist_hit, blacklist_hit,
                        heuristic_verdict,
                        psycopg2.extras.Json(heuristic_flags) if heuristic_flags else None,
                        brand_verdict, brand_matched,
                        ml_skipped, ml_prediction, ml_confidence, ml_risk_score,
                        final_verdict, final_confidence, response_ms,
                    ),
                )
    except Exception as exc:
        logger.error("scan_log insert failed: %s", exc)


# ──────────────────────────────────────────────────────────────
# Quiz helpers
# ──────────────────────────────────────────────────────────────

def fetch_quiz_question(domain_name: str, exclude_ids: list[int]) -> Optional[dict]:
    """
    Return a random active question for the given threat domain, excluding
    questions the user has already answered (supplied as a list of IDs from
    browser localStorage).

    Atomically increments `times_fetched` on the chosen row.
    Returns None if no new questions exist for this domain (all exhausted).

    The response dict intentionally OMITS correct_index and explanation_text
    so the answers cannot be read from the browser network tab.
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Build the exclusion clause dynamically (safe — IDs are integers)
            exclude_clause = ""
            if exclude_ids:
                # Cast to integers defensively to prevent injection
                safe_ids = [int(i) for i in exclude_ids]
                exclude_clause = f"AND qq.id NOT IN ({','.join(str(i) for i in safe_ids)})"

            cur.execute(
                f"""
                SELECT qq.id, qq.question_text, qq.options
                FROM quiz_questions qq
                JOIN threat_domains td ON td.id = qq.domain_id
                WHERE td.name = %s
                  AND qq.is_active = TRUE
                  {exclude_clause}
                ORDER BY RANDOM()
                LIMIT 1
                """,
                (domain_name,),
            )
            row = cur.fetchone()
            if row is None:
                return None

            question_id = row["id"]

            # Atomic increment — delegates math to PostgreSQL, no race condition
            cur.execute(
                "UPDATE quiz_questions SET times_fetched = times_fetched + 1 WHERE id = %s",
                (question_id,),
            )
            return {
                "id":            question_id,
                "question_text": row["question_text"],
                "options":       row["options"],   # JSONB → Python list
            }


def record_quiz_answer(question_id: int, selected_index: int) -> Optional[dict]:
    """
    Validate the user's answer against the database and atomically
    increment the correct telemetry counter.

    Returns a dict with:
        is_correct      — bool
        explanation_text — str (revealed only now)
    Returns None if question_id does not exist.
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Fetch the correct answer — single PK lookup, O(1)
            cur.execute(
                "SELECT correct_index, explanation_text FROM quiz_questions WHERE id = %s AND is_active = TRUE",
                (question_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None

            is_correct = (selected_index == row["correct_index"])

            # Atomic counter increment — no read-modify-write, concurrency-safe
            counter_col = "times_correct" if is_correct else "times_incorrect"
            cur.execute(
                f"UPDATE quiz_questions SET {counter_col} = {counter_col} + 1 WHERE id = %s",
                (question_id,),
            )

            return {
                "is_correct":       is_correct,
                "explanation_text": row["explanation_text"],
            }


# ──────────────────────────────────────────────────────────────
# ML Feature Dataset Logging
# ──────────────────────────────────────────────────────────────

def log_ml_features(
    url_redacted: str,
    label: int,                   # 1 = phishing, 0 = legitimate
    features: dict,
    model_version: str = "rf_v1",
) -> None:
    """
    Append a row to ml_feature_logs for the public dataset.

    Each ML feature gets its own column (no JSON blobs), making the
    table directly exportable as a clean CSV for model training.

    Fire-and-forget — errors are logged, never raised, so this
    never blocks or breaks the main scan response.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO ml_feature_logs (
                        url_redacted, label, model_version,
                        url_length, hostname_length, has_ip_address,
                        count_dots, count_hyphens, count_at,
                        count_exclamation, count_ampersand, count_pipe,
                        count_equal, count_underscore, count_percent,
                        count_slash, count_asterisk, count_colon, count_space,
                        has_www, has_com, count_double_slash, uses_https,
                        ratio_digits_path, ratio_digits_hostname,
                        is_punycode, tld_in_path, has_abnormal_subdomain,
                        subdomain_count, has_prefix_suffix, is_shortening_service,
                        path_extension_category, has_multiple_extensions,
                        path_depth, phish_hints,
                        has_query, query_param_count, has_sensitive_query_keys,
                        query_has_url_value, query_value_max_length,
                        query_has_file_extension, query_has_double_file_extension,
                        query_entropy,
                        has_char_repeat, max_word_length_url,
                        max_word_length_hostname, max_word_length_path,
                        brand_in_domain, brand_in_subdomain, brand_in_path,
                        brand_mismatch, brand_impersonation_score,
                        is_suspicious_tld, tld_length,
                        entropy_url, entropy_domain, entropy_path, entropy_query,
                        has_login_keyword, has_secure_keyword, has_account_keyword,
                        has_update_keyword, has_verify_keyword, has_redirection_keyword,
                        vowel_ratio_sld, consecutive_consonants_max_sld, has_digit_sld,
                        ratio_special_chars_url, domain_has_https
                    ) VALUES (
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s,
                        %s,
                        %s, %s,
                        %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s,
                        %s
                    )
                    """,
                    (
                        url_redacted, label, model_version,
                        features.get("url_length"),
                        features.get("hostname_length"),
                        features.get("has_ip_address"),
                        features.get("count_dots"),
                        features.get("count_hyphens"),
                        features.get("count_at"),
                        features.get("count_exclamation"),
                        features.get("count_ampersand"),
                        features.get("count_pipe"),
                        features.get("count_equal"),
                        features.get("count_underscore"),
                        features.get("count_percent"),
                        features.get("count_slash"),
                        features.get("count_asterisk"),
                        features.get("count_colon"),
                        features.get("count_space"),
                        features.get("has_www"),
                        features.get("has_com"),
                        features.get("count_double_slash"),
                        features.get("uses_https"),
                        features.get("ratio_digits_path"),
                        features.get("ratio_digits_hostname"),
                        features.get("is_punycode"),
                        features.get("tld_in_path"),
                        features.get("has_abnormal_subdomain"),
                        features.get("subdomain_count"),
                        features.get("has_prefix_suffix"),
                        features.get("is_shortening_service"),
                        features.get("path_extension_category"),
                        features.get("has_multiple_extensions"),
                        features.get("path_depth"),
                        features.get("phish_hints"),
                        features.get("has_query"),
                        features.get("query_param_count"),
                        features.get("has_sensitive_query_keys"),
                        features.get("query_has_url_value"),
                        features.get("query_value_max_length"),
                        features.get("query_has_file_extension"),
                        features.get("query_has_double_file_extension"),
                        features.get("query_entropy"),
                        features.get("has_char_repeat"),
                        features.get("max_word_length_url"),
                        features.get("max_word_length_hostname"),
                        features.get("max_word_length_path"),
                        features.get("brand_in_domain"),
                        features.get("brand_in_subdomain"),
                        features.get("brand_in_path"),
                        features.get("brand_mismatch"),
                        features.get("brand_impersonation_score"),
                        features.get("is_suspicious_tld"),
                        features.get("tld_length"),
                        features.get("entropy_url"),
                        features.get("entropy_domain"),
                        features.get("entropy_path"),
                        features.get("entropy_query"),
                        features.get("has_login_keyword"),
                        features.get("has_secure_keyword"),
                        features.get("has_account_keyword"),
                        features.get("has_update_keyword"),
                        features.get("has_verify_keyword"),
                        features.get("has_redirection_keyword"),
                        features.get("vowel_ratio_sld"),
                        features.get("consecutive_consonants_max_sld"),
                        features.get("has_digit_sld"),
                        features.get("ratio_special_chars_url"),
                        features.get("domain_has_https"),
                    ),
                )
    except Exception as exc:
        logger.error("ml_feature_logs insert failed: %s", exc)


