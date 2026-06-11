/**
 * CheckGroup — collapsible group with smart sticky URL strip.
 *
 * Sticky strip rules:
 *  • Sticks below the group header while scrolling through items.
 *  • Releases (un-sticks) when the last TWO checklist items are visible,
 *    giving reading space at the bottom of each group.
 *  • Never overlaps the quiz, report button, or items below the fold.
 *  • Gap between URL strip and first item = 12px spacer.
 *  • Groups have 16px gap between them (handled by parent space-y-4 → space-y-6).
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { GROUP_FOCUS_PARTS } from '../../utils/constants'
import MiniURLStrip      from '../url/MiniURLStrip'
import CheckItem         from './CheckItem'
import InlineQuiz        from '../quiz/InlineQuiz'
import FalsePositiveModal from '../result/FalsePositiveModal'

const GROUP_ICONS = {
  'Web Address & Technical Checks': '🔗',
  'Brand Impersonation Check':      '🏷️',
  'Domain Name Analysis (DGA)':     '🤖',
  'Machine Learning Analysis':      '🧠',
}

// How many items from the bottom the strip releases early
const RELEASE_BEFORE_LAST = 2
// Height estimate per item row (px) — used to calculate early-release threshold
const ITEM_ROW_H = 54
// Strip height (px) — approximate
const STRIP_H = 52

export default function CheckGroup({ group, parsedUrl, revealed, result, isLastGroup }) {
  const [activeItem,  setActiveItem]  = useState(null)
  const [showReport,  setShowReport]  = useState(false)
  const [collapsed,   setCollapsed]   = useState(false)

  // stripState: 'sticky' | 'released' | 'hidden'
  const [stripState,  setStripState]  = useState('hidden')
  const [stripTop,    setStripTop]    = useState(0)
  const [stripRect,   setStripRect]   = useState(null)

  const groupRef     = useRef(null)
  const listRef      = useRef(null)    // wraps all CheckItem rows
  const NAV_H        = 57
  const HEADER_H     = 46

  const focusParts   = GROUP_FOCUS_PARTS[group.name] || ['full']
  const flaggedCount = group.items.filter(i => i.present).length
  const totalCount   = group.items.length
  const allRevealed  = group.items.every(i => revealed.has(i.id))
  const isScanning   = group.items.every(i => !revealed.has(i.id))

  /**
   * Compute where the fixed strip should sit and whether it should show.
   *
   * Logic:
   *  1. Group not yet on screen → hidden.
   *  2. Group header above viewport (user scrolled in) → strip shows, follows
   *     until "early-release threshold".
   *  3. Early-release: when the bottom of the list minus (RELEASE_BEFORE_LAST * ITEM_ROW_H)
   *     would be above where the strip bottom would land → release it (let it float up
   *     naturally with the card).
   *  4. Group fully above viewport → hidden again.
   */
  const update = useCallback(() => {
    const group = groupRef.current
    const list  = listRef.current
    if (!group || !list) return

    const gr = group.getBoundingClientRect()
    const lr = list.getBoundingClientRect()

    // Update horizontal rect for portal positioning
    setStripRect({ left: gr.left + 1, width: gr.width - 2 })

    const stripEntryTop = NAV_H + HEADER_H + 6   // where strip sits when sticky
    const stripBottom   = stripEntryTop + STRIP_H

    // Group hasn't scrolled into sticky zone yet
    if (gr.top > NAV_H + HEADER_H + 30) {
      setStripState('hidden')
      return
    }

    // Group has scrolled fully off screen
    if (gr.bottom < NAV_H) {
      setStripState('hidden')
      return
    }

    // Early-release threshold: bottom of list - (N items * row height)
    // When the strip bottom would reach within N items of the list bottom, release
    const earlyReleaseY = lr.bottom - (RELEASE_BEFORE_LAST * ITEM_ROW_H) - STRIP_H

    if (earlyReleaseY < stripBottom) {
      // Release: let the strip scroll up naturally with the group
      // Its natural position is: header bottom + 6px offset relative to page
      const naturalTop = gr.top + HEADER_H + 6
      setStripState('released')
      setStripTop(Math.round(naturalTop))
    } else {
      setStripState('sticky')
      setStripTop(Math.round(stripEntryTop))
    }
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update])

  const showStrip = parsedUrl && !collapsed && (stripState === 'sticky' || stripState === 'released')

  return (
    <>
      {showReport && result && (
        <FalsePositiveModal result={result} onClose={() => setShowReport(false)} />
      )}

      <div ref={groupRef} className="rounded-2xl overflow-visible relative"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>

        {/* ── Group header — sticky ───────────────────────────────── */}
        <div className="sticky z-20 flex items-center justify-between px-5 py-3 rounded-t-2xl cursor-pointer select-none"
          style={{ top: NAV_H, background: 'var(--color-surface)', borderBottom: `1px solid ${collapsed ? 'transparent' : 'var(--color-border)'}` }}
          onClick={() => setCollapsed(c => !c)}
          role="button"
          aria-expanded={!collapsed}>

          <h3 className="text-sm font-semibold flex items-center gap-2.5" style={{ color: 'var(--color-text-primary)' }}>
            <span>{GROUP_ICONS[group.name] || '🔍'}</span>
            {group.name}
          </h3>

          <div className="flex items-center gap-2">
            {isScanning ? (
              <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full scan-pulse" style={{ background: 'var(--color-info)' }} />
                Scanning…
              </span>
            ) : flaggedCount > 0 ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                {flaggedCount}/{totalCount} flagged
              </span>
            ) : (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>
                ✓ All clear
              </span>
            )}
            {/* Collapse chevron */}
            <span className="text-xs transition-transform duration-200 ml-1"
              style={{ color: 'var(--color-text-muted)', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', display: 'inline-block' }}>
              ▼
            </span>
          </div>
        </div>

        {/* ── Collapsible body ─────────────────────────────────────── */}
        {!collapsed && (
          <>
            {/* Spacer — reserves space for the fixed strip so content isn't hidden beneath it */}
            <div style={{ height: STRIP_H + 16 }} aria-hidden="true" />

            {/* Checklist items */}
            <div ref={listRef} className="px-4 pb-3 space-y-1.5" role="list">
              {group.items.map(item => (
                <CheckItem
                  key={item.id}
                  item={item}
                  isRevealed={revealed.has(item.id)}
                  onHover={setActiveItem}
                />
              ))}
            </div>

            {/* Inline quiz */}
            {allRevealed && (
              <InlineQuiz groupId={group.id} hasFlaggedItems={flaggedCount > 0} />
            )}

            {/* Report button — last group only, both verdicts */}
            {isLastGroup && allRevealed && result && (
              <div className="px-4 pb-4 mt-1">
                <button onClick={e => { e.stopPropagation(); setShowReport(true) }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all text-sm font-semibold"
                  style={{ border: '1px dashed rgba(251,191,36,0.35)', color: '#fbbf24', background: 'rgba(251,191,36,0.04)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(251,191,36,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(251,191,36,0.04)'}>
                  🚩 Report incorrect detection
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Fixed URL strip portal — rendered outside card so z-index is clean ── */}
      {showStrip && stripRect && (
        <div
          aria-hidden="true"
          style={{
            position:  'fixed',
            top:       stripTop,
            left:      stripRect.left,
            width:     stripRect.width,
            zIndex:    25,
            // Smooth transition only for the 'released' → scroll-up motion
            transition: stripState === 'released' ? 'top 0.1s linear' : 'none',
          }}>
          <div className="px-4 py-2.5 rounded-xl shadow-2xl"
            style={{
              background:     'rgba(13,21,35,0.98)',
              border:         '1px solid var(--color-border-md)',
              backdropFilter: 'blur(12px)',
              boxShadow:      '0 8px 40px rgba(0,0,0,0.6)',
            }}>
            <MiniURLStrip
              parsedUrl={parsedUrl}
              groupFocusParts={focusParts}
              activeItem={activeItem}
              showHint={false}
            />
          </div>
        </div>
      )}
    </>
  )
}
