/**
 * StickyURLStrip.jsx
 * Full URL anatomy bar that becomes sticky once the user scrolls past it.
 * Uses IntersectionObserver to detect when to activate sticky mode.
 *
 * When sticky: compact single-line version pinned to top of viewport.
 * When in-flow: full labelled version with part annotations.
 */
import { useState, useRef, useEffect } from 'react'
import FullURLStrip from '../url/FullURLStrip'
import URLSegment from '../url/URLSegment'

export default function StickyURLStrip({ parsedUrl, activeItem }) {
  const [isSticky, setIsSticky] = useState(false)
  const sentinelRef = useRef(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-64px 0px 0px 0px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  const { protocol, subdomain, domain, tld, path, query } = parsedUrl || {}

  return (
    <>
      {/* Sentinel element — invisible, triggers sticky when scrolled past */}
      <div ref={sentinelRef} className="h-0 w-0" />

      {/* In-flow full strip */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
          URL Anatomy — hover any check below to highlight that part
        </p>
        <FullURLStrip parsedUrl={parsedUrl} activeItem={activeItem} />
      </div>

      {/* Sticky compact bar — appears when scrolled past in-flow version */}
      {isSticky && (
        <div
          className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm px-4 py-2"
          aria-label="URL anatomy (sticky)"
        >
          <div className="max-w-2xl mx-auto flex flex-wrap items-center gap-0.5 font-mono text-xs overflow-x-auto">
            {protocol  && <URLSegment part="protocol"  text={protocol + '://'} active={activeItem?.part === 'protocol'  || activeItem?.part === 'full'} severity={activeItem?.severity} compact />}
            {subdomain && <URLSegment part="subdomain" text={subdomain + '.'}   active={activeItem?.part === 'subdomain' || activeItem?.part === 'full'} severity={activeItem?.severity} compact />}
            {domain    && <URLSegment part="domain"    text={domain}            active={activeItem?.part === 'domain'    || activeItem?.part === 'full'} severity={activeItem?.severity} compact />}
            {tld       && <URLSegment part="tld"       text={'.' + tld}         active={activeItem?.part === 'tld'       || activeItem?.part === 'full'} severity={activeItem?.severity} compact />}
            {path      && <URLSegment part="path"      text={path}              active={activeItem?.part === 'path'      || activeItem?.part === 'full'} severity={activeItem?.severity} compact />}
            {query     && <URLSegment part="query"     text={query}             active={activeItem?.part === 'query'     || activeItem?.part === 'full'} severity={activeItem?.severity} compact />}
          </div>
        </div>
      )}
    </>
  )
}
