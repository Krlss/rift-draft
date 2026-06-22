'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAgentStatus } from '@/components/providers/AgentStatusProvider'

const navItems = [
  {
    section: 'En Vivo',
    items: [
      { href: '/', icon: '🏠', label: 'Dashboard' },
      { href: '/live', icon: '⚔️', label: 'Partida en Vivo' },
    ],
  },
  {
    section: 'Preparación',
    items: [
      { href: '/draft', icon: '🎯', label: 'Draft Simulator' },
      { href: '/champions', icon: '🛡️', label: 'Campeones' },
      { href: '/builds', icon: '⚗️', label: 'Builds' },
    ],
  },
  {
    section: 'Análisis',
    items: [
      { href: '/otps', icon: '📊', label: 'OTP Stats' },
      { href: '/meta', icon: '📈', label: 'Meta Actual' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { agentConnected, gamePhase } = useAgentStatus()

  const statusLabel = agentConnected
    ? gamePhase === 'InProgress'
      ? 'Partida en curso'
      : gamePhase === 'ChampSelect'
      ? 'Champ Select'
      : 'Cliente conectado'
    : 'Agente desconectado'

  const dotClass = agentConnected
    ? gamePhase === 'InProgress'
      ? 'status-dot in-game'
      : 'status-dot connected'
    : 'status-dot'

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">⚡</div>
        <div className="sidebar-logo-text">
          LoL Stats
          <span>Assistant</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((section) => (
          <div key={section.section}>
            <div className="nav-section-label">{section.section}</div>
            {section.items.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : (pathname ?? '').startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${isActive ? ' active' : ''}`}
                >
                  <span className="nav-item-icon">{item.icon}</span>
                  {item.label}
                  {item.href === '/live' && gamePhase === 'InProgress' && (
                    <span className="nav-item-badge">LIVE</span>
                  )}
                  {item.href === '/draft' && (
                    <span className="nav-item-badge" style={{ background: 'var(--color-teal-300)' }}>
                      NEW
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Agent Status */}
      <div className="sidebar-status">
        <div className="status-indicator">
          <div className={dotClass} />
          <span style={{ fontSize: '11px' }}>{statusLabel}</span>
        </div>
      </div>
    </aside>
  )
}
