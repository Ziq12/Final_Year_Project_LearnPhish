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
  const question = useScanStore(s => s.prefetchedQuestion)
  
  // 🔥 1. Import the progress hook
  const { recordAnswer } = useQuizProgress() 
  
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
    <div className="space-y-4">
      <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
        🎓 Quick Question
      </h3>
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        {question.question_text}
      </p>

      <div className="space-y-2">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleOptionClick(index)}
            disabled={loading || result}
            className="w-full text-left text-sm px-4 py-2.5 rounded-lg transition-all"
            style={{
              background: selectedIndex === index ? 'rgba(56,189,248,0.1)' : 'var(--color-elevated)',
              border: `1px solid ${selectedIndex === index ? 'var(--color-info)' : 'var(--color-border)'}`,
              color: 'var(--color-text-primary)'
            }}
          >
            {option}
          </button>
        ))}
      </div>

      {/* Show result and explanation after answering */}
      {result && (
        <div className="mt-4 p-3 rounded-lg" style={{ background: result.is_correct ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)' }}>
          <p className="text-xs font-bold mb-1" style={{ color: result.is_correct ? '#34d399' : '#f87171' }}>
            {result.is_correct ? '✅ Correct!' : '❌ Incorrect'}
          </p>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {result.explanation_text}
          </p>
          <button 
            onClick={onDismiss}
            className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-md"
            style={{ background: 'var(--color-info)', color: '#020d14' }}
          >
            See Scan Results →
          </button>
        </div>
      )}
    </div>
  )
}