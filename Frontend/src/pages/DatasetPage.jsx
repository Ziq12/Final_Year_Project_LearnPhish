/**
 * DatasetPage — dark-themed, focused, consistent with the rest of the app.
 * Three sections: Model info, Download, Feature reference.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const BATCH_SIZE = 200

const FEATURE_GROUPS = [
  {
    group: 'URL Structure', icon: '🔗',
    color: { accent: '#38bdf8', bg: 'rgba(56,189,248,0.06)', border: 'rgba(56,189,248,0.15)' },
    features: [
      { name: 'url_length',          desc: 'Total character count of the full URL' },
      { name: 'hostname_length',     desc: 'Length of the hostname portion only' },
      { name: 'has_ip_address',      desc: '1 if host is a raw IP instead of a domain' },
      { name: 'count_dots',          desc: 'Number of dots in the hostname' },
      { name: 'count_hyphens',       desc: 'Number of hyphens in the full URL' },
      { name: 'count_at',            desc: 'Number of @ symbols (redirect trick)' },
      { name: 'count_exclamation',   desc: 'Exclamation marks in the URL' },
      { name: 'count_ampersand',     desc: 'Ampersand (&) count' },
      { name: 'count_pipe',          desc: 'Pipe (|) count' },
      { name: 'count_equal',         desc: 'Equal sign (=) count' },
      { name: 'count_underscore',    desc: 'Underscore count' },
      { name: 'count_percent',       desc: 'Percent-encoded character count' },
      { name: 'count_slash',         desc: 'Forward slash count' },
      { name: 'count_asterisk',      desc: 'Asterisk (*) count' },
      { name: 'count_colon',         desc: 'Colon (:) count' },
      { name: 'count_space',         desc: 'Space (or encoded space) count' },
    ],
  },
  {
    group: 'Tokens & Encoding', icon: '📝',
    color: { accent: '#c084fc', bg: 'rgba(192,132,252,0.06)', border: 'rgba(192,132,252,0.15)' },
    features: [
      { name: 'has_www',             desc: '1 if URL contains "www"' },
      { name: 'has_com',             desc: '1 if URL contains ".com"' },
      { name: 'count_double_slash',  desc: 'Occurrences of // after the scheme' },
      { name: 'uses_https',          desc: '1 if scheme is HTTPS' },
    ],
  },
  {
    group: 'Digit & Special Ratios', icon: '📊',
    color: { accent: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)' },
    features: [
      { name: 'ratio_digits_path',      desc: 'Fraction of path characters that are digits' },
      { name: 'ratio_digits_hostname',  desc: 'Fraction of hostname characters that are digits' },
      { name: 'ratio_special_chars_url',desc: 'Fraction of special characters in full URL' },
    ],
  },
  {
    group: 'Domain & TLD', icon: '🌐',
    color: { accent: '#2dd4bf', bg: 'rgba(45,212,191,0.06)', border: 'rgba(45,212,191,0.15)' },
    features: [
      { name: 'is_punycode',            desc: '1 if domain uses Punycode (xn--) encoding' },
      { name: 'tld_in_path',            desc: '1 if a TLD appears in the URL path' },
      { name: 'has_abnormal_subdomain', desc: '1 if subdomain structure is unusual' },
      { name: 'subdomain_count',        desc: 'Number of subdomain labels' },
      { name: 'has_prefix_suffix',      desc: '1 if domain wraps a brand name with prefix/suffix' },
      { name: 'is_shortening_service',  desc: '1 if URL uses a known shortener (bit.ly, tinyurl…)' },
      { name: 'is_suspicious_tld',      desc: '1 if TLD is on the abused list (.xyz, .top, .gq…)' },
      { name: 'tld_length',             desc: 'Character length of the TLD' },
    ],
  },
  {
    group: 'Path', icon: '📁',
    color: { accent: '#34d399', bg: 'rgba(52,211,153,0.06)', border: 'rgba(52,211,153,0.15)' },
    features: [
      { name: 'path_extension_category',   desc: '0=none · 1=benign extension · 2=suspicious extension' },
      { name: 'has_multiple_extensions',   desc: '1 if path has multiple file extensions' },
      { name: 'path_depth',                desc: 'Number of directory levels in the path' },
      { name: 'phish_hints',               desc: 'Count of phishing keywords in the path (login, verify…)' },
    ],
  },
  {
    group: 'Query String', icon: '🔍',
    color: { accent: '#818cf8', bg: 'rgba(129,140,248,0.06)', border: 'rgba(129,140,248,0.15)' },
    features: [
      { name: 'has_query',                       desc: '1 if URL has a query string' },
      { name: 'query_param_count',               desc: 'Number of key=value pairs' },
      { name: 'has_sensitive_query_keys',        desc: '1 if keys include token, pass, user, id' },
      { name: 'query_has_url_value',             desc: '1 if a query value is itself a URL (open redirect)' },
      { name: 'query_value_max_length',          desc: 'Length of the longest query value' },
      { name: 'query_has_file_extension',        desc: '1 if a query value ends with a file extension' },
      { name: 'query_has_double_file_extension', desc: '1 if double extension in query (.jpg.exe)' },
      { name: 'query_entropy',                   desc: 'Shannon entropy of the query string' },
    ],
  },
  {
    group: 'Word Length', icon: '📏',
    color: { accent: '#fb923c', bg: 'rgba(251,146,60,0.06)', border: 'rgba(251,146,60,0.15)' },
    features: [
      { name: 'has_char_repeat',          desc: '1 if any word has repeated characters' },
      { name: 'max_word_length_url',      desc: 'Longest token in the full URL' },
      { name: 'max_word_length_hostname', desc: 'Longest token in the hostname' },
      { name: 'max_word_length_path',     desc: 'Longest token in the path' },
    ],
  },
  {
    group: 'Brand & Impersonation', icon: '🏷️',
    color: { accent: '#f87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.15)' },
    features: [
      { name: 'brand_in_domain',         desc: '1 if a protected brand name appears in the SLD' },
      { name: 'brand_in_subdomain',      desc: '1 if a brand name appears in the subdomain' },
      { name: 'brand_in_path',           desc: '1 if a brand name appears in the path' },
      { name: 'brand_mismatch',          desc: '1 if brand in subdomain/path does not match the SLD' },
      { name: 'brand_impersonation_score', desc: 'Fuzzy similarity score (0–1) to the nearest brand' },
    ],
  },
  {
    group: 'Entropy', icon: '🎲',
    color: { accent: '#a78bfa', bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.15)' },
    features: [
      { name: 'entropy_url',    desc: 'Shannon entropy of the full URL' },
      { name: 'entropy_domain', desc: 'Shannon entropy of the domain' },
      { name: 'entropy_path',   desc: 'Shannon entropy of the path' },
      { name: 'entropy_query',  desc: 'Shannon entropy of the query string' },
    ],
  },
  {
    group: 'Keywords', icon: '🔑',
    color: { accent: '#fbbf24', bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.15)' },
    features: [
      { name: 'has_login_keyword',       desc: '1 if URL contains "login"' },
      { name: 'has_secure_keyword',      desc: '1 if URL contains "secure"' },
      { name: 'has_account_keyword',     desc: '1 if URL contains "account"' },
      { name: 'has_update_keyword',      desc: '1 if URL contains "update"' },
      { name: 'has_verify_keyword',      desc: '1 if URL contains "verify"' },
      { name: 'has_redirection_keyword', desc: '1 if URL contains a redirect keyword' },
    ],
  },
  {
    group: 'DGA Signals', icon: '🤖',
    color: { accent: '#67e8f9', bg: 'rgba(103,232,249,0.06)', border: 'rgba(103,232,249,0.15)' },
    features: [
      { name: 'vowel_ratio_sld',              desc: 'Vowel-to-consonant ratio in the SLD' },
      { name: 'consecutive_consonants_max_sld', desc: 'Longest run of consecutive consonants in the SLD' },
      { name: 'has_digit_sld',                desc: '1 if the SLD contains any digit' },
      { name: 'domain_has_https',             desc: '1 if "https" literally appears in the domain string' },
    ],
  },
]

const totalFeatures = FEATURE_GROUPS.reduce((s, g) => s + g.features.length, 0)

export default function DatasetPage() {
  const navigate   = useNavigate()
  const [total,    setTotal]      = useState(null)
  const [loading,  setLoading]    = useState(true)
  const [dlError,  setDlError]    = useState('')
  const [busy,     setBusy]       = useState(null)
  const batchCount = total ? Math.ceil(total / BATCH_SIZE) : 0

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || '';
    fetch(`${apiBase}/api/dataset/count`, {
      headers: { 'x-api-key': import.meta.env.VITE_FRONTEND_API_KEY }
    })
      .then(r => r.json())
      .then(d => { setTotal(d.total); setLoading(false) })
      .catch(() => { setLoading(false) })
  }, [])

  async function downloadBatch(i) {
    setBusy(i)
    setDlError('')
    try {
      const offset = i * BATCH_SIZE
      const apiBase = import.meta.env.VITE_API_URL || '';
      const res    = await fetch(`${apiBase}/api/dataset/download?offset=${offset}&limit=${BATCH_SIZE}`, {
        headers: { 'x-api-key': import.meta.env.VITE_FRONTEND_API_KEY }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `LearnPhish_dataset_batch${i + 1}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setDlError(e.message)
    }
    setBusy(null)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-base)' }}>

      {/* Nav */}
      <header className="sticky top-0 z-30 px-4 py-3"
        style={{ background: 'rgba(8,15,26,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-semibold transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-info)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
            ← <span className="font-display font-bold" style={{ color: 'var(--color-text-primary)' }}>LearnPhish</span>
          </button>
          <span className="font-mono text-xs px-2 py-0.5 rounded"
            style={{ background: 'rgba(56,189,248,0.1)', color: 'var(--color-info)', border: '1px solid rgba(56,189,248,0.2)' }}>
            ML Dataset
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Hero */}
        <div>
          <h1 className="font-display font-bold text-3xl mb-2" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            Public Phishing Dataset
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Every URL scanned by LearnPhish is converted into {totalFeatures} lexical features and stored here — no DNS lookups, no HTTP requests.
            Labels are assigned by the same detection pipeline you just used.
          </p>
        </div>

        {/* Model + Label cards */}
        <div className="grid sm:grid-cols-2 gap-4">
          <InfoCard title="🤖 Model: rf_v1" rows={[
            ['Algorithm',  'Random Forest Classifier'],
            ['Library',    'scikit-learn'],
            ['Threshold',  '0.661'],
            ['Features',   `${totalFeatures} lexical URL features`],
            ['DNS/HTTP',   'None — lexical-only, works offline'],
          ]} />
          <InfoCard title="🏷️ Label Assignment" rows={[
            ['Label 1 (Phishing)', 'Heuristic block or RF model ≥ 0.661'],
            ['Label 0 (Legit)', 'Passed all checks, model < 0.661'],
            ['Whitelisted', 'Excluded from dataset'],
            ['Query values', 'Redacted to REDACTED before storage'],
          ]} />
        </div>

        {/* Privacy notice */}
        <div className="flex gap-3 rounded-2xl px-5 py-4"
          style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <span className="text-xl flex-shrink-0">🔒</span>
          <div>
            <p className="font-semibold text-sm mb-1" style={{ color: '#fde68a' }}>Privacy &amp; Redaction</p>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(253,230,138,0.75)' }}>
              All query parameter <strong>values</strong> are replaced with <code className="font-mono bg-black/20 px-1 rounded">REDACTED</code> before storage.
              Key names are preserved as they are structural features of the URL, not user data.
              No IP addresses, browser fingerprints, or personal information are collected.
            </p>
          </div>
        </div>

        {/* Download */}
        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <h2 className="font-display font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
              ⬇️ Download Dataset
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {BATCH_SIZE} rows per CSV batch. Download all batches for the complete dataset.
            </p>
          </div>

          <div className="px-5 py-4">
            {loading && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                <span className="inline-block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'rgba(56,189,248,0.4)', borderTopColor: 'transparent' }} />
                Loading dataset info…
              </div>
            )}

            {!loading && total === 0 && (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">📭</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>No data yet</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Scan some URLs to start building the dataset.</p>
              </div>
            )}

            {!loading && total > 0 && (
              <>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="font-display font-bold text-2xl" style={{ color: 'var(--color-text-primary)' }}>
                    {total.toLocaleString()}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    rows · {batchCount} batch{batchCount !== 1 ? 'es' : ''}
                  </span>
                </div>

                {dlError && (
                  <p className="text-xs mb-3 px-3 py-2 rounded-lg"
                    style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger-border)' }}>
                    ⚠ {dlError}
                  </p>
                )}

                <div className="grid sm:grid-cols-3 gap-3">
                  {Array.from({ length: batchCount }, (_, i) => {
                    const start = i * BATCH_SIZE + 1
                    const end   = Math.min((i + 1) * BATCH_SIZE, total)
                    const going = busy === i
                    return (
                      <button key={i} onClick={() => downloadBatch(i)} disabled={going}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                        style={{
                          background: going ? 'rgba(56,189,248,0.08)' : 'var(--color-elevated)',
                          border: `1px solid ${going ? 'rgba(56,189,248,0.3)' : 'var(--color-border)'}`,
                        }}
                        onMouseEnter={e => { if (!going) e.currentTarget.style.borderColor = 'rgba(56,189,248,0.3)' }}
                        onMouseLeave={e => { if (!going) e.currentTarget.style.borderColor = 'var(--color-border)' }}>
                        <span className="text-xl flex-shrink-0">{going ? '⏳' : '📄'}</span>
                        <div>
                          <p className="font-semibold text-xs" style={{ color: 'var(--color-text-primary)' }}>Batch {i + 1}</p>
                          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            Rows {start.toLocaleString()}–{end.toLocaleString()}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Feature reference */}
        <section>
          <h2 className="font-display font-bold text-base mb-1" style={{ color: 'var(--color-text-primary)' }}>
            📋 Feature Reference
          </h2>
          <p className="text-xs mb-5" style={{ color: 'var(--color-text-secondary)' }}>
            {totalFeatures} lexical features — no DNS or HTTP. Binary = 0/1, counts = int, ratios &amp; entropy = float.
          </p>

          <div className="space-y-3">
            {FEATURE_GROUPS.map(({ group, icon, color, features }) => (
              <FeatureGroup key={group} group={group} icon={icon} color={color} features={features} />
            ))}
          </div>
        </section>

        {/* Citation */}
        <div className="rounded-2xl px-5 py-4" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
          <h2 className="font-semibold text-sm mb-2" style={{ color: 'var(--color-text-primary)' }}>📜 Citation &amp; Licence</h2>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Released for academic and research use. Please cite <strong>LearnPhish</strong> if you use this dataset.
            No commercial redistribution without permission. Labels are machine-generated and may contain noise —
            validate with additional ground-truth sources before publishing.
          </p>
        </div>
      </main>

      <footer className="px-4 py-5 text-center" style={{ borderTop: '1px solid var(--color-border)' }}>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          LearnPhish · Public ML Dataset · Labels generated by rf_v1
        </p>
      </footer>
    </div>
  )
}

function InfoCard({ title, rows }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-elevated)' }}>
        <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start gap-2 px-4 py-2.5">
            <span className="text-xs w-28 flex-shrink-0 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{k}</span>
            <span className="text-xs" style={{ color: 'var(--color-text-primary)' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FeatureGroup({ group, icon, color, features }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-surface)', border: `1px solid ${color.border}` }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-all"
        style={{ background: color.bg }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
        <span className="text-sm font-semibold flex items-center gap-2" style={{ color: color.accent }}>
          <span>{icon}</span> {group}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded-full"
            style={{ background: `${color.accent}18`, color: color.accent, border: `1px solid ${color.border}` }}>
            {features.length}
          </span>
          <span className="text-xs" style={{ color: color.accent }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {features.map(({ name, desc }) => (
            <div key={name} className="flex items-start gap-3 px-4 py-2.5">
              <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: color.accent }} />
              <code className="text-xs font-mono flex-shrink-0 w-52" style={{ color: color.accent }}>{name}</code>
              <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
