"""
dga_detector.py
───────────────
Production-Ready Deterministic DGA & Phishing Infrastructure Detector.

Combines hierarchical domain parsing, context-aware hosting analysis,
and tiered hard/soft rule triggers to eliminate scoring "grey areas".

Verdicts:
- pass:       Clean domain.
- suspicious: Soft DGA indicators found (Route to ML/Manual Review).
- block:      Hard DGA/Phishing infrastructure pattern (Immediate Drop).

Replaces the old scoring-based dga_detector.py (8 features, 0-18 score).
`check_dga` is kept as a backward-compatible alias for heuristic.py.
"""

import math
import re
import ipaddress
from collections import Counter
from dataclasses import dataclass, field
from typing import List, Tuple
from urllib.parse import urlparse

# ─────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────

# Free hosting platforms heavily abused for phishing campaigns
HOSTING_DOMAINS = {
    "weeblysite.com", "webadorsite.com", "square.site", "workers.dev",
    "vercel.app", "pages.dev", "netlify.app", "blogspot.com", "wordpress.com",
    "wixsite.com", "ipfs.inbrowser.link", "fleek.co", "surge.sh",
    "github.io", "gitlab.io", "herokuapp.com", "azurewebsites.net",
    "glitch.me", "repl.co", "000webhostapp.com", "infinityfreeapp.com",
    "firebaseapp.com"
}

# Standard infrastructure labels to ignore (prevents false positives)
SAFE_LABELS = {
    "www", "mail", "api", "cdn", "static", "img", "js", "m", "webmail",
    "smtp", "pop", "imap", "ftp", "ssh", "vpn", "dns", "cpanel", "whm"
}

# Multi-part TLDs to ensure accurate SLD extraction
MULTI_PART_TLDS = {
    "co.uk", "com.au", "co.jp", "com.br", "ac.uk", "gov.uk", "org.uk",
    "co.in", "net.au", "org.au", "com.mx", "co.nz", "co.za"
}

VOWELS = set("aeiouy")  # 'y' included to prevent false positives on words like 'rhythm'
CONSONANTS = set("bcdfghjklmnpqrstvwxz")

# ─────────────────────────────────────────────────────────────
# DATA CLASSES
# ─────────────────────────────────────────────────────────────

@dataclass
class Detection:
    rule: str
    label: str
    reason: str
    severity: str  # "hard" or "soft"


@dataclass
class DGAResult:
    hostname: str
    verdict: str  # "pass", "suspicious", "block"
    detections: List[Detection] = field(default_factory=list)
    summary: str = ""

    def to_dict(self) -> dict:
        return {
            "hostname":   self.hostname,
            "verdict":    self.verdict,
            "summary":    self.summary,
            "detections": [
                {
                    "rule":     d.rule,
                    "label":    d.label,
                    "reason":   d.reason,
                    "severity": d.severity,
                }
                for d in self.detections
            ],
        }


# ─────────────────────────────────────────────────────────────
# MATH & LEXICAL HELPERS
# ─────────────────────────────────────────────────────────────

def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    freq = Counter(s)
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in freq.values())


def max_consecutive_consonants(s: str) -> int:
    max_run = current = 0
    for c in s.lower():
        if c in CONSONANTS:
            current += 1
            max_run = max(max_run, current)
        else:
            current = 0
    return max_run


def digit_ratio(s: str) -> float:
    if not s:
        return 0.0
    return sum(c.isdigit() for c in s) / len(s)


def vowel_ratio(s: str) -> float:
    alpha = [c for c in s if c.isalpha()]
    if not alpha:
        return 0.0
    return sum(c in VOWELS for c in alpha) / len(alpha)


# ─────────────────────────────────────────────────────────────
# DOMAIN PARSING
# ─────────────────────────────────────────────────────────────

def parse_hostname(hostname: str) -> Tuple[str, str, List[str]]:
    """Splits hostname into (sld, tld, subdomains_list)"""
    parts = hostname.lower().strip(".").split(".")
    if len(parts) < 2:
        return "", hostname, []

    if len(parts) >= 3 and f"{parts[-2]}.{parts[-1]}" in MULTI_PART_TLDS:
        tld = f"{parts[-2]}.{parts[-1]}"
        sld = parts[-3]
        subdomains = parts[:-3]
    else:
        tld = parts[-1]
        sld = parts[-2]
        subdomains = parts[:-2]

    return sld, tld, subdomains


# ─────────────────────────────────────────────────────────────
# CORE LABEL ANALYZER
# ─────────────────────────────────────────────────────────────

def analyze_label(label: str) -> List[Detection]:
    detections = []
    if not label or label in SAFE_LABELS:
        return detections

    label_lower = label.lower()
    length = len(label_lower)

    if label_lower.startswith("xn--"):  # Skip Punycode
        return detections

    has_letters = any(c.isalpha() for c in label_lower)
    has_digits  = any(c.isdigit() for c in label_lower)

    entropy  = shannon_entropy(label_lower)
    v_ratio  = vowel_ratio(label_lower)
    d_ratio  = digit_ratio(label_lower)
    max_cons = max_consecutive_consonants(label_lower)

    # ==========================================
    # HARD BLOCK RULES (Immediate Drop)
    # ==========================================

    # 1. Pure Numeric (e.g., 545665654.vercel.app)
    if length >= 6 and label_lower.isdigit():
        detections.append(Detection("pure_numeric", label,
                                    "Label is purely numeric.", "hard"))

    # 2. Zero Vowels with Digits (e.g., grv846316.pro)
    if length >= 6 and has_letters and has_digits and v_ratio == 0:
        detections.append(Detection("zero_vowels_mixed", label,
                                    "Contains letters/digits but zero vowels.", "hard"))

    # 3. IPFS / Crypto Hashes
    if re.match(r"^(bafy|bafk|bafz|Qm)[a-zA-Z0-9]{40,}$", label_lower):
        detections.append(Detection("ipfs_cid", label,
                                    "Matches IPFS CID pattern.", "hard"))
    if re.match(r"^[a-f0-9]{32}$", label_lower) or re.match(r"^[a-f0-9]{64}$", label_lower):
        detections.append(Detection("hex_hash", label,
                                    "Matches MD5/SHA256 hex hash.", "hard"))
    if length >= 32 and re.fullmatch(r"[a-z2-7]{32,}", label_lower):
        detections.append(Detection("base32_hash", label,
                                    "Base32/hash-like random label.", "hard"))

    # 4. Hyphen-Numeric Padding (e.g., free-5520723, att-103512-adeyemi)
    if "-" in label_lower and re.search(r"(?<!\d)\d{5,}(?!\d)", label_lower):
        detections.append(Detection("numeric_padding", label,
                                    "Campaign-style numeric padding detected.", "hard"))

    # 5. Long mixed alphanumeric (e.g., poiaqewsxcbcgtrt566655)
    if length >= 15 and has_letters and has_digits and "-" not in label_lower:
        detections.append(Detection("mixed_alphanumeric", label,
                                    "Long mixed alphanumeric string.", "hard"))

    # ==========================================
    # SOFT SUSPICIOUS RULES (Route to ML/Review)
    # ==========================================

    # 6. High Entropy
    if length >= 12 and entropy >= 3.5:
        detections.append(Detection("high_entropy", label,
                                    f"High entropy ({entropy:.2f}) indicates randomness.", "soft"))

    # 7. Low Vowel Ratio
    if length >= 8 and has_letters and 0 < v_ratio < 0.15:
        detections.append(Detection("low_vowel_ratio", label,
                                    f"Very low vowel ratio ({v_ratio:.2f}).", "soft"))

    # 8. Consonant Clusters
    if max_cons >= 5 and length >= 6:
        detections.append(Detection("consonant_cluster", label,
                                    f"Contains {max_cons} consecutive consonants.", "soft"))

    # 9. High Digit Ratio
    if length >= 8 and has_letters and has_digits and d_ratio >= 0.40 and v_ratio > 0:
        detections.append(Detection("high_digit_ratio", label,
                                    f"Excessive digit density ({d_ratio:.2f}).", "soft"))

    return detections


# ─────────────────────────────────────────────────────────────
# MAIN ENGINE
# ─────────────────────────────────────────────────────────────

def detect_dga(url_or_host: str) -> DGAResult:
    """
    Run DGA & phishing-infrastructure detection against *url_or_host*.

    Args:
        url_or_host: Full URL (https://...) or plain hostname.

    Returns:
        DGAResult with verdict "pass" | "suspicious" | "block".
    """
    # 1. Extract & Normalize Hostname
    if "://" in url_or_host:
        try:
            parsed   = urlparse(url_or_host)
            hostname = parsed.hostname or parsed.netloc
        except Exception:
            hostname = url_or_host
    else:
        hostname = url_or_host

    hostname = hostname.lower().strip()

    # Ignore raw IP addresses
    try:
        ipaddress.ip_address(hostname)
        return DGAResult(hostname, "pass", [], "IP Address (Ignored)")
    except ValueError:
        pass

    # 2. Parse Hierarchy
    sld, tld, subdomains = parse_hostname(hostname)
    registered_domain = f"{sld}.{tld}" if tld else sld
    is_abused_host    = registered_domain in HOSTING_DOMAINS

    all_detections = []

    # 3. Evaluate SLD
    if sld and sld not in SAFE_LABELS:
        all_detections.extend(analyze_label(sld))

    # 4. Evaluate Subdomains
    for sub in subdomains:
        dets = analyze_label(sub)

        # CONTEXT OVERRIDE:
        # If hosted on an abused free host (e.g., Weebly, Vercel),
        # upgrade any "soft" suspicious subdomains to "hard" blocks.
        if is_abused_host:
            for d in dets:
                if d.severity == "soft":
                    d.severity = "hard"
                    d.reason  += " [UPGRADED: Hosted on abused site builder]"

        all_detections.extend(dets)

    # 5. Deduplicate Detections
    unique_detections = []
    seen = set()
    for d in all_detections:
        key = (d.rule, d.label)
        if key not in seen:
            unique_detections.append(d)
            seen.add(key)

    # 6. Determine Final Verdict
    has_hard = any(d.severity == "hard" for d in unique_detections)
    has_soft = any(d.severity == "soft" for d in unique_detections)

    if has_hard:
        verdict = "block"
        summary = "BLOCKED: Hard DGA/Phishing infrastructure pattern detected."
    elif has_soft:
        verdict = "suspicious"
        summary = "SUSPICIOUS: Soft DGA indicators detected. Forward to ML/Review."
    else:
        verdict = "pass"
        summary = "PASS: No DGA patterns detected."

    return DGAResult(
        hostname=hostname,
        verdict=verdict,
        detections=unique_detections,
        summary=summary,
    )


# ─────────────────────────────────────────────────────────────
# BACKWARD-COMPATIBLE ALIAS
# heuristic.py imports `check_dga` — this alias keeps it working.
# ─────────────────────────────────────────────────────────────
check_dga = detect_dga
