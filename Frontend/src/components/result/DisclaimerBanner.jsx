import { useState, useEffect } from 'react'

export default function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('lp_disclaimer')) setDismissed(true)
  }, [])

  if (dismissed) return null

  return (
    <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
      style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
      <span className="text-lg flex-shrink-0">ℹ️</span>
      <p className="text-xs leading-relaxed flex-1" style={{ color: '#93c5fd' }}>
        Results are informational. False positives and negatives are possible. For important security decisions, always verify with your IT team.
      </p>
      <button onClick={() => { setDismissed(true); sessionStorage.setItem('lp_disclaimer', '1') }}
        className="text-xs flex-shrink-0 transition-colors" style={{ color: 'rgba(147,197,253,0.5)' }}
        aria-label="Dismiss notice">✕</button>
    </div>
  )
}
