import { useState } from 'react'
import { URL_PARTS } from '../../utils/constants'

const PART_DESCRIPTIONS = {
  protocol:  '"https://" means the connection is encrypted — safer. "http://" sends data in plain text and anyone on the same network can read it.',
  subdomain: 'Everything before the main domain. Attackers put brand names here (e.g. "paypal.evil.com") to look trustworthy — but the real domain is still "evil.com".',
  domain:    'The core registered name. This is the most important part — it tells you who actually owns the site.',
  tld:       'The domain ending (.com, .org, .co.uk). Unusual endings like .xyz, .top, .gq are cheaper and heavily used by scammers.',
  path:      'The specific page or folder. Watch for words like /login, /verify, /secure — these are commonly faked by phishing sites.',
  query:     'Extra data sent to the page (starts with "?"). Can carry hidden redirects, tracking codes, or session-hijacking attempts.',
  full:      'The entire URL address is relevant to this check.',
}

const PART_COLORS = {
  protocol:  '#38bdf8',
  subdomain: '#c084fc',
  domain:    '#e2e8f0',
  tld:       '#fb923c',
  path:      '#2dd4bf',
  query:     '#818cf8',
  full:      '#f87171',
}

export default function FullURLStrip({ parsedUrl, activeItem = null }) {
  const [clickedPart, setClickedPart] = useState(null)
  const [hoveredPart, setHoveredPart] = useState(null)

  if (!parsedUrl) return null
  const { protocol, subdomain, domain, tld, path, query } = parsedUrl
  const parts = [
    protocol  && { part: 'protocol',  text: protocol + '://' },
    subdomain && { part: 'subdomain', text: subdomain + '.'  },
    domain    && { part: 'domain',    text: domain           },
    tld       && { part: 'tld',       text: '.' + tld        },
    path      && { part: 'path',      text: path             },
    query     && { part: 'query',     text: query            },
  ].filter(Boolean)

  const focusPart = hoveredPart || clickedPart || (activeItem?.part !== 'full' ? activeItem?.part : null)
  const isFull    = !hoveredPart && !clickedPart && activeItem?.part === 'full'
  const extSev    = activeItem?.severity || 'safe'

  function getOpacity(part) {
    if (!focusPart && !isFull) return 0.9
    if (isFull) return 1
    return part === focusPart ? 1 : 0.2
  }

  function getHighlight(part) {
    const active = isFull || part === focusPart
    if (!active) return null
    if (hoveredPart === part || clickedPart === part) return 'info'
    return extSev
  }

  const tooltipPart = hoveredPart || clickedPart
  const partConfig  = tooltipPart ? URL_PARTS[tooltipPart] : null
  const description = tooltipPart ? PART_DESCRIPTIONS[tooltipPart] : null

  return (
    <div>
      {/* URL segments */}
      <div className="flex flex-wrap items-baseline gap-0 font-mono text-sm leading-loose break-all mb-3">
        {parts.map(({ part, text }) => {
          const hl = getHighlight(part)
          const hlBg = hl === 'danger' ? 'rgba(239,68,68,0.2)' : hl === 'suspicious' ? 'rgba(251,191,36,0.15)' : hl === 'safe' ? 'rgba(52,211,153,0.15)' : 'rgba(56,189,248,0.15)'
          const hlBorder = hl === 'danger' ? 'rgba(239,68,68,0.4)' : hl === 'suspicious' ? 'rgba(251,191,36,0.4)' : hl === 'safe' ? 'rgba(52,211,153,0.4)' : 'rgba(56,189,248,0.4)'
          return (
            <span key={part}
              className="transition-all duration-100 cursor-pointer"
              style={{
                color: hl ? undefined : PART_COLORS[part],
                opacity: getOpacity(part),
                background: hl ? hlBg : undefined,
                outline: hl ? `1px solid ${hlBorder}` : undefined,
                borderRadius: hl ? 4 : undefined,
                padding: hl ? '0 2px' : undefined,
              }}
              onMouseEnter={() => setHoveredPart(part)}
              onMouseLeave={() => setHoveredPart(null)}
              onClick={() => setClickedPart(p => p === part ? null : part)}
              tabIndex={0}
              role="button"
              aria-label={`${URL_PARTS[part]?.label || part}: ${text}`}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setClickedPart(p => p === part ? null : part) }}>
              {text}
            </span>
          )
        })}
      </div>

      {/* Legend pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {parts.map(({ part }) => (
          <button key={part}
            onClick={() => setClickedPart(p => p === part ? null : part)}
            className="text-xs px-2 py-0.5 rounded-full transition-all"
            style={{
              color: clickedPart === part ? '#020d14' : PART_COLORS[part],
              background: clickedPart === part ? PART_COLORS[part] : 'rgba(255,255,255,0.05)',
              border: `1px solid ${PART_COLORS[part]}40`,
            }}>
            {URL_PARTS[part]?.label || part}
          </button>
        ))}
      </div>

      {/* Description */}
      {description && (
        <div className="rounded-lg px-3 py-2.5 text-xs leading-relaxed"
          style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
          <p className="font-bold mb-1 uppercase tracking-wider" style={{ color: 'var(--color-info)', fontSize: 10 }}>
            {partConfig?.label || tooltipPart}
          </p>
          <p style={{ color: '#93c5fd' }}>{description}</p>
          <button onClick={() => setClickedPart(null)}
            className="mt-1.5 text-xs transition-colors" style={{ color: 'rgba(147,197,253,0.5)' }}>
            ✕ Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
