import { useNavigate } from 'react-router-dom'
import ScanForm from '../home/ScanForm'

export default function ResultHeader({ scanUrl, showReportButton, onReport }) {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-30 px-4 py-3"
      style={{ background: 'rgba(8,15,26,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--color-border)' }}>
      <div className="max-w-[1100px] mx-auto flex items-center justify-between gap-4">
        
        {/* Back Button */}
        <button onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm font-semibold transition-colors shrink-0"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-info)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
          ← <span className="font-display font-bold" style={{ color: 'var(--color-text-primary)' }}>LearnPhish</span>
        </button>

        {/* Inline Scan Form */}
        <div className="flex-1 max-w-sm hidden sm:block">
          <ScanForm initialUrl={scanUrl} targetRoute="/result2" />
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {showReportButton && (
            <button onClick={onReport}
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
  )
}