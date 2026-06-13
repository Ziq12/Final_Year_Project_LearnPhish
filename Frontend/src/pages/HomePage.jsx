/**
 * HomePage — Brand page with mission, how-it-works, tech stack, then scan form.
 */
import { useEffect }   from 'react'
import { useNavigate } from 'react-router-dom'
import useScanStore    from '../store/useScanStore'
import { useQuizPrefetch } from '../hooks/useQuizPrefetch'
import ErrorDisplay    from '../components/result/ErrorDisplay'

export default function HomePage() {
  useQuizPrefetch()

  const error     = useScanStore(s => s.error)
  const reset     = useScanStore(s => s.reset)
  const startScan = useScanStore(s => s.startScan)
  const navigate  = useNavigate()

  // Clear any stale scan state when the user lands on the home page.
  // This prevents a previous failed-scan error from appearing in the form
  // if the user navigated back without explicitly resetting.
  useEffect(() => { reset() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleScan(url) {
    navigate('/result2')
    await startScan(url)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-base)' }}>

      {/* Subtle grid bg */}
      <div className="fixed inset-0 pointer-events-none" style={{ opacity: 0.025 }}>
        <div style={{
          backgroundImage: 'linear-gradient(rgba(56,189,248,1) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,1) 1px,transparent 1px)',
          backgroundSize: '48px 48px', width: '100%', height: '100%',
        }} />
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-30 px-6 py-4"
        style={{ background: 'rgba(8,15,26,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)' }}>🛡️</div>
            <span className="font-display font-bold text-lg" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
              LearnPhish
            </span>
            <span className="hidden sm:inline text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: 'rgba(56,189,248,0.1)', color: 'var(--color-info)', border: '1px solid rgba(56,189,248,0.2)' }}>
              v5
            </span>
          </div>
          <nav className="flex items-center gap-1">
            {[
              { label: 'How it works', href: '#how' },
              { label: 'Technology',   href: '#tech' },
              { label: 'Dataset',      onClick: () => navigate('/dataset') },
            ].map(({ label, href, onClick }) => (
              <a key={label} href={href} onClick={onClick}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-info)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 relative">

        {/* ── HERO ──────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-7 text-xs font-semibold"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
            🎓 Cybersecurity education through real-time detection
          </div>

          <h1 className="font-display font-bold leading-none mb-5"
            style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', color: 'var(--color-text-primary)', letterSpacing: '-0.03em' }}>
            Don't just know if a link is{' '}
            <span style={{ color: 'var(--color-safe)', textShadow: '0 0 40px rgba(52,211,153,0.3)' }}>safe</span>
            .{' '}
            <span style={{ color: 'var(--color-info)', textShadow: '0 0 40px rgba(56,189,248,0.3)' }}>Understand why.</span>
          </h1>

          <p className="text-lg leading-relaxed max-w-2xl mx-auto mb-10" style={{ color: 'var(--color-text-secondary)' }}>
            LearnPhish runs 20+ security checks on any URL and explains every single finding —
            turning each scan into a real cybersecurity lesson.
          </p>

          {/* Scan form */}
          <ScanHero onScan={handleScan} error={error} />

          {/* Example URLs */}
          <ExampleURLCards onScan={handleScan} />
        </section>

        {/* ── TRUST STATS ───────────────────────────────────── */}
        <section className="py-12" style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { stat: '20+',    label: 'Security checks per URL' },
              { stat: '6',      label: 'Threat domain categories' },
              { stat: '56',     label: 'ML features extracted' },
              { stat: '100%',   label: 'Lexical — works offline' },
            ].map(({ stat, label }) => (
              <div key={label}>
                <p className="font-display font-bold text-3xl mb-1" style={{ color: 'var(--color-info)', letterSpacing: '-0.02em' }}>{stat}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── MISSION ───────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4 inline-block"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
                Our Mission
              </span>
              <h2 className="font-display font-bold text-3xl mb-4" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                Phishing costs billions.<br />Education is the defence.
              </h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                Over 3.4 billion phishing emails are sent every day. Most anti-phishing tools just say "dangerous" and block the link —
                leaving users no wiser the next time.
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                LearnPhish is different. Every time a URL is scanned, the system shows exactly which patterns triggered each alarm and why those patterns matter —
                building real intuition that protects you even without the tool.
              </p>
            </div>
            <div className="space-y-3">
              {[
                { icon: '🔍', title: 'Detection + Explanation', desc: 'Every check runs regardless of verdict. You always get the full story.' },
                { icon: '🎓', title: 'Built-in micro-quizzes', desc: 'Answer questions while you wait, and after each group reveals. Spaced repetition at work.' },
                { icon: '🏷️', title: 'Brand impersonation radar', desc: 'Fuzzy matching + Unicode homograph detection catches "paypa1.com" and "рaypal.com".' },
                { icon: '📊', title: 'Public ML dataset', desc: 'Every scan trains the next model. Download the dataset for your own research.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex gap-3 p-4 rounded-xl"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <span className="text-xl flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────── */}
        <section id="how" className="py-16" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}>
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-10">
              <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full inline-block mb-3"
                style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: 'var(--color-info)' }}>
                How it works
              </span>
              <h2 className="font-display font-bold text-3xl" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                A 4-stage detection pipeline
              </h2>
              <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                All checks run in parallel, then a decision gate decides if ML is needed.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { step: '01', icon: '⚡', color: '#38bdf8', title: 'Parallel Checks', desc: 'Whitelist, blacklist, Google Safe Browsing, structural heuristics, and brand/DGA detection all run simultaneously.' },
                { step: '02', icon: '🚦', color: '#34d399', title: 'Decision Gate', desc: 'If any check produces a high-confidence verdict (e.g. brand impersonation), ML is skipped — instant answer.' },
                { step: '03', icon: '🧠', color: '#c084fc', title: 'ML Model', desc: 'For uncertain URLs, a Random Forest classifier analyses 56 features with a tuned 0.661 threshold.' },
                { step: '04', icon: '📋', color: '#f59e0b', title: 'Explanation', desc: 'The Explainer Engine maps every triggered feature to one of 6 Threat Domains and produces plain-English reasons.' },
              ].map(({ step, icon, color, title, desc }) => (
                <div key={step} className="p-5 rounded-2xl relative overflow-hidden"
                  style={{ background: 'var(--color-elevated)', border: `1px solid ${color}22` }}>
                  <div className="absolute top-3 right-3 font-mono text-xs font-bold" style={{ color: `${color}40` }}>{step}</div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3"
                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}>{icon}</div>
                  <p className="font-semibold text-sm mb-1.5" style={{ color: 'var(--color-text-primary)' }}>{title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{desc}</p>
                </div>
              ))}
            </div>

            {/* Check categories */}
            <div className="mt-8">
              <p className="text-xs font-bold uppercase tracking-widest text-center mb-5" style={{ color: 'var(--color-text-secondary)' }}>
                6 Threat Domains Explained
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { icon: '🕵️', name: 'Obfuscation & Cloaking',    desc: 'IP addresses, URL shorteners, punycode, open redirects', color: '#f87171' },
                  { icon: '🏷️', name: 'Identity & Brand Trust',    desc: 'Brand names in subdomains, TLD-swaps, typosquatting',    color: '#fb923c' },
                  { icon: '🧩', name: 'Structural Complexity',     desc: 'URL entropy, abnormal lengths, subdomain padding',      color: '#fbbf24' },
                  { icon: '🔬', name: 'Advanced Content Patterns', desc: 'Non-standard ports, high digit density, long raw words',  color: '#c084fc' },
                ].map(({ icon, name, desc, color }) => (
                  <div key={name} className="flex gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <span className="text-lg flex-shrink-0">{icon}</span>
                    <div>
                      <p className="text-xs font-semibold" style={{ color }}>{name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── TECHNOLOGY STACK ──────────────────────────────── */}
        <section id="tech" className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full inline-block mb-3"
              style={{ background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.2)', color: '#c084fc' }}>
              Technology
            </span>
            <h2 className="font-display font-bold text-3xl" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
              Built on solid foundations
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                side: 'Backend', color: '#38bdf8',
                items: [
                  ['FastAPI (Python)',   'Async, high-performance REST API'],
                  ['Random Forest',     'scikit-learn RF classifier, 56 features'],
                  ['rapidfuzz',         'Sub-millisecond fuzzy brand matching'],
                  ['tldextract',        'Mozilla PSL-based domain parsing'],
                  ['NLTK',              'English dictionary for DGA detection'],
                  ['PostgreSQL',        'Supabase-hosted scan log and quiz data'],
                  ['Upstash Redis',     'TTL-based whitelist/blacklist cache'],
                  ['Google Safe Browsing', 'External threat intelligence'],
                ],
              },
              {
                side: 'Frontend', color: '#c084fc',
                items: [
                  ['React 19 + Vite',   'Fast SPA with HMR'],
                  ['Tailwind CSS v4',   'Utility-first dark-theme design system'],
                  ['Zustand',           'Lightweight scan lifecycle state'],
                  ['React Router',      'Home → Result → Dataset navigation'],
                  ['IBM Plex Mono',     'Monospace font for URL anatomy display'],
                  ['Syne',              'Display font for headings'],
                  ['Pure CSS animations', 'No Framer Motion — performance first'],
                ],
              },
            ].map(({ side, color, items }) => (
              <div key={side} className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: `1px solid ${color}22` }}>
                <div className="px-5 py-3.5" style={{ background: `${color}10`, borderBottom: `1px solid ${color}22` }}>
                  <h3 className="font-semibold text-sm" style={{ color }}>{side}</h3>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {items.map(([tech, desc]) => (
                    <div key={tech} className="flex items-baseline gap-2 px-5 py-2.5">
                      <span className="text-xs font-mono font-semibold w-40 flex-shrink-0" style={{ color }}>{tech}</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── PRIVACY ───────────────────────────────────────── */}
        <section className="py-14" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}>
          <div className="max-w-3xl mx-auto px-6 text-center">
            <span className="text-4xl mb-4 block">🔒</span>
            <h2 className="font-display font-bold text-2xl mb-3" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
              Your privacy, protected
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              URLs are analysed in-memory using only their lexical structure — no DNS lookups, no page loads.
              Query parameter values are redacted before storage. No cookies, no tracking, no account required.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {['No DNS lookups', 'No page loading', 'No accounts', 'Query values redacted', 'Free forever'].map(badge => (
                <span key={badge} className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>
                  ✓ {badge}
                </span>
              ))}
            </div>
          </div>
        </section>

      </main>

      <footer className="px-6 py-6" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-base">🛡️</span>
            <span className="font-display font-bold text-sm" style={{ color: 'var(--color-text-secondary)' }}>LearnPhish</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>v5 · Academic research project</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Results are informational. Always exercise caution online.
          </p>
        </div>
      </footer>
    </div>
  )
}

/* ── Inline components ─────────────────────────────────── */
function ScanHero({ onScan, error }) {
  async function handleSubmit(e) {
    e.preventDefault()
    const url = e.target.url.value.trim()
    if (!url) return
    const final = url.startsWith('http') ? url : 'https://' + url
    await onScan(final)
  }

  return (
    <div className="max-w-xl mx-auto mb-4">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          name="url" type="text" autoFocus
          placeholder="https://suspicious-link.com/verify?id=12345"
          className="flex-1 text-sm px-4 py-3.5 rounded-xl font-mono transition-all"
          style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border-md)',
            color: 'var(--color-text-primary)', outline: 'none',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(56,189,248,0.5)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border-md)'}
        />
        <button type="submit"
          className="shrink-0 font-semibold text-sm px-7 py-3.5 rounded-xl transition-all active:scale-95"
          style={{ background: 'var(--color-info)', color: '#020d14', boxShadow: '0 0 20px rgba(56,189,248,0.25)' }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 30px rgba(56,189,248,0.45)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(56,189,248,0.25)'}>
          Analyse URL →
        </button>
      </form>

      {/* Compact error display — handles the structured error object from useScanStore */}
      {error && (
        <ErrorDisplay error={error} compact />
      )}
    </div>
  )
}

const EXAMPLES = [
  { url: 'https://login.paypal.secure-update.com/verify?redirect=paypal.com', label: 'Phishing', expected: 'phishing',   desc: 'Brand in subdomain, not the real domain' },
  { url: 'https://www.google.com',                                             label: 'Safe',     expected: 'legitimate',  desc: 'Real Google homepage' },
  { url: 'https://xqjpvflnrtzmbws.ru/login',                                  label: 'DGA',      expected: 'phishing',    desc: 'Machine-generated domain name' },
]

function ExampleURLCards({ onScan }) {
  return (
    <div className="mt-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-center mb-4" style={{ color: 'var(--color-text-muted)' }}>
        Try an example
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {EXAMPLES.map(({ url, label, expected, desc }) => {
          const c = expected === 'phishing'
            ? { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)' }
            : { color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)' }
          return (
            <button key={url} onClick={() => onScan(url)}
              className="text-left px-4 py-3 rounded-xl transition-all"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', maxWidth: 240 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = c.border}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
                {label}
              </span>
              <p className="text-xs font-mono mt-1.5 mb-1 truncate" style={{ color: 'var(--color-text-secondary)', maxWidth: 200 }}>{url}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
