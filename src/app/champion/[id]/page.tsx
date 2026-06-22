import { getAllChampions, getTopMastery, getRankedStats, getMatchIds, getMatch } from '@/lib/riot-api'
import { DDragon, normalizeChampionName, POSITION_LABELS } from '@/lib/lol-data'
import styles from './champion.module.css'
import Link from 'next/link'

export const revalidate = 3600

interface Props {
  params: Promise<{ id: string }>
}

export default async function ChampionPage({ params }: Props) {
  const { id } = await params
  const allChampions = await getAllChampions()
  const champion = Object.values(allChampions).find((c) => c.id === id || c.key === id)

  if (!champion) {
    return (
      <div className={styles.container}>
        <div className="empty-state">
          <div className="empty-state-icon">❓</div>
          <div className="empty-state-title">Campeón no encontrado</div>
          <Link href="/champions" className="btn btn-secondary">← Volver</Link>
        </div>
      </div>
    )
  }

  const internalName = normalizeChampionName(champion.name)
  const splashUrl = DDragon.championSplash(internalName)
  const portraitUrl = DDragon.championPortrait(internalName)

  const tagColors: Record<string, string> = {
    Fighter: '#ff8c4a',
    Tank: '#4a9eff',
    Mage: '#c084fc',
    Assassin: '#f43f5e',
    Marksman: '#22c55e',
    Support: '#f59e0b',
  }

  const stats = champion.stats

  return (
    <div className={styles.container}>
      {/* Hero Section */}
      <div className={styles.hero}>
        <img src={splashUrl} alt={champion.name} className={styles.heroSplash} />
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <div className={styles.heroLeft}>
            <img src={portraitUrl} alt={champion.name} className={styles.heroPortrait} />
            <div>
              <h1 className={styles.heroName}>{champion.name}</h1>
              <p className={styles.heroTitle}>{champion.title}</p>
              <div className={styles.heroTags}>
                {champion.tags.map((tag) => (
                  <span
                    key={tag}
                    className="badge"
                    style={{
                      color: tagColors[tag] || '#888',
                      background: (tagColors[tag] || '#888') + '20',
                      border: `1px solid ${(tagColors[tag] || '#888')}40`,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.mainGrid}>
        {/* Left Column */}
        <div className={styles.leftCol}>
          {/* Description */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📖 Descripción</h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              {champion.blurb}
            </p>
          </div>

          {/* Base Stats */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📊 Stats Base (Nivel 1)</h2>
              <span className="badge badge-gold">v{internalName}</span>
            </div>
            <div className={styles.statsGrid}>
              <StatItem icon="❤️" label="HP" value={`${stats.hp} (+${stats.hpperlevel}/lvl)`} />
              <StatItem icon="💧" label="Maná" value={`${stats.mp} (+${stats.mpperlevel}/lvl)`} />
              <StatItem icon="⚔️" label="Ataque" value={`${stats.attackdamage} (+${stats.attackdamageperlevel}/lvl)`} />
              <StatItem icon="🛡️" label="Armadura" value={`${stats.armor} (+${stats.armorperlevel}/lvl)`} />
              <StatItem icon="✨" label="Res. Mágica" value={`${stats.spellblock} (+${stats.spellblockperlevel}/lvl)`} />
              <StatItem icon="💨" label="Velocidad" value={`${stats.movespeed}`} />
              <StatItem icon="🎯" label="Rango" value={`${stats.attackrange}`} />
              <StatItem icon="⚡" label="Vel. Ataque" value={`${stats.attackspeed}`} />
            </div>
          </div>

          {/* Difficulty Radar */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📈 Perfil del Campeón</h2>
            </div>
            <div className={styles.profileBars}>
              <ProfileBar label="Ataque" value={champion.info.attack} color="#ff8c4a" />
              <ProfileBar label="Defensa" value={champion.info.defense} color="#4a9eff" />
              <ProfileBar label="Magia" value={champion.info.magic} color="#c084fc" />
              <ProfileBar label="Dificultad" value={champion.info.difficulty} color="#f59e0b" />
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className={styles.rightCol}>
          {/* OTP Section */}
          <div className="card card-gold">
            <div className="card-header">
              <h2 className="card-title">⭐ OTP Stats</h2>
              <span className="badge badge-teal">One-Trick Ponies</span>
            </div>
            <div className={styles.otpInfo}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.8', marginBottom: '16px' }}>
                Para ver OTPs en tiempo real de <strong style={{ color: 'var(--color-gold-200)' }}>{champion.name}</strong>,
                el agente debe estar conectado y busca jugadores con &gt;60% de partidas en este campeón.
              </p>
              <div className={styles.otpPlaceholder}>
                <div className={styles.otpPlaceholderItem}>
                  <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: '12px', width: '70%', marginBottom: '6px' }} />
                    <div className="skeleton" style={{ height: '10px', width: '50%' }} />
                  </div>
                </div>
                <div className={styles.otpPlaceholderItem}>
                  <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: '12px', width: '60%', marginBottom: '6px' }} />
                    <div className="skeleton" style={{ height: '10px', width: '45%' }} />
                  </div>
                </div>
                <div className={styles.otpPlaceholderItem}>
                  <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: '12px', width: '75%', marginBottom: '6px' }} />
                    <div className="skeleton" style={{ height: '10px', width: '55%' }} />
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
                🔗 Conecta el agente y entra en partida para ver OTPs del server
              </p>
            </div>
          </div>

          {/* Tips */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">💡 Guía Rápida</h2>
            </div>
            <div className={styles.tipsGrid}>
              <div className={styles.tip}>
                <div className={styles.tipIcon}>🗡️</div>
                <div>
                  <div className={styles.tipTitle}>Rol Principal</div>
                  <div className={styles.tipText}>{champion.tags.join(' · ')}</div>
                </div>
              </div>
              <div className={styles.tip}>
                <div className={styles.tipIcon}>⚗️</div>
                <div>
                  <div className={styles.tipTitle}>Recurso</div>
                  <div className={styles.tipText}>{champion.partype}</div>
                </div>
              </div>
              <div className={styles.tip}>
                <div className={styles.tipIcon}>📊</div>
                <div>
                  <div className={styles.tipTitle}>Dificultad</div>
                  <div className={styles.tipText}>{'⭐'.repeat(Math.ceil(champion.info.difficulty / 3))}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Builds Link */}
          <Link href={`/builds?champion=${champion.id}`} className={`card ${styles.buildsLink}`}>
            <div className="card-header" style={{ marginBottom: 0 }}>
              <h2 className="card-title">⚗️ Ver Builds Recomendadas</h2>
              <span style={{ color: 'var(--color-gold-300)', fontSize: '18px' }}>→</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className={styles.statItem}>
      <span className={styles.statIcon}>{icon}</span>
      <div>
        <div className={styles.statLabel}>{label}</div>
        <div className={styles.statValue}>{value}</div>
      </div>
    </div>
  )
}

function ProfileBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={styles.profileBar}>
      <span className={styles.profileBarLabel}>{label}</span>
      <div className={styles.profileBarTrack}>
        <div
          className={styles.profileBarFill}
          style={{ width: `${value * 10}%`, background: `linear-gradient(to right, ${color}88, ${color})` }}
        />
      </div>
      <span className={styles.profileBarValue}>{value}/10</span>
    </div>
  )
}
