/**
 * ErrorDisplay.jsx
 * ────────────────
 * Renders a contextual error card matched to the error type returned
 * by useScanStore. Supports a compact inline variant and a full card
 * variant (default) used on the Result page.
 *
 * Error types → visual treatments:
 *   rate_limit          amber  ⏱️  countdown bar + auto-retry
 *   connection_error    red    📡  network unreachable
 *   server_error        red    ⚠️  HTTP 5xx
 *   service_unavailable orange 🧠  ML / HF Space offline
 *   unauthorized        red    🔑  API key missing / invalid
 *   invalid_url         amber  🔗  bad URL format
 *   unknown             red    ⚠️  catch-all
 */
import { useState, useEffect } from 'react'

// ─────────────────────────────────────────────────────────────────
// Configuration table — one entry per error type
// ─────────────────────────────────────────────────────────────────
const CFG = {
  rate_limit: {
    icon:  '⏱️',
    label: 'Rate limited',
    title: 'Too many scans',
    rgb:   '251,191,36',   // amber
    canRetry:   true,
    autoRetry:  true,
    hint: "You've reached the scan rate limit. The counter below shows when you can try again.",
  },
  connection_error: {
    icon:  '📡',
    label: 'Network error',
    title: 'Connection failed',
    rgb:   '239,68,68',    // red
    canRetry:  true,
    autoRetry: false,
    hint: 'Your browser could not reach LearnPhish servers. Check your internet connection and try again.',
  },
  server_error: {
    icon:  '⚠️',
    label: 'Server error',
    title: 'Something went wrong',
    rgb:   '239,68,68',
    canRetry:  true,
    autoRetry: false,
    hint: 'An unexpected error occurred on the server. This is usually temporary — retrying often works.',
  },
  service_unavailable: {
    icon:  '🧠',
    label: 'Service offline',
    title: 'ML engine offline',
    rgb:   '251,146,60',   // orange
    canRetry:  true,
    autoRetry: false,
    hint: 'The Hugging Face inference space may be cold-starting. First scan after an idle period can take 30–60 s — retry in a moment.',
  },
  unauthorized: {
    icon:  '🔑',
    label: 'Auth error',
    title: 'Access denied',
    rgb:   '239,68,68',
    canRetry:  false,
    autoRetry: false,
    hint: 'The API key is invalid or missing. This is a configuration issue — contact the site administrator.',
  },
  invalid_url: {
    icon:  '🔗',
    label: 'Invalid input',
    title: 'Invalid URL',
    rgb:   '251,191,36',
    canRetry:  false,
    autoRetry: false,
    hint: 'Enter a complete URL, e.g. https://example.com or just example.com without quotes.',
  },
  unknown: {
    icon:  '⚠️',
    label: 'Error',
    title: 'Unexpected error',
    rgb:   '239,68,68',
    canRetry:  true,
    autoRetry: false,
    hint: 'Something unexpected happened. Retrying usually fixes this.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────
export default function ErrorDisplay({ error, onRetry, onGoBack, compact = false }) {
  const type = error?.type ?? 'unknown'
  const cfg  = CFG[type] ?? CFG.unknown

  // Rate-limit countdown
  const isRL        = type === 'rate_limit'
  const totalSecs   = error?.retryAfter ?? 60
  const [rem, setRem]   = useState(isRL ? totalSecs : 0)
  const [fired, setFired] = useState(false)

  // Tick down every second while rate-limited
  useEffect(() => {
    if (!isRL || rem <= 0) return
    const id = setInterval(() => {
      setRem(prev => {
        if (prev <= 1) { clearInterval(id); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [isRL]) // run once on mount; rem changes drive the render

  // Auto-retry once countdown reaches 0
  useEffect(() => {
    if (isRL && rem === 0 && !fired && cfg.autoRetry && onRetry) {
      setFired(true)
      const t = setTimeout(() => onRetry(), 450)
      return () => clearTimeout(t)
    }
  }, [rem, isRL, fired, cfg.autoRetry, onRetry])

  const progress  = isRL && totalSecs > 0
    ? Math.min(100, ((totalSecs - rem) / totalSecs) * 100)
    : 0
  const showRetry = cfg.canRetry && !(isRL && rem > 0)
  const goBackLabel = type === 'invalid_url' ? 'Fix URL' : 'Go back'

  // ── Compact variant (used inline below form on HomePage) ────
  if (compact) {
    return (
      <div className="mt-3 px-4 py-3 rounded-xl"
        style={{
          background: `rgba(${cfg.rgb},0.06)`,
          border:     `1px solid rgba(${cfg.rgb},0.25)`,
        }}>
        <div className="flex items-center gap-2.5">
          <span className="text-base shrink-0">{cfg.icon}</span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold"
              style={{ color: `rgb(${cfg.rgb})` }}>
              {cfg.title}:{' '}
            </span>
            <span className="text-sm"
              style={{ color: 'var(--color-text-secondary)' }}>
              {error?.message}
            </span>
          </div>
          {error?.status > 0 && (
            <span className="text-xs font-mono shrink-0"
              style={{ color: `rgba(${cfg.rgb},0.55)` }}>
              {error.status}
            </span>
          )}
        </div>
        {isRL && rem > 0 && (
          <p className="text-xs mt-1.5 pl-8"
            style={{ color: `rgba(${cfg.rgb},0.7)` }}>
            Retry in {rem}s
          </p>
        )}
      </div>
    )
  }

  // ── Full card variant (used on Result2Page) ─────────────────
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: `rgba(${cfg.rgb},0.05)`,
        border:     `1px solid rgba(${cfg.rgb},0.2)`,
      }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: `1px solid rgba(${cfg.rgb},0.12)` }}>

        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{
            background: `rgba(${cfg.rgb},0.12)`,
            border:     `1px solid rgba(${cfg.rgb},0.25)`,
          }}>
          {cfg.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm"
              style={{ color: `rgb(${cfg.rgb})` }}>
              {cfg.title}
            </p>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full"
              style={{
                background: `rgba(${cfg.rgb},0.15)`,
                color:      `rgb(${cfg.rgb})`,
              }}>
              {cfg.label}
            </span>
          </div>
          {error?.status > 0 && (
            <p className="text-xs font-mono mt-0.5"
              style={{ color: `rgba(${cfg.rgb},0.55)` }}>
              HTTP {error.status}
            </p>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-5 py-4 space-y-4">

        {/* Message + hint */}
        <div>
          <p className="text-sm leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}>
            {error?.message}
          </p>
          <p className="text-xs mt-2 leading-relaxed"
            style={{ color: 'var(--color-text-muted)' }}>
            {cfg.hint}
          </p>
        </div>

        {/* Rate-limit countdown bar */}
        {isRL && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold"
                style={{ color: `rgb(${cfg.rgb})` }}>
                {rem > 0
                  ? `Retry available in ${rem}s`
                  : fired ? 'Retrying scan…' : 'Ready to retry'}
              </span>
              {rem > 0 && (
                <span className="text-xs font-mono tabular-nums"
                  style={{ color: `rgba(${cfg.rgb},0.55)` }}>
                  {Math.round(progress)}%
                </span>
              )}
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: `rgba(${cfg.rgb},0.15)` }}>
              <div className="h-full rounded-full"
                style={{
                  background:  `rgb(${cfg.rgb})`,
                  width:       `${progress}%`,
                  transition:  'width 1s linear',
                  boxShadow:   `0 0 8px rgba(${cfg.rgb},0.45)`,
                }} />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-1">
          {showRetry && onRetry && (
            <button
              onClick={onRetry}
              className="text-sm font-semibold px-4 py-2 rounded-lg transition-all active:scale-95"
              style={{
                background: `rgba(${cfg.rgb},0.12)`,
                border:     `1px solid rgba(${cfg.rgb},0.3)`,
                color:      `rgb(${cfg.rgb})`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `rgba(${cfg.rgb},0.2)` }}
              onMouseLeave={e => { e.currentTarget.style.background = `rgba(${cfg.rgb},0.12)` }}>
              ↻ Retry
            </button>
          )}
          {onGoBack && (
            <button
              onClick={onGoBack}
              className="text-sm font-medium transition-opacity"
              style={{ color: 'var(--color-info)' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
              ← {goBackLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
