import { useState, useEffect } from 'react'
import { fetchQuestion, submitAnswer } from '../../utils/quizApi'
import { useQuizProgress } from '../../hooks/useQuizProgress'
import QuizCard from './QuizCard'

const GROUP_TO_DOMAIN = {
  structural: 'Structural Complexity',
  brand:      'Identity & Brand Trust',
  dga:        'Advanced Content Patterns',
  ml:         'Obfuscation & Cloaking',
}

export default function InlineQuiz({ groupId, hasFlaggedItems }) {
  const { progress, recordAnswer } = useQuizProgress()
  const domainName = GROUP_TO_DOMAIN[groupId]
  const [question, setQuestion]   = useState(null)
  const [result,   setResult]     = useState(null)
  const [loading,  setLoading]    = useState(false)
  const [fetched,  setFetched]    = useState(false)
  const [visible,  setVisible]    = useState(false)

  useEffect(() => {
    if (!domainName || fetched) return
    setFetched(true)
    fetchQuestion(domainName, progress.answered_ids).then(setQuestion)
  }, [domainName]) // eslint-disable-line

  const handleAnswer = async (selectedIndex) => {
    if (!question || result || loading) return
    setLoading(true)
    const res = await submitAnswer(question.id, selectedIndex)
    if (res) {
      setResult({ ...res, selected_index: selectedIndex })
      recordAnswer(question.id, res.is_correct)
    }
    setLoading(false)
  }

  if (!question) return null

  return (
    <div className="px-4 pb-4">
      {!visible ? (
        <button onClick={() => setVisible(true)}
          className="w-full mt-2 flex items-center justify-center gap-2.5 py-3 rounded-xl transition-all"
          style={{ border: '1px dashed rgba(245,158,11,0.3)', color: '#f59e0b', background: 'rgba(245,158,11,0.04)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.04)'}>
          <span className="text-base">🎓</span>
          <span className="text-sm font-semibold">Test your knowledge on this</span>
          <span className="text-xs" style={{ color: 'rgba(245,158,11,0.6)' }}>optional</span>
        </button>
      ) : (
        <div className="mt-2">
          <QuizCard question={question} onAnswer={handleAnswer} result={result} isLoading={loading} compact />
          {result && (
            <p className="text-center text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              Score: <strong style={{ color: 'var(--color-text-secondary)' }}>
                {progress.total_correct + (result.is_correct ? 1 : 0)}/{progress.total_answered + 1}
              </strong>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
