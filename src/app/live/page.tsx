'use client'

import { useAgentStatus } from '@/components/providers/AgentStatusProvider'
import { formatGameTime, formatKDA, DDragon, normalizeChampionName, POSITION_LABELS } from '@/lib/lol-data'
import styles from './live.module.css'

const RIOT_API = 'https://la2.api.riotgames.com'
const API_KEY = 'RGAPI-1691ad2b-5582-425c-89be-b610b4d144a8'

const ROLE_COLORS: Record<string, string> = {
  TOP: '#a07a28',
  JUNGLE: '#22c55e',
  MIDDLE: '#4a9eff',
  BOTTOM: '#ff8c4a',
  UTILITY: '#c084fc',
}

function PlayerCard({ player }: { player: ReturnType<typeof useAgentStatus>['liveGameData'] extends null ? never : NonNullable<ReturnType<typeof useAgentStatus>['liveGameData']>['players'][number] }) {
  const kda = formatKDA(player.kills, player.deaths, player.assists)
  const internalName = normalizeChampionName(player.championName)
  const isBlue = player.team === 'ORDER'
  const kdaNum = parseFloat(kda)

  return (
    <div className={`${styles.playerCard} ${isBlue ? styles.playerBlue : styles.playerRed}`}>
      {/* Champion Art */}
      <div className={styles.champArt}>
        <img
          src={DDragon.championLoading(internalName)}
          alt={player.championName}
          className={styles.champArtImg}
        />
        <div className={styles.champArtOverlay} />
        <div className={styles.champLevel}>Lv. {player.level}</div>
      </div>

      {/* Player Info */}
      <div className={styles.playerInfo}>
        <div className={styles.playerName}>{player.summonerName}</div>
        <div className={styles.playerChamp}>{player.championName}</div>

        {player.position && (
          <div
            className={styles.playerPosition}
            style={{ color: ROLE_COLORS[player.position] || 'var(--text-muted)' }}
          >
            {POSITION_LABELS[player.position] || player.position}
          </div>
        )}

        {/* Stats */}
        <div className={styles.statsRow}>
          <div className={styles.statBlock}>
            <div
              className={styles.statValue}
              style={{ color: player.deaths === 0 ? 'var(--color-gold-300)' : kdaNum >= 3 ? 'var(--color-success)' : 'var(--text-primary)' }}
            >
              {kda}
            </div>
            <div className={styles.statLabel}>KDA</div>
          </div>
          <div className={styles.statSeparator} />
          <div className={styles.statBlock}>
            <div className={styles.statValue}>{player.kills}/{player.deaths}/{player.assists}</div>
            <div className={styles.statLabel}>K / D / A</div>
          </div>
          <div className={styles.statSeparator} />
          <div className={styles.statBlock}>
            <div className={styles.statValue}>{player.cs}</div>
            <div className={styles.statLabel}>CS</div>
          </div>
        </div>

        {/* Items */}
        {player.items && player.items.length > 0 && (
          <div className={styles.items}>
            {(player.items as { itemID: number }[]).slice(0, 6).map((item, i) => (
              item.itemID > 0 ? (
                <img
                  key={i}
                  src={DDragon.itemIcon(item.itemID)}
                  alt={`Item ${item.itemID}`}
                  className={styles.itemIcon}
                />
              ) : (
                <div key={i} className={styles.itemEmpty} />
              )
            ))}
          </div>
        )}
      </div>

      {/* Dead indicator */}
      {player.isDead && (
        <div className={styles.deadOverlay}>
          <span className={styles.deadIcon}>💀</span>
        </div>
      )}
    </div>
  )
}

export default function LivePage() {
  const { agentConnected, lolClientConnected, gamePhase, liveGameData, champSelectData } = useAgentStatus()

  const bluePlayers = liveGameData?.players.filter((p) => p.team === 'ORDER') ?? []
  const redPlayers = liveGameData?.players.filter((p) => p.team === 'CHAOS') ?? []

  const gameTime = liveGameData?.gameData?.gameTime
    ? formatGameTime(liveGameData.gameData.gameTime)
    : null

  // No game active
  if (!agentConnected || gamePhase === 'None') {
    return (
      <div className={styles.container}>
        <div className="page-header">
          <h1 className="page-title">Partida en Vivo</h1>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">⚔️</div>
          <div className="empty-state-title">Sin partida activa</div>
          <div className="empty-state-text">
            {!agentConnected
              ? 'El agente de LoL Stats no está conectado. Inicia el ejecutable para habilitar esta función.'
              : 'No estás en una partida en este momento. Entra a una partida o a Champ Select para ver los datos.'}
          </div>
        </div>
      </div>
    )
  }

  // Champ Select
  if (gamePhase === 'ChampSelect') {
    return (
      <div className={styles.container}>
        <div className="page-header">
          <h1 className="page-title">Champ Select</h1>
          <p className="page-subtitle">Selección de campeones en curso</p>
        </div>
        <div className="card card-gold">
          <div className="card-header">
            <h2 className="card-title">🎯 Draft Activo</h2>
            <span className="badge badge-teal">EN VIVO</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.8' }}>
            El cliente de LoL está en Champ Select. Los datos se actualizan automáticamente.
            <br />
            Usa el <strong style={{ color: 'var(--color-gold-200)' }}>Draft Simulator</strong> para planear tu selección con el equipo.
          </p>
        </div>
      </div>
    )
  }

  // In-game
  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.liveHeader}>
        <div>
          <h1 className="page-title">⚔️ Partida en Vivo</h1>
          <p className="page-subtitle">
            {liveGameData?.gameData?.gameMode} · {gameTime}
          </p>
        </div>
        <div className={styles.liveIndicator}>
          <span className="status-dot in-game" style={{ width: '10px', height: '10px' }} />
          <span className={styles.livePill}>EN VIVO</span>
          <span className={styles.gameTimer}>{gameTime}</span>
        </div>
      </div>

      {/* Teams */}
      <div className={styles.teamsLayout}>
        {/* Blue Team */}
        <div className={styles.team}>
          <div className={styles.teamTitle}>
            <span className="badge badge-blue" style={{ fontSize: '13px', padding: '4px 12px' }}>
              🔵 Equipo Azul
            </span>
          </div>
          <div className={styles.playerList}>
            {bluePlayers.map((player) => (
              <PlayerCard key={player.summonerName} player={player} />
            ))}
          </div>
        </div>

        {/* VS */}
        <div className={styles.vsColumn}>
          <div className={styles.vsText}>VS</div>
          {/* Score */}
          <div className={styles.scoreBlock}>
            <div className={styles.teamScore} style={{ color: 'var(--color-blue-team)' }}>
              {bluePlayers.reduce((a, p) => a + p.kills, 0)}
            </div>
            <div className={styles.scoreDash}>:</div>
            <div className={styles.teamScore} style={{ color: 'var(--color-red-team)' }}>
              {redPlayers.reduce((a, p) => a + p.kills, 0)}
            </div>
          </div>
        </div>

        {/* Red Team */}
        <div className={styles.team}>
          <div className={styles.teamTitle}>
            <span className="badge badge-red" style={{ fontSize: '13px', padding: '4px 12px' }}>
              🔴 Equipo Rojo
            </span>
          </div>
          <div className={styles.playerList}>
            {redPlayers.map((player) => (
              <PlayerCard key={player.summonerName} player={player} />
            ))}
          </div>
        </div>
      </div>

      {/* Recent Events */}
      {liveGameData?.events?.Events && liveGameData.events.Events.length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <h2 className="card-title">📜 Eventos Recientes</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            {(liveGameData.events.Events as { EventName: string; EventTime: number; KillerName?: string; VictimName?: string }[])
              .slice(-10)
              .reverse()
              .map((event, i) => (
                <div key={i} style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: '40px' }}>
                    {formatGameTime(event.EventTime)}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{event.EventName}</span>
                  {event.KillerName && <span>🗡️ {event.KillerName}</span>}
                  {event.VictimName && <span>💀 {event.VictimName}</span>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
