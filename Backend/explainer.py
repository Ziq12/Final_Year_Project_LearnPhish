"""
Phishing URL Feature Explainability Engine
Converts raw feature values into structured, human-readable threat reports.
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class Domain(str, Enum):
    OBFUSCATION = "Obfuscation & Cloaking"
    IDENTITY = "Identity & Brand Trust"
    STRUCTURAL = "Structural Complexity"
    PAYLOAD = "Data Payload & Query Risks"
    SYMBOLS = "Character & Symbol Analysis"
    CONTENT = "Advanced Content Patterns"


DOMAIN_ICONS = {
    Domain.OBFUSCATION: "🕵️",
    Domain.IDENTITY: "🏷️",
    Domain.STRUCTURAL: "🧩",
    Domain.PAYLOAD: "📦",
    Domain.SYMBOLS: "⚠️",
    Domain.CONTENT: "🔬",
}

DOMAIN_COLORS = {
    Domain.OBFUSCATION: "#ef4444",
    Domain.IDENTITY: "#f97316",
    Domain.STRUCTURAL: "#eab308",
    Domain.PAYLOAD: "#8b5cf6",
    Domain.SYMBOLS: "#06b6d4",
    Domain.CONTENT: "#ec4899",
}


@dataclass
class FeatureRule:
    name: str
    domain: Domain
    threshold_type: str          # "eq", "gt", "lt", "ne"
    threshold_value: float
    explanation: str
    severity: int                # 1=low, 2=medium, 3=high
    default_importance: float    # fallback if no model importance provided


# ──────────────────────────────────────────────────────────────
# Master rule registry (56 features)
# ──────────────────────────────────────────────────────────────
FEATURE_RULES: list[FeatureRule] = [
    # Domain 1 – Obfuscation & Cloaking
    FeatureRule("have_IP",              Domain.OBFUSCATION, "eq", 1,   "Uses a numerical IP address instead of a domain name to hide ownership.", 3, 0.85),
    FeatureRule("url_shortening",       Domain.OBFUSCATION, "eq", 1,   "Uses a redirection service to mask the final malicious destination.", 3, 0.80),
    FeatureRule("punycode",             Domain.OBFUSCATION, "eq", 1,   "Uses look-alike characters (homoglyphs) to impersonate a legitimate brand.", 3, 0.75),
    FeatureRule("char_repeat",          Domain.OBFUSCATION, "eq", 1,   "Uses repetitive characters to bypass simple security filters.", 2, 0.55),
    FeatureRule("count_double_slash",   Domain.OBFUSCATION, "gt", 0,   "Contains an internal redirection trick to confuse your browser's address bar.", 2, 0.60),
    FeatureRule("count_http_token",     Domain.OBFUSCATION, "gt", 0,   "Includes 'http' inside the URL path to make a fake address look real.", 3, 0.72),
    FeatureRule("https_token",          Domain.OBFUSCATION, "eq", 1,   "The site lacks a secure HTTPS connection, common for temporary phishing sites.", 2, 0.50),

    # Domain 2 – Identity & Brand Trust
    FeatureRule("brand_in_domain",      Domain.IDENTITY, "eq", 1,   "A brand was detected in the domain", 3, 0.90),
    FeatureRule("brand_in_subdomain",   Domain.IDENTITY, "eq", 1,   "A brand name is placed in the subdomain to trick users into trusting a fake site.", 3, 0.88),
    FeatureRule("brand_in_path",        Domain.IDENTITY, "eq", 1,   "The brand name is hidden in the path (after the slash) rather than the official domain.", 2, 0.70),
    FeatureRule("phish_hint",           Domain.IDENTITY, "eq", 1,   "Contains suspicious keywords like 'login', 'verify', or 'secure' used in social engineering.", 3, 0.82),
    FeatureRule("suspicious_tld",       Domain.IDENTITY, "eq", 1,   "Uses a Top-Level Domain (like .top, .xyz, .loan) frequently associated with mass-scale phishing.", 2, 0.65),
    FeatureRule("check_www",            Domain.IDENTITY, "eq", 0,   "Site does not follow standard 'www' naming conventions used by most established brands.", 1, 0.30),
    FeatureRule("check_com",            Domain.IDENTITY, "eq", 0,   "Does not use a '.com' extension; attackers often use cheaper alternatives.", 1, 0.25),

    # Domain 3 – Structural Complexity
    FeatureRule("url_entropy",          Domain.STRUCTURAL, "gt", 4.5,  "The entire URL is highly random, suggesting it was created by a malicious script.", 3, 0.78),
    FeatureRule("domain_entropy",       Domain.STRUCTURAL, "gt", 4.0,  "The domain name appears to be randomly generated (DGA), a common trait of malware.", 3, 0.80),
    FeatureRule("path_entropy",         Domain.STRUCTURAL, "gt", 4.8,  "The URL path contains chaotic characters, often indicating hidden tracking or payloads.", 2, 0.62),
    FeatureRule("url_length",           Domain.STRUCTURAL, "gt", 75,   "The URL is excessively long, likely to hide the real domain in mobile browsers.", 2, 0.55),
    FeatureRule("hostname_length",      Domain.STRUCTURAL, "gt", 25,   "The hostname is unusually long, used to push suspicious parts off-screen.", 2, 0.58),
    FeatureRule("count_subdomain",      Domain.STRUCTURAL, "gt", 1,    "Excessive subdomains detected — a 'Subdomain Padding' technique to hide the real host.", 2, 0.60),
    FeatureRule("abnormal_subdomain",   Domain.STRUCTURAL, "eq", 1,    "The subdomain structure does not follow standard web hierarchies.", 2, 0.64),
    FeatureRule("count_dots",           Domain.STRUCTURAL, "gt", 4,    "Contains too many dots, an attempt to mimic a deep directory on a trusted site.", 1, 0.40),

    # Domain 4 – Data Payload & Query Risks
    FeatureRule("has_query",                        Domain.PAYLOAD, "eq", 1, "The URL is actively passing data through a query, which can steal credentials.", 2, 0.45),
    FeatureRule("query_param_count",                Domain.PAYLOAD, "gt", 3, "Contains many data parameters, suggesting complex tracking of the victim.", 2, 0.55),
    FeatureRule("has_sensitive_query_key",          Domain.PAYLOAD, "eq", 1, "The URL explicitly requests sensitive keys like 'user', 'pass', or 'id' in plain text.", 3, 0.85),
    FeatureRule("has_url_in_query",                 Domain.PAYLOAD, "eq", 1, "Contains another URL inside the query — often used for Open Redirect attacks.", 3, 0.82),
    FeatureRule("query_value_max_length",           Domain.PAYLOAD, "gt", 50, "A data value is extremely long, potentially carrying an encoded script or payload.", 2, 0.60),
    FeatureRule("has_file_extension_in_query",      Domain.PAYLOAD, "eq", 1, "The query points to a file download, which may be a malicious installer.", 2, 0.68),
    FeatureRule("has_double_file_extension_in_query", Domain.PAYLOAD, "eq", 1, "Uses a double extension (e.g., image.jpg.exe) to trick you into downloading malware.", 3, 0.88),
    FeatureRule("suspicious_extension_in_path",     Domain.PAYLOAD, "eq", 1, "The URL path ends in a file type often used for viruses (.exe, .scr, .zip).", 3, 0.90),
    FeatureRule("multiple_extension_in_path",       Domain.PAYLOAD, "eq", 1, "Multiple file extensions found in the path — a common masking technique for malware.", 3, 0.87),

    # Domain 5 – Character & Symbol Analysis
    FeatureRule("count_hyphens",        Domain.SYMBOLS, "gt", 0,  "Uses multiple hyphens to create look-alike domains (e.g., secure-login-bank).", 2, 0.55),
    FeatureRule("count_at",             Domain.SYMBOLS, "gt", 0,  "Contains '@' symbol — a trick to ignore everything before it and redirect you.", 3, 0.80),
    FeatureRule("count_exclamation",    Domain.SYMBOLS, "gt", 0,  "Uses exclamation marks to break the visual flow of the URL.", 1, 0.30),
    FeatureRule("count_and",            Domain.SYMBOLS, "gt", 1,  "High frequency of '&' symbol, indicating complex data manipulation.", 1, 0.35),
    FeatureRule("count_or",             Domain.SYMBOLS, "gt", 0,  "Presence of 'pipe' or 'or' symbols, which are rare in legitimate URLs.", 1, 0.28),
    FeatureRule("count_equal",          Domain.SYMBOLS, "gt", 2,  "Frequent '=' signs showing the URL is heavily dependent on data inputs.", 1, 0.32),
    FeatureRule("count_underscore",     Domain.SYMBOLS, "gt", 1,  "Uses underscores to mimic professional-looking file naming conventions.", 1, 0.25),
    FeatureRule("count_tilde",          Domain.SYMBOLS, "gt", 0,  "Uses '~' symbol, which often points to personal web directories rather than official pages.", 1, 0.28),
    FeatureRule("count_percentage",     Domain.SYMBOLS, "gt", 1,  "Contains encoded characters (%), often used to hide malicious keywords from filters.", 2, 0.58),
    FeatureRule("count_slash",          Domain.SYMBOLS, "gt", 5,  "The directory structure is unusually deep — used to bury the malicious file.", 1, 0.38),
    FeatureRule("count_star",           Domain.SYMBOLS, "gt", 0,  "Contains an asterisk, an uncommon symbol that can interfere with server configurations.", 1, 0.22),
    FeatureRule("count_colon",          Domain.SYMBOLS, "gt", 1,  "Multiple colons detected, which can be used to bypass URL parsing logic.", 1, 0.30),
    FeatureRule("count_comma",          Domain.SYMBOLS, "gt", 0,  "Uses commas, which are rarely seen in standard, clean URLs.", 1, 0.20),
    FeatureRule("count_semicolon",      Domain.SYMBOLS, "gt", 0,  "Presence of semicolons, sometimes used to hide additional command instructions.", 1, 0.25),
    FeatureRule("count_dollar",         Domain.SYMBOLS, "gt", 0,  "Uses the dollar sign, a signal of script-based URL generation.", 1, 0.22),
    FeatureRule("count_space",          Domain.SYMBOLS, "gt", 0,  "Contains spaces (or encoded spaces), a sign of a poorly constructed, suspicious link.", 2, 0.48),

    # Domain 6 – Advanced Content Patterns
    FeatureRule("ratio_digits_path",        Domain.CONTENT, "gt", 0.3,  "Over 30% of the path is numbers, suggesting automated tracking IDs or encoded data.", 2, 0.52),
    FeatureRule("ratio_digits_hostname",    Domain.CONTENT, "gt", 0.1,  "The domain name contains a high ratio of digits, typical of machine-generated hostnames.", 2, 0.58),
    FeatureRule("has_port",                 Domain.CONTENT, "eq", 1,    "Specifies a non-standard connection port, bypassing standard web traffic rules.", 3, 0.75),
    FeatureRule("has_tld_in_path",          Domain.CONTENT, "eq", 1,    "Includes a TLD (like .com) inside the path to make a fake folder look like a real website.", 2, 0.65),
    FeatureRule("has_tld_in_subdomain",     Domain.CONTENT, "eq", 1,    "Includes a TLD in the subdomain to trick users about where the site is actually hosted.", 2, 0.68),
    FeatureRule("prefix_suffix",            Domain.CONTENT, "eq", 1,    "Uses prefixes/suffixes (like 'login-', '-update') to create a false sense of urgency.", 2, 0.60),
    FeatureRule("longest_word_in_url",      Domain.CONTENT, "gt", 20,   "Contains a single word too long to be natural — likely a tracking string.", 2, 0.55),
    FeatureRule("longest_word_in_hostname", Domain.CONTENT, "gt", 15,   "The domain name itself contains a very long, unbroken string of characters.", 2, 0.58),
    FeatureRule("longest_word_in_path",     Domain.CONTENT, "gt", 20,   "The folders in the URL have very long names, typical of automated phishing kits.", 2, 0.52),
]

# Quick lookup by feature name
RULE_MAP: dict[str, FeatureRule] = {r.name: r for r in FEATURE_RULES}


# ──────────────────────────────────────────────────────────────
# Result dataclasses
# ──────────────────────────────────────────────────────────────

@dataclass
class TriggeredFeature:
    name: str
    value: float
    explanation: str
    domain: str
    domain_icon: str
    domain_color: str
    severity: int
    severity_label: str
    importance: float

@dataclass
class DomainSummary:
    domain: str
    icon: str
    color: str
    triggered_count: int
    total_features: int
    risk_score: float               # 0-100
    top_explanation: Optional[str]

@dataclass
class ExplainabilityReport:
    prediction: int                 # 0 = legit, 1 = phishing
    confidence: float               # 0-1
    overall_risk_score: float       # 0-100
    risk_level: str                 # "Low" / "Medium" / "High" / "Critical"
    triggered_features: list[TriggeredFeature]
    domain_summaries: list[DomainSummary]
    top_reasons: list[str]          # top 5 human-readable reasons
    total_features_triggered: int
    total_features_evaluated: int


# ──────────────────────────────────────────────────────────────
# Core engine
# ──────────────────────────────────────────────────────────────

SEVERITY_LABELS = {1: "Low", 2: "Medium", 3: "High"}
DOMAIN_FEATURE_COUNTS = {}
for rule in FEATURE_RULES:
    DOMAIN_FEATURE_COUNTS[rule.domain] = DOMAIN_FEATURE_COUNTS.get(rule.domain, 0) + 1


def _is_triggered(rule: FeatureRule, value: float) -> bool:
    t = rule.threshold_type
    v = rule.threshold_value
    if t == "eq":  return value == v
    if t == "ne":  return value != v
    if t == "gt":  return value > v
    if t == "lt":  return value < v
    return False


def explain(
    features: dict[str, float],
    prediction: int,
    confidence: float,
    feature_importances: Optional[dict[str, float]] = None,
) -> ExplainabilityReport:
    """
    Generate a full explainability report.

    Args:
        features:            dict of feature_name → value
        prediction:          0 (legit) or 1 (phishing)
        confidence:          model probability for the predicted class
        feature_importances: optional dict of feature_name → importance (0-1)
                             (e.g. from Random Forest .feature_importances_)
    """
    triggered: list[TriggeredFeature] = []

    for name, value in features.items():
        rule = RULE_MAP.get(name)
        if rule is None:
            continue
        if not _is_triggered(rule, value):
            continue

        importance = (
            feature_importances.get(name, rule.default_importance)
            if feature_importances else rule.default_importance
        )

        triggered.append(TriggeredFeature(
            name=name,
            value=value,
            explanation=rule.explanation,
            domain=rule.domain.value,
            domain_icon=DOMAIN_ICONS[rule.domain],
            domain_color=DOMAIN_COLORS[rule.domain],
            severity=rule.severity,
            severity_label=SEVERITY_LABELS[rule.severity],
            importance=round(importance, 4),
        ))

    # Sort by importance descending
    triggered.sort(key=lambda x: x.importance, reverse=True)

    # Domain summaries
    domain_triggered: dict[Domain, list[TriggeredFeature]] = {d: [] for d in Domain}
    for tf in triggered:
        domain_triggered[Domain(tf.domain)].append(tf)

    summaries: list[DomainSummary] = []
    for domain, items in domain_triggered.items():
        total = DOMAIN_FEATURE_COUNTS.get(domain, 1)
        risk = round(min(100, (len(items) / total) * 100 + sum(i.severity * 8 for i in items)), 1)
        summaries.append(DomainSummary(
            domain=domain.value,
            icon=DOMAIN_ICONS[domain],
            color=DOMAIN_COLORS[domain],
            triggered_count=len(items),
            total_features=total,
            risk_score=risk,
            top_explanation=items[0].explanation if items else None,
        ))
    summaries.sort(key=lambda x: x.risk_score, reverse=True)

    # Overall risk score (weighted by importance × severity)
    if triggered:
        weighted_sum = sum(t.importance * t.severity for t in triggered)
        max_possible = len(triggered) * 3  # max severity = 3
        raw_score = (weighted_sum / max_possible) * 100
        # Boost by volume
        volume_factor = min(1.0, len(triggered) / 10)
        overall_risk = round(min(100, raw_score * 0.7 + volume_factor * 30), 1)
    else:
        overall_risk = 0.0

    if overall_risk >= 75:
        risk_level = "Critical"
    elif overall_risk >= 50:
        risk_level = "High"
    elif overall_risk >= 25:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    top_reasons = [t.explanation for t in triggered[:5]]

    return ExplainabilityReport(
        prediction=prediction,
        confidence=round(confidence, 4),
        overall_risk_score=overall_risk,
        risk_level=risk_level,
        triggered_features=triggered,
        domain_summaries=summaries,
        top_reasons=top_reasons,
        total_features_triggered=len(triggered),
        total_features_evaluated=len([k for k in features if k in RULE_MAP]),
    )
