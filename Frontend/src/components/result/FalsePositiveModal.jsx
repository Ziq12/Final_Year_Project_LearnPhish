/**
 * FalsePositiveModal — solid dark bg, z-[9999], proper backdrop.
 * Appears for BOTH phishing and safe results.
 */
import { useState, useEffect, useRef } from 'react'

const REASONS = [
  { value: 'own_site',       label: 'This is my own legitimate website' },
  { value: 'known_trusted',  label: 'This is a well-known trusted site' },
  { value: 'brand_mismatch', label: 'The domain was misidentified as a brand' },
  { value: 'should_be_phish',label: 'This SHOULD be flagged as phishing (false safe)' },
  { value: 'other',          label: 'Other reason' },
]

export default function FalsePositiveModal({ result, onClose }) {
  const [reason,  setReason]  = useState('')
  const [notes,   setNotes]   = useState('')
  const [status,  setStatus]  = useState('idle') // idle | sending | sent | error
  const dialogRef = useRef(null)

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Close on Escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!reason) return
    setStatus('sending')
    
    try {
      const h = result?.heuristic || {}
      const selectedReason = REASONS.find(r => r.value === reason)
      const reasonLabel = selectedReason?.label || reason
      // LOGIC CHANGE: Format the notes based on the selection
      let finalNotes = ''
      if (reason === 'other') {
        // If "Other", prepend the label to the user's text
        finalNotes = notes.trim() ? `${reasonLabel}: ${notes}` : reasonLabel
      } else {
        // If specific reason, use the reason value itself as the note
        finalNotes = reasonLabel
      }

      // Determine triggered rule
      let finalRule = null;
      const hAllChecks = h.all_checks || [];
      if (result?.status === 'whitelisted') {
         finalRule = 'whitelist';
      } else if (result?.status === 'blacklisted') {
         finalRule = 'blacklist';
      } else if (result?.gsb?.status === 'unsafe') {
         finalRule = 'google_safe_browsing';
      } else if (h.brand_check?.triggered_rule) {
         finalRule = h.brand_check.triggered_rule;
      } else if (h.dga_check?.verdict === 'block' || h.dga_check?.verdict === 'suspicious') {
         finalRule = h.dga_check.detections?.[0]?.rule || 'dga_algorithm';
      } else {
         const triggeredHeuristic = hAllChecks.find(c => c.triggered);
         if (triggeredHeuristic) {
             finalRule = triggeredHeuristic.rule;
         } else if (result?.final_verdict === 'phishing' && (result?.status === 'success' || result?.status === 'phishing')) {
             finalRule = 'ml_model';
         }
      }

      // Determine similarity score
      let finalScore = null;
      if (h.brand_check?.similarity_score !== undefined && h.brand_check?.similarity_score !== null) {
          finalScore = h.brand_check.similarity_score;
      } else if (result?.confidence_score !== undefined && result?.confidence_score !== null) {
          finalScore = result.confidence_score;
      } else if (result?.explain?.overall_risk_score !== undefined && result?.explain?.overall_risk_score !== null) {
          finalScore = result.explain.overall_risk_score;
      }

      const body = {
        url:            result?.url || '',
        domain:         result?.parsed_url?.hostname || '',
        triggered_rule: finalRule,
        similarity_score: finalScore,
        matched_brand:  h.brand_check?.matched_brand || null,
        
        // LOGIC CHANGE: Always send 'false_positive' to satisfy DB constraint
        user_feedback:  'false_positive', 
        
        // LOGIC CHANGE: Send the formatted notes
        notes:          finalNotes,
      }

      const apiBase = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiBase}/api/feedback`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_FRONTEND_API_KEY
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Server error')
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    /* Full-screen backdrop — z-[9999] so it covers everything including sticky headers */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true" aria-label="Report false positive"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-elevated)' }}>
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🚩</span>
            <div>
              <p className="font-display font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                Report Incorrect Detection
              </p>
              <p className="text-xs font-mono mt-0.5 truncate max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {result?.parsed_url?.hostname || result?.url || ''}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ color: 'var(--color-text-secondary)', background: 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        {status === 'sent' ? (
          <div className="px-5 py-10 text-center">
            <span className="text-5xl">✅</span>
            <p className="font-display font-bold text-lg mt-4" style={{ color: '#6ee7b7' }}>Report submitted</p>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              Thank you! Our team will review and update the database if needed.
            </p>
            <button onClick={onClose} className="mt-5 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all"
              style={{ background: 'var(--color-info)', color: '#020d14' }}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                If you believe this result is incorrect, tell us why. We'll review the report and update our detection system.
              </p>

              {/* Reason selector */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2.5"
                  style={{ color: 'var(--color-text-secondary)' }}>
                  Why do you think this result is wrong? <span style={{ color: 'var(--color-danger)' }}>*</span>
                </p>
                <div className="space-y-2">
                  {REASONS.map(({ value, label }) => (
                    <label key={value}
                      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all"
                      style={{
                        background: reason === value ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${reason === value ? 'rgba(56,189,248,0.35)' : 'var(--color-border)'}`,
                      }}>
                      {/* Custom radio */}
                      <span className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                        style={{
                          border: `2px solid ${reason === value ? 'var(--color-info)' : 'rgba(148,163,184,0.4)'}`,
                          background: reason === value ? 'var(--color-info)' : 'transparent',
                        }}>
                        {reason === value && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <input type="radio" name="reason" value={value}
                        className="sr-only" onChange={() => setReason(value)} />
                      <span className="text-sm" style={{ color: reason === value ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes - Only show if "Other" is selected */}
              {reason === 'other' && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    Additional details <span style={{ color: 'var(--color-text-muted)' }}>(optional)</span>
                  </p>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="e.g. Official website link, contact info, registration details…"
                    className="w-full text-sm px-3.5 py-3 rounded-xl resize-none transition-all"
                    style={{
                      background: 'var(--color-elevated)',
                      border: '1px solid var(--color-border-md)',
                      color: 'var(--color-text-primary)',
                      outline: 'none',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(56,189,248,0.45)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border-md)'}
                  />
                </div>
              )}

              {status === 'error' && (
                <p className="text-xs px-3 py-2 rounded-lg"
                  style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger-border)' }}>
                  Submission failed. Please try again.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ border: '1px solid var(--color-border-md)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-border-md)'}
                onMouseLeave={e => {}}>
                Cancel
              </button>
              <button type="submit" disabled={!reason || status === 'sending'}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: reason ? 'var(--color-info)' : 'rgba(56,189,248,0.2)',
                  color: reason ? '#020d14' : 'rgba(56,189,248,0.4)',
                  cursor: reason ? 'pointer' : 'not-allowed',
                }}>
                {status === 'sending' ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}