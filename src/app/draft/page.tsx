'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Manager } from 'socket.io-client'
import { getAllChampions, ChampionData } from '@/lib/riot-api'
import { DDragon, POSITION_ICONS, POSITION_ICON_URLS } from '@/lib/lol-data'
import type {
  DraftState, DraftRole, Team, DraftMode,
  ChatMessage, Participant, KickVoteInfo, JoinRequest, ReadyCheckState,
} from '@/lib/draft-types'
import { STANDARD_DRAFT_ORDER } from '@/lib/draft-types'
import { DraftSounds } from '@/lib/draft-sounds'
import styles from './draft.module.css'

// ─── Socket singleton ────────────────────────────────────────────────────
let _manager: InstanceType<typeof Manager> | null = null
type Socket = ReturnType<InstanceType<typeof Manager>['socket']>
let _socket: Socket | null = null

function getSocket(): Socket {
  if (!_socket) {
    fetch('/api/socket')
    _manager = new Manager({ path: '/api/socket', transports: ['websocket'] })
    _socket = _manager.socket('/')
  }
  return _socket
}

// ─── Constants ────────────────────────────────────────────────────────────
const POSITION_NAMES = ['Top', 'Jungla', 'Mid', 'Bot', 'Support']
const SOLO_MODE = process.env.NEXT_PUBLIC_SOLO_MODE === 'true'
const GITHUB_URL = 'https://github.com/Krlss/rift-draft'

// ─── Invite link encryption (XOR + base64url) ────────────────────────────
// Simple obfuscation so the room code is not visible in the shared URL.
// Not meant to be cryptographically secure — just hides the code from stream viewers.
const _EK = 'lol-draft-inv-2024'
function encryptRoomId(id: string): string {
  const xored = id.split('').map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ _EK.charCodeAt(i % _EK.length))
  ).join('')
  return btoa(xored).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function decryptToken(token: string): string {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=')
    const decoded = atob(padded)
    return decoded.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ _EK.charCodeAt(i % _EK.length))
    ).join('')
  } catch { return '' }
}
function makeInviteLink(roomId: string): string {
  return `${window.location.origin}/draft?t=${encryptRoomId(roomId)}`
}

// Small helper component — renders official LoL lane icon
function RoleIcon({ pos, size = 16, className }: { pos: number; size?: number; className?: string }) {
  const url = POSITION_ICON_URLS[pos]
  const name = POSITION_NAMES[pos]
  if (!url) return <span>{name}</span>
  return (
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle', filter: 'brightness(0) invert(1)', opacity: 0.85 }}
    />
  )
}

const ROLE_LABEL: Record<string, string> = {
  player_blue_1: 'Azul · Top',    player_blue_2: 'Azul · Jungla',
  player_blue_3: 'Azul · Mid',    player_blue_4: 'Azul · Bot',
  player_blue_5: 'Azul · Support',
  player_red_1:  'Rojo · Top',    player_red_2:  'Rojo · Jungla',
  player_red_3:  'Rojo · Mid',    player_red_4:  'Rojo · Bot',
  player_red_5:  'Rojo · Support',
  coach_blue: 'Coach Azul', coach_red: 'Coach Rojo',
  spectator: 'Espectador',  admin: 'Administrador',
}

const ROLE_COLOR: Record<string, string> = {
  player_blue_1: 'var(--color-blue-team)', player_blue_2: 'var(--color-blue-team)',
  player_blue_3: 'var(--color-blue-team)', player_blue_4: 'var(--color-blue-team)',
  player_blue_5: 'var(--color-blue-team)',
  player_red_1:  'var(--color-red-team)',  player_red_2:  'var(--color-red-team)',
  player_red_3:  'var(--color-red-team)',  player_red_4:  'var(--color-red-team)',
  player_red_5:  'var(--color-red-team)',
  coach_blue: 'var(--color-teal-200)', coach_red: '#ff8c4a',
  spectator:  'var(--text-muted)',     admin: 'var(--color-gold-200)',
}

// ─────────────────────────────────────────────────────────────────────────
// LOBBY SCREEN
// ─────────────────────────────────────────────────────────────────────────
interface LobbyProps {
  onJoin: (p: { roomId: string; name: string; role: DraftRole; mode: DraftMode; timerMax: number; totalGames: number }) => void
  previewParticipants?: Participant[]
  joinError?: string | null
  initialRoomId?: string   // pre-filled from encrypted invite link
}

function LobbyScreen({ onJoin, previewParticipants = [], joinError, initialRoomId }: LobbyProps) {
  const [tab, setTab]             = useState<'create' | 'join'>(initialRoomId ? 'join' : 'join')
  const [newRoomId, setNewRoomId] = useState('XXXXXX')
  const [joinRoomId, setJoinRoomId] = useState(initialRoomId ?? '')
  const [name, setName]           = useState('')
  const [selectedRole, setSelectedRole] = useState<DraftRole | null>(null)
  const [draftMode, setDraftMode] = useState<DraftMode>('standard')
  const [timer, setTimer]         = useState(30)
  const [games, setGames]         = useState(3)
  const [showLobbyCode, setShowLobbyCode] = useState(false) // hidden by default for streamers
  const [copied, setCopied] = useState(false)

  const copyRoomLink = (id: string) => {
    navigator.clipboard.writeText(makeInviteLink(id))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  useEffect(() => { setNewRoomId(Math.random().toString(36).slice(2, 8).toUpperCase()) }, [])

  const roomId = tab === 'create' ? newRoomId : joinRoomId.toUpperCase().trim()
  const getOccupied = (role: DraftRole) => previewParticipants.find(p => p.role === role && p.connected) ?? null

  const handleSubmit = () => {
    if (!name.trim() || !roomId) return
    onJoin({ roomId, name: name.trim(), role: selectedRole ?? 'admin', mode: draftMode, timerMax: timer, totalGames: games })
  }

  const renderTeamSlots = (team: Team) =>
    [1, 2, 3, 4, 5].map(num => {
      const role = `player_${team}_${num}` as DraftRole
      const occupied = getOccupied(role)
      const isSelected = selectedRole === role
      return (
        <button key={role}
          className={`${styles.slotBtn} ${isSelected ? styles.slotSelected : ''} ${occupied ? styles.slotOccupied : ''}`}
          onClick={() => !occupied && setSelectedRole(isSelected ? null : role)}
          disabled={!!occupied}
        >
          <span className={styles.slotIcon}>
            <RoleIcon pos={num - 1} size={22} />
          </span>
          <div className={styles.slotInfo}>
            <div className={styles.slotPos}>{POSITION_NAMES[num - 1]}</div>
            {occupied ? <div className={styles.slotPlayer}>✅ {occupied.name}</div>
                      : <div className={styles.slotEmpty}>Disponible</div>}
          </div>
          {isSelected && <span className={styles.slotCheck}>●</span>}
        </button>
      )
    })

  return (
    <div className={styles.lobby}>
      <div className={styles.lobbyCard}>
        <div className={styles.lobbyHeader}>
          <div className={styles.lobbyLogo}>🎯</div>
          <h1 className={styles.lobbyTitle}>Rift Draft</h1>
          <p className={styles.lobbySubtitle}>Simulador de draft competitivo multijugador para League of Legends</p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.githubLink}
            title="Ver código fuente en GitHub"
          >
            <svg height="18" width="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
                0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
                -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
                .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
                -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
                1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56
                .82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07
                -.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            GitHub
          </a>
        </div>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'create' ? styles.tabActive : ''}`} onClick={() => setTab('create')}>✨ Crear Sala</button>
          <button className={`${styles.tab} ${tab === 'join'   ? styles.tabActive : ''}`} onClick={() => setTab('join')}>🚪 Unirse</button>
        </div>

        {tab === 'create' && (
          <div className={styles.createConfig}>
            <div className={styles.roomIdDisplay}>
              <span className={styles.roomIdLabel}>Código de sala</span>
              <div className={styles.roomIdValueWrap}>
                <span className={styles.roomIdValue}>
                  {showLobbyCode ? newRoomId : '••••••'}
                </span>
                <button
                  className={styles.eyeBtn}
                  onClick={() => setShowLobbyCode(v => !v)}
                  title={showLobbyCode ? 'Ocultar código' : 'Mostrar código'}
                >
                  {showLobbyCode ? '🙈' : '👁️'}
                </button>
              </div>
              <button className={`btn btn-secondary btn-sm ${copied ? styles.copiedBtn : ''}`}
                onClick={() => copyRoomLink(newRoomId)}
                title="Copiar link de la sala (sin revelar el código)">
                {copied ? '✅ Copiado' : '📋 Copiar Link'}
              </button>
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Modo</label>
                <div className={styles.modeSelector}>
                  {(['standard', 'fearless'] as DraftMode[]).map(m => (
                    <button key={m} className={`${styles.modeBtn} ${draftMode === m ? styles.modeBtnActive : ''}`}
                      onClick={() => setDraftMode(m)}>
                      {m === 'standard' ? '🏆 Estándar' : '💀 Fearless'}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Timer (seg)</label>
                <input type="number" className="input" value={timer} onChange={e => setTimer(+e.target.value)} min={10} max={90} />
              </div>
              {draftMode === 'fearless' && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Bo</label>
                  <input type="number" className="input" value={games} onChange={e => setGames(+e.target.value)} min={1} max={7} />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'join' && (
          <div className={styles.fieldGroup} style={{ marginBottom: 16 }}>
            <div className={styles.joinCodeLabel}>
              <label className={styles.fieldLabel}>Código de sala</label>
            </div>
            <div className={styles.joinCodeRow}>
              <input
                type={showLobbyCode ? 'text' : 'password'}
                className="input"
                placeholder="ABC123"
                value={joinRoomId}
                onChange={e => setJoinRoomId(e.target.value.toUpperCase())}
                maxLength={8}
                style={{ letterSpacing: showLobbyCode ? '2px' : '6px', flex: 1 }}
              />
              <button
                className={styles.eyeBtnIcon}
                onClick={() => setShowLobbyCode(v => !v)}
                title={showLobbyCode ? 'Ocultar código' : 'Mostrar código'}
              >
                {showLobbyCode ? '🙈' : '👁️'}
              </button>
              <button
                className={`${styles.eyeBtnIcon} ${copied ? styles.copiedBtn : ''}`}
                onClick={() => joinRoomId && copyRoomLink(joinRoomId)}
                title="Copiar link de la sala"
                disabled={!joinRoomId.trim()}
              >
                {copied ? '✅' : '📋'}
              </button>
            </div>
          </div>
        )}

        {/* Team Slots */}
        <div className={styles.teamsSlots}>
          <div className={styles.teamSlotCol}>
            <div className={`badge badge-blue ${styles.teamSlotTitle}`}>🔵 Equipo Azul</div>
            {renderTeamSlots('blue')}
          </div>
          <div className={styles.teamSlotDivider} />
          <div className={styles.teamSlotCol}>
            <div className={`badge badge-red ${styles.teamSlotTitle}`}>🔴 Equipo Rojo</div>
            {renderTeamSlots('red')}
          </div>
        </div>

        {/* Other roles */}
        <div className={styles.otherRoles}>
          {(['coach_blue', 'coach_red', 'spectator'] as DraftRole[]).map(role => {
            const occ = getOccupied(role)
            return (
              <button key={role} className={`${styles.otherRoleBtn} ${selectedRole === role ? styles.slotSelected : ''}`}
                onClick={() => setSelectedRole(selectedRole === role ? null : role)}>
                <span>{role === 'coach_blue' ? '📋🔵' : role === 'coach_red' ? '📋🔴' : '👁️'}</span>
                <span>{ROLE_LABEL[role]}</span>
                {occ && <span style={{ color: 'var(--color-success)', fontSize: 10 }}>({occ.name})</span>}
              </button>
            )
          })}
          <button className={`${styles.adminRoleBtn} ${selectedRole === 'admin' ? styles.slotSelected : ''}`}
            onClick={() => setSelectedRole(selectedRole === 'admin' ? null : 'admin')}
            title="Puede iniciar el draft y expulsar jugadores">
            <span>👑</span><span>Administrador</span>
          </button>
        </div>

        {/* Name */}
        <div className={styles.fieldGroup} style={{ marginTop: 20 }}>
          <label className={styles.fieldLabel}>Tu nombre (Summoner Name)</label>
          <input type="text" className="input" placeholder="Ingresa tu nombre..."
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} maxLength={32} />
        </div>

        {joinError && <div className={styles.errorMsg}>⚠️ {joinError}</div>}

        {!selectedRole && (
          <div className={styles.adminHint}>
            👑 Sin rol seleccionado → entrarás como <strong>Administrador</strong>
          </div>
        )}
        {selectedRole && (
          <div className={styles.selectedRolePreview}>
            Rol: <strong style={{ color: ROLE_COLOR[selectedRole] }}>{ROLE_LABEL[selectedRole]}</strong>
            <button className={styles.clearRoleBtn} onClick={() => setSelectedRole(null)}>✕</button>
          </div>
        )}

        <button className={`btn btn-primary btn-lg ${styles.joinBtn}`}
          onClick={handleSubmit}
          disabled={!name.trim() || (tab === 'join' && !joinRoomId.trim())}>
          {tab === 'create' ? '🚀 Crear Sala' : '🚪 Unirse al Draft'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// WAITING FOR APPROVAL SCREEN
// ─────────────────────────────────────────────────────────────────────────
function WaitingApprovalScreen({ onCancel }: { onCancel: () => void }) {
  return (
    <div className={styles.lobby}>
      <div className={styles.lobbyCard} style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-gold-200)', marginBottom: 8 }}>
          Esperando Aprobación
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
          Tu solicitud está en cola. Un administrador o compañero de equipo debe aprobarte para ingresar a la sala.
        </p>
        <div className={styles.waitingSpinner} />
        <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// READY CHECK OVERLAY
// ─────────────────────────────────────────────────────────────────────────
function ReadyCheckOverlay({
  readyCheck, myRole, participants, onReady, onCancel, hasAuthority, alreadyReady,
}: {
  readyCheck: ReadyCheckState
  myRole: DraftRole
  participants: Participant[]
  onReady: () => void
  onCancel: () => void
  hasAuthority: boolean
  alreadyReady: boolean
}) {
  const [timeLeft, setTimeLeft] = useState(
    Math.max(0, Math.ceil((readyCheck.timeoutAt - Date.now()) / 1000))
  )
  useEffect(() => {
    const iv = setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil((readyCheck.timeoutAt - Date.now()) / 1000)))
    }, 500)
    return () => clearInterval(iv)
  }, [readyCheck.timeoutAt])

  const isPlayer = myRole.startsWith('player_')
  const playerSlots: DraftRole[] = [
    ...[1,2,3,4,5].map(n => `player_blue_${n}` as DraftRole),
    ...[1,2,3,4,5].map(n => `player_red_${n}` as DraftRole),
  ]

  return (
    <div className={styles.readyOverlay}>
      <div className={styles.readyCard}>
        <div className={styles.readyTitle}>⚔️ ¡READY CHECK!</div>
        <div className={styles.readySubtitle}>El draft está a punto de comenzar</div>

        <div className={`${styles.readyTimerBig} ${timeLeft <= 10 ? styles.readyTimerLow : ''}`}>
          {timeLeft}s
        </div>

        <div className={styles.readyGrid}>
          {playerSlots.map(role => {
            const participant = participants.find(p => p.role === role)
            const isReady = readyCheck.readyRoles.includes(role)
            const isConnected = participant?.connected
            const team = role.includes('_blue') ? 'blue' : 'red'
            const posNum = parseInt(role.slice(-1)) - 1

            return (
              <div key={role}
                className={`${styles.readyPlayerSlot}
                  ${team === 'blue' ? styles.readySlotBlue : styles.readySlotRed}
                  ${isReady ? styles.readySlotDone : ''}
                  ${!isConnected && participant ? styles.readySlotOffline : ''}`}>
                <span className={styles.readySlotPos}>{POSITION_NAMES[posNum]}</span>
                <span className={styles.readySlotName}>{participant?.name ?? '—'}</span>
                <span className={styles.readySlotIcon}>
                  {isReady ? '✅' : !isConnected && participant ? '🔌' : participant ? '⏳' : '🪑'}
                </span>
              </div>
            )
          })}
        </div>

        <div className={styles.readyProgress}>
          <div className={styles.readyProgressBar}>
            <div className={styles.readyProgressFill}
              style={{ width: `${(readyCheck.readyRoles.length / 10) * 100}%` }} />
          </div>
          <span>{readyCheck.readyRoles.length} / 10 listos</span>
        </div>

        {isPlayer && !alreadyReady && (
          <button className={styles.readyBtn} onClick={onReady}>
            ✅ ¡LISTO!
          </button>
        )}
        {isPlayer && alreadyReady && (
          <div className={styles.readyConfirmed}>✅ Confirmado — esperando al resto...</div>
        )}
        {!isPlayer && (
          <div className={styles.readyConfirmed} style={{ color: 'var(--text-muted)' }}>
            Esperando que los jugadores confirmen...
          </div>
        )}

        {(hasAuthority) && (
          <button className={`btn btn-danger btn-sm ${styles.readyCancelBtn}`} onClick={onCancel}>
            ✕ Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// PENDING JOINS LIST
// ─────────────────────────────────────────────────────────────────────────
function PendingJoinsList({
  pending, myRole, mySocketId, creatorSocketId, onApprove, onDeny,
}: {
  pending: JoinRequest[]
  myRole: DraftRole
  mySocketId: string
  creatorSocketId: string | null
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}) {
  if (pending.length === 0) return null

  const canApproveRequest = (req: JoinRequest): boolean => {
    if (mySocketId === creatorSocketId || myRole === 'admin') return true
    const myTeam = myRole.startsWith('player_blue') || myRole === 'coach_blue' ? 'blue'
      : myRole.startsWith('player_red') || myRole === 'coach_red' ? 'red' : null
    const reqTeam = req.role.startsWith('player_blue') || req.role === 'coach_blue' ? 'blue'
      : req.role.startsWith('player_red') || req.role === 'coach_red' ? 'red' : null
    return myTeam !== null && myTeam === reqTeam
  }

  const approvable = pending.filter(canApproveRequest)
  if (approvable.length === 0) return null

  return (
    <div className={styles.pendingSection}>
      <div className={styles.pendingSectionTitle}>🔔 Solicitudes de acceso ({approvable.length})</div>
      {approvable.map(req => (
        <div key={req.id} className={styles.pendingItem}>
          <div className={styles.pendingInfo}>
            <span className={styles.pendingName}>{req.name}</span>
            <span className={styles.pendingRole} style={{ color: ROLE_COLOR[req.role] ?? 'var(--text-muted)' }}>
              {ROLE_LABEL[req.role] ?? req.role}
            </span>
          </div>
          <div className={styles.pendingActions}>
            <button className={styles.approveBtn} onClick={() => onApprove(req.id)}>✅</button>
            <button className={styles.denyBtn} onClick={() => onDeny(req.id)}>✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// PARTICIPANTS PANEL
// ─────────────────────────────────────────────────────────────────────────
function ParticipantsPanel({
  participants, pendingJoins, creatorSocketId, mySocketId, myRole,
  canStartDraft, draftStarted, draftFinished, readyCheck,
  onStart, onReset, onKick, onApprove, onDeny, kickVotes,
  soloMode,
}: {
  participants: Participant[]
  pendingJoins: JoinRequest[]
  creatorSocketId: string | null
  mySocketId: string
  myRole: DraftRole
  canStartDraft: boolean
  draftStarted: boolean
  draftFinished: boolean
  readyCheck: ReadyCheckState | null
  onStart: () => void
  onReset: () => void
  onKick: (id: string) => void
  onApprove: (id: string) => void
  onDeny: (id: string) => void
  kickVotes: Record<string, number>
  soloMode?: boolean
}) {
  const safe = participants ?? []
  const isAdmin = myRole === 'admin'
  const isCreator = mySocketId === creatorSocketId
  const hasAuthority = isAdmin || isCreator
  const myTeam = myRole.startsWith('player_blue') ? 'blue' : myRole.startsWith('player_red') ? 'red' : null

  const canKick = (t: Participant): boolean => {
    if (t.socketId === mySocketId) return false
    if (hasAuthority) return true
    const tTeam = t.role.startsWith('player_blue') ? 'blue' : t.role.startsWith('player_red') ? 'red' : null
    return myTeam !== null && tTeam === myTeam && t.role.startsWith('player_')
  }

  const connected = safe.filter(p => p.connected).length

  const TeamBlock = ({ team }: { team: Team }) => (
    <div className={styles.participantTeamBlock}>
      <div className={styles.participantTeamLabel} style={{ color: team === 'blue' ? 'var(--color-blue-team)' : 'var(--color-red-team)' }}>
        {team === 'blue' ? '🔵 Equipo Azul' : '🔴 Equipo Rojo'}
      </div>
      {[1,2,3,4,5].map(n => {
        const role = `player_${team}_${n}` as DraftRole
        const p = safe.find(pl => pl.role === role)
        const isReady = readyCheck?.readyRoles.includes(role)
        return (
          <ParticipantRow key={role} participant={p} role={role}
            mySocketId={mySocketId} creatorSocketId={creatorSocketId}
            canKick={p ? canKick(p) : false} voteCount={p ? kickVotes[p.socketId] : 0}
            isReady={isReady} readyCheckActive={!!readyCheck?.active}
            onKick={p ? () => onKick(p.socketId) : undefined} />
        )
      })}
    </div>
  )

  const others = safe.filter(p => !p.role.startsWith('player_'))

  return (
    <div className={styles.participantsPanel}>
      <div className={styles.participantsHeader}>
        <span>👥 Sala · {connected} conectados</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!draftStarted && !readyCheck?.active && (hasAuthority || myRole.startsWith('player_')) && (
            <button
              className={`btn btn-primary btn-sm ${(!canStartDraft && !soloMode) ? styles.btnDisabled : ''}`}
              onClick={onStart}
              disabled={!canStartDraft && !soloMode}
              title={(!canStartDraft && !soloMode) ? 'Necesitas 5 azules y 5 rojos' : 'Iniciar draft'}>
              ▶ Iniciar
            </button>
          )}
          {draftFinished && hasAuthority && (
            <button className="btn btn-secondary btn-sm" onClick={onReset}>🔄 Nuevo</button>
          )}
        </div>
      </div>

      {readyCheck?.active && (
        <div className={styles.readyCheckBanner}>
          ⚡ Ready Check activo — {readyCheck.readyRoles.length}/10 listos
        </div>
      )}

      {!canStartDraft && !draftStarted && (
        <div className={styles.waitingHint}>
          ⏳ ({safe.filter(p => p.connected && p.role.startsWith('player_')).length}/10 jugadores)
        </div>
      )}

      <div className={styles.participantsPanelBody}>
        <PendingJoinsList pending={pendingJoins} myRole={myRole}
          mySocketId={mySocketId} creatorSocketId={creatorSocketId}
          onApprove={onApprove} onDeny={onDeny} />

        <TeamBlock team="blue" />
        <TeamBlock team="red" />

        {others.length > 0 && (
          <div className={styles.participantTeamBlock}>
            <div className={styles.participantTeamLabel} style={{ color: 'var(--text-muted)' }}>Otros</div>
            {others.map(p => (
              <ParticipantRow key={p.socketId} participant={p} role={p.role}
                mySocketId={mySocketId} creatorSocketId={creatorSocketId}
                canKick={canKick(p)} voteCount={kickVotes[p.socketId]}
                onKick={() => onKick(p.socketId)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ParticipantRow({
  participant, role, mySocketId, creatorSocketId, canKick, voteCount, onKick,
  isReady, readyCheckActive,
}: {
  participant: Participant | undefined
  role: DraftRole
  mySocketId: string
  creatorSocketId: string | null
  canKick: boolean
  voteCount?: number
  onKick?: () => void
  isReady?: boolean
  readyCheckActive?: boolean
}) {
  const posNum = role.match(/_(\d)$/)?.[1]
  const posName = posNum ? POSITION_NAMES[parseInt(posNum) - 1] : ''
  return (
    <div className={`${styles.participantRow} ${!participant?.connected ? styles.participantOffline : ''}`}>
      <div className={styles.participantLeft}>
        <span className={styles.participantPos}>{posName || ROLE_LABEL[role]?.split('·')[1]?.trim() || ''}</span>
        {participant ? (
          <>
            <span className={styles.participantName} style={{ color: ROLE_COLOR[role] ?? 'var(--text-primary)' }}>
              {participant.name}
            </span>
            {participant.socketId === creatorSocketId && <span className={styles.creatorBadge}>👑</span>}
            {participant.socketId === mySocketId       && <span className={styles.meBadge}>Tú</span>}
            {!participant.connected                    && <span className={styles.offlineBadge}>offline</span>}
            {readyCheckActive && isReady               && <span className={styles.readyBadge}>✅</span>}
            {readyCheckActive && !isReady && participant.connected && <span className={styles.notReadyBadge}>⏳</span>}
          </>
        ) : (
          <span className={styles.emptySlot}>— vacío —</span>
        )}
      </div>
      {canKick && onKick && (
        <button className={styles.kickBtn} onClick={onKick}>
          👢{voteCount ? ` (${voteCount})` : ''}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// CHAMPION GRID
// ─────────────────────────────────────────────────────────────────────────
function ChampionGrid({
  champions, usedChampionIds, fearlessLockedIds,
  onSelect, canInteract, selectedKey, onDeselect,
}: {
  champions: ChampionData[]
  usedChampionIds: Set<number>
  fearlessLockedIds: Set<number>
  onSelect: (id: number, key: string, name: string) => void
  canInteract: boolean
  selectedKey: string | null
  onDeselect: () => void
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const tags = ['ALL', 'Fighter', 'Tank', 'Mage', 'Assassin', 'Marksman', 'Support']

  const filtered = useMemo(() =>
    champions
      .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) && (filter === 'ALL' || c.tags.includes(filter)))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [champions, search, filter]
  )

  return (
    <div className={styles.champGrid}>
      <div className={styles.champGridControls}>
        <input type="text" className="input" placeholder="🔍 Buscar campeón..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className={styles.tagFilters}>
          {tags.map(tag => (
            <button key={tag} className={`${styles.tagBtn} ${filter === tag ? styles.tagBtnActive : ''}`}
              onClick={() => setFilter(tag)}>
              {tag === 'ALL' ? 'Todos' : tag}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.champList}>
        {filtered.map(champ => {
          const id = parseInt(champ.key)
          const isUsed = usedChampionIds.has(id)
          const isFearless = fearlessLockedIds.has(id)
          const isDisabled = isUsed || isFearless || !canInteract
          const isSelected = selectedKey === champ.id
          return (
            <button key={champ.id}
              className={`${styles.champItem} ${isUsed ? styles.champUsed : ''} ${isFearless ? styles.champFearless : ''} ${isSelected ? styles.champSelected : ''}`}
              onClick={() => {
                if (isDisabled) return
                if (isSelected) { onDeselect() } else { onSelect(id, champ.id, champ.name) }
              }}
              disabled={isDisabled}>
              <img src={DDragon.championPortrait(champ.id)} alt={champ.name} className={styles.champItemImg} loading="lazy" />
              <span className={styles.champItemName}>{champ.name}</span>
              {isFearless && <span className={styles.fearlessMark}>💀</span>}
              {isUsed && <span className={styles.usedMark}>✓</span>}
              {isSelected && <span className={styles.selectedMark}>●</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// DRAFT BOARD
// ─────────────────────────────────────────────────────────────────────────
function DraftBoard({
  state, myRole, selectedKey, selectedName, onConfirm, onDeselect, compact,
}: {
  state: DraftState
  myRole: DraftRole
  selectedKey: string | null
  selectedName: string | null
  onConfirm?: () => void
  onDeselect?: () => void
  compact?: boolean
}) {
  const getPlayerName = (team: Team, pos: number) => {
    const role = `player_${team}_${pos + 1}` as DraftRole
    return state.participants.find(p => p.role === role)?.name ?? `J${pos + 1}`
  }

  const isActiveSlot = (team: Team, type: 'ban' | 'pick', pos: number): boolean => {
    if (!state.started || state.finished) return false
    const action = STANDARD_DRAFT_ORDER[state.currentStep]
    return action?.team === team && action?.type === type && action?.position === pos
  }

  const canInteract = state.started && !state.finished && myRole === state.activePlayerRole

  const BanSlot = ({ slot, isActive }: { slot: DraftState['blueBans'][0]; isActive: boolean }) => {
    // selectedKey is non-null for the selecting client; hoveredChampionKey covers all other viewers
    const pendingKey = selectedKey || (isActive && !slot.locked ? state.hoveredChampionKey : null)
    const showPending = isActive && !!pendingKey && !slot.locked
    const displayKey = showPending ? pendingKey! : slot.championKey
    return (
      <div className={`${styles.banSlot} ${slot.locked ? styles.banLocked : styles.banEmpty} ${isActive ? styles.slotActive : ''} ${showPending ? styles.pickPending : ''}`}>
        {displayKey
          ? <img src={DDragon.championPortrait(displayKey)} alt={slot.championName ?? ''} className={`${styles.banImg} ${showPending ? styles.banImgPending : ''}`} />
          : <div className={styles.banPlaceholder} />}
      </div>
    )
  }

  const PickSlot = ({ slot, pos, team, isActive }: {
    slot: DraftState['bluePicks'][0]; pos: number; team: Team; isActive: boolean
  }) => {
    const playerName = getPlayerName(team, pos)
    const posName = POSITION_NAMES[pos]
    const isMe = myRole === `player_${team}_${pos + 1}`
    // selectedKey covers the selecting client; hoveredChampionKey covers all other viewers
    const pendingKey  = selectedKey || (isActive && !slot.locked ? state.hoveredChampionKey : null)
    const pendingName = selectedKey ? selectedName : state.hoveredChampionName
    const isPendingSlot = isActive && !!pendingKey && !slot.locked
    const displayKey  = isPendingSlot ? pendingKey!  : (slot.championKey  ?? null)
    const displayName = isPendingSlot ? pendingName  : (slot.championName ?? null)
    return (
      <div className={`${styles.pickSlot} ${team === 'blue' ? styles.pickBlue : styles.pickRed}
        ${slot.locked ? styles.pickLocked : styles.pickEmpty}
        ${isActive ? styles.slotActive : ''} ${isMe && isActive ? styles.slotIsMe : ''}
        ${isPendingSlot ? styles.pickPending : ''}`}>
        {displayKey ? (
          <>
            <img
              src={DDragon.championCentered(displayKey)}
              alt={displayName!}
              className={`${styles.pickImg} ${isPendingSlot ? styles.pickImgPending : ''}`}
            />
            <div className={styles.pickOverlay}>
              <div className={styles.pickChampName}>{displayName}</div>
              <div className={styles.pickRole}>
                <RoleIcon pos={pos} size={11} />
                {' '}{posName}
              </div>
            </div>
          </>
        ) : (
          <div className={styles.pickPlaceholder}>
            <RoleIcon pos={pos} size={32} className={styles.pickPlaceholderIcon} />
            <span className={styles.pickPlaceholderRole}>{posName}</span>
          </div>
        )}
        <div className={`${styles.pickPlayerName} ${isMe ? styles.pickPlayerNameMe : ''}`}>
          {isMe ? '⭐ ' : ''}{playerName}
        </div>
        {isActive && (
          <div className={styles.activePickIndicator}>
            {team === 'blue' ? '🔵' : '🔴'} Turno
          </div>
        )}
      </div>
    )
  }

  const TeamColumn = ({ team, bans, picks }: {
    team: Team; bans: DraftState['blueBans']; picks: DraftState['bluePicks']
  }) => (
    <div className={`${styles.teamColumn} ${team === 'blue' ? styles.teamBlue : styles.teamRed}`}>
      <div className={styles.teamHeader}>
        <span className={`badge ${team === 'blue' ? 'badge-blue' : 'badge-red'}`}>
          {team === 'blue' ? '🔵 Equipo Azul' : '🔴 Equipo Rojo'}
        </span>
      </div>
      <div className={styles.bansRow}>
        {bans.map((slot, i) => <BanSlot key={i} slot={slot} isActive={isActiveSlot(team, 'ban', i)} />)}
      </div>
      <div className={styles.picksColumn}>
        {picks.map((slot, i) => <PickSlot key={i} slot={slot} pos={i} team={team} isActive={isActiveSlot(team, 'pick', i)} />)}
      </div>
    </div>
  )

  return (
    <div className={`${styles.draftBoard} ${compact ? styles.draftBoardCompact : ''}`}>
      <TeamColumn team="blue" bans={state.blueBans} picks={state.bluePicks} />

      {/* Center: timer + turn info only */}
      <div className={styles.draftCenter}>
        {state.started && !state.finished && (
          <>
            <div className={`${styles.turnTeam} ${state.activeTeam === 'blue' ? styles.turnBlue : styles.turnRed}`}>
              {state.activeTeam === 'blue' ? '🔵' : '🔴'} {state.activeActionType === 'ban' ? 'BAN' : 'PICK'}
            </div>
            {state.timer !== null && (
              <div className={`${styles.timer} ${(state.timer ?? 99) <= 10 ? styles.timerLow : ''}`}>
                {state.timer}s
              </div>
            )}
            {state.activePlayerRole && (
              <div className={styles.activePlayerLabel}>
                <span style={{ color: ROLE_COLOR[state.activePlayerRole] ?? 'var(--text-primary)' }}>
                  {state.participants.find(p => p.role === state.activePlayerRole)?.name ?? state.activePlayerRole}
                </span>
              </div>
            )}
          </>
        )}
        {state.finished && <div className={styles.finishedBanner}>✅ Draft Completado</div>}
        {!state.started && <div className={styles.waitingText}>Esperando inicio...</div>}
      </div>

      <TeamColumn team="red" bans={state.redBans} picks={state.redPicks} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────────────────────────────────
function Chat({ messages, onSend, readOnly }: {
  messages: ChatMessage[]
  onSend: (t: string) => void
  readOnly?: boolean
}) {
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  return (
    <div className={styles.chat}>
      <div className={styles.chatMessages}>
        {messages.map(msg => (
          <div key={msg.id} className={styles.chatMsg}>
            <span className={styles.chatAuthor} style={{ color: ROLE_COLOR[msg.role] ?? 'var(--text-secondary)' }}>
              {msg.authorName}:
            </span>
            <span className={styles.chatText}> {msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {!readOnly ? (
        <div className={styles.chatInput}>
          <input type="text" className="input" placeholder="Mensaje..."
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onSend(text.trim()); setText('') } }}
            maxLength={200} />
          <button className="btn btn-primary btn-sm"
            onClick={() => { if (text.trim()) { onSend(text.trim()); setText('') } }}>→</button>
        </div>
      ) : (
        <div className={styles.chatReadOnly}>👁️ Solo lectura</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN DRAFT PAGE
// ─────────────────────────────────────────────────────────────────────────
export default function DraftPage() {
  // ── Identity ──────────────────────────────────────────────────────────
  const [joined, setJoined]             = useState(false)
  const [roomId, setRoomId]             = useState('')
  const [myName, setMyName]             = useState('')
  const [myRole, setMyRole]             = useState<DraftRole>('spectator')
  const [mySocketId, setMySocketId]     = useState('')
  const [isCreator, setIsCreator]       = useState(false)

  // ── Join flow ─────────────────────────────────────────────────────────
  const [isJoinPending, setIsJoinPending] = useState(false)
  const [joinDenied, setJoinDenied]       = useState(false)
  const [joinError, setJoinError]         = useState<string | null>(null)

  // ── Room state ────────────────────────────────────────────────────────
  const [draftState, setDraftState]     = useState<DraftState | null>(null)
  const [canStartDraft, setCanStartDraft] = useState(false)
  const [creatorSocketId, setCreatorSocketId] = useState<string | null>(null)
  const [pendingJoins, setPendingJoins] = useState<JoinRequest[]>([])
  const [readyCheck, setReadyCheck]     = useState<ReadyCheckState | null>(null)
  const [myReadyConfirmed, setMyReadyConfirmed] = useState(false)
  const [kickVotes, setKickVotes]       = useState<Record<string, number>>({})
  const [connected, setConnected]       = useState(false)

  // ── Selection state (local) ────────────────────────────────────────────
  const [selectedKey, setSelectedKey]   = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [selectedId, setSelectedId]     = useState<number | null>(null)
  const prevActiveRole                  = useRef<string | null>(null)
  const prevStarted                     = useRef(false)

  // ── Champions ─────────────────────────────────────────────────────────
  const [champions, setChampions]       = useState<ChampionData[]>([])

  // ── Stream mode ────────────────────────────────────────────────────────
  const [streamMode, setStreamMode]     = useState(false)
  const streamRef                       = useRef<HTMLDivElement>(null)

  // ── Sounds ────────────────────────────────────────────────────────────
  const [soundEnabled, setSoundEnabled] = useState(false)

  // ── Streamer helpers ──────────────────────────────────────────────────
  const [showRoomCode, setShowRoomCode]     = useState(false)     // hidden by default
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // ── Modals ────────────────────────────────────────────────────────────
  const [showChatModal, setShowChatModal]     = useState(false)
  const [showUsersModal, setShowUsersModal]   = useState(false)

  // ── Pre-loaded room ID from encrypted invite link ──────────────────────────
  const [initialRoomId, setInitialRoomId] = useState<string | undefined>(undefined)

  // URL param handling — supports both ?room=CODE (legacy) and ?t=TOKEN (encrypted)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const token = p.get('t')
    const plain = p.get('room')
    if (token) {
      const id = decryptToken(token).toUpperCase().trim()
      if (id) {
        setInitialRoomId(id)
        // Clean the URL — no room code visible to stream viewers
        window.history.replaceState({}, '', '/draft')
      }
    } else if (plain) {
      setInitialRoomId(plain.toUpperCase().trim())
      window.history.replaceState({}, '', '/draft')
    }
  }, [])

  // Load champions
  useEffect(() => { getAllChampions().then(d => setChampions(Object.values(d))) }, [])

  // Sync sound setting
  useEffect(() => { DraftSounds.setEnabled(soundEnabled) }, [soundEnabled])

  // Fullscreen exit detection
  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setStreamMode(false) }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ── Socket events ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!joined) return
    const s = getSocket()

    s.on('connect',    () => setConnected(true))
    s.on('disconnect', () => setConnected(false))

    s.on('your_info', ({ socketId, isCreator: ic }: { socketId: string; isCreator: boolean }) => {
      setMySocketId(socketId)
      setIsCreator(ic)
    })

    s.on('room_state', (state: DraftState) => {
      setDraftState(state)
      setCreatorSocketId(state.creatorSocketId)
      setCanStartDraft(state.canStartDraft)
      setPendingJoins(state.pendingJoins ?? [])
      setReadyCheck(state.readyCheck ?? null)
    })

    s.on('draft_update', (state: DraftState) => {
      setDraftState(prev => {
        // Detect draft just started
        if (!prev?.started && state.started) DraftSounds.draftStart()
        // Detect turn changed to me
        if (state.activePlayerRole !== prevActiveRole.current && state.activePlayerRole === myRole) {
          DraftSounds.yourTurn()
        }
        // Clear local selection only when the step actually advanced
        // (i.e. a pick/ban was confirmed), not on every broadcast
        if (!prev || state.currentStep !== prev.currentStep || state.finished) {
          setSelectedKey(null); setSelectedName(null); setSelectedId(null)
        }
        prevActiveRole.current = state.activePlayerRole
        prevStarted.current = state.started
        return state
      })
      setReadyCheck(state.readyCheck ?? null)
    })

    s.on('hover_update', ({ championKey, championName }: { championKey: string | null; championName: string | null }) => {
      setDraftState(prev => prev ? { ...prev, hoveredChampionKey: championKey, hoveredChampionName: championName } : prev)
    })

    s.on('timer_tick', (t: number) => {
      if (t <= 10 && t > 0) DraftSounds.timerWarning()
      setDraftState(prev => prev ? { ...prev, timer: t } : prev)
    })

    s.on('participants_update', ({ participants, canStartDraft: csd, creatorSocketId: csid, pendingJoins: pj }: {
      participants: Participant[]; canStartDraft: boolean; creatorSocketId: string | null; pendingJoins?: JoinRequest[]
    }) => {
      setDraftState(prev => prev ? { ...prev, participants } : prev)
      setCanStartDraft(csd)
      setCreatorSocketId(csid)
      setPendingJoins(pj ?? [])
    })

    s.on('new_message', (msg: ChatMessage) => {
      setDraftState(prev => prev ? { ...prev, chatMessages: [...(prev.chatMessages ?? []), msg] } : prev)
    })

    s.on('system_message', ({ text }: { text: string }) => {
      setDraftState(prev => prev ? {
        ...prev,
        chatMessages: [...(prev.chatMessages ?? []), {
          id: `sys-${Date.now()}`, authorName: 'Sistema', role: 'spectator' as DraftRole, text, timestamp: Date.now(),
        }],
      } : prev)
    })

    // ── Join flow events ────────────────────────────────────────────────
    s.on('join_pending',  () => setIsJoinPending(true))
    s.on('join_approved', () => {
      setIsJoinPending(false)
      DraftSounds.approved()
    })
    s.on('join_denied', () => {
      setIsJoinPending(false)
      setJoinDenied(true)
      setJoined(false)
      DraftSounds.denied()
    })
    s.on('join_error', ({ message }: { message: string }) => {
      setJoinError(message); setJoined(false); setIsJoinPending(false)
    })

    // ── Ready check events ──────────────────────────────────────────────
    s.on('ready_check_update', (rc: ReadyCheckState | null) => {
      setReadyCheck(prev => {
        if (!prev && rc?.active) DraftSounds.readyCheckStart()
        if (rc && prev && rc.readyRoles.length > prev.readyRoles.length) DraftSounds.playerReady()
        if (!rc) setMyReadyConfirmed(false)
        return rc
      })
    })
    s.on('ready_check_cancelled', ({ cancelledBy }: { cancelledBy: string }) => {
      setReadyCheck(null); setMyReadyConfirmed(false)
      DraftSounds.cancelled()
      setDraftState(prev => prev ? {
        ...prev,
        chatMessages: [...(prev.chatMessages ?? []), {
          id: `sys-${Date.now()}`, authorName: 'Sistema', role: 'spectator' as DraftRole,
          text: `⚠️ ${cancelledBy} canceló el ready check`, timestamp: Date.now(),
        }],
      } : prev)
    })

    // ── Kick events ─────────────────────────────────────────────────────
    s.on('kick_vote_update', (info: KickVoteInfo) => {
      setKickVotes(prev => ({ ...prev, [info.targetSocketId]: info.votes }))
    })
    s.on('kicked', ({ message }: { message: string }) => {
      alert(message); setJoined(false); setDraftState(null)
    })

    return () => {
      s.off('connect'); s.off('disconnect'); s.off('your_info'); s.off('room_state')
      s.off('draft_update'); s.off('hover_update'); s.off('timer_tick')
      s.off('participants_update'); s.off('new_message'); s.off('system_message')
      s.off('join_pending'); s.off('join_approved'); s.off('join_denied')
      s.off('join_error'); s.off('ready_check_update'); s.off('ready_check_cancelled')
      s.off('kick_vote_update'); s.off('kicked')
    }
  }, [joined, myRole])

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleJoin = useCallback(({ roomId: rid, name, role, mode, timerMax, totalGames }: {
    roomId: string; name: string; role: DraftRole; mode: DraftMode; timerMax: number; totalGames: number
  }) => {
    setRoomId(rid); setMyName(name); setMyRole(role)
    setJoinError(null); setJoinDenied(false); setJoined(true)
    getSocket().emit('join_room', { roomId: rid, name, role, mode, timerMax, totalGames })
  }, [])

  const handleHover  = useCallback((key: string | null, name: string | null) => {
    getSocket().emit('hover_champion', { roomId, championKey: key, championName: name })
  }, [roomId])

  const handleSelect = useCallback((id: number, key: string, name: string) => {
    setSelectedId(id); setSelectedKey(key); setSelectedName(name)
    // Emit hover so ALL viewers (stream, spectators) see the selection in real-time
    getSocket().emit('hover_champion', { roomId, championKey: key, championName: name })
  }, [roomId])

  const handleDeselect = useCallback(() => {
    setSelectedKey(null); setSelectedName(null); setSelectedId(null)
    handleHover(null, null)
  }, [handleHover])

  const handleConfirm = useCallback(() => {
    if (!selectedId || !selectedKey || !selectedName) return
    const actionType = draftState?.activeActionType
    if (actionType === 'ban') DraftSounds.ban(); else DraftSounds.lockIn()
    getSocket().emit('lock_champion', { roomId, championId: selectedId, championKey: selectedKey, championName: selectedName })
    setSelectedKey(null); setSelectedName(null); setSelectedId(null)
  }, [selectedId, selectedKey, selectedName, roomId, draftState])

  const handleStart  = useCallback(() => { getSocket().emit('start_draft',       { roomId }) }, [roomId])
  const handleReset  = useCallback(() => { getSocket().emit('reset_room',         { roomId }) }, [roomId])
  const handleChat   = useCallback((t: string) => { getSocket().emit('send_message', { roomId, text: t }) }, [roomId])
  const handleKick   = useCallback((id: string) => { getSocket().emit('kick_player', { roomId, targetSocketId: id }) }, [roomId])

  const handleApprove = useCallback((reqId: string) => {
    getSocket().emit('approve_join', { roomId, requestId: reqId })
  }, [roomId])

  const handleDeny = useCallback((reqId: string) => {
    getSocket().emit('deny_join', { roomId, requestId: reqId })
  }, [roomId])

  const handleReady = useCallback(() => {
    getSocket().emit('player_ready', { roomId })
    setMyReadyConfirmed(true)
    DraftSounds.playerReady()
  }, [roomId])

  const handleCancelReady = useCallback(() => {
    getSocket().emit('cancel_ready_check', { roomId })
  }, [roomId])


  const handleToggleStream = useCallback(() => {
    if (!streamMode) {
      setStreamMode(true)
      setTimeout(() => { streamRef.current?.requestFullscreen().catch(() => {}) }, 100)
    } else {
      setStreamMode(false)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [streamMode])

  // ── Derived ───────────────────────────────────────────────────────────
  const usedChampionIds = useMemo(() => {
    if (!draftState) return new Set<number>()
    const used = new Set<number>()
    ;[...draftState.blueBans, ...draftState.redBans, ...draftState.bluePicks, ...draftState.redPicks]
      .forEach(s => { if (s.championId !== null) used.add(s.championId) })
    return used
  }, [draftState])

  const fearlessLockedIds = useMemo(() => {
    if (!draftState || draftState.mode !== 'fearless') return new Set<number>()
    return new Set(draftState.fearlessBannedChampionIds)
  }, [draftState])

  const canInteract = useMemo(() => {
    if (!draftState || !draftState.started || draftState.finished) return false
    if (SOLO_MODE && myRole === 'admin') return true
    return myRole === draftState.activePlayerRole
  }, [draftState, myRole])

  const hasAuthority = useMemo(() =>
    myRole === 'admin' || mySocketId === creatorSocketId || myRole.startsWith('player_'),
    [myRole, mySocketId, creatorSocketId]
  )


  // ─── STREAM MODE VIEW ─────────────────────────────────────────────────
  const streamDraftContent = streamMode && draftState && (
    <div ref={streamRef} className={styles.streamContainer}>
      <div className={styles.streamTopBar}>
        <span className={styles.streamRoomCode}>🎯 {roomId}</span>
        {draftState.started && !draftState.finished && (
          <div className={`${styles.streamTurnBadge} ${draftState.activeTeam === 'blue' ? styles.turnBlue : styles.turnRed}`}>
            {draftState.activeTeam === 'blue' ? '🔵' : '🔴'} {draftState.activeActionType?.toUpperCase()} · {draftState.timer}s
          </div>
        )}
        <button className="btn btn-secondary btn-sm" onClick={handleToggleStream}>✕ Salir</button>
      </div>
      <div className={styles.streamBoardArea}>
        <DraftBoard
          state={draftState} myRole={myRole}
          selectedKey={canInteract ? selectedKey : (draftState.hoveredChampionKey ?? null)}
          selectedName={canInteract ? selectedName : (draftState.hoveredChampionName ?? null)}
          onConfirm={handleConfirm} onDeselect={handleDeselect}
          compact
        />
      </div>
    </div>
  )

  // ─── RENDER ───────────────────────────────────────────────────────────
  if (!joined) {
    if (joinDenied) return (
      <div className={styles.lobby}>
        <div className={styles.lobbyCard} style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h2 style={{ color: 'var(--color-danger)' }}>Acceso Denegado</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '12px 0 24px' }}>Tu solicitud fue rechazada.</p>
          <button className="btn btn-primary" onClick={() => setJoinDenied(false)}>Intentar de nuevo</button>
        </div>
      </div>
    )
    return <LobbyScreen onJoin={handleJoin} previewParticipants={draftState?.participants} joinError={joinError} initialRoomId={initialRoomId} />
  }

  if (isJoinPending) return <WaitingApprovalScreen onCancel={() => { setJoined(false); setIsJoinPending(false) }} />

  return (
    <>
      {/* Stream mode overlay — covers everything including sidebar */}
      {streamDraftContent}

      <div className={styles.draftPage}>
        {/* ── Top Bar ───────────────────────────────────────────────── */}
        <div className={styles.draftTopBar}>
          <div className={styles.draftTopLeft}>
            {/* Room code — hidden by default for streamers */}
            <div className={styles.roomCodeWrap}>
              <span className={styles.roomCode}>
                🎯 <strong>{showRoomCode ? roomId : '••••••'}</strong>
              </span>
              <button
                className={styles.eyeBtn}
                onClick={() => setShowRoomCode(v => !v)}
                title={showRoomCode ? 'Ocultar código' : 'Mostrar código de sala'}
              >
                {showRoomCode ? '🙈' : '👁️'}
              </button>
            </div>
            <span className={`badge ${connected ? 'badge-green' : 'badge-red'}`}>
              {connected ? '● Conectado' : '● Desconectado'}
            </span>
            {draftState?.mode === 'fearless' && (
              <span className="badge badge-gold">💀 Fearless Bo{draftState.totalGames}</span>
            )}
          </div>
          <div className={styles.draftTopRight}>
            {/* ── DRAFT CONTROLS (start / reset) — inline in navbar ── */}
            {draftState && hasAuthority && !draftState.started && !readyCheck?.active && (
              <button
                className={`btn btn-primary btn-sm ${(!canStartDraft && !SOLO_MODE) ? styles.btnDisabled : ''}`}
                onClick={handleStart}
                disabled={!canStartDraft && !SOLO_MODE}
                title={(!canStartDraft && !SOLO_MODE) ? 'Necesitas 5 azules y 5 rojos conectados' : 'Iniciar draft'}
              >
                ▶ Iniciar Draft
              </button>
            )}
            {draftState && draftState.finished && hasAuthority && (
              <button className="btn btn-secondary btn-sm" onClick={handleReset}>
                🔄 Nuevo Draft
              </button>
            )}
            {/* Chat modal button */}
            {draftState && (
              <button
                className={`btn btn-secondary btn-sm ${showChatModal ? styles.navBtnActive : ''}`}
                onClick={() => { setShowChatModal(v => !v); setShowUsersModal(false) }}
                title="Chat">
                💬 Chat
                {(draftState.chatMessages?.length ?? 0) > 0 && (
                  <span className={styles.navBadge}>{draftState.chatMessages!.length}</span>
                )}
              </button>
            )}
            {/* Users modal button */}
            {draftState && (
              <button
                className={`btn btn-secondary btn-sm ${showUsersModal ? styles.navBtnActive : ''}`}
                onClick={() => { setShowUsersModal(v => !v); setShowChatModal(false) }}
                title="Jugadores conectados">
                👥 Jugadores
                <span className={styles.navBadge}>
                  {draftState.participants.filter(p => p.connected).length}
                </span>
              </button>
            )}
            {/* Stream Mode */}
            <button className={`btn btn-secondary btn-sm ${styles.streamBtn}`} onClick={handleToggleStream}
              title="Modo transmisión: pantalla completa sin menús">
              📡 Stream
            </button>
            {/* Sound toggle */}
            <button className="btn btn-secondary btn-sm"
              onClick={() => setSoundEnabled(v => !v)}
              title={soundEnabled ? 'Desactivar sonidos' : 'Activar sonidos'}>
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            <button className="btn btn-secondary btn-sm"
              onClick={() => navigator.clipboard.writeText(makeInviteLink(roomId))}>
              📋 Invitar
            </button>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-secondary btn-sm ${styles.githubNavBtn}`}
              title="Ver en GitHub"
            >
              <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
                  0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
                  -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
                  .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
                  -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
                  1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56
                  .82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07
                  -.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              GitHub
            </a>
            <span className={styles.myRoleBadge}>
              <span style={{ color: ROLE_COLOR[myRole] ?? 'var(--text-primary)' }}>{ROLE_LABEL[myRole]}</span>
              {' · '}<strong>{myName}</strong>
            </span>
          </div>
        </div>

        {/* ── Main Area: Blue | Center | Red ────────────────────── */}
        <div className={styles.draftMain}>

          {/* ── BLUE COLUMN: bans + picks + participants ───────────── */}
          <div className={styles.teamCol}>
            {draftState && (
              <>
                {/* Team header */}
                <div className={`${styles.teamColHeader} ${styles.teamColBlue}`}>🔵 Equipo Azul</div>
                {/* Bans row */}
                <div className={styles.teamColBans}>
                  {draftState.blueBans.map((slot, i) => {
                    const isActive = draftState.started && !draftState.finished &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.team === 'blue' &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.type === 'ban' &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.position === i
                    // Local client is selecting → immediate feedback; others see hoveredChampionKey from server
                    const localPending = isActive && !!selectedKey && !slot.locked && canInteract
                    const serverPending = isActive && !slot.locked && !!draftState.hoveredChampionKey && !localPending
                    const showPending = localPending || serverPending
                    const displayKey = localPending ? selectedKey! : serverPending ? draftState.hoveredChampionKey! : slot.championKey
                    const displayAlt = localPending ? (selectedName ?? '') : serverPending ? (draftState.hoveredChampionName ?? '') : (slot.championName ?? '')
                    return (
                      <div key={i} className={`${styles.banSlot} ${slot.locked ? styles.banLocked : styles.banEmpty} ${isActive ? styles.slotActive : ''} ${showPending ? styles.pickPending : ''}`}>
                        {displayKey
                          ? <img src={DDragon.championPortrait(displayKey)} alt={displayAlt} className={`${styles.banImg} ${showPending ? styles.banImgPending : ''}`} />
                          : <div className={styles.banPlaceholder} />}
                      </div>
                    )
                  })}
                </div>
                {/* Picks */}
                <div className={styles.teamColPicks}>
                  {draftState.bluePicks.map((slot, i) => {
                    const isActive = draftState.started && !draftState.finished &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.team === 'blue' &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.type === 'pick' &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.position === i
                    const isMe = myRole === `player_blue_${i + 1}`
                    const localPending = (isMe || (SOLO_MODE && myRole === 'admin' && canInteract)) && isActive && !!selectedKey && !slot.locked
                    const serverPending = isActive && !slot.locked && !!draftState.hoveredChampionKey && !localPending
                    const isPending = localPending || serverPending
                    const displayKey = localPending ? selectedKey! : serverPending ? draftState.hoveredChampionKey! : slot.championKey
                    const displayName = localPending ? selectedName : serverPending ? draftState.hoveredChampionName : slot.championName
                    const posIcon = POSITION_ICON_URLS[i]
                    return (
                      <div key={i} className={`${styles.pickSlot} ${styles.pickBlue}
                        ${slot.locked ? styles.pickLocked : styles.pickEmpty}
                        ${isActive ? styles.slotActive : ''} ${isMe && isActive ? styles.slotIsMe : ''}
                        ${isPending ? styles.pickPending : ''}`}>
                        {displayKey ? (
                          <>
                            <img src={DDragon.championCentered(displayKey)} alt={displayName!}
                              className={`${styles.pickImg} ${isPending ? styles.pickImgPending : ''}`} />
                            <div className={styles.pickOverlay}>
                              <div className={styles.pickChampName}>{displayName}</div>
                              <div className={styles.pickRole}>
                                <img src={posIcon} alt="" width={10} height={10} style={{filter:'brightness(0) invert(1)',opacity:.8,verticalAlign:'middle'}} />
                                {' '}{POSITION_NAMES[i]}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className={styles.pickPlaceholder}>
                            <img src={posIcon} alt={POSITION_NAMES[i]} className={styles.pickPlaceholderIcon} />
                            <span className={styles.pickPlaceholderRole}>{POSITION_NAMES[i]}</span>
                          </div>
                        )}
                        <div className={`${styles.pickPlayerName} ${isMe ? styles.pickPlayerNameMe : ''}`}>
                          {isMe ? '⭐ ' : ''}{(() => { const r = `player_blue_${i+1}` as DraftRole; return draftState.participants.find(p => p.role === r)?.name ?? `J${i+1}` })()}
                        </div>
                        {isActive && <div className={styles.activePickIndicator}>🔵 Turno</div>}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── CENTER: timer + preview + champion grid ─────────────── */}
          <div className={styles.draftCenterCol}>
            {/* Turn info bar */}
            {draftState?.started && !draftState.finished && (
              <div className={styles.centerTurnBar}>
                <div className={`${styles.turnTeam} ${draftState.activeTeam === 'blue' ? styles.turnBlue : styles.turnRed}`}>
                  {draftState.activeTeam === 'blue' ? '🔵' : '🔴'} {draftState.activeActionType === 'ban' ? 'BAN' : 'PICK'}
                </div>
                {draftState.timer !== null && (
                  <div className={`${styles.timer} ${(draftState.timer ?? 99) <= 10 ? styles.timerLow : ''}`}>
                    {draftState.timer}s
                  </div>
                )}
                {draftState.activePlayerRole && (
                  <div className={styles.activePlayerLabel}>
                    <span style={{ color: ROLE_COLOR[draftState.activePlayerRole] ?? 'var(--text-primary)' }}>
                      {draftState.participants.find(p => p.role === draftState.activePlayerRole)?.name ?? draftState.activePlayerRole}
                    </span>
                  </div>
                )}
              </div>
            )}
            {draftState?.finished && <div className={styles.finishedBannerCenter}>✅ Draft Completado</div>}
            {!draftState?.started && draftState && <div className={styles.waitingTextCenter}>Esperando inicio del draft...</div>}

            {/* Selection preview — shown when active player has selected a champion */}
            {canInteract && draftState && (
              <div className={`${styles.selectionPreview} ${
                draftState.activeActionType === 'ban' ? styles.selectionPreviewBan : styles.selectionPreviewPick
              }`}>
                {selectedKey ? (
                  <>
                    <div className={styles.selectionPreviewArt}>
                      <img src={DDragon.championCentered(selectedKey)} alt={selectedName ?? ''} className={styles.selectionPreviewImg} />
                      <div className={styles.selectionPreviewGrad} />
                      <div className={styles.selectionPreviewMeta}>
                        <span className={styles.selectionPreviewName}>{selectedName}</span>
                        <span className={styles.selectionPreviewType}>
                          {draftState.activeActionType === 'ban' ? '🚫 Ban' : '✅ Pick'}
                        </span>
                      </div>
                    </div>
                    <div className={styles.selectionPreviewActions}>
                      <button className={`btn btn-primary ${styles.confirmBtn}`} onClick={handleConfirm}>
                        ✅ Confirmar {draftState.activeActionType === 'ban' ? 'Ban' : 'Pick'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={handleDeselect}>✕</button>
                    </div>
                  </>
                ) : (
                  <div className={styles.selectionPreviewEmpty}>
                    <span className={styles.selectionPreviewEmptyIcon}>
                      {draftState.activeActionType === 'ban' ? '🚫' : '🎯'}
                    </span>
                    <span>Selecciona un campeón para {draftState.activeActionType === 'ban' ? 'banear' : 'pickear'}</span>
                  </div>
                )}
              </div>
            )}

            {/* Champion grid */}
            <ChampionGrid
              champions={champions}
              usedChampionIds={usedChampionIds}
              fearlessLockedIds={fearlessLockedIds}
              onSelect={handleSelect}
              canInteract={canInteract}
              selectedKey={selectedKey}
              onDeselect={handleDeselect}
            />
          </div>

          {/* ── RED COLUMN: bans + picks + chat ────────────────────── */}
          <div className={styles.teamCol}>
            {draftState && (
              <>
                <div className={`${styles.teamColHeader} ${styles.teamColRed}`}>🔴 Equipo Rojo</div>
                <div className={styles.teamColBans}>
                  {draftState.redBans.map((slot, i) => {
                    const isActive = draftState.started && !draftState.finished &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.team === 'red' &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.type === 'ban' &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.position === i
                    // Local client is selecting → immediate feedback; others see hoveredChampionKey from server
                    const localPending = isActive && !!selectedKey && !slot.locked && canInteract
                    const serverPending = isActive && !slot.locked && !!draftState.hoveredChampionKey && !localPending
                    const showPending = localPending || serverPending
                    const displayKey = localPending ? selectedKey! : serverPending ? draftState.hoveredChampionKey! : slot.championKey
                    const displayAlt = localPending ? (selectedName ?? '') : serverPending ? (draftState.hoveredChampionName ?? '') : (slot.championName ?? '')
                    return (
                      <div key={i} className={`${styles.banSlot} ${slot.locked ? styles.banLocked : styles.banEmpty} ${isActive ? styles.slotActive : ''} ${showPending ? styles.pickPending : ''}`}>
                        {displayKey
                          ? <img src={DDragon.championPortrait(displayKey)} alt={displayAlt} className={`${styles.banImg} ${showPending ? styles.banImgPending : ''}`} />
                          : <div className={styles.banPlaceholder} />}
                      </div>
                    )
                  })}
                </div>
                <div className={styles.teamColPicks}>
                  {draftState.redPicks.map((slot, i) => {
                    const isActive = draftState.started && !draftState.finished &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.team === 'red' &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.type === 'pick' &&
                      STANDARD_DRAFT_ORDER[draftState.currentStep]?.position === i
                    const isMe = myRole === `player_red_${i + 1}`
                    const localPending = (isMe || (SOLO_MODE && myRole === 'admin' && canInteract)) && isActive && !!selectedKey && !slot.locked
                    const serverPending = isActive && !slot.locked && !!draftState.hoveredChampionKey && !localPending
                    const isPending = localPending || serverPending
                    const displayKey = localPending ? selectedKey! : serverPending ? draftState.hoveredChampionKey! : slot.championKey
                    const displayName = localPending ? selectedName : serverPending ? draftState.hoveredChampionName : slot.championName
                    const posIcon = POSITION_ICON_URLS[i]
                    return (
                      <div key={i} className={`${styles.pickSlot} ${styles.pickRed}
                        ${slot.locked ? styles.pickLocked : styles.pickEmpty}
                        ${isActive ? styles.slotActive : ''} ${isMe && isActive ? styles.slotIsMe : ''}
                        ${isPending ? styles.pickPending : ''}`}>
                        {displayKey ? (
                          <>
                            <img src={DDragon.championCentered(displayKey)} alt={displayName!}
                              className={`${styles.pickImg} ${isPending ? styles.pickImgPending : ''}`} />
                            <div className={styles.pickOverlay}>
                              <div className={styles.pickChampName}>{displayName}</div>
                              <div className={styles.pickRole}>
                                <img src={posIcon} alt="" width={10} height={10} style={{filter:'brightness(0) invert(1)',opacity:.8,verticalAlign:'middle'}} />
                                {' '}{POSITION_NAMES[i]}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className={styles.pickPlaceholder}>
                            <img src={posIcon} alt={POSITION_NAMES[i]} className={styles.pickPlaceholderIcon} />
                            <span className={styles.pickPlaceholderRole}>{POSITION_NAMES[i]}</span>
                          </div>
                        )}
                        <div className={`${styles.pickPlayerName} ${isMe ? styles.pickPlayerNameMe : ''}`}>
                          {isMe ? '⭐ ' : ''}{(() => { const r = `player_red_${i+1}` as DraftRole; return draftState.participants.find(p => p.role === r)?.name ?? `J${i+1}` })()}
                        </div>
                        {isActive && <div className={styles.activePickIndicator}>🔴 Turno</div>}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Chat Modal ───────────────────────────────────────────── */}
        {showChatModal && draftState && (
          <div className={styles.modalOverlay} onClick={() => setShowChatModal(false)}>
            <div className={styles.modalPanel} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <span>💬 Chat</span>
                <button className={styles.modalClose} onClick={() => setShowChatModal(false)}>✕</button>
              </div>
              <div className={styles.modalBody}>
                <Chat
                  messages={draftState.chatMessages ?? []}
                  onSend={handleChat}
                  readOnly={myRole === 'spectator'}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Users Modal ──────────────────────────────────────────── */}
        {showUsersModal && draftState && (
          <div className={styles.modalOverlay} onClick={() => setShowUsersModal(false)}>
            <div className={styles.modalPanel} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <span>👥 Jugadores conectados</span>
                <button className={styles.modalClose} onClick={() => setShowUsersModal(false)}>✕</button>
              </div>
              <div className={styles.modalBody}>
                <ParticipantsPanel
                  participants={draftState.participants}
                  pendingJoins={pendingJoins}
                  creatorSocketId={creatorSocketId}
                  mySocketId={mySocketId}
                  myRole={myRole}
                  canStartDraft={canStartDraft}
                  draftStarted={draftState.started}
                  draftFinished={draftState.finished}
                  readyCheck={readyCheck}
                  onStart={handleStart}
                  onReset={handleReset}
                  onKick={handleKick}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                  kickVotes={kickVotes}
                  soloMode={SOLO_MODE}
                />
              </div>
            </div>
          </div>
        )}


        {/* ── Ready Check Overlay ──────────────────────────────────── */}
        {readyCheck?.active && draftState && (
          <ReadyCheckOverlay
            readyCheck={readyCheck}
            myRole={myRole}
            participants={draftState.participants ?? []}
            onReady={handleReady}
            onCancel={handleCancelReady}
            hasAuthority={hasAuthority}
            alreadyReady={myReadyConfirmed}
          />
        )}
      </div>
    </>
  )
}
