import { useState, useEffect } from 'react'
import { submitAnswer, fetchQuestion } from '../../utils/quizApi'
import { useQuizProgress } from '../../hooks/useQuizProgress'
import useScanStore from '../../store/useScanStore'
import QuizCard from './QuizCard'

/**
 * PreScanQuiz
 * ───────────
 * Renders the quiz question pre-fetched on the HomePage (zero network delay).
 *
 * Dismissal rules — ONLY these two actions close the quiz:
 *  1. User clicks "Skip quiz →"
 *  2. User answers a question, then clicks "See full results →"
 *
 * The quiz is NEVER auto-closed by a timer or by the scan finishing.
 * The scan result waits behind the quiz until the user is ready.
 */
export default function PreScanQuiz({ onDismiss }) {
  const { progress, recordAnswer } = useQuizProgress()

  const prefetchedQuestion    = useScanStore(s => s.prefetchedQuestion)
  const setPrescanAnswered    = useScanStore(s => s.setPrescanAnswered)
  const setPrefetchedQuestion = useScanStore(s => s.setPrefetchedQuestion)

  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)

  // Edge case only: if the DB has no questions seeded, dismiss cleanly
  useEffect(() => {
    if (prefetchedQuestion === null && onDismiss) {
      onDismiss()
    }
  }, [prefetchedQuestion, onDismiss])

  // If the user scanned directly from ResultPage (bypassing HomePage), the
  // pre-fetch never ran and prefetchedQuestion is undefined. Self-fetch a
  // random domain question so the quiz still shows instead of leaving the
  // parent stuck on "Scanning… Skip →".
  useEffect(() => {
    if (prefetchedQuestion !== undefined) return
    const DOMAINS = [
      'Structural Complexity',
      'Identity & Brand Trust',
      'Advanced Content Patterns',
      'Obfuscation & Cloaking',
    ]
    const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)]
    fetchQuestion(domain, progress.answered_ids).then(q => {
      // null  → no questions in DB; the effect above will auto-dismiss
      // {...} → question object; component will re-render and show the quiz
      setPrefetchedQuestion(q ?? null)
    })
  }, []) // eslint-disable-line — intentionally runs once on mount

  // undefined = prefetch still in flight → show nothing (prevents empty flash)
  // null      = no questions in DB     → handled by useEffect above
  if (!prefetchedQuestion) return null

  const question = prefetchedQuestion

  const handleAnswer = async (selectedIndex) => {
    if (result || loading) return
    setLoading(true)
    setPrescanAnswered()

    const res = await submitAnswer(question.id, selectedIndex)
    if (res) {
      setResult({ ...res, selected_index: selectedIndex })
      recordAnswer(question.id, res.is_correct)
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}>
          While scanning…
        </span>
        {progress.total_answered > 0 && (
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Score: {progress.total_correct}/{progress.total_answered}
          </span>
        )}
      </div>

      <QuizCard
        question={question}
        onAnswer={handleAnswer}
        result={result}
        isLoading={loading}
      />

      <div className="mt-3 text-center">
        <button
          onClick={onDismiss}
          className="text-sm transition-opacity"
          style={{ color: 'var(--color-info)' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
          {result ? 'See full results →' : 'Skip quiz →'}
        </button>
      </div>
    </div>
  )
}
