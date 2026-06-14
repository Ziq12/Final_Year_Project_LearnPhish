export default function Footer() {
  return (
    <footer className="px-6 py-6" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-base">🛡️</span>
          <span className="font-display font-bold text-sm" style={{ color: 'var(--color-text-secondary)' }}>LearnPhish</span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>v5 · Academic research project</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Results are informational. Always exercise caution online.
        </p>
      </div>
    </footer>
  )
}