/**
 * MiniURLStrip — compact URL anatomy bar used inside CheckGroup.
 * No hint text (showHint=false by default when used inside groups).
 * The "Click any segment" hint lives only in the sidebar FullURLStrip.
 */
import { useState } from 'react'
import { URL_PARTS } from '../../utils/constants'

const PART_DESCRIPTIONS = {
  protocol:  'Connection type. "https://" = encrypted. "http://" = no encryption.',
  subdomain: 'Section before the domain. Scammers place brand names here.',
  domain:    'The core website name — the most important part to check.',
  tld:       'Domain ending (.com, .xyz…). Unusual endings are often abused.',
  path:      'Page path. Watch for /login, /verify, /secure.',
  query:     'Extra data sent to the page. Can contain hidden redirects.',
  full:      'The entire URL is relevant to this check.',
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

export default function MiniURLStrip({
  parsedUrl,
  groupFocusParts = [],
  activeItem = null,
  showHint = false,         // ← false when used inside groups
}) {
  const [clickedPart, setClickedPart] = useState(null)
  const [hoveredPart, setHoveredPart] = useState(null)

  if (!parsedUrl) return null
  const { protocol, subdomain, domain, tld, path, query } = parsedUrl
  const segments = [
    protocol  && { part: 'protocol',  text: protocol + '://' },
    subdomain && { part: 'subdomain', text: subdomain + '.'  },
    domain    && { part: 'domain',    text: domain           },
    tld       && { part: 'tld',       text: '.' + tld        },
    path      && { part: 'path',      text: path             },
    query     && { part: 'query',     text: query            },
  ].filter(Boolean)

  const highlightPart = hoveredPart || clickedPart || (activeItem?.part === 'full' ? null : activeItem?.part)
  const isFull = !hoveredPart && !clickedPart && activeItem?.part === 'full'

  function getHlStyle(part) {
    const isH = isFull || part === highlightPart
    if (!isH) return null
    if (hoveredPart === part || clickedPart === part) return 'info'
    return activeItem?.severity || 'info'
  }

  function getOpacity(part) {
    if (!highlightPart && !isFull) return groupFocusParts.includes(part) ? 1 : 0.28
    if (isFull) return 1
    return part === highlightPart ? 1 : 0.18
  }

  const HL_BG = {
    danger:     'rgba(239,68,68,0.2)',
    suspicious: 'rgba(251,191,36,0.15)',
    safe:       'rgba(52,211,153,0.15)',
    info:       'rgba(56,189,248,0.15)',
  }
  const HL_BORDER = {
    danger:     'rgba(239,68,68,0.55)',
    suspicious: 'rgba(251,191,36,0.55)',
    safe:       'rgba(52,211,153,0.5)',
    info:       'rgba(56,189,248,0.5)',
  }

  const activeTip = hoveredPart || clickedPart

  return (
    <div>
      {/* URL row */}
      <div className="flex flex-wrap items-center gap-0 rounded-lg px-3 py-1.5 font-mono text-xs leading-loose overflow-x-auto"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {segments.map(({ part, text }) => {
          const hl = getHlStyle(part)
          return (
            <span key={part}
              className="transition-all duration-75 px-0.5 cursor-pointer"
              style={{
                color:        hl ? undefined : PART_COLORS[part],
                opacity:      getOpacity(part),
                background:   hl ? HL_BG[hl]     : undefined,
                outline:      hl ? `1px solid ${HL_BORDER[hl]}` : undefined,
                borderRadius: hl ? 3              : undefined,
              }}
              onMouseEnter={() => setHoveredPart(part)}
              onMouseLeave={() => setHoveredPart(null)}
              onClick={e => { e.stopPropagation(); setClickedPart(p => p === part ? null : part) }}>
              {text}
            </span>
          )
        })}
      </div>

      {/* Inline description — only when a segment is hovered/clicked */}
      {activeTip && (
        <div className="mt-1.5 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed"
          style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.14)' }}>
          <span className="font-bold uppercase tracking-wider mr-1"
            style={{ color: 'var(--color-info)', fontSize: 9 }}>
            {URL_PARTS[activeTip]?.label || activeTip}
          </span>
          <span style={{ color: '#93c5fd' }}>{PART_DESCRIPTIONS[activeTip]}</span>
        </div>
      )}

      {/* Optional hint — only shown in sidebar FullURLStrip context */}
      {showHint && !activeTip && !activeItem && (
        <p className="text-xs mt-1.5 ml-0.5 italic" style={{ color: 'var(--color-text-muted)' }}>
          Click any segment to learn what it means
        </p>
      )}
    </div>
  )
}
