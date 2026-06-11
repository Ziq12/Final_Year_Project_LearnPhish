"""
seed_quiz.py
────────────
Populates the threat_domains and quiz_questions tables with the initial
set of 7 domains and 14 questions defined in the implementation plan.

Run from the Staging/ directory:
    python -m scripts.seed_quiz

Uses ON CONFLICT DO NOTHING so re-running is safe (idempotent).
"""

import json
import sys
import os

# Allow running from the Staging/ directory directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db

# ──────────────────────────────────────────────────────────────
# Seed data — mirrors implementation_plan.md exactly
# ──────────────────────────────────────────────────────────────

DOMAINS = [
    {
        "name": "pre_scan",
        "description": "The initial gut-check question shown while the URL is being scanned.",
    },
    {
        "name": "Obfuscation & Cloaking",
        "description": "Techniques used to hide the true destination of a link, such as IP addresses or URL shorteners.",
    },
    {
        "name": "Identity & Brand Trust",
        "description": "Attempts to spoof trusted brands (like PayPal or Apple) to deceive users into providing credentials.",
    },
    {
        "name": "Structural Complexity",
        "description": "Abnormal URL patterns, high randomness (entropy), or excessive length used to confuse parsers or users.",
    },
    {
        "name": "Data Payload & Query Risks",
        "description": "Suspicious data exfiltration or embedded payloads found in the URL query string (the part after the ?).",
    },
    {
        "name": "Character & Symbol Analysis",
        "description": "Anomalous use of symbols to break parsers, hide keywords, or confuse users.",
    },
    {
        "name": "Advanced Content Patterns",
        "description": "Non-standard connection ports or unnatural strings indicative of automated generation.",
    },
]

QUESTIONS = [
    # ── 0. Pre-scan hook ──────────────────────────────────────────────────────
    {
        "domain": "pre_scan",
        "question_text": "Based on the structure of this link, which part do you think is most likely trying to deceive you?",
        "options": ["The Subdomain (prefix before the main name)", "The Main Domain (the website name)", "The Folder Path (after the slash)"],
        "correct_index": 0,
        "explanation_text": "Attackers often place familiar brand names in the subdomain (e.g. 'paypal.scam-site.com') to trick you. The real website is always the main domain right before the '.com' — not the prefix.",
    },
    {
        "domain": "pre_scan",
        "question_text": "Before we reveal the results, what is your initial assessment of this URL?",
        "options": ["Looks completely safe", "Seems slightly suspicious", "Highly likely to be phishing"],
        "correct_index": 2,
        "explanation_text": "Always verify the actual domain name — gut instinct is a great first step, but LearnPhish checks dozens of technical signals that the human eye misses!",
    },

    # ── 1. Obfuscation & Cloaking ─────────────────────────────────────────────
    {
        "domain": "Obfuscation & Cloaking",
        "question_text": "Why do attackers sometimes use raw IP addresses (e.g., 192.168.1.1) instead of standard domain names?",
        "options": [
            "To bypass domain reputation blacklists and hide their identity",
            "To ensure the connection is encrypted with HTTPS",
            "Because IP addresses load websites significantly faster",
        ],
        "correct_index": 0,
        "explanation_text": "Standard domains can be tracked, flagged, and taken down by security vendors within hours. Raw IP addresses bypass these reputation checks, giving attackers a longer window to operate before being detected.",
    },
    {
        "domain": "Obfuscation & Cloaking",
        "question_text": "What is the primary danger of a URL shortening service (like bit.ly) in the context of phishing?",
        "options": [
            "It makes the website load noticeably slower",
            "It hides the actual destination domain from the user before they click",
            "It automatically removes HTTPS encryption from the link",
        ],
        "correct_index": 1,
        "explanation_text": "URL shorteners completely mask the final destination. You cannot visually inspect the domain name to verify trust before clicking — which is exactly what attackers rely on.",
    },

    # ── 2. Identity & Brand Trust ─────────────────────────────────────────────
    {
        "domain": "Identity & Brand Trust",
        "question_text": "In the URL 'secure-login.paypal.com.scam-site.net', which part is the actual website you are visiting?",
        "options": [
            "secure-login.paypal.com",
            "paypal.com",
            "scam-site.net",
        ],
        "correct_index": 2,
        "explanation_text": "Browsers navigate to the rightmost registered domain. 'scam-site.net' is the real destination — 'paypal.com' is just a fake subdomain placed there to make the link look trustworthy.",
    },
    {
        "domain": "Identity & Brand Trust",
        "question_text": "Why do phishing links often include words like 'verify', 'secure', or 'update'?",
        "options": [
            "To create a false sense of urgency and make the link appear legitimate",
            "To trigger security software to whitelist the link automatically",
            "Because internet security protocols require these keywords in safe URLs",
        ],
        "correct_index": 0,
        "explanation_text": "These are social engineering keywords designed to make you panic or believe you must take immediate action. A real bank or service will never ask you to 'verify your account' through an unsolicited link.",
    },

    # ── 3. Structural Complexity ──────────────────────────────────────────────
    {
        "domain": "Structural Complexity",
        "question_text": "What does it suggest if a domain name appears highly random (e.g., 'x7k9p2m.com') with no recognizable words?",
        "options": [
            "The domain belongs to a highly secure government entity",
            "The domain name was likely generated by an automated algorithm, not a human",
            "Random characters indicate the domain uses advanced encryption",
        ],
        "correct_index": 1,
        "explanation_text": "High character randomness (entropy) is a strong indicator of a Domain Generation Algorithm (DGA). Malware uses DGAs to spin up thousands of disposable phishing domains automatically, making them hard to block.",
    },
    {
        "domain": "Structural Complexity",
        "question_text": "Why might an attacker deliberately create an excessively long URL with hundreds of characters?",
        "options": [
            "To push the suspicious parts of the URL out of the browser's visible address bar",
            "To embed large image files directly into the link for faster loading",
            "Long URLs improve a website's search engine ranking",
        ],
        "correct_index": 0,
        "explanation_text": "Mobile browsers and small screens truncate long URLs. Attackers use 'subdomain padding' — a real-looking prefix — to push the malicious domain far to the right where it is invisible without scrolling.",
    },

    # ── 4. Data Payload & Query Risks ────────────────────────────────────────
    {
        "domain": "Data Payload & Query Risks",
        "question_text": "What is the risk of seeing your email address pre-filled in a URL query string (e.g., ?user=john@email.com)?",
        "options": [
            "It could be pre-filling a fake login form to steal your credentials",
            "It proves the website has already verified your identity securely",
            "It ensures the confirmation email is sent to the correct address",
        ],
        "correct_index": 0,
        "explanation_text": "Attackers harvest email addresses and use them to pre-populate fake login pages. A personalized page dramatically lowers your suspicion and makes the fraud far more convincing.",
    },
    {
        "domain": "Data Payload & Query Risks",
        "question_text": "Why is it a red flag if a URL contains another full 'http://' link inside its query string?",
        "options": [
            "It is an Open Redirect — a legitimate site is being used to bounce you to a malicious page",
            "It means the website is securely hosting multiple domains for redundancy",
            "Embedded links inside URLs are a standard practice for loading images securely",
        ],
        "correct_index": 0,
        "explanation_text": "An Open Redirect lets an attacker abuse a trusted website (e.g., google.com/redirect?to=evil.com). The link appears safe at first glance because it starts with a reputable domain, but it immediately forwards you to a phishing page.",
    },

    # ── 5. Character & Symbol Analysis ───────────────────────────────────────
    {
        "domain": "Character & Symbol Analysis",
        "question_text": "How can the '@' symbol be weaponized in a URL like 'http://google.com@attacker.com'?",
        "options": [
            "Browsers ignore everything before the '@', taking you directly to 'attacker.com'",
            "The '@' sends an automated email to google.com before the page loads",
            "It creates an encrypted tunnel between google.com and attacker.com",
        ],
        "correct_index": 0,
        "explanation_text": "In the URL specification, everything before '@' is treated as a username credential. The browser silently discards 'google.com' and navigates straight to 'attacker.com', making this a classic misdirection trick.",
    },
    {
        "domain": "Character & Symbol Analysis",
        "question_text": "Why might an attacker register a domain like 'paypal-security-update.com' instead of simply 'paypal.com'?",
        "options": [
            "To visually mimic the real brand while registering a completely different domain they control",
            "Hyphens are required in domains belonging to certified secure websites",
            "Hyphenated domain names are processed faster by DNS servers",
        ],
        "correct_index": 0,
        "explanation_text": "This is called Brand Impersonation. Since the attacker cannot register the real 'paypal.com', they register a hyphenated variant. At a quick glance, the brand name is visible, which is enough to fool many users.",
    },

    # ── 6. Advanced Content Patterns ─────────────────────────────────────────
    {
        "domain": "Advanced Content Patterns",
        "question_text": "Standard web traffic uses port 80 or 443. Why might a URL using a non-standard port (e.g., ':8080') be suspicious?",
        "options": [
            "It may indicate the site is bypassing standard security filters or hosted on a non-standard server",
            "Non-standard ports mean the connection speed is doubled for the user",
            "Port 8080 guarantees the server is physically located in a nearby region",
        ],
        "correct_index": 0,
        "explanation_text": "Attackers often host phishing pages on compromised servers using non-standard ports to avoid disrupting the server's main website and to bypass corporate firewalls that only inspect standard ports.",
    },
    {
        "domain": "Advanced Content Patterns",
        "question_text": "If a URL path contains a very long, unbroken string of random characters with no folder structure, what does this often indicate?",
        "options": [
            "It is a sign of machine-generated infrastructure — automated tools creating disposable phishing pages",
            "It means the website is very simple and intentionally has no sub-pages",
            "Long unbroken paths are required for modern single-page web applications to function",
        ],
        "correct_index": 0,
        "explanation_text": "Automated phishing toolkits generate random URL paths to avoid matching URL-based blacklists. Legitimate websites almost always use human-readable, descriptive folder names like '/login' or '/about'.",
    },
]


# ──────────────────────────────────────────────────────────────
# Seeding logic
# ──────────────────────────────────────────────────────────────

def seed():
    db.init_pool()
    print("Connected to database. Starting seed…\n")

    import psycopg2.extras

    with db.get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

            # ── Insert domains ────────────────────────────────
            domain_id_map: dict[str, int] = {}
            for d in DOMAINS:
                cur.execute(
                    """
                    INSERT INTO threat_domains (name, description)
                    VALUES (%s, %s)
                    ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
                    RETURNING id, name
                    """,
                    (d["name"], d["description"]),
                )
                row = cur.fetchone()
                domain_id_map[row["name"]] = row["id"]
                print(f"  ✓ Domain: {row['name']}  (id={row['id']})")

            print(f"\n  Inserted/updated {len(DOMAINS)} threat domains.\n")

            # ── Insert questions ──────────────────────────────
            inserted = 0
            for q in QUESTIONS:
                domain_id = domain_id_map.get(q["domain"])
                if domain_id is None:
                    print(f"  ✗ Unknown domain '{q['domain']}' — skipping.")
                    continue

                cur.execute(
                    """
                    INSERT INTO quiz_questions
                        (domain_id, question_text, options, correct_index, explanation_text)
                    VALUES (%s, %s, %s::jsonb, %s, %s)
                    ON CONFLICT DO NOTHING
                    RETURNING id
                    """,
                    (
                        domain_id,
                        q["question_text"],
                        json.dumps(q["options"]),
                        q["correct_index"],
                        q["explanation_text"],
                    ),
                )
                result = cur.fetchone()
                if result:
                    inserted += 1
                    print(f"  ✓ Question id={result['id']}: {q['question_text'][:60]}…")
                else:
                    print(f"  – Skipped (already exists): {q['question_text'][:60]}…")

            print(f"\n  Inserted {inserted} new questions ({len(QUESTIONS) - inserted} already existed).")

    db.close_pool()
    print("\nSeed complete ✅")


if __name__ == "__main__":
    seed()
