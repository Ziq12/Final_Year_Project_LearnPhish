export default function RealVsFakePanel({ fakeUrl, officialDomain }) {
  if (!officialDomain) return null
  return (
    <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
      <div className="flex items-center gap-2 px-2.5 py-1.5"
        style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.12)' }}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#f87171' }}>⚠ Impersonation Detected</span>
      </div>
      <div className="px-2.5 py-2 space-y-1.5">
        {fakeUrl && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>This URL</p>
            <p className="font-mono text-xs truncate" style={{ color: '#f87171' }}>{fakeUrl}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>Real official site</p>
          <p className="font-mono text-xs" style={{ color: '#34d399' }}>{officialDomain}</p>
        </div>
      </div>
    </div>
  )
}
