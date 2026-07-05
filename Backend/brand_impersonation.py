

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional
import logging
from collections import defaultdict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Optional fast fuzzy library; falls back to difflib
try:
    from rapidfuzz import fuzz as _fuzz
    def _similarity(a: str, b: str) -> float:
        return _fuzz.ratio(a, b) / 100.0
except ImportError:
    from difflib import SequenceMatcher
    def _similarity(a: str, b: str) -> float:
        return SequenceMatcher(None, a, b).ratio()

# Optional unidecode; falls back to manual homoglyph map
try:
    from unidecode import unidecode as _unidecode
    def _to_ascii(text: str) -> str:
        return _unidecode(text).lower()
except ImportError:
    _HOMOGLYPH_MAP: dict[str, str] = {
        "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x",
        "і": "i", "ѕ": "s", "ν": "v", "η": "n", "ρ": "p", "ο": "o",
        "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z",
        "ι": "i", "κ": "k", "μ": "m", "τ": "t", "υ": "u", "ω": "w",
        "ℬ": "b", "ℰ": "e", "ℱ": "f", "ℋ": "h", "ℐ": "i", "ℒ": "l",
        "ℳ": "m", "ℛ": "r", "𝒜": "a", "𝒞": "c", "𝒟": "d", "𝒢": "g",
        "１": "1", "２": "2", "３": "3", "４": "4", "５": "5",
        "６": "6", "７": "7", "８": "8", "９": "9", "０": "0",
    }
    def _to_ascii(text: str) -> str:
        out = [_HOMOGLYPH_MAP.get(ch, ch) for ch in text.lower()]
        return "".join(c for c in "".join(out) if ord(c) < 128)


# ──────────────────────────────────────────────────────────────
# Minimal fallback brands (used only when DB is unavailable)
# ──────────────────────────────────────────────────────────────
def load_fallback_brands(file_path: str) -> set[str]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return {line.strip().lower() for line in f if line.strip()}
    except Exception:
        return set()

_FALLBACK_BRANDS: set[str] = load_fallback_brands("scripts/allbrands.txt")

# ──────────────────────────────────────────────────────────────
# Thresholds similarity
# ──────────────────────────────────────────────────────────────
SIMILARITY_THRESHOLD      = 0.70   # suspicious (typosquatting)
SIMILARITY_BLOCK_THRESHOLD = 0.80  # block (near-exact typosquatting, e.g. paypai ≈ paypal)
LENGTH_TOLERANCE          = 2      # for whole-SLD matching


# ──────────────────────────────────────────────────────────────
# Result dataclass
# ──────────────────────────────────────────────────────────────
@dataclass
class BrandCheckResult:
    verdict: str = "pass"                  # "pass" | "suspicious" | "block"
    triggered_rule: Optional[str] = None   # which rule fired
    matched_brand: Optional[str] = None
    similarity_score: Optional[float] = None
    message: str = ""
    had_unicode: bool = False
    normalized_sld: str = ""
    real_domain: Optional[str] = None      # primary official domain for matched brand,
                                           # None if brand has no DB entry


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _get_brands() -> tuple[set[str], dict]:
    """Return (brand_names_set, brands_by_len_dict) from DB cache or fallback."""
    try:
        from db import get_brand_names, get_brands_by_len
        names = get_brand_names()
        by_len = get_brands_by_len()
        if names:
            return names, by_len
    except Exception as e:
        logger.error("Failed to fetch brands from DB: %s. Falling back.", e)
    by_len: defaultdict[int, list[str]] = defaultdict(list)
    for b in _FALLBACK_BRANDS:
        by_len[len(b)].append(b)
    return _FALLBACK_BRANDS, by_len


def _get_brand_primary_domain(brand_name: str) -> Optional[str]:
    """
    Look up the primary official domain for a matched brand.
    Returns None if the brand has no primary domain entry in the DB,
    or if the DB is unavailable — callers must handle None gracefully.
    """
    try:
        from db import get_brand_primary_domain
        return get_brand_primary_domain(brand_name)
    except Exception:
        return None


def _get_official_domains() -> set[str]:
    try:
        from db import get_cache
        return get_cache().brand_official_domains
    except Exception:
        return set()


def _find_domains_containing(brand_name: str) -> list[str]:
    return [d for d in _get_official_domains() if brand_name in d]


import tldextract

def _extract_sld(hostname: str) -> str:
    return tldextract.extract(hostname).domain

def _extract_subdomain(hostname: str) -> str:
    return tldextract.extract(hostname).subdomain

def _extract_domain(hostname: str) -> str:
    ext = tldextract.extract(hostname)
    return f"{ext.domain}.{ext.suffix}"


def _get_candidates(token: str, brands_by_len: dict, tolerance: int = LENGTH_TOLERANCE) -> list[str]:
    """Return brand candidates within ±tolerance characters of token length."""
    L = len(token)
    candidates: list[str] = []
    for offset in range(-tolerance, tolerance + 1):
        candidates.extend(brands_by_len.get(L + offset, []))
    return candidates


def _best_match(token: str, candidates: list[str]) -> tuple[float, str]:
    best_score, best_brand = 0.0, ""
    for brand in candidates:
        score = _similarity(token, brand)
        if score > best_score:
            best_score, best_brand = score, brand
    return best_score, best_brand


def _has_prefix_suffix(sld: str, brand_names: set[str]) -> Optional[str]:
    """
    Detect paypal-secure.com (prefix) or secure-paypal.com (suffix).
    Also detects paypai-anything.com by checking if the pre-hyphen part
    is a near-exact match (≥ SIMILARITY_BLOCK_THRESHOLD) to a brand.
    """
    # Exact brand at start/end with separator
    for brand in brand_names:
        if re.match(rf"^{re.escape(brand)}[\-_0-9]", sld):
            return brand
        if re.search(rf"[\-_]{re.escape(brand)}$", sld):
            return brand
    return None


def _check_sld_tokens(sld: str, brands_by_len: dict) -> Optional[tuple[str, float, str]]:
    """
    Split a hyphenated/digit-separated SLD into tokens and fuzzy-match
    each token against brands.

    'paypai-security' → tokens ['paypai', 'security']
    'ch4se-bank' → tokens ['ch4se', 'bank']
    'paypai' (len 6) has candidates including 'paypal' (len 6)
    similarity('paypai','paypal') = 0.83 ≥ SIMILARITY_BLOCK_THRESHOLD → block

    Returns (matched_brand, score, token) or None.
    Only returns a result if the token itself is ≥ 3 chars (avoids false
    positives from single-letter separators or digits).
    """
    tokens = re.split(r"[\-_]+", sld)   # keep digits inside tokens ("ch4se")
    best: Optional[tuple[str, float, str]] = None
    best_score = 0.0

    for token in tokens:
        token = token.strip()
        if len(token) < 3:
            continue
        candidates = _get_candidates(token, brands_by_len)
        if not candidates:
            continue
        score, brand = _best_match(token, candidates)
        if score >= SIMILARITY_THRESHOLD and score > best_score:
            best_score = score
            best = (brand, score, token)

    return best


def _check_subdomain_tokens(subdomain: str, brand_names: set[str], brands_by_len: dict) -> Optional[tuple[str, float, str]]:
    """
    Check each dot/hyphen-separated subdomain label for brand impersonation.

    'login.paypal' → tokens ['login', 'paypal']
    'paypal' exact match with brand → block (brand in subdomain)

    Returns (matched_brand, score, token) or None.
    """
    if not subdomain:
        return None

    # Split on dots and hyphens
    labels = re.split(r"[.\-_]", subdomain.lower())
    best: Optional[tuple[str, float, str]] = None
    best_score = 0.0

    for label in labels:
        label = label.strip()
        if len(label) < 3:
            continue

        # Exact brand match in subdomain → definite block
        if label in brand_names:
            return (label, 1.0, label)

        # Fuzzy match
        candidates = _get_candidates(label, brands_by_len)
        if not candidates:
            continue
        score, brand = _best_match(label, candidates)
        if score >= SIMILARITY_THRESHOLD and score > best_score:
            best_score = score
            best = (brand, score, label)

    return best


# ──────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────

def check_brand_impersonation(hostname: str) -> BrandCheckResult:
    """
    Run the full brand-impersonation check against a hostname.

    Detection stages (in order of priority):
      0. Exact official domain            → pass immediately
      1. Punycode (xn--)                  → block (homograph)
      2. Exact prefix/suffix wrapping     → block (e.g. paypal-login.com)
      3. Subdomain token check            → block/suspicious
         (paypal.evil.com → brand in subdomain)
      4. SLD token check (hyphen parts)   → block/suspicious
         (paypai-security.com → "paypai" ≈ "paypal")
      5. Whole-SLD ASCII fuzzy match      → block/suspicious
         (paypai.com → whole SLD ≈ paypal)
      6. Unicode homograph path           → block
    """
    hostname = hostname.lower().strip()
    hostname_clean = re.sub(r":\d+$", "", hostname)   # strip port

    brand_names, brands_by_len = _get_brands()
    official_domains = _get_official_domains()

    # ── 0. Exact official domain → pass ─────────────────────
    if hostname_clean in official_domains:
        return BrandCheckResult(verdict="pass", message="Verified official brand domain.")

    sld       = _extract_sld(hostname_clean)
    subdomain = _extract_subdomain(hostname_clean)
    domai     = _extract_domain(hostname_clean)

    if not sld:
        return BrandCheckResult(verdict="pass", message="Could not extract SLD.")

    # ── 1. Punycode → block ──────────────────────────────────
    if "xn--" in hostname_clean:
        return BrandCheckResult(
            verdict="block",
            triggered_rule="homograph",
            message=(
                "Punycode (xn--) detected in domain. "
                "Strong indicator of a Unicode homograph/look-alike attack."
            ),
            had_unicode=True,
            normalized_sld=sld,
        )

    # ── 2. Exact prefix / suffix brand wrapping ──────────────
    prefix_brand = _has_prefix_suffix(sld, brand_names)
    if prefix_brand:
        return BrandCheckResult(
            verdict="block",
            triggered_rule="prefix_suffix",
            matched_brand=prefix_brand,
            message=(
                f"Domain '{sld}' wraps the brand '{prefix_brand}' with a prefix "
                "or suffix — a common phishing pattern (e.g. paypal-secure.com)."
            ),
            normalized_sld=sld,
            real_domain=_get_brand_primary_domain(prefix_brand),
        )

    # ── 3. Subdomain token check ─────────────────────────────
    # Catches: paypal.evil.com, login.paypal.evil.com
    if subdomain:
        sub_match = _check_subdomain_tokens(subdomain, brand_names, brands_by_len)
        if sub_match:
            brand, score, token = sub_match
            is_exact = (score == 1.0)
            verdict  = "block" if score >= SIMILARITY_BLOCK_THRESHOLD else "suspicious"
            rule     = "brand_in_subdomain"
            msg = (
                f"Brand name '{brand}' found in subdomain (token '{token}'). "
                "Attackers place brand names in subdomains to make URLs look "
                f"trustworthy — but the real domain is '{domai}'."
                if is_exact else
                f"Subdomain token '{token}' is {score*100:.0f}% similar to brand "
                f"'{brand}' — possible subdomain impersonation."
            )
            return BrandCheckResult(
                verdict=verdict,
                triggered_rule=rule,
                matched_brand=brand,
                similarity_score=round(score, 4),
                message=msg,
                normalized_sld=sld,
                real_domain=_get_brand_primary_domain(brand),
            )

    # ── 4. SLD token check (hyphenated parts) ────────────────
    # Catches: paypai-security.com → token "paypai" ≈ "paypal"
    if "-" in sld or "_" in sld or re.search(r"\d", sld):
        token_match = _check_sld_tokens(sld, brands_by_len)
        if token_match:
            brand, score, token = token_match
            verdict = "block" if score >= SIMILARITY_BLOCK_THRESHOLD else "suspicious"
            msg = (
                f"Part of the domain name ('{token}') is {score*100:.0f}% similar to "
                f"the brand '{brand}'. The full domain '{sld}' appears to impersonate "
                f"'{brand}' by adding a hyphen and extra words."
            )
            return BrandCheckResult(
                verdict=verdict,
                triggered_rule="typosquatting_token",
                matched_brand=brand,
                similarity_score=round(score, 4),
                message=msg,
                normalized_sld=sld,
                real_domain=_get_brand_primary_domain(brand),
            )


    # ── 5. Whole-SLD ASCII fuzzy match ───────────────────────
    if sld.isascii():
        candidates = _get_candidates(sld, brands_by_len)
        if candidates:
            score, brand = _best_match(sld, candidates)

            # Exact name match: SLD IS the brand (e.g. "google" in google.com).
            # This is the LEGITIMATE pattern — a brand name standing alone as
            # the SLD with no prefix/suffix (caught in Step 2) and no brand in
            # subdomain (caught in Step 3).
            #
            # We do NOT block here because:
            #   • The real domain owner SHOULD have their brand as the SLD.
            #   • Suspicious TLD abuse (google.xyz, google.tk) is already
            #     handled by the structural heuristic's `suspicious_tld` check,
            #     so brand impersonation must not double-flag it — that causes
            #     false positives on legitimate domains whose official entries
            #     may be absent or incomplete in the DB.

            if score == 1.0:
                return BrandCheckResult(
                    verdict="pass",
                    triggered_rule=None,
                    matched_brand=brand,
                    similarity_score=1.0,
                    message=(
                        f"Domain SLD '{sld}' exactly matches the brand '{brand}' "
                        "with no prefix, suffix, or subdomain tricks — "
                        "consistent with the legitimate official domain pattern."
                    ),
                    normalized_sld=sld,
                )

            # Near-exact match → block; moderate match → suspicious
            if score >= SIMILARITY_BLOCK_THRESHOLD:
                return BrandCheckResult(
                    verdict="block",
                    triggered_rule="typosquatting",
                    matched_brand=brand,
                    similarity_score=round(score, 4),
                    message=(
                        f"Domain '{sld}' is {score*100:.1f}% similar to brand "
                        f"'{brand}' — high-confidence typosquatting."
                    ),
                    normalized_sld=sld,
                    real_domain=_get_brand_primary_domain(brand),
                )

            if score >= SIMILARITY_THRESHOLD:
                return BrandCheckResult(
                    verdict="suspicious",
                    triggered_rule="typosquatting",
                    matched_brand=brand,
                    similarity_score=round(score, 4),
                    message=(
                        f"Domain '{sld}' is {score*100:.1f}% similar to '{brand}' "
                        "— possible typosquatting."
                    ),
                    normalized_sld=sld,
                    real_domain=_get_brand_primary_domain(brand),
                )

        return BrandCheckResult(verdict="pass", message="No brand impersonation detected.")

    # ── 6. Non-ASCII / Unicode homoglyph path ────────────────
    normalized = _to_ascii(sld)

    if normalized == sld:
        # Normalization had no effect → treat as plain ASCII
        candidates = _get_candidates(sld, brands_by_len)
        score, brand = _best_match(sld, candidates) if candidates else (0.0, "")
        if score >= SIMILARITY_BLOCK_THRESHOLD:
            return BrandCheckResult(
                verdict="block",
                triggered_rule="typosquatting",
                matched_brand=brand,
                similarity_score=round(score, 4),
                message=f"Domain '{sld}' is {score*100:.1f}% similar to '{brand}'.",
                had_unicode=True,
                normalized_sld=normalized,
            )
        if score >= SIMILARITY_THRESHOLD:
            return BrandCheckResult(
                verdict="suspicious",
                triggered_rule="typosquatting",
                matched_brand=brand,
                similarity_score=round(score, 4),
                message=f"Domain '{sld}' is {score*100:.1f}% similar to '{brand}'.",
                had_unicode=True,
                normalized_sld=normalized,
            )
        return BrandCheckResult(
            verdict="pass",
            message="International domain — no brand match after normalization.",
            had_unicode=True,
            normalized_sld=normalized,
        )

    # Normalization changed the text → check normalized form for homograph
    candidates = _get_candidates(normalized, brands_by_len)
    score, brand = _best_match(normalized, candidates) if candidates else (0.0, "")

    if score >= SIMILARITY_THRESHOLD:
        return BrandCheckResult(
            verdict="block",
            triggered_rule="homograph",
            matched_brand=brand,
            similarity_score=round(score, 4),
            message=(
                f"Unicode homograph attack: '{sld}' normalises to '{normalized}' "
                f"({score*100:.1f}% match to '{brand}'). "
                "Look-alike characters used to impersonate a known brand."
            ),
            had_unicode=True,
            normalized_sld=normalized,
            real_domain=_get_brand_primary_domain(brand),
        )

    return BrandCheckResult(
        verdict="pass",
        message="International domain — no brand impersonation detected.",
        had_unicode=True,
        normalized_sld=normalized,
    )
