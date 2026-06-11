/**
 * URLSegment.jsx
 * One span of the URL (protocol, subdomain, domain, tld, path, query).
 * Accepts an `active` prop (bool) and `severity` to apply highlight class.
 */
import { URL_PARTS, SEVERITY } from '../../utils/constants'

export default function URLSegment({ part, text, active, severity = 'safe', compact = false }) {
  if (!text) return null

  const partConfig = URL_PARTS[part] || URL_PARTS.full
  const baseClass  = `font-mono rounded px-0.5 transition-all duration-200 ${compact ? 'text-xs' : 'text-sm'}`

  const activeClass = active
    ? (severity === 'danger'     ? 'bg-red-100 ring-2 ring-red-400 text-red-800' :
       severity === 'suspicious' ? 'bg-amber-100 ring-2 ring-amber-400 text-amber-800' :
       'bg-green-100 ring-2 ring-green-400 text-green-800')
    : `${partConfig.color} opacity-60`

  return (
    <span className={`${baseClass} ${activeClass}`}>
      {text}
    </span>
  )
}
