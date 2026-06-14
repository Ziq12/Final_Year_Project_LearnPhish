import { useNavigate, useLocation } from 'react-router-dom'

export default function MainHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentPath = location.pathname

  const navItems = [
    { label: 'Scanner', path: '/' },
    { label: 'Learn',   path: '/learn' },
    { label: 'Dataset', path: '/dataset' },
  ]

  return (
    <header className="sticky top-0 z-30 px-6 py-4"
      style={{ background: 'rgba(8,15,26,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--color-border)' }}>
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        
        {/* Logo */}
        <button onClick={() => navigate('/')} className="flex items-center gap-3 cursor-pointer">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)' }}>🛡️</div>
          <span className="font-display font-bold text-lg" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            LearnPhish
          </span>
          <span className="hidden sm:inline text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: 'rgba(56,189,248,0.1)', color: 'var(--color-info)', border: '1px solid rgba(56,189,248,0.2)' }}>
            v5
          </span>
        </button>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ label, path }) => {
            const isActive = currentPath === path
            return (
              <button
                key={label}
                onClick={() => navigate(path)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                style={{ 
                  color: isActive ? 'var(--color-info)' : 'var(--color-text-secondary)', 
                  background: isActive ? 'rgba(56,189,248,0.08)' : 'transparent',
                  border: isActive ? '1px solid rgba(56,189,248,0.2)' : '1px solid transparent'
                }}
                onMouseEnter={e => { if(!isActive) e.currentTarget.style.color = 'var(--color-info)' }}
                onMouseLeave={e => { if(!isActive) e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              >
                {label}
              </button>
            )
          })}
        </nav>
      </div>
    </header>
  )
}