/**
 * CheckItem — hover shows explanation automatically (no click for info).
 * Keeps keyboard-accessible toggle as fallback for accessibility.
 * Text severity labels + left accent colour.
 */
import { useState, useId } from 'react'
import StatusIcon from './StatusIcon'
import RealVsFakePanel from './RealVsFakePanel'

const SEV_LABEL = {
  danger:     { text: 'HIGH RISK',  color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.25)' },
  suspicious: { text: 'SUSPICIOUS', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.25)'  },
  safe:       { text: 'SAFE',       color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.2)'   },
  pending:    { text: '',           color: '',        bg: '',                        border: ''                        },
}

const LEFT_ACCENT = {
  danger:     '#ef4444',
  suspicious: '#f59e0b',
  safe:       'rgba(52,211,153,0.3)',
  pending:    'rgba(148,163,184,0.1)',
}

export default function CheckItem({ item, isRevealed, onHover }) {
  // hovered = tip shown on hover; pinned = tip locked open via keyboard
  const [hovered, setHovered] = useState(false)
  const [pinned,  setPinned]  = useState(false)
  const tipId = useId()

  const state = !isRevealed ? 'pending' : item.present ? 'flagged' : 'passed'
  const sev   = !isRevealed ? 'pending' : (item.present ? item.severity : 'safe')
  const sl    = SEV_LABEL[sev] || SEV_LABEL.pending

  const showTip = (hovered || pinned) && isRevealed && !!item.tip

  function handleMouseEnter() {
    if (isRevealed) {
      setHovered(true)
      onHover?.({ part: item.part, severity: sev })
    }
  }
  function handleMouseLeave() {
    setHovered(false)
    if (!pinned) onHover?.(null)
  }
  function handleKeyToggle(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setPinned(p => !p)
      if (!pinned) onHover?.({ part: item.part, severity: sev })
      else onHover?.(null)
    }
  }

  return (
    <div
      className={`rounded-lg transition-all duration-150 ${isRevealed ? 'item-reveal' : ''}`}
      style={{
        borderLeft: `3px solid ${LEFT_ACCENT[sev] || LEFT_ACCENT.pending}`,
        background: state === 'flagged'
          ? (sev === 'danger' ? 'rgba(239,68,68,0.05)' : 'rgba(251,191,36,0.04)')
          : state === 'passed' ? 'rgba(52,211,153,0.03)' : 'rgba(255,255,255,0.02)',
        opacity: state === 'pending' ? 0.4 : state === 'passed' ? 0.72 : 1,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      onKeyDown={handleKeyToggle}
      tabIndex={isRevealed ? 0 : -1}
      role="listitem"
      aria-label={`${state}: ${item.text}`}
      aria-describedby={showTip ? tipId : undefined}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <StatusIcon state={state} severity={sev} />

        <div className="flex-1 min-w-0">
          {/* Row: text + severity badge */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm leading-relaxed"
              style={{ color: state === 'pending' ? 'var(--color-text-muted)' : state === 'passed' ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>
              {state === 'pending'
                ? <span className="inline-block rounded shimmer h-4 w-48" style={{ background: 'var(--color-elevated)' }} />
                : item.text}
            </p>
            {isRevealed && sl.text && (
              <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ color: sl.color, background: sl.bg, border: `1px solid ${sl.border}` }}>
                {sl.text}
              </span>
            )}
          </div>

          {/* Measured value */}
          {state === 'flagged' && item.measured && (
            <span className="inline-block mt-1.5 text-xs font-mono px-2 py-0.5 rounded"
              style={{ color: sl.color, background: sl.bg, border: `1px solid ${sl.border}` }}>
              Detected: {item.measured}
            </span>
          )}

          {/* Hover/focus explanation — appears automatically on hover */}
          {showTip && (
            <div id={tipId}
              className="mt-2 text-xs leading-relaxed p-3 rounded-lg"
              style={{
                background: 'rgba(56,189,248,0.06)',
                border: '1px solid rgba(56,189,248,0.15)',
                color: '#93c5fd',
                animation: 'tipFade 0.15s ease-out',
              }}>
              <style>{`@keyframes tipFade{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}`}</style>
              <span className="font-semibold" style={{ color: 'var(--color-info)' }}>Why this matters: </span>
              {item.tip}
            </div>
          )}

          {/* URL part label */}
          {isRevealed && (
            <p className="text-xs mt-1 uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Checks: <strong style={{ color: 'var(--color-text-secondary)' }}>{item.part}</strong>
            </p>
          )}

          {state === 'flagged' && item.officialDomain && (
            <RealVsFakePanel fakeUrl={item.fakeUrl} officialDomain={item.officialDomain} />
          )}
        </div>
      </div>
    </div>
  )
}
