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
import ErrorDisplay           from '../components/result/ErrorDisplay'
import ResultHeader           from '../components/layout/ResultHeader'


export default function Result2Page() {
  const navigate = useNavigate()
  const [showReport, setShowReport] = useState(false)
  const { status, result, scanUrl, error, groups, parsedUrl,
          revealed, totalCount, flaggedCount, handleScanAnother } = useResultData()

  const prescanDismissed   = useScanStore(s => s.prescanDismissed)
  const prefetchedQuestion = useScanStore(s => s.prefetchedQuestion)
  const dismissPrescan     = useScanStore(s => s.dismissPrescan)
  const retryScan          = useScanStore(s => s.retryScan)

  // Quiz is shown until the user explicitly dismisses it (Skip / See results).
  // It is also hidden whenever there is an error — no point showing it
  // while the scan has already failed.
  const showPrescan = !prescanDismissed && !error
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
      <ResultHeader 
        scanUrl={scanUrl} 
        showReportButton={scanDone && result} 
        onReport={() => setShowReport(true)} 
      />

      <main className="max-w-[1100px] mx-auto px-4 py-6">
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 space-y-4 lg:space-y-0">

          {/* ── Left column ────────────────────────────────── */}
          <div className="space-y-4 min-w-0">

            {/* Pre-scan quiz — hidden on error, hidden after dismiss */}
            {showPrescan && (
              <div className="rounded-2xl p-5"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                {prefetchedQuestion
                  ? (
                    <PreScanQuiz onDismiss={dismissPrescan} />
                  ) : (
                    <div className="py-6 text-center space-y-2">
                      <div className="flex justify-center gap-1.5 mb-3">
                        {[0, 1, 2].map(i => (
                          <span key={i} className="w-2 h-2 rounded-full inline-block"
                            style={{ background: 'var(--color-info)', opacity: 0.8,
                              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                        ))}
                      </div>
                      <p className="text-sm font-semibold"
                        style={{ color: 'var(--color-text-secondary)' }}>
                        Scanning URL…
                      </p>
                      <p className="text-xs"
                        style={{ color: 'var(--color-text-muted)' }}>
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

            {/* ── Error state — full ErrorDisplay card ─────── */}
            {error ? (
              <ErrorDisplay
                error={error}
                onRetry={retryScan}
                onGoBack={() => navigate('/')}
              />
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

            {result && !showPrescan && (
              <VerdictFooter isPhishing={result.is_phishing} status={status} />
            )}

            <div className="sm:hidden mt-3">
              <ScanForm initialUrl={scanUrl} targetRoute="/result2" />
            </div>
          </div>

          {/* ── Right sidebar ────────────────────────────────── */}
          <div className="space-y-4">
            <div className="lg:sticky lg:top-[65px] space-y-4">

              {parsedUrl && !showPrescan && !error && (
                <div className="rounded-2xl p-4"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    URL Anatomy
                  </p>
                  <FullURLStrip parsedUrl={parsedUrl} activeItem={null} />
                  <p className="text-xs mt-2 italic"
                    style={{ color: 'var(--color-text-muted)' }}>
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

              {/* Error sidebar hint — shown instead of summary panel on error */}
              {error && (
                <div className="rounded-2xl p-4"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    What you can do
                  </p>
                  <div className="space-y-2">
                    {[
                      { label: 'Try scanning again', action: retryScan,         show: error.type !== 'unauthorized' && error.type !== 'invalid_url' },
                      { label: 'Scan a different URL', action: handleScanAnother, show: true },
                      { label: 'Check server status',
                        action: () => window.open('https://status.learnphish.me', '_blank'),
                        show: error.type === 'server_error' || error.type === 'service_unavailable' || error.type === 'connection_error' },
                    ].filter(a => a.show).map(({ label, action }) => (
                      <button key={label} onClick={action}
                        className="w-full text-left text-xs font-semibold px-3 py-2.5 rounded-lg transition-all"
                        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--color-info)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
                        → {label}
                      </button>
                    ))}
                  </div>
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
  const sk = id => ({ id, text: '', tip: '', part: 'full', severity: 'pending', present: false, measured: '' })
  return [
    { id: 'sk1', name: 'Web Address & Technical Checks', items: Array.from({ length: 10 }, (_, i) => sk(`sk1_${i}`)) },
    { id: 'sk2', name: 'Brand Impersonation Check',      items: [sk('sk2_0')] },
    { id: 'sk3', name: 'Generated / Random URL Check',   items: [sk('sk3_0')] },
    { id: 'sk4', name: 'Machine Learning Analysis',      items: Array.from({ length: 3 }, (_, i) => sk(`sk4_${i}`)) },
  ]
}
