import useScanStore from '../../store/useScanStore'
import { useNavigate } from 'react-router-dom'

export default function VerdictFooter({ isPhishing, status }) {
  const reset    = useScanStore(s => s.reset)
  const navigate = useNavigate()

  if (!status || status === 'scanning') return null

  const tip = isPhishing
    ? "Scammers copy real websites exactly — the only way to tell is carefully reading the address bar. Bookmark your bank's real website."
    : "A safe URL is just the start. Legitimate services never ask for your password via email. Always verify before entering details."

  return (
    <div className="rounded-2xl p-5" style={{
      background: isPhishing ? 'rgba(239,68,68,0.05)' : 'rgba(52,211,153,0.05)',
      border: `1px solid ${isPhishing ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.15)'}`,
    }}>
      <div className="flex items-start gap-3 mb-4">
        <span className="text-2xl">{isPhishing ? '🛡️' : '👍'}</span>
        <div>
          <p className="font-semibold text-sm" style={{ color: isPhishing ? '#fca5a5' : '#6ee7b7' }}>
            {isPhishing ? 'What should you do?' : 'Looks good — stay safe'}
          </p>
          <p className="text-sm mt-1 leading-relaxed" style={{ color: isPhishing ? 'rgba(252,165,165,0.7)' : 'rgba(110,231,183,0.7)' }}>
            {isPhishing
              ? 'Do not click this link. Do not enter any personal information. If someone sent this to you, let them know.'
              : 'This URL passed our checks. Always look at the address bar before entering passwords on any site.'}
          </p>
        </div>
      </div>

      {/* Learning tip */}
      <div className="rounded-xl p-3.5 mb-4"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
        <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: '#f59e0b' }}>
          💡 Did you know?
        </p>
        <p className="text-sm leading-relaxed" style={{ color: '#fde68a', opacity: 0.85 }}>
          {tip}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => { reset(); navigate('/') }}
          className="font-semibold text-sm px-5 py-2.5 rounded-xl transition-all"
          style={{ background: 'var(--color-info)', color: '#020d14' }}>
          Scan another URL →
        </button>
        <a href="https://consumer.ftc.gov/articles/how-recognize-and-avoid-phishing-scams"
          target="_blank" rel="noopener noreferrer"
          className="font-medium text-sm px-5 py-2.5 rounded-xl transition-all"
          style={{ border: '1px solid var(--color-border-md)', color: 'var(--color-text-secondary)' }}>
          📚 Learn more
        </a>
      </div>
    </div>
  )
}
