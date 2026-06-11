import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useScanStore from '../../store/useScanStore'

export default function ScanForm({ initialUrl = '', targetRoute = '/result' }) {
  const [url, setUrl]     = useState(initialUrl)
  const [error, setError] = useState('')
  const startScan         = useScanStore(s => s.startScan)
  const status            = useScanStore(s => s.status)
  const navigate          = useNavigate()
  const isScanning = status === 'scanning'

  function validate(val) {
    const trimmed = val.trim()
    if (!trimmed) return 'Please enter a URL to check.'
    const testUrl = trimmed.startsWith('http') ? trimmed : 'https://' + trimmed
    try { new URL(testUrl); return '' } catch { return "That doesn't look like a valid web address." }
  }

  async function handleScan(e) {
    e?.preventDefault()
    const err = validate(url)
    if (err) { setError(err); return }
    setError('')
    const finalUrl = url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim()
    navigate(targetRoute)
    await startScan(finalUrl)
  }

  return (
    <form onSubmit={handleScan} className="w-full" noValidate>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setError('') }}
          placeholder="https://paste-url-here.com"
          className="flex-1 text-sm px-3 py-2.5 rounded-lg font-mono transition-all"
          style={{
            background: 'var(--color-surface)',
            border: error ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--color-border-md)',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(56,189,248,0.5)'}
          onBlur={e => e.currentTarget.style.borderColor = error ? 'rgba(239,68,68,0.4)' : 'var(--color-border-md)'}
          disabled={isScanning}
          aria-label="URL to check"
          aria-describedby={error ? 'url-error' : undefined}
        />
        <button type="submit" disabled={isScanning || !url.trim()}
          className="shrink-0 font-semibold text-sm px-4 py-2.5 rounded-lg transition-all"
          style={{ background: 'var(--color-info)', color: '#020d14', opacity: (isScanning || !url.trim()) ? 0.5 : 1 }}>
          {isScanning ? '…' : 'Scan →'}
        </button>
      </div>
      {error && <p id="url-error" className="text-xs mt-1.5" style={{ color: 'var(--color-danger)' }} role="alert">{error}</p>}
    </form>
  )
}
