"""
heuristic.py
────────────
Pre-ML heuristic engine.

KEY DESIGN PRINCIPLE (TODO-1 + TODO-2):
  Detection and explanation are now FULLY DECOUPLED.

  - EVERY check ALWAYS runs regardless of any earlier result.
  - Every check records both its result (pass/fail) AND its measured value.
  - The detection verdict is computed at the END from all results.
  - No early-return short-circuits that would leave explanation data incomplete.

This means:
  • Whitelist hit? → all 10 structural rules still evaluate.
  • Brand BLOCK?  → DGA still runs and records all 8 feature values.
  • Detection says BLOCK? → ML decision is made by main.py, but heuristic
    still hands back the COMPLETE picture for the explainer.

Verdict meanings (for main.py decision gate):
  "block"      → high-confidence phishing, can skip ML.
  "suspicious" → uncertain, send to ML.
  "pass"       → clean, send to ML for final confirmation.

Public API:
  run_heuristics(url: str) -> HeuristicResult
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse

from brand_impersonation import check_brand_impersonation, BrandCheckResult
from dga_detector import check_dga


# ──────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────
SUSPICIOUS_TLDS: set[str] = {
    'fit', 'tk', 'gp', 'ga', 'work', 'ml', 'date', 'wang', 'men', 'icu',
    'online', 'click', 'country', 'stream', 'download', 'xin', 'racing',
    'jetzt', 'ren', 'mom', 'party', 'review', 'trade', 'accountants',
    'science', 'ninja', 'xyz', 'faith', 'zip', 'cricket', 'win',
    'accountant', 'realtor', 'top', 'christmas', 'gdn', 'link',
    'asia', 'club', 'la', 'ae', 'exposed', 'pe', 'go.id', 'rs',
    'ce.ke', 'audio', 'gob.pe', 'gov.az', 'website', 'bj', 'mx',
    'media', 'k12.pa.us', 'or.kr', 'sa.gov.au'
}

PHISH_KEYWORDS: list[str] = [
    "login", "signin", "sign-in", "secure", "security", "verify",
    "verification", "update", "account", "confirm", "banking",
    "wallet", "password", "credential", "authenticate", "support",
    "helpdesk", "invoice", "billing", "payment", "recover",
    "suspend", "unlock", "reset", "alert", "notice", "bantuan","tng", "tng-wallet",
    "wallet", "ewallet", "ewalet", "bantuan-malaysia"
]

# Rules that are strong enough to warrant a detection BLOCK on their own
BLOCK_RULES: set[str] = {"ip_address", "punycode", "at_symbol", "embedded_http"}


# ──────────────────────────────────────────────────────────────
# StructuralCheck — one evaluated rule with full pass/fail data
# ──────────────────────────────────────────────────────────────
@dataclass
class StructuralCheck:
    """
    Represents one evaluated structural rule.
    Always present in the response whether it passed or failed.
    """
    rule: str
    severity: int          # 1 low · 2 medium · 3 high
    triggered: bool        # True = red flag found
    message_fail: str      # shown when triggered=True
    message_pass: str      # shown when triggered=False
    measured_value: str    # the actual value that was measured, e.g. "3 subdomains"

    @property
    def message(self) -> str:
        return self.message_fail if self.triggered else self.message_pass

    def to_dict(self) -> dict:
        return {
            "rule":           self.rule,
            "severity":       self.severity,
            "severity_label": "High" if self.severity == 3 else "Medium" if self.severity == 2 else "Low",
            "triggered":      self.triggered,
            "message":        self.message,
            "measured_value": self.measured_value,
        }


# ──────────────────────────────────────────────────────────────
# HeuristicResult
# ──────────────────────────────────────────────────────────────
@dataclass
class HeuristicResult:
    """
    Full result of the heuristic engine.

    structural_checks: ALL 10 rules, always populated (triggered or not).
    brand_check:       Always populated (never None after run_heuristics).
    dga_check:         Always populated (never None after run_heuristics).
    verdict:           Detection decision — "block" | "suspicious" | "pass".
    ml_skipped:        Set by main.py after the decision gate, not here.
    """
    verdict: str = "pass"
    summary: str = ""

    # ALL structural checks (10 items, always present)
    structural_checks: list[StructuralCheck] = field(default_factory=list)

    # Convenience: only the triggered structural checks (subset of above)
    triggered_flags: list[StructuralCheck] = field(default_factory=list)

    # Brand and DGA always run, always populated
    brand_check: Optional[BrandCheckResult] = None
    dga_check:   Optional[DGAResult]        = None

    # Set by main.py decision gate after verdict is known
    ml_skipped: bool = False

    def to_dict(self) -> dict:
        brand = self.brand_check
        dga   = self.dga_check
        return {
            "verdict":    self.verdict,
            "summary":    self.summary,
            "ml_skipped": self.ml_skipped,

            # ALL 10 structural checks — for the full checklist view
            "all_checks": [c.to_dict() for c in self.structural_checks],

            # Only triggered ones — for legacy/summary use
            "flags": [c.to_dict() for c in self.triggered_flags],

            "brand_check": {
                "verdict":          brand.verdict,
                "triggered_rule":   brand.triggered_rule,
                "matched_brand":    brand.matched_brand,
                "similarity_score": brand.similarity_score,
                "message":          brand.message,
                "had_unicode":      brand.had_unicode,
                "normalized_sld":   brand.normalized_sld,
                "real_domain":      brand.real_domain,
            } if brand else None,

            # Full DGA result including all 8 features (triggered and not)
            "dga_check": dga.to_dict() if dga else None,
        }


# ──────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────
_IP_RE = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")

def _is_ip(hostname: str) -> bool:
    return bool(_IP_RE.match(hostname.split(":")[0]))

def _get_tld(hostname: str) -> str:
    parts = hostname.rstrip(".").split(".")
    return parts[-1].lower() if parts else ""

def _has_phish_keyword(url: str) -> Optional[str]:
    url_lower = url.lower()
    for kw in PHISH_KEYWORDS:
        if kw in url_lower:
            return kw
    return None

def _count_subdomains(hostname: str) -> int:
    parts = hostname.strip(".").split(".")
    return max(0, len(parts) - 2)


# ──────────────────────────────────────────────────────────────
# Rule evaluators — each returns a StructuralCheck
# ──────────────────────────────────────────────────────────────

def _check_ip(hostname: str) -> StructuralCheck:
    triggered = bool(hostname and _is_ip(hostname))
    return StructuralCheck(
        rule="ip_address", severity=3, triggered=triggered,
        measured_value=hostname if triggered else "no IP detected",
        message_fail=(
            f"URL uses a raw IP address ({hostname}) instead of a domain name. "
            "Legitimate services almost never do this."
        ),
        message_pass="Uses a proper domain name, not a raw IP address. ✓",
    )

def _check_punycode(hostname: str) -> StructuralCheck:
    triggered = "xn--" in hostname
    return StructuralCheck(
        rule="punycode", severity=3, triggered=triggered,
        measured_value="xn-- found" if triggered else "no punycode",
        message_fail=(
            "Punycode (xn--) detected in the domain. "
            "Attackers use internationalized characters to impersonate real domains."
        ),
        message_pass="No Punycode detected — domain uses standard ASCII characters. ✓",
    )

def _check_suspicious_tld(hostname: str) -> StructuralCheck:
    tld = _get_tld(hostname)
    triggered = tld in SUSPICIOUS_TLDS
    return StructuralCheck(
        rule="suspicious_tld", severity=2, triggered=triggered,
        measured_value=f".{tld}",
        message_fail=(
            f"The domain uses a '.{tld}' extension, which is "
            "heavily associated with free or cheap phishing infrastructure."
        ),
        message_pass=f"Domain ending '.{tld}' is not on the suspicious TLD list. ✓",
    )

def _check_https(scheme: str) -> StructuralCheck:
    triggered = scheme == "http"
    return StructuralCheck(
        rule="no_https", severity=1, triggered=triggered,
        measured_value=scheme,
        message_fail=(
            "URL uses plain HTTP (not HTTPS). "
            "Legitimate services almost universally use HTTPS."
        ),
        message_pass="Connection uses secure HTTPS encryption. ✓",
    )

def _check_excessive_subdomains(hostname: str) -> StructuralCheck:
    count = _count_subdomains(hostname)
    triggered = count > 1
    return StructuralCheck(
        rule="excessive_subdomains", severity=2, triggered=triggered,
        measured_value=f"{count} subdomain level(s)",
        message_fail=(
            f"Domain has {count} subdomain levels. "
            "Attackers pad subdomains to hide the real host."
        ),
        message_pass=f"Subdomain depth ({count}) is within normal range. ✓",
    )

def _check_long_url(url: str) -> StructuralCheck:
    length = len(url)
    triggered = length > 100
    return StructuralCheck(
        rule="long_url", severity=1, triggered=triggered,
        measured_value=f"{length} characters",
        message_fail=(
            f"URL is {length} characters long. "
            "Excessively long URLs are used to obscure the true destination."
        ),
        message_pass=f"URL length ({length} chars) is reasonable. ✓",
    )

def _check_phish_keyword(url: str) -> StructuralCheck:
    kw = _has_phish_keyword(url)
    triggered = kw is not None
    return StructuralCheck(
        rule="phish_keyword", severity=2, triggered=triggered,
        measured_value=f"keyword: '{kw}'" if kw else "no suspicious keyword",
        message_fail=(
            f"URL contains the keyword '{kw}', "
            "which is frequently used in social-engineering attacks."
        ),
        message_pass="No suspicious phishing keywords found in the URL. ✓",
    )

def _check_at_symbol(url: str) -> StructuralCheck:
    triggered = "@" in url.lower()
    return StructuralCheck(
        rule="at_symbol", severity=3, triggered=triggered,
        measured_value="@ found" if triggered else "no @ symbol",
        message_fail=(
            "URL contains '@'. Browsers ignore everything before '@', "
            "so attackers place a fake-legitimate domain before it."
        ),
        message_pass="No '@' symbol found in the URL. ✓",
    )

def _check_double_slash(path: str) -> StructuralCheck:
    triggered = "//" in path
    return StructuralCheck(
        rule="double_slash", severity=2, triggered=triggered,
        measured_value="// found in path" if triggered else "no double slash",
        message_fail=(
            "URL contains '//' inside the path, "
            "a trick used to confuse browser address-bar parsing."
        ),
        message_pass="No double-slash redirection trick in the URL path. ✓",
    )

def _check_embedded_http(path: str, query: str) -> StructuralCheck:
    triggered = bool(re.search(r"https?://", path + query))
    return StructuralCheck(
        rule="embedded_http", severity=3, triggered=triggered,
        measured_value="embedded URL found" if triggered else "no embedded URL",
        message_fail=(
            "Another URL is embedded inside this URL's path or query string — "
            "a classic Open Redirect or phishing payload carrier."
        ),
        message_pass="No embedded URL found in the path or query string. ✓",
    )


# ──────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────

def run_heuristics(url: str) -> HeuristicResult:
    """
    Run ALL heuristic checks against *url*.

    ALWAYS evaluates all 10 structural rules, brand impersonation, and DGA —
    regardless of any individual result. No early returns.

    Returns HeuristicResult with:
      - structural_checks: all 10 rules with pass/fail + measured value
      - brand_check: always populated
      - dga_check: always populated (all 8 DGA features)
      - verdict: "block" | "suspicious" | "pass"
    """
    result = HeuristicResult()

    # ── Parse URL ─────────────────────────────────────────────
    try:
        parsed   = urlparse(url if "://" in url else "http://" + url)
        hostname = parsed.hostname or ""
        scheme   = parsed.scheme or "http"
        path     = parsed.path or ""
        query    = parsed.query or ""
        full_url = url.lower()
    except Exception:
        # Even on parse failure, return a minimal but complete result
        result.verdict = "suspicious"
        result.summary = "URL could not be parsed — treating as suspicious."
        # Fill all 10 checks with a generic parse-error state
        parse_error_check = StructuralCheck(
            rule="parse_error", severity=2, triggered=True,
            measured_value="parse failed",
            message_fail="URL parsing failed; malformed URLs are a common phishing trait.",
            message_pass="",
        )
        result.structural_checks = [parse_error_check]
        result.triggered_flags   = [parse_error_check]
        # Still run brand + DGA with whatever we have
        result.brand_check = check_brand_impersonation("")
        result.dga_check   = check_dga("")
        return result

    # ── Evaluate all 10 structural rules ─────────────────────
    # Each evaluator is called unconditionally and returns a StructuralCheck.
    all_checks: list[StructuralCheck] = [
        _check_ip(hostname),
        _check_punycode(hostname),
        _check_suspicious_tld(hostname),
        _check_https(scheme),
        _check_excessive_subdomains(hostname),
        _check_long_url(url),
        _check_phish_keyword(full_url),
        _check_at_symbol(full_url),
        _check_double_slash(path),
        _check_embedded_http(path, query),
    ]

    result.structural_checks = all_checks
    result.triggered_flags   = [c for c in all_checks if c.triggered]

    # ── Brand impersonation — ALWAYS runs ─────────────────────
    brand_result = check_brand_impersonation(hostname)
    result.brand_check = brand_result

    # ── DGA detection — ALWAYS runs (even if brand blocked) ───
    # Previously this was skipped when brand verdict == "block".
    # Now it always runs so the explainer always has all 8 DGA features.
    dga_result = check_dga(hostname)
    result.dga_check = dga_result

    # ── Compute detection verdict from all results ─────────────
    # Detection logic is evaluated once at the end — it does NOT
    # affect which checks ran. It only determines the verdict for
    # the main.py decision gate.

    # High-severity structural block rules
    has_structural_block = any(
        c.triggered and c.rule in BLOCK_RULES
        for c in all_checks
    )

    brand_blocks = brand_result.verdict == "block"
    dga_blocks   = dga_result.verdict   == "block"

    any_triggered = (
        bool(result.triggered_flags)
        or brand_result.verdict != "pass"
        or dga_result.verdict   != "pass"
    )

    if has_structural_block or brand_blocks or dga_blocks:
        result.verdict = "block"

        # Build a human-readable summary of what caused the block
        block_causes = []
        if has_structural_block:
            rules = [c.rule for c in all_checks if c.triggered and c.rule in BLOCK_RULES]
            block_causes.append(f"structural rule(s): {', '.join(rules)}")
        if brand_blocks:
            block_causes.append(f"brand impersonation ({brand_result.triggered_rule})")
        if dga_blocks:
            hard_count = sum(1 for d in dga_result.detections if d.severity == "hard")
            block_causes.append(f"DGA: {hard_count} hard indicator(s) detected")

        result.summary = (
            f"BLOCKED — high-confidence phishing indicators detected: "
            f"{'; '.join(block_causes)}."
        )

    elif any_triggered:
        result.verdict = "suspicious"

        contributors = []
        if result.triggered_flags:
            contributors.append(f"{len(result.triggered_flags)} structural flag(s)")
        if brand_result.verdict == "suspicious":
            contributors.append(f"brand impersonation ({brand_result.triggered_rule})")
        if dga_result.verdict == "suspicious":
            soft_count = sum(1 for d in dga_result.detections if d.severity == "soft")
            contributors.append(f"DGA: {soft_count} soft indicator(s) detected")

        result.summary = (
            f"SUSPICIOUS — {', '.join(contributors)} raised. "
            "Forwarding to ML model for deeper analysis."
        )

    else:
        result.verdict = "pass"
        result.summary = (
            "All heuristic checks passed. "
            "No structural, brand, or DGA issues detected. "
            "Forwarding to ML model for confirmation."
        )

    return result
