import { useNavigate } from 'react-router-dom'
import { EXAMPLE_URLS } from '../../utils/constants'
import useScanStore from '../../store/useScanStore'

export default function ExampleURLCards({ selectedLayout = '/result2' }) {
  const startScan = useScanStore(s => s.startScan)
  const navigate  = useNavigate()

  async function handleExample(url) {
    navigate(selectedLayout)
    await startScan(url)
  }

  const tagStyle = {
    phishing:   { color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', border: 'var(--color-danger-border)' },
    legitimate: { color: 'var(--color-safe)',   bg: 'var(--color-safe-bg)',   border: 'var(--color-safe-border)'   },
  }

  return (
    <div className="mt-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-center mb-4"
        style={{ color: 'var(--color-text-secondary)' }}>
        Try an example
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {EXAMPLE_URLS.map(({ url, label, description, expected }) => {
          const s = tagStyle[expected] || {}
          return (
            <button key={url} onClick={() => handleExample(url)}
              className="text-left p-4 rounded-xl transition-all group"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-border-md)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
                {label}
              </span>
              <p className="text-xs font-mono mt-2 mb-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>{url}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
