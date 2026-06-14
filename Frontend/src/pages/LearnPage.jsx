import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useScanStore from '../store/useScanStore'
import MainHeader from '../components/layout/MainHeader'  
import Footer from '../components/layout/Footer'     

// ─────────────────────────────────────────────────────────────────
// Data mapped directly from explainer.py, heuristic.py & dga_detector.py
// ─────────────────────────────────────────────────────────────────
const THREAT_DOMAINS = [
  {
    domain: 'Obfuscation & Cloaking',
    icon: '🕵️',
    color: { accent: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.15)' },
    desc: 'Techniques used to hide the true destination or nature of the link.',
    features: [
      { name: 'Raw IP Address', code: 'have_IP', explanation: 'Uses a numerical IP address instead of a domain name to hide ownership and bypass domain-based filters.', example: 'http://192.168.1.104/login.html', trigger: 'Hostname matches IPv4 or IPv6 regex pattern.' },
      { name: 'URL Shorteners', code: 'url_shortening', explanation: 'Uses a redirection service (like bit.ly) to mask the final malicious destination from the user.', example: 'https://bit.ly/3xYzAbC', trigger: 'Domain matches a known list of 80+ URL shortening services.' },
      { name: 'Punycode / Homograph', code: 'punycode', explanation: 'Uses internationalized domain names (IDN) to create look-alike characters that impersonate a legitimate brand.', example: 'https://xn--pple-43a.com (аррӏе.com)', trigger: 'Hostname contains the "xn--" prefix.' },
      { name: 'Embedded HTTP', code: 'count_http_token', explanation: "Includes another URL or 'http' inside the path/query to trick the browser into thinking it's a safe redirect.", example: 'https://legit.com/redirect?url=http://evil.com', trigger: 'Regex finds "http://" inside the path or query string.' },
      { name: 'Missing HTTPS', code: 'https_token', explanation: 'The site lacks a secure HTTPS connection. Legitimate banks universally use HTTPS; phishing kits often default to HTTP.', example: 'http://secure-bank-login.com', trigger: 'URL scheme is "http" instead of "https".' }
    ]
  },
  {
    domain: 'Identity & Brand Trust',
    icon: '🏷️',
    color: { accent: '#f97316', bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.15)' },
    desc: 'Impersonation of well-known brands through domain manipulation.',
    features: [
      { name: 'Brand in Subdomain', code: 'brand_in_subdomain', explanation: 'Attackers place a trusted brand name in the subdomain to make the URL look official, even though the actual registered domain is malicious.', example: 'https://paypal.secure-update.com', trigger: 'Fuzzy matching or exact match of a protected brand in subdomain labels.' },
      { name: 'Typosquatting', code: 'typosquatting', explanation: 'Registering a domain name that is a slight misspelling of a popular brand, relying on users not noticing the typo.', example: 'https://paypai.com', trigger: 'RapidFuzz similarity score ≥ 80% against the brand database.' },
      { name: 'Prefix / Suffix Wrapping', code: 'prefix_suffix', explanation: 'Wrapping a legitimate brand name with hyphens and generic words like "secure" or "login" to create a fake domain.', example: 'https://paypal-secure-login.com', trigger: 'Regex matches brand name separated by hyphens from other words.' },
      { name: 'Suspicious TLD', code: 'suspicious_tld', explanation: 'Using Top-Level Domains heavily associated with mass-scale phishing campaigns because they are cheap or free.', example: 'https://chase-bank.xyz', trigger: 'TLD matches a hardcoded list of ~50 abused extensions (.xyz, .tk, .top).' },
      { name: 'Brand in Path', code: 'brand_in_path', explanation: 'The brand name is hidden in the URL path rather than the official domain, often used on compromised legitimate sites.', example: 'https://blog.com/wp-content/paypal/login/', trigger: 'Brand keyword found in the URL path segments.' }
    ]
  },
  {
    domain: 'Structural Complexity',
    icon: '🧩',
    color: { accent: '#eab308', bg: 'rgba(234,179,8,0.06)', border: 'rgba(234,179,8,0.15)' },
    desc: 'Abnormal URL structures, lengths, and randomness indicative of automated generation.',
    features: [
      { name: 'High Entropy (DGA)', code: 'domain_entropy', explanation: 'The domain appears completely random. Domain Generation Algorithms (DGAs) use high-entropy strings to create thousands of disposable domains.', example: 'https://xqjpvflnrtzmbws.ru', trigger: 'Shannon entropy calculation exceeds 4.0 for domain or 4.5 for full URL.' },
      { name: 'Excessive Subdomains', code: 'count_subdomain', explanation: 'Using an unusually high number of subdomains to push the actual malicious domain off the visible screen on mobile devices.', example: 'https://login.verify.secure.paypal.evil.com', trigger: 'Subdomain count is strictly greater than normal thresholds.' },
      { name: 'Abnormal Length', code: 'url_length', explanation: 'Phishing URLs are often excessively long because they embed tracking IDs, base64 payloads, or multiple redirect paths.', example: 'https://site.com/a/very/long/path/hiding/dest...', trigger: 'URL length > 75 characters or hostname length > 25 characters.' },
      { name: 'Excessive Dots', code: 'count_dots', explanation: 'Contains too many dots, an attempt to mimic a deep directory structure on a trusted site or confuse parsers.', example: 'https://www.login.verify.account.update.com', trigger: 'Count of "." in the hostname exceeds 4.' }
    ]
  },
  {
    domain: 'Data Payload & Query Risks',
    icon: '📦',
    color: { accent: '#8b5cf6', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.15)' },
    desc: 'Malicious use of query parameters to steal data or deliver payloads.',
    features: [
      { name: 'Sensitive Query Keys', code: 'has_sensitive_query_key', explanation: 'The URL explicitly requests sensitive keys like "user", "pass", or "token" in plain text, often used to pre-fill fake login forms.', example: 'https://site.com?user=admin&pass=123', trigger: 'Query parameter keys match a sensitive keyword list.' },
      { name: 'URL in Query', code: 'has_url_in_query', explanation: 'Contains another URL inside the query string. Attackers use this to bypass filters or chain redirects to the final phishing page.', example: 'https://site.com?redirect=https://evil.com', trigger: 'Query parameter value contains "http://" or "https://".' },
      { name: 'Double File Extension', code: 'has_double_file_extension', explanation: 'Uses a double extension to trick users into downloading malware, making a script look like an image.', example: 'https://site.com?file=invoice.jpg.exe', trigger: 'Regex detects multiple extensions in query values or path.' },
      { name: 'Suspicious Path Extensions', code: 'suspicious_extension', explanation: 'The URL path ends in a file type often used for viruses or executable scripts (.exe, .scr, .zip).', example: 'https://site.com/downloads/update.scr', trigger: 'Path ends with a blacklisted executable extension.' }
    ]
  },
  {
    domain: 'Character & Symbol Analysis',
    icon: '⚠️',
    color: { accent: '#06b6d4', bg: 'rgba(6,182,212,0.06)', border: 'rgba(6,182,212,0.15)' },
    desc: 'Unusual character frequencies and symbol abuse.',
    features: [
      { name: 'The "@" Symbol Trick', code: 'count_at', explanation: 'URLs containing "@" will redirect the browser to whatever comes AFTER the symbol, ignoring the text before it.', example: 'https://google.com@evil-phish.com', trigger: 'Presence of "@" anywhere in the URL authority/path.' },
      { name: 'Hyphen Abuse', code: 'count_hyphens', explanation: 'Phishers use multiple hyphens to separate keywords and create look-alike domains, as legitimate brands rarely use many hyphens.', example: 'https://secure-login-bank-update.com', trigger: 'Count of "-" in the URL exceeds normal thresholds.' },
      { name: 'Percent Encoding', code: 'count_percentage', explanation: 'Contains excessive URL-encoded characters (%), often used to hide malicious keywords or payloads from basic security filters.', example: 'https://site.com/%70%61%79%70%61%6C', trigger: 'Count of "%" characters is unusually high.' },
      { name: 'Double Slash Redirect', code: 'count_double_slash', explanation: 'Contains "//" inside the path, a trick used to confuse browser address-bar parsing and simulate a new domain start.', example: 'https://legit.com/path//evil.com', trigger: 'Regex finds "//" after the initial protocol scheme.' }
    ]
  },
  {
    domain: 'Advanced Content Patterns',
    icon: '🔬',
    color: { accent: '#ec4899', bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.15)' },
    desc: 'Deep structural anomalies and DGA infrastructure hosting.',
    features: [
      { name: 'High Digit Ratio', code: 'ratio_digits_hostname', explanation: 'The domain or path contains an unnatural amount of numbers, typical of machine-generated tracking IDs or automated phishing kits.', example: 'https://user8475920193.com/login', trigger: 'Ratio of digits to total characters exceeds 10-30%.' },
      { name: 'Non-Standard Ports', code: 'has_port', explanation: 'Specifies a non-standard connection port. Legitimate sites use default ports (80/443); phishers use custom ports to bypass firewalls.', example: 'https://bank-login.com:8443/secure', trigger: 'URL parsing detects a port number other than 80 or 443.' },
      { name: 'TLD in Path', code: 'has_tld_in_path', explanation: 'Includes a TLD (like .com) inside the path to make a fake folder look like a real website domain.', example: 'https://evil.com/login/com/secure/', trigger: 'Regex matches known TLDs in the path segments.' },
      { name: 'Abused Free Hosting', code: 'hosting_infrastructure', explanation: 'The domain is hosted on a free site builder combined with random subdomains, a common zero-cost phishing tactic.', example: 'https://secure-login-8475.vercel.app', trigger: 'Registered domain matches a list of 20+ abused hosting providers.' }
    ]
  }
]

export default function LearnPage() {
  const navigate = useNavigate()
  const startScan = useScanStore(s => s.startScan)
  
  const handleTryExample = async (url) => {
    navigate('/result2')
    await startScan(url)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-base)' }}>
      
      {/* ── Unified Header ──────────────────── */}
      <MainHeader />

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        
        {/* Hero */}
        <div className="text-center space-y-3">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
            Threat Glossary
          </span>
          <h1 className="font-display font-bold text-3xl sm:text-4xl" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            The Anatomy of a Phishing URL
          </h1>
          <p className="text-sm leading-relaxed max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            LearnPhish evaluates {THREAT_DOMAINS.reduce((s, d) => s + d.features.length, 0)} distinct lexical features across 6 threat domains. 
            Explore the exact rules our engine uses to detect, block, and explain malicious links.
          </p>
        </div>

        {/* Accordion Sections */}
        <div className="space-y-4">
          {THREAT_DOMAINS.map((d) => (
            <DomainAccordion key={d.domain} {...d} onTry={handleTryExample} />
          ))}
        </div>

      </main>

      {/* ── Unified Footer ──────────────────── */}
      <Footer />
    </div>
  )
}

function DomainAccordion({ domain, icon, color, desc, features, onTry }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-surface)', border: `1px solid ${color.border}` }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 text-left transition-all" style={{ background: color.bg }}>
        <span className="text-base font-display font-bold flex items-center gap-3" style={{ color: color.accent }}>
          <span className="text-xl">{icon}</span> {domain}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: `${color.accent}18`, color: color.accent, border: `1px solid ${color.border}` }}>
            {features.length} rules
          </span>
          <span className="text-sm" style={{ color: color.accent }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="p-5 space-y-4" style={{ borderTop: `1px solid ${color.border}` }}>
          <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>{desc}</p>
          <div className="space-y-4">
            {features.map((f, i) => (
              <FeatureCard key={i} feature={f} color={color} onTry={onTry} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FeatureCard({ feature, color, onTry }) {
  const isScannable = feature.example.startsWith('http')
  return (
    <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: color.accent }} />
          <h4 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{feature.name}</h4>
        </div>
        <code className="text-[10px] font-mono px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: `${color.accent}15`, color: color.accent, border: `1px solid ${color.border}` }}>
          {feature.code}
        </code>
      </div>
      
      <p className="text-xs leading-relaxed pl-4" style={{ color: 'var(--color-text-secondary)' }}>
        {feature.explanation}
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-3 pl-4" style={{ borderTop: '1px dashed var(--color-border)' }}>
        <span className="text-[10px] font-bold uppercase tracking-wider w-16 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>Example</span>
        <code className="text-xs font-mono break-all flex-1" style={{ color: color.accent }}>
          {feature.example}
        </code>
        {isScannable && (
          <button 
            onClick={() => onTry(feature.example)}
            className="text-[10px] font-bold px-2 py-1 rounded-md transition-all flex-shrink-0"
            style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,189,248,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(56,189,248,0.1)'}
          >
            Scan this →
          </button>
        )}
      </div>

      <div className="flex items-start gap-2 pl-4">
        <span className="text-[10px] font-bold uppercase tracking-wider w-16 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>Trigger</span>
        <span className="text-xs italic" style={{ color: 'var(--color-text-secondary)' }}>{feature.trigger}</span>
      </div>
    </div>
  )
}