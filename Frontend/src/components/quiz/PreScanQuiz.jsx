import { useState } from 'react'
import { submitAnswer } from '../../utils/quizApi'
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
  const question = useScanStore(s => s.prefetchedQuestion)
  
  // 🔥 FIX 1: Destructure `progress` from the hook so it doesn't crash!
  const { progress, recordAnswer } = useQuizProgress() 
  
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  if (!question) return null

  // 🔥 2. Handle the answer submission
  const handleOptionClick = async (index) => {
    if (result || loading) return // Prevent double-clicks
    
    setSelectedIndex(index)
    setLoading(true)

    // Submit to backend to get the correct answer & explanation
    const res = await submitAnswer(question.id, index)

    if (res) {
      setResult(res)
      // 🔥 3. CRITICAL: Save to localStorage so it's excluded next time!
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
        onAnswer={handleOptionClick}
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