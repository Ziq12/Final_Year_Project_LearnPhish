/**
 * SummaryPanel — Detection Summary sidebar widget.
 * Dark theme consistent with the rest of the UI.
 * Scrollable rows when content is tall.
 * Report button removed from here (moved to CheckGroup last group).
 */
import { useState } from 'react'

/* ── Helper sub-components ───────────────────────────────── */
function Badge({ text, color }) {
  const styles = {
    danger:  { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  color: '#fca5a5' },
    warn:    { bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)', color: '#fde68a' },
    safe:    { bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)',color: '#6ee7b7' },
    neutral: { bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)',color: '#94a3b8' },
    info:    { bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.25)',color: '#38bdf8' },
  }
  const s = styles[color] || styles.neutral
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {text}
    </span>
  )
}

function GsbBadge({ gsb }) {
  if (!gsb) return <Badge text="NOT CHECKED" color="neutral" />
  const map = {
    malicious: <Badge text="⚠ FLAGGED"   color="danger" />,
    safe:      <Badge text="✓ SAFE"       color="safe"   />,
    error:     <Badge text="⚠ ERROR"      color="warn"   />,
    disabled:  <Badge text="DISABLED"     color="neutral"/>,
  }
  return map[gsb.status] || <Badge text="NOT CHECKED" color="neutral" />
}

function gsbSub(gsb) {
  if (!gsb) return ''
  if (gsb.status === 'malicious') return `Threats: ${(gsb.threats || []).join(', ') || 'Unknown'}`
  if (gsb.status === 'safe')      return "Not in Google's threat database"
  if (gsb.status === 'disabled')  return 'No API key configured'
  if (gsb.status === 'error')     return gsb.error ? `Error: ${gsb.error}` : 'Could not reach GSB'
  return ''
}

function Row({ label, value, sub }) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        {value}
      </div>
      {sub && <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────── */
export default function SummaryPanel({ result }) {
  const [open, setOpen] = useState(true)
  if (!result) return null

  const h         = result.heuristic || {}
  const conf      = Math.round((result.confidence_score || 0) * 100)
  const isPhish   = result.is_phishing
  const mlSkipped = h.ml_skipped
  const hVerdict  = h.verdict || 'pass'
  const flagCount = (h.all_checks || []).filter(c => c.triggered).length
  const dgaDets   = (h.dga_check?.detections || [])
  const dgaHard   = dgaDets.filter(d => d.severity === 'hard').length
  const dgaSoft   = dgaDets.filter(d => d.severity === 'soft').length
  const dgaVerdict = h.dga_check?.verdict || 'pass'
  const dgaLabel  = dgaVerdict === 'pass'
    ? 'CLEAN'
    : [dgaHard > 0 ? `${dgaHard} hard` : null, dgaSoft > 0 ? `${dgaSoft} soft` : null]
        .filter(Boolean).join(' + ') + ' indicator(s)'
  const dgaColor  = dgaHard > 0 ? 'danger' : dgaSoft > 0 ? 'warn' : 'safe'
  const dgaSub    = dgaHard > 0
    ? 'Hard DGA/phishing infrastructure pattern'
    : dgaSoft > 0 ? 'Soft DGA indicators — forwarded to ML' : 'Domain looks naturally formed'
  const brandV    = h.brand_check?.verdict || 'pass'
  const gsb       = result.gsb

  const confColor = conf >= 80 ? 'danger' : conf >= 50 ? 'warn' : 'safe'
  const hColor    = hVerdict === 'block' ? 'danger' : hVerdict === 'suspicious' ? 'warn' : 'safe'
  const hSub      = hVerdict === 'block'
    ? (result.skip_reason || 'A high-confidence rule fired')
    : hVerdict === 'suspicious'
    ? `${flagCount} flag(s) — forwarded to ML`
    : 'No strong signals — forwarded to ML'

  const rows = [
    {
      label: 'Confidence',
      value: <Badge text={`${conf}%`} color={confColor} />,
      sub: conf >= 80 ? 'Very confident' : conf >= 50 ? 'Moderately confident' : 'Lower confidence',
    },
    {
      label: 'Heuristic verdict',
      value: <Badge text={hVerdict.toUpperCase()} color={hColor} />,
      sub: hSub,
    },
    {
      label: 'Brand check',
      value: <Badge
        text={brandV === 'pass' ? '✓ NONE' : brandV === 'block' ? '✗ BLOCKED' : '⚠ SUSPICIOUS'}
        color={brandV === 'pass' ? 'safe' : brandV === 'block' ? 'danger' : 'warn'}
      />,
      sub: brandV !== 'pass' ? (h.brand_check?.message || '') : 'No brand tricks found',
    },
    {
      label: 'DGA check',
      value: <Badge text={dgaLabel} color={dgaColor} />,
      sub: dgaSub,
    },
    {
      label: 'ML model',
      value: <Badge text={mlSkipped ? 'SKIPPED' : '✓ RAN'} color={mlSkipped ? 'neutral' : 'info'} />,
      sub: mlSkipped ? `Skipped — ${result.skip_reason || 'heuristic decided'}` : 'Analysed 56 URL features',
    },
    {
      label: 'Google Safe Browsing',
      value: <GsbBadge gsb={gsb} />,
      sub: gsbSub(gsb),
    },
  ]

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {/* Header toggle */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 transition-all"
        style={{ background: 'var(--color-elevated)', borderBottom: open ? '1px solid var(--color-border)' : 'none' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--color-elevated)'}>
        <span className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"
          style={{ color: 'var(--color-text-secondary)' }}>
          📊 Detection Summary
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}
          aria-expanded={open}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        /* Scrollable — max-h so it doesn't dominate the sidebar on short screens */
        <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
          {rows.map(r => <Row key={r.label} {...r} />)}
        </div>
      )}
    </div>
  )
}
