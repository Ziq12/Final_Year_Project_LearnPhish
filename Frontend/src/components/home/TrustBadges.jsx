export default function TrustBadges() {
  const badges = [
    { icon: '🔒', text: 'Private', sub: 'URLs never stored' },
    { icon: '⚡', text: 'Instant', sub: 'Under 2 seconds' },
    { icon: '🎓', text: 'Educational', sub: 'Every flag explained' },
  ]
  return (
    <div className="flex flex-wrap justify-center gap-4 mt-7">
      {badges.map(({ icon, text, sub }) => (
        <div key={text} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span className="text-base">{icon}</span>
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{text}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{sub}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
