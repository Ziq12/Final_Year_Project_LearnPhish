/**
 * QuizCard.jsx — redesigned for educational impact.
 * Dark theme, learning streak feel, clear feedback.
 */
export default function QuizCard({ question, onAnswer, result, isLoading, compact = false }) {
  if (!question) return null
  const pad = compact ? 'p-4' : 'p-5'

  return (
    <div className={`rounded-2xl ${pad} transition-all duration-300 quiz-pop`}
      style={{
        background: result
          ? result.is_correct ? 'rgba(52,211,153,0.06)'   : 'rgba(239,68,68,0.06)'
          : 'rgba(245,158,11,0.06)',
        border: result
          ? result.is_correct ? '1px solid rgba(52,211,153,0.25)' : '1px solid rgba(239,68,68,0.2)'
          : '1px solid rgba(245,158,11,0.25)',
      }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
          🎓 Quiz
        </span>
        {result && (
          <span className="text-xs font-bold"
            style={{ color: result.is_correct ? '#34d399' : '#f87171' }}>
            {result.is_correct ? '✓ Correct!' : '✗ Not quite'}
          </span>
        )}
      </div>

      {/* Question */}
      <p className="text-sm font-semibold mb-3.5 leading-snug" style={{ color: 'var(--color-text-primary)' }}>
        {question.question_text}
      </p>

      {/* Options */}
      <div className="flex flex-col gap-2">
        {question.options.map((opt, idx) => (
          <OptionButton key={idx} index={idx} label={opt}
            result={result} isLoading={isLoading} onClick={() => onAnswer(idx)} />
        ))}
      </div>

      {/* Explanation */}
      {result && (
        <div className="mt-4 text-xs rounded-xl px-3.5 py-3 leading-relaxed"
          style={{
            background: result.is_correct ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
            border: result.is_correct ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(239,68,68,0.2)',
            color: result.is_correct ? '#6ee7b7' : '#fca5a5',
          }}>
          <span className="font-semibold">Why: </span>
          {result.explanation_text}
        </div>
      )}
    </div>
  )
}

function OptionButton({ index, label, result, isLoading, onClick }) {
  const letters = ['A', 'B', 'C', 'D']
  const letter  = letters[index] ?? index

  let style = {
    base: 'w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 ',
  }

  let bg, border, textColor, letterBg, letterColor

  if (!result && !isLoading) {
    bg = 'transparent'; border = 'rgba(148,163,184,0.15)'; textColor = 'var(--color-text-secondary)'
    letterBg = 'rgba(245,158,11,0.1)'; letterColor = '#f59e0b'
  } else if (isLoading) {
    bg = 'transparent'; border = 'rgba(148,163,184,0.08)'; textColor = 'var(--color-text-muted)'
    letterBg = 'rgba(148,163,184,0.08)'; letterColor = 'var(--color-text-muted)'
  } else if (result?.correct_index === index) {
    bg = 'rgba(52,211,153,0.1)'; border = 'rgba(52,211,153,0.3)'; textColor = '#6ee7b7'
    letterBg = 'rgba(52,211,153,0.2)'; letterColor = '#34d399'
  } else if (result?.selected_index === index && !result.is_correct) {
    bg = 'rgba(239,68,68,0.1)'; border = 'rgba(239,68,68,0.25)'; textColor = '#fca5a5'
    letterBg = 'rgba(239,68,68,0.15)'; letterColor = '#f87171'
  } else {
    bg = 'transparent'; border = 'rgba(148,163,184,0.08)'; textColor = 'var(--color-text-muted)'
    letterBg = 'rgba(148,163,184,0.06)'; letterColor = 'var(--color-text-muted)'
  }

  return (
    <button
      className={style.base + 'focus-ring'}
      style={{ background: bg, border: `1px solid ${border}`, color: textColor, cursor: result || isLoading ? 'default' : 'pointer' }}
      onClick={onClick}
      disabled={!!result || isLoading}
      onMouseEnter={e => { if (!result && !isLoading) e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)' }}
      onMouseLeave={e => { if (!result && !isLoading) e.currentTarget.style.borderColor = border }}>
      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
        style={{ background: letterBg, color: letterColor }}>
        {letter}
      </span>
      <span className="leading-snug">{label}</span>
    </button>
  )
}
