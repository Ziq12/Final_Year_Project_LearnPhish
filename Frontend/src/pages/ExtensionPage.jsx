import { useState } from 'react'
import MainHeader from '../components/layout/MainHeader'
import Footer from '../components/layout/Footer'

// ─────────────────────────────────────────────────────────────────
// Static metadata for the extension release
// ─────────────────────────────────────────────────────────────────
const EXTENSION = {
  name: 'LearnPhish Extension',
  version: 'v4',
  filename: 'learnphish_extension_v4.zip',
  sha256: 'E595B810E55F820E46D4D34DC9A59B930C19B768D8817D33C7B9EF87A5C007AA',
  sizeLabel: '~37 KB',
  compatible: ['Google Chrome', 'Microsoft Edge', 'Brave', 'Opera'],
}

const INSTALL_STEPS = [
  {
    step: 1,
    icon: '📥',
    title: 'Download the Extension',
    desc: 'Click the download button above to save the ZIP file to your computer.',
    note: null,
  },
  {
    step: 2,
    icon: '📂',
    title: 'Extract the ZIP',
    desc: 'Right-click the downloaded ZIP file and choose "Extract All…" (Windows) or double-click it (Mac). You should see a folder named learnphish_extension_v4.',
    note: 'Keep track of where you extract it — you\'ll need to point your browser to that folder.',
  },
  {
    step: 3,
    icon: '🔧',
    title: 'Open Extension Manager',
    desc: 'In your browser address bar, type the appropriate URL and press Enter:',
    urls: [
      { browser: 'Chrome / Brave / Opera', url: 'chrome://extensions/' },
      { browser: 'Edge', url: 'edge://extensions/' },
    ],
  },
  {
    step: 4,
    icon: '🛠️',
    title: 'Enable Developer Mode',
    desc: 'In the top-right corner of the Extensions page, toggle on the "Developer mode" switch. This allows loading unpublished extensions.',
    note: null,
  },
  {
    step: 5,
    icon: '📁',
    title: 'Load the Unpacked Extension',
    desc: 'Click "Load unpacked" (top-left). A file picker will open — navigate to and select the extracted learnphish_extension_v4 folder (not the ZIP file).',
    note: null,
  },
  {
    step: 6,
    icon: '✅',
    title: 'Pin & Start Using',
    desc: 'The LearnPhish 🛡️ icon will appear in your browser toolbar. Click the puzzle piece icon (Extensions) → find LearnPhish → click the pin icon to keep it always visible.',
    note: null,
  },
]

// ─────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────
export default function ExtensionPage() {
  const [hashCopied, setHashCopied] = useState(false)

  const handleCopyHash = () => {
    navigator.clipboard.writeText(EXTENSION.sha256).then(() => {
      setHashCopied(true)
      setTimeout(() => setHashCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-base)' }}>
      <MainHeader />

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-10">

        {/* ── Hero Section ────────────────────────────────── */}
        <div className="text-center space-y-3">
          <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: '#38bdf8' }}>
            Browser Extension
          </span>
          <h1 className="font-display font-bold text-3xl sm:text-4xl" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            LearnPhish Extension
          </h1>
          <p className="text-sm leading-relaxed max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            Detect phishing links in real-time, right in your browser. Free, open-source, and built for awareness.
          </p>
        </div>

        {/* ── Download Card ─────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          {/* Top gradient bar */}
          <div style={{ height: '3px', background: 'linear-gradient(90deg, #38bdf8, #818cf8, #34d399)' }} />

          <div className="p-6 sm:p-8 space-y-6">
            {/* Download button row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🛡️</span>
                  <span className="font-display font-bold text-lg" style={{ color: 'var(--color-text-primary)' }}>
                    {EXTENSION.name}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded"
                    style={{ background: 'rgba(56,189,248,0.1)', color: 'var(--color-info)', border: '1px solid rgba(56,189,248,0.2)' }}>
                    {EXTENSION.version}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {EXTENSION.filename} · {EXTENSION.sizeLabel} · For Chromium-based browsers
                </p>
              </div>

              <a
                href={`/${EXTENSION.filename}`}
                download={EXTENSION.filename}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={{
                  background: 'linear-gradient(135deg, rgba(56,189,248,0.15), rgba(129,140,248,0.15))',
                  border: '1px solid rgba(56,189,248,0.35)',
                  color: 'var(--color-info)',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(56,189,248,0.25), rgba(129,140,248,0.25))'
                  e.currentTarget.style.borderColor = 'rgba(56,189,248,0.6)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(56,189,248,0.15), rgba(129,140,248,0.15))'
                  e.currentTarget.style.borderColor = 'rgba(56,189,248,0.35)'
                }}
              >
                ⬇️ Download ZIP
              </a>
            </div>

            {/* Compatible browsers row */}
            <div className="flex flex-wrap gap-2">
              {EXTENSION.compatible.map(browser => (
                <span key={browser} className="text-xs font-mono px-2.5 py-1 rounded-lg"
                  style={{ background: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  {browser}
                </span>
              ))}
            </div>

            {/* SHA256 Integrity */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                  SHA-256 Integrity Hash
                </span>
                <button
                  onClick={handleCopyHash}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                  style={{
                    background: hashCopied ? 'rgba(52,211,153,0.1)' : 'rgba(56,189,248,0.08)',
                    color: hashCopied ? 'var(--color-safe)' : 'var(--color-info)',
                    border: hashCopied ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(56,189,248,0.2)',
                  }}>
                  {hashCopied ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
              <code className="block font-mono text-xs break-all leading-relaxed" style={{ color: '#94a3b8' }}>
                {EXTENSION.sha256}
              </code>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                After downloading, verify this hash matches your file to confirm it hasn't been tampered with.
                Run <code className="font-mono text-xs px-1 rounded" style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}>
                  Get-FileHash .\{EXTENSION.filename} -Algorithm SHA256
                </code> in PowerShell, or <code className="font-mono text-xs px-1 rounded" style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}>
                  sha256sum {EXTENSION.filename}
                </code> on Mac/Linux.
              </p>
            </div>
          </div>
        </div>

        {/* ── Installation Tutorial ─────────────────────── */}
        <div className="space-y-4">
          <div className="space-y-1">
            <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
              Step-by-Step Guide
            </span>
            <h2 className="font-display font-bold text-xl" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
              How to Install the Extension
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Chromium-based browsers (Chrome, Edge, Brave, Opera) require loading the extension manually since it's not listed on the Web Store.
            </p>
          </div>

          <div className="space-y-3">
            {INSTALL_STEPS.map((s) => (
              <InstallStep key={s.step} {...s} />
            ))}
          </div>
        </div>

        {/* ── Important Notes ──────────────────────────── */}
        <div className="rounded-xl p-5 space-y-3"
          style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <h3 className="font-display font-bold text-sm flex items-center gap-2" style={{ color: '#f59e0b' }}>
            ⚠️ Important Notes
          </h3>
          <ul className="space-y-2 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            <li className="flex items-start gap-2">
              <span style={{ color: '#f59e0b' }}>•</span>
              <span>Do <strong style={{ color: 'var(--color-text-primary)' }}>not</strong> delete the extracted folder after loading — the browser loads the extension from it live.</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: '#f59e0b' }}>•</span>
              <span>If you see a "This extension is not from the Chrome Web Store" warning, that is expected for side-loaded developer extensions.</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: '#f59e0b' }}>•</span>
              <span>Always verify the SHA-256 hash before installing to ensure the file's integrity.</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: '#f59e0b' }}>•</span>
              <span>This is an academic research extension — results are informational and should not replace professional security tools.</span>
            </li>
          </ul>
        </div>

      </main>

      <Footer />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sub-component: A single installation step card
// ─────────────────────────────────────────────────────────────────
function InstallStep({ step, icon, title, desc, note, urls }) {
  return (
    <div className="flex gap-4 rounded-xl p-4"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {/* Step number column */}
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-sm"
          style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: 'var(--color-info)' }}>
          {step}
        </div>
      </div>

      {/* Content column */}
      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
        </div>

        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{desc}</p>

        {/* Browser URL list */}
        {urls && (
          <div className="space-y-1 pt-1">
            {urls.map(({ browser, url }) => (
              <div key={browser} className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold w-32 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{browser}:</span>
                <code className="text-[11px] font-mono px-2 py-0.5 rounded"
                  style={{ background: 'var(--color-elevated)', color: 'var(--color-info)', border: '1px solid var(--color-border)' }}>
                  {url}
                </code>
              </div>
            ))}
          </div>
        )}

        {/* Optional tip note */}
        {note && (
          <p className="text-[11px] leading-relaxed italic pt-1" style={{ color: 'var(--color-text-muted)' }}>
            💡 {note}
          </p>
        )}
      </div>
    </div>
  )
}
