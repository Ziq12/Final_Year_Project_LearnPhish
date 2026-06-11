import { useState, useEffect } from 'react'
import { useNavigate }        from 'react-router-dom'
import { useResultData }      from '../hooks/useResultData'
import useScanStore           from '../store/useScanStore'
import VerdictBanner          from '../components/result/VerdictBanner'
import VerdictFooter          from '../components/result/VerdictFooter'
import SummaryPanel           from '../components/result/SummaryPanel'
import DisclaimerBanner       from '../components/result/DisclaimerBanner'
import ChecklistSection       from '../components/checklist/ChecklistSection'
import ScanForm               from '../components/home/ScanForm'
import FullURLStrip           from '../components/url/FullURLStrip'
import PreScanQuiz            from '../components/quiz/PreScanQuiz'
import FalsePositiveModal     from '../components/result/FalsePositiveModal'

export default function Result2Page() {
  const navigate = useNavigate()
  const [showReport, setShowReport] = useState(false)
  const { status, result, scanUrl, error, groups, parsedUrl,
          revealed, totalCount, flaggedCount, handleScanAnother } = useResultData()

  const prescanDismissed   = useScanStore(s => s.prescanDismissed)
  const prefetchedQuestion = useScanStore(s => s.prefetchedQuestion)
  const dismissPrescan     = useScanStore(s => s.dismissPrescan)
  const retryScan          = useScanStore(s => s.retryScan)

  // Quiz is shown until the user explicitly dismisses it (Skip or See results).
  // NOT tied to scan status — runs fully in parallel with the backend call.
  const showPrescan = !prescanDismissed
  const scanDone    = status === 'revealing' || status === 'complete'

  // If the scan finishes and the DB has no questions (null), auto-dismiss
  // so the user isn't stuck on an empty quiz panel.
  useEffect(() => {
    if (!prescanDismissed && prefetchedQuestion === null) {
      dismissPrescan()
    }
  }, [prescanDismissed, prefetchedQuestion, dismissPrescan])

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-base)' }}>

      {/* Report modal — rendered at top level for correct z-index */}
      {showReport && result && (
        <FalsePositiveModal result={result} onClose={() => setShowReport(false)} />
      )}

      {/* Sticky nav */}
      <header className="sticky top-0 z-30 px-4 py-3"
        style={{ background: 'rgba(8,15,26,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="max-w-[1100px] mx-auto flex items-center justify-between gap-4">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-semibold transition-colors shrink-0"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-info)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
            ← <span className="font-display font-bold" style={{ color: 'var(--color-text-primary)' }}>LearnPhish</span>
          </button>

          <div className="flex-1 max-w-sm hidden sm:block">
            <ScanForm initialUrl={scanUrl} targetRoute="/result2" />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Report button in header — shown whenever scan result exists (both phishing & safe) */}
            {scanDone && result && (
              <button onClick={() => setShowReport(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.06)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(251,191,36,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(251,191,36,0.06)'}>
                🚩 Report
              </button>
            )}
            <button onClick={() => navigate('/dataset')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--color-info)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
              Dataset
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 py-6">
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 space-y-4 lg:space-y-0">

          {/* ── Left column ───────────────────── */}
          <div className="space-y-4 min-w-0">

            {showPrescan && (
              <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                {prefetchedQuestion
                  ? (
                    // Question is ready — render the interactive quiz
                    <PreScanQuiz onDismiss={dismissPrescan} />
                  ) : (
                    // Question still loading (undefined) — show scanning state
                    // so results never bleed through prematurely
                    <div className="py-6 text-center space-y-2">
                      <div className="flex justify-center gap-1.5 mb-3">
                        {[0,1,2].map(i => (
                          <span key={i} className="w-2 h-2 rounded-full inline-block"
                            style={{ background: 'var(--color-info)', opacity: 0.8,
                              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                        ))}
                      </div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                        Scanning URL…
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        Results will appear here when ready
                      </p>
                      <button onClick={dismissPrescan}
                        className="text-xs mt-2 transition-opacity"
                        style={{ color: 'var(--color-info)' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                        Skip →
                      </button>
                    </div>
                  )
                }
              </div>
            )}

            {error ? (
              <div className="rounded-2xl p-5"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="font-bold text-sm" style={{ color: '#f87171' }}>Scan failed</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(252,165,165,0.7)' }}>{error}</p>
                <div className="flex gap-3 mt-3">
                  <button onClick={retryScan}
                    className="text-sm font-semibold px-4 py-2 rounded-lg"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                    ↻ Retry
                  </button>
                  <button onClick={() => navigate('/')} className="text-sm" style={{ color: 'var(--color-info)' }}>
                    ← Go back
                  </button>
                </div>
              </div>
            ) : !showPrescan ? (
              <VerdictBanner
                status={status}
                result={result}
                flaggedCount={flaggedCount}
                totalCount={totalCount}
              />
            ) : null}

            {result && !showPrescan && <DisclaimerBanner />}

            {((result || status === 'scanning') && !showPrescan) && (
              <ChecklistSection
                groups={groups.length ? groups : skeletonGroups()}
                parsedUrl={parsedUrl}
                revealed={revealed}
                result={result}
              />
            )}

            {result && !showPrescan && <VerdictFooter isPhishing={result.is_phishing} status={status} />}

            <div className="sm:hidden mt-3">
              <ScanForm initialUrl={scanUrl} targetRoute="/result2" />
            </div>
          </div>

          {/* ── Right sidebar ──────────────────── */}
          <div className="space-y-4">
            <div className="lg:sticky lg:top-[65px] space-y-4">

              {parsedUrl && !showPrescan && (
                <div className="rounded-2xl p-4"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    URL Anatomy
                  </p>
                  <FullURLStrip parsedUrl={parsedUrl} activeItem={null} />
                  <p className="text-xs mt-2 italic" style={{ color: 'var(--color-text-muted)' }}>
                    Click any part to learn what it means
                  </p>
                </div>
              )}

              {result && !showPrescan && <SummaryPanel result={result} />}

              {result && status === 'complete' && !showPrescan && (
                <div className="rounded-2xl p-4 space-y-2"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <button onClick={handleScanAnother}
                    className="w-full font-semibold text-sm py-2.5 rounded-xl transition-all"
                    style={{ background: 'var(--color-info)', color: '#020d14', boxShadow: '0 0 15px rgba(56,189,248,0.2)' }}>
                    Scan another URL →
                  </button>
                  <a href="https://consumer.ftc.gov/articles/how-recognize-and-avoid-phishing-scams"
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center w-full text-sm font-medium py-2.5 rounded-xl transition-all"
                    style={{ border: '1px solid var(--color-border-md)', color: 'var(--color-text-secondary)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
                    📚 Learn about phishing
                  </a>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}

function skeletonGroups() {
  const sk = id => ({ id, text:'', tip:'', part:'full', severity:'pending', present:false, measured:'' })
  return [
    { id:'sk1', name:'Web Address & Technical Checks', items: Array.from({length:10},(_,i)=>sk(`sk1_${i}`)) },
    { id:'sk2', name:'Brand Impersonation Check',      items: [sk('sk2_0')] },
    { id:'sk3', name:'Generated / Random URL Check',    items: [sk('sk3_0')] },
    { id:'sk4', name:'Machine Learning Analysis',      items: Array.from({length:3},(_,i)=>sk(`sk4_${i}`)) },
  ]
}
