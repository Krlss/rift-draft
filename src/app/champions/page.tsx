import { getAllChampions, type ChampionData } from '@/lib/riot-api'
import { DDragon, normalizeChampionName } from '@/lib/lol-data'
import Link from 'next/link'
import styles from './champions.module.css'

export const revalidate = 3600 // Revalidate every hour

export default async function ChampionsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tag?: string }>
}) {
  const { search = '', tag = 'ALL' } = await searchParams
  const allChampions = await getAllChampions()
  const champions = Object.values(allChampions)

  const tags = ['ALL', 'Fighter', 'Tank', 'Mage', 'Assassin', 'Marksman', 'Support']

  const filtered = champions
    .filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase())
      const matchTag = tag === 'ALL' || c.tags.includes(tag)
      return matchSearch && matchTag
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className={styles.container}>
      <div className="page-header">
        <h1 className="page-title">Campeones</h1>
        <p className="page-subtitle">
          Explora estadísticas, OTPs, builds y counters de los {champions.length} campeones
        </p>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <form className={styles.searchForm}>
          <input
            type="text"
            name="search"
            className="input"
            placeholder="🔍 Buscar campeón..."
            defaultValue={search}
          />
          <div className={styles.tagFilters}>
            {tags.map((t) => (
              <Link
                key={t}
                href={`/champions?search=${search}&tag=${t}`}
                className={`${styles.tagBtn} ${tag === t ? styles.tagActive : ''}`}
              >
                {t === 'ALL' ? 'Todos' : t}
              </Link>
            ))}
          </div>
        </form>
      </div>

      {/* Grid */}
      <div className={styles.championGrid}>
        {filtered.map((champ) => (
          <ChampionCard key={champ.id} champion={champ} />
        ))}
      </div>
    </div>
  )
}

function ChampionCard({ champion }: { champion: ChampionData }) {
  const internalName = normalizeChampionName(champion.name)
  const tagColors: Record<string, string> = {
    Fighter: '#ff8c4a',
    Tank: '#4a9eff',
    Mage: '#c084fc',
    Assassin: '#f43f5e',
    Marksman: '#22c55e',
    Support: '#f59e0b',
  }

  return (
    <Link href={`/champion/${champion.id}`} className={styles.champCard}>
      <div className={styles.champSplash}>
        <img
          src={DDragon.championPortrait(internalName)}
          alt={champion.name}
          className={styles.champImg}
        />
        <div className={styles.champGlow} />
      </div>
      <div className={styles.champInfo}>
        <div className={styles.champName}>{champion.name}</div>
        <div className={styles.champTitle}>{champion.title}</div>
        <div className={styles.champTags}>
          {champion.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className={styles.champTag}
              style={{ color: tagColors[tag] || 'var(--text-muted)', borderColor: tagColors[tag] + '40' || 'rgba(255,255,255,0.1)' }}
            >
              {tag}
            </span>
          ))}
        </div>
        {/* Stats bars */}
        <div className={styles.statBars}>
          <StatBar label="ATK" value={champion.info.attack} color="#ff8c4a" />
          <StatBar label="DEF" value={champion.info.defense} color="#4a9eff" />
          <StatBar label="MAG" value={champion.info.magic} color="#c084fc" />
        </div>
      </div>
    </Link>
  )
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={styles.statBar}>
      <span className={styles.statBarLabel}>{label}</span>
      <div className={styles.statBarTrack}>
        <div
          className={styles.statBarFill}
          style={{ width: `${value * 10}%`, background: color }}
        />
      </div>
    </div>
  )
}
