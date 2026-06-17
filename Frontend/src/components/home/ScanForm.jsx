import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useScanStore from '../../store/useScanStore'

export default function ScanForm({ initialUrl = '', targetRoute = '/result' }) {
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState('')
  const startScan = useScanStore(s => s.startScan)
  const status = useScanStore(s => s.status)
  const navigate = useNavigate()
  
  const isScanning = status === 'scanning'

  function validate(val) {
    const trimmed = val.trim();
    
    // 1. Check for empty input
    if (!trimmed) {
      return 'Please enter a URL to check.';
    }

    // 2. Explicitly check if it contains/starts with http:// or https://
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return 'URL must start with http:// or https://';
    }

    try {
      const parsed = new URL(trimmed);
      // 3. Explicitly block non-web protocols (ftp, mailto, etc.) just in case
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return `Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are allowed.`;
      }
      return ''; // Valid
    } catch {
      return "That doesn't look like a valid web address. Please check the format.";
    }
  }

  async function handleScan(e) {
    e?.preventDefault();
    const err = validate(url);
    
    if (err) { 
      setError(err); 
      return; 
    }

    setError('');
    const finalUrl = url.trim();

    navigate(targetRoute);
    await startScan(finalUrl);
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
        
        {/* Removed !url.trim() from disabled so the button can be clicked when empty to trigger the error */}
        <button 
          type="submit" 
          disabled={isScanning} 
          className="shrink-0 font-semibold text-sm px-4 py-2.5 rounded-lg transition-all"
          style={{ 
            background: 'var(--color-info)', 
            color: '#020d14', 
            opacity: isScanning ? 0.5 : 1 
          }}
        >
          {isScanning ? '…' : 'Scan →'}
        </button>
      </div>
      
      {error && (
        <p id="url-error" className="text-xs mt-1.5" style={{ color: 'var(--color-danger)' }} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}