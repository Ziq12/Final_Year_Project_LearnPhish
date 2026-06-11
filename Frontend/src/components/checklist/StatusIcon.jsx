export default function StatusIcon({ state, severity }) {
  if (state === 'pending') {
    return (
      <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full shimmer"
        style={{ background: 'var(--color-elevated)' }} aria-label="Checking" />
    )
  }
  if (state === 'passed') {
    return (
      <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full flex items-center justify-center text-[10px]"
        style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}
        aria-label="Passed">
        ✓
      </span>
    )
  }
  // flagged
  const isDanger = severity === 'danger'
  return (
    <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full flex items-center justify-center text-[10px] font-bold"
      style={isDanger
        ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }
        : { background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}
      aria-label="Flagged">
      !
    </span>
  )
}
