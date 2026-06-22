import { Server as SocketIOServer } from 'socket.io'
import { NextApiRequest, NextApiResponse } from 'next'
import { Server as HTTPServer } from 'http'
import { Socket as NetSocket } from 'net'
import {
  DraftRole, DraftMode, Team, DraftSlot,
  ChatMessage, Participant, CoachNote, KickVoteInfo, DraftState,
  JoinRequest, ReadyCheckState,
  STANDARD_DRAFT_ORDER, getActivePlayerRole,
} from '@/lib/draft-types'

// Re-export shared types so page.tsx can import from here if needed
export type {
  DraftRole, DraftMode, Team, DraftSlot, ChatMessage, Participant,
  CoachNote, KickVoteInfo, DraftState, JoinRequest, ReadyCheckState,
}
export { STANDARD_DRAFT_ORDER, getActivePlayerRole }

// ─── Room store ───────────────────────────────────────────────────────────
const rooms = new Map<string, DraftState>()

/** When true, one admin can simulate the entire draft alone */
const SOLO_MODE = process.env.NEXT_PUBLIC_SOLO_MODE === 'true'

function emptySlots(n: number): DraftSlot[] {
  return Array.from({ length: n }, () => ({
    championId: null, championKey: null, championName: null, locked: false,
  }))
}

function computeCanStart(participants: Participant[]): boolean {
  const connected = new Set(participants.filter(p => p.connected).map(p => p.role))
  for (let i = 1; i <= 5; i++) {
    if (!connected.has(`player_blue_${i}` as DraftRole)) return false
    if (!connected.has(`player_red_${i}` as DraftRole)) return false
  }
  return true
}

function createRoom(
  roomId: string, mode: DraftMode, timerMax: number,
  totalGames: number, creatorSocketId: string
): DraftState {
  const first = STANDARD_DRAFT_ORDER[0]
  return {
    roomId, mode,
    currentStep: 0,
    blueBans: emptySlots(5), redBans: emptySlots(5),
    bluePicks: emptySlots(5), redPicks: emptySlots(5),
    hoveredChampionKey: null, hoveredChampionName: null, hoveredTeam: null,
    timer: timerMax, timerMax, isTimerRunning: false,
    started: false, finished: false, fearlessBannedChampionIds: [],
    activeTeam: first.team, activeActionType: first.type,
    activePlayerRole: getActivePlayerRole(0),
    gameNumber: 1, totalGames,
    chatMessages: [], participants: [], coachNotes: [],
    creatorSocketId, kickVotes: {}, canStartDraft: false,
    pendingJoins: [], readyCheck: null,
  }
}

function getTeamOfRole(role: string): Team | null {
  if (role.startsWith('player_blue') || role === 'coach_blue') return 'blue'
  if (role.startsWith('player_red')  || role === 'coach_red')  return 'red'
  return null
}

/** Can this approver approve this join request? */
function canApproveRequest(
  room: DraftState, approver: Participant, request: JoinRequest
): boolean {
  // Admin or creator → approve anyone
  if (approver.role === 'admin' || approver.socketId === room.creatorSocketId) return true
  // Same team → approve teammate
  const aTeam = getTeamOfRole(approver.role)
  const rTeam = getTeamOfRole(request.role)
  return aTeam !== null && rTeam !== null && aTeam === rTeam
}

function advanceStep(state: DraftState): DraftState {
  const nextStep = state.currentStep + 1
  if (nextStep >= STANDARD_DRAFT_ORDER.length) {
    return {
      ...state, currentStep: nextStep,
      finished: true, isTimerRunning: false,
      hoveredChampionKey: null, hoveredChampionName: null,
    }
  }
  const next = STANDARD_DRAFT_ORDER[nextStep]
  return {
    ...state, currentStep: nextStep,
    activeTeam: next.team, activeActionType: next.type,
    activePlayerRole: getActivePlayerRole(nextStep),
    hoveredChampionKey: null, hoveredChampionName: null, hoveredTeam: null,
    timer: state.timerMax, isTimerRunning: true,
  }
}

function applySelection(
  state: DraftState, championId: number, championKey: string, championName: string
): DraftState {
  const action = STANDARD_DRAFT_ORDER[state.currentStep]
  const newState = { ...state }
  if (action.type === 'ban') {
    const bans = action.team === 'blue' ? [...state.blueBans] : [...state.redBans]
    bans[action.position] = { championId, championKey, championName, locked: true }
    if (action.team === 'blue') newState.blueBans = bans
    else newState.redBans = bans
  } else {
    const picks = action.team === 'blue' ? [...state.bluePicks] : [...state.redPicks]
    picks[action.position] = { championId, championKey, championName, locked: true }
    if (action.team === 'blue') newState.bluePicks = picks
    else newState.redPicks = picks
  }
  if (state.mode === 'fearless' && action.type === 'pick') {
    // Only champions that were PLAYED (picked) are locked across games.
    // Banned champions are free again next game — only picks carry over.
    newState.fearlessBannedChampionIds = [...state.fearlessBannedChampionIds, championId]
  }
  return advanceStep(newState)
}

function getUsedChampionIds(state: DraftState): Set<number> {
  const used = new Set<number>()
  ;[...state.blueBans, ...state.redBans, ...state.bluePicks, ...state.redPicks]
    .forEach(s => { if (s.championId !== null) used.add(s.championId) })
  return used
}

// Broadcast participants_update (includes pending joins)
function broadcastParticipants(io: SocketIOServer, room: DraftState) {
  io.to(room.roomId).emit('participants_update', {
    participants: room.participants,
    canStartDraft: room.canStartDraft,
    creatorSocketId: room.creatorSocketId,
    pendingJoins: room.pendingJoins,
  })
}

// Finalize a join: add to participants, let socket into the room
function finalizeJoin(
  io: SocketIOServer,
  room: DraftState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket: any,
  name: string,
  role: DraftRole
) {
  const roomId = room.roomId
  // Remove from pending if they were there
  room.pendingJoins = room.pendingJoins.filter(r => r.socketId !== socket.id)
  room.participants.push({ socketId: socket.id, name, role, connected: true })
  room.canStartDraft = computeCanStart(room.participants)
  rooms.set(roomId, room)

  socket.join(roomId)
  socket.data.roomId = roomId
  socket.data.name = name
  socket.data.role = role

  socket.emit('your_info', {
    socketId: socket.id,
    isCreator: room.creatorSocketId === socket.id,
  })
  socket.emit('room_state', room)
  broadcastParticipants(io, room)
}

// ─── Next.js handler ──────────────────────────────────────────────────────
interface NextApiResponseWithSocket extends NextApiResponse {
  socket: NetSocket & {
    server: HTTPServer & { io?: SocketIOServer }
  }
}

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponseWithSocket
) {
  if (!res.socket.server.io) {
    const io = new SocketIOServer(res.socket.server, {
      path: '/api/socket',
      cors: { origin: '*' },
    })

    const timers = new Map<string, ReturnType<typeof setInterval>>()

    function startTimer(roomId: string) {
      if (timers.has(roomId)) { clearInterval(timers.get(roomId)!); timers.delete(roomId) }
      const interval = setInterval(() => {
        const r = rooms.get(roomId)
        if (!r || !r.isTimerRunning || r.finished) { clearInterval(interval); timers.delete(roomId); return }
        if (r.timer !== null && r.timer > 0) {
          r.timer -= 1
          rooms.set(roomId, r)
          io.to(roomId).emit('timer_tick', r.timer)
        } else {
          clearInterval(interval); timers.delete(roomId)
          const updated = advanceStep(r)
          rooms.set(roomId, updated)
          io.to(roomId).emit('draft_update', updated)
          if (!updated.finished) startTimer(roomId)
        }
      }, 1000)
      timers.set(roomId, interval)
    }

    io.on('connection', (socket) => {
      console.log('[SOCKET] Connected:', socket.id)

      // ── JOIN ROOM ────────────────────────────────────────────────────
      socket.on('join_room', ({
        roomId, name, role, mode, timerMax, totalGames,
      }: {
        roomId: string; name: string; role: DraftRole
        mode?: DraftMode; timerMax?: number; totalGames?: number
      }) => {
        let room = rooms.get(roomId)

        // ── Create new room — creator is always auto-approved ──────────
        if (!room) {
          room = createRoom(roomId, mode || 'standard', timerMax || 30, totalGames || 1, socket.id)
          rooms.set(roomId, room)
          finalizeJoin(io, room, socket, name, role)
          return
        }

        // ── Reconnection (same socketId) ───────────────────────────────
        const existingIdx = room.participants.findIndex(p => p.socketId === socket.id)
        if (existingIdx >= 0) {
          room.participants[existingIdx] = { ...room.participants[existingIdx], connected: true }
          room.canStartDraft = computeCanStart(room.participants)
          rooms.set(roomId, room)
          socket.join(roomId)
          socket.data.roomId = roomId
          socket.data.name = room.participants[existingIdx].name
          socket.data.role = room.participants[existingIdx].role
          socket.emit('your_info', { socketId: socket.id, isCreator: room.creatorSocketId === socket.id })
          socket.emit('room_state', room)
          broadcastParticipants(io, room)
          if (room.readyCheck?.active) {
            io.to(roomId).emit('ready_check_update', room.readyCheck)
          }
          return
        }

        // ── Player slot uniqueness ─────────────────────────────────────
        if (role.startsWith('player_')) {
          const taken = room.participants.find(p => p.role === role && p.connected)
          if (taken) {
            socket.emit('join_error', { message: `El slot ya está ocupado por ${taken.name}` })
            return
          }
        }

        // ── Auto-approve conditions ────────────────────────────────────
        // Spectators join instantly (view-only)
        const isSpectator = role === 'spectator'
        // First admin bootstraps the room if no admins are present
        const isBootstrapAdmin = role === 'admin' &&
          !room.participants.some(p => p.role === 'admin' && p.connected)
        // Room creator reconnecting under different socketId (same name + creator slot)
        const autoApprove = isSpectator || isBootstrapAdmin

        if (autoApprove) {
          finalizeJoin(io, room, socket, name, role)
        } else {
          // Queue the request
          const request: JoinRequest = {
            id: `req-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            socketId: socket.id, name, role, timestamp: Date.now(),
          }
          room.pendingJoins.push(request)
          rooms.set(roomId, room)
          // Store for reconnection handling, but DON'T socket.join the room yet
          socket.data.pendingRoomId = roomId
          socket.data.pendingRequestId = request.id
          socket.emit('join_pending', { requestId: request.id })
          broadcastParticipants(io, room)
        }
      })

      // ── APPROVE JOIN ─────────────────────────────────────────────────
      socket.on('approve_join', ({ roomId, requestId }: { roomId: string; requestId: string }) => {
        const room = rooms.get(roomId)
        if (!room) return
        const request = room.pendingJoins.find(r => r.id === requestId)
        if (!request) return
        const approver = room.participants.find(p => p.socketId === socket.id && p.connected)
        if (!approver || !canApproveRequest(room, approver, request)) {
          socket.emit('error_msg', { message: 'No tienes permisos para aprobar esta solicitud' }); return
        }
        room.pendingJoins = room.pendingJoins.filter(r => r.id !== requestId)
        rooms.set(roomId, room)
        const reqSocket = io.sockets.sockets.get(request.socketId)
        if (reqSocket) {
          finalizeJoin(io, room, reqSocket, request.name, request.role)
          reqSocket.emit('join_approved')
        } else {
          broadcastParticipants(io, room)
        }
      })

      // ── DENY JOIN ────────────────────────────────────────────────────
      socket.on('deny_join', ({ roomId, requestId }: { roomId: string; requestId: string }) => {
        const room = rooms.get(roomId)
        if (!room) return
        const request = room.pendingJoins.find(r => r.id === requestId)
        if (!request) return
        const approver = room.participants.find(p => p.socketId === socket.id && p.connected)
        if (!approver || !canApproveRequest(room, approver, request)) return
        room.pendingJoins = room.pendingJoins.filter(r => r.id !== requestId)
        rooms.set(roomId, room)
        io.sockets.sockets.get(request.socketId)?.emit('join_denied', {
          message: 'Tu solicitud de acceso fue rechazada.',
        })
        broadcastParticipants(io, room)
      })

      // ── START DRAFT → triggers ready check ───────────────────────────
      socket.on('start_draft', ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId)
        if (!room || room.started || room.readyCheck?.active) return
        const sender = room.participants.find(p => p.socketId === socket.id && p.connected)
        if (!sender) return

        // Any admin OR any player can start
        const canStart = sender.role === 'admin' || sender.role.startsWith('player_')
        if (!canStart) { socket.emit('error_msg', { message: 'No tienes permisos para iniciar' }); return }

        // In solo mode: skip player count check + skip ready check, start directly
        if (SOLO_MODE && sender.role === 'admin') {
          room.readyCheck = null
          room.started = true
          room.isTimerRunning = true
          room.timer = room.timerMax
          rooms.set(roomId, room)
          io.to(roomId).emit('draft_update', room)
          startTimer(roomId)
          return
        }

        if (!computeCanStart(room.participants)) {
          socket.emit('error_msg', { message: 'Faltan jugadores: necesitas 5 azules y 5 rojos conectados' }); return
        }

        // Start the ready check (60 seconds)
        room.readyCheck = { active: true, readyRoles: [], timeoutAt: Date.now() + 60_000 }
        rooms.set(roomId, room)
        io.to(roomId).emit('ready_check_update', room.readyCheck)
      })

      // ── PLAYER READY ─────────────────────────────────────────────────
      socket.on('player_ready', ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId)
        if (!room || !room.readyCheck?.active) return
        const sender = room.participants.find(p => p.socketId === socket.id && p.connected)
        if (!sender || !sender.role.startsWith('player_')) return

        if (!room.readyCheck.readyRoles.includes(sender.role)) {
          room.readyCheck.readyRoles.push(sender.role)
        }
        rooms.set(roomId, room)
        io.to(roomId).emit('ready_check_update', room.readyCheck)

        // Check all connected player slots are ready
        const connectedSlots = room.participants
          .filter(p => p.connected && p.role.startsWith('player_'))
          .map(p => p.role)
        const allConnected = computeCanStart(room.participants)
        const allReady = connectedSlots.every(r => room.readyCheck!.readyRoles.includes(r))

        if (allReady && allConnected) {
          // 🎉 Launch!
          room.readyCheck = null
          room.started = true
          room.isTimerRunning = true
          room.timer = room.timerMax
          rooms.set(roomId, room)
          io.to(roomId).emit('draft_update', room)
          startTimer(roomId)
        }
      })

      // ── CANCEL READY CHECK ───────────────────────────────────────────
      socket.on('cancel_ready_check', ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId)
        if (!room || !room.readyCheck?.active) return
        const sender = room.participants.find(p => p.socketId === socket.id && p.connected)
        if (!sender) return
        if (sender.role !== 'admin' && !sender.role.startsWith('player_')) return
        room.readyCheck = null
        rooms.set(roomId, room)
        io.to(roomId).emit('ready_check_update', null)
        io.to(roomId).emit('ready_check_cancelled', { cancelledBy: sender.name })
      })

      // ── HOVER CHAMPION ───────────────────────────────────────────────
      socket.on('hover_champion', ({
        roomId, championKey, championName,
      }: { roomId: string; championKey: string | null; championName: string | null }) => {
        const room = rooms.get(roomId)
        if (!room || !room.started || room.finished) return
        if (socket.data.role !== room.activePlayerRole) return
        room.hoveredChampionKey = championKey
        room.hoveredChampionName = championName
        room.hoveredTeam = room.activeTeam
        rooms.set(roomId, room)
        io.to(roomId).emit('hover_update', { championKey, championName, team: room.activeTeam })
      })

      // ── LOCK CHAMPION ────────────────────────────────────────────────
      socket.on('lock_champion', ({
        roomId, championId, championKey, championName,
      }: { roomId: string; championId: number; championKey: string; championName: string }) => {
        const room = rooms.get(roomId)
        if (!room || !room.started || room.finished) return
        // In solo mode, admin can lock for any slot
        const isSoloAdmin = SOLO_MODE && socket.data.role === 'admin'
        if (!isSoloAdmin && socket.data.role !== room.activePlayerRole) {
          socket.emit('error_msg', { message: 'No es tu turno' }); return
        }
        if (getUsedChampionIds(room).has(championId)) {
          socket.emit('error_msg', { message: 'Campeón ya seleccionado en este draft' }); return
        }
        // Fearless: block champs that were PLAYED (picked) in a previous game.
        // Banned champs in previous games are still available.
        if (room.mode === 'fearless' && room.fearlessBannedChampionIds.includes(championId)) {
          socket.emit('error_msg', { message: 'Fearless: este campeón ya fue jugado en una partida anterior' }); return
        }
        if (timers.has(roomId)) { clearInterval(timers.get(roomId)!); timers.delete(roomId) }
        const updated = applySelection(room, championId, championKey, championName)
        rooms.set(roomId, updated)
        io.to(roomId).emit('draft_update', updated)
        if (!updated.finished) startTimer(roomId)
      })

      // ── KICK PLAYER ──────────────────────────────────────────────────
      socket.on('kick_player', ({
        roomId, targetSocketId,
      }: { roomId: string; targetSocketId: string }) => {
        const room = rooms.get(roomId)
        if (!room) return
        const target = room.participants.find(p => p.socketId === targetSocketId)
        if (!target || targetSocketId === socket.id) return
        const senderRole = socket.data.role as string
        let shouldKick = false

        if (room.creatorSocketId === socket.id || senderRole === 'admin') {
          shouldKick = true
        } else {
          const senderTeam = getTeamOfRole(senderRole)
          const targetTeam = getTeamOfRole(target.role)
          if (senderTeam && senderTeam === targetTeam) {
            if (!room.kickVotes[targetSocketId]) room.kickVotes[targetSocketId] = []
            if (!room.kickVotes[targetSocketId].includes(socket.id)) {
              room.kickVotes[targetSocketId].push(socket.id)
            }
            const teammates = room.participants.filter(p =>
              p.connected && p.socketId !== targetSocketId && getTeamOfRole(p.role) === senderTeam
            )
            const required = Math.min(Math.ceil(teammates.length / 2) + (teammates.length <= 2 ? 1 : 0), 3)
            if (room.kickVotes[targetSocketId].length >= required) shouldKick = true
            else {
              rooms.set(roomId, room)
              io.to(roomId).emit('kick_vote_update', {
                targetSocketId, targetName: target.name,
                votes: room.kickVotes[targetSocketId].length, required,
              } as KickVoteInfo)
            }
          }
        }

        if (shouldKick) {
          const name = target.name
          room.participants = room.participants.filter(p => p.socketId !== targetSocketId)
          delete room.kickVotes[targetSocketId]
          room.canStartDraft = computeCanStart(room.participants)
          // Remove their ready vote
          if (room.readyCheck?.active) {
            room.readyCheck.readyRoles = room.readyCheck.readyRoles.filter(r => r !== target.role)
            io.to(roomId).emit('ready_check_update', room.readyCheck)
          }
          rooms.set(roomId, room)
          const kicked = io.sockets.sockets.get(targetSocketId)
          kicked?.leave(roomId)
          kicked?.emit('kicked', { message: 'Has sido expulsado de la sala' })
          broadcastParticipants(io, room)
          io.to(roomId).emit('system_message', { text: `👢 ${name} fue expulsado de la sala` })
        }
      })

      // ── CHAT ─────────────────────────────────────────────────────────
      socket.on('send_message', ({ roomId, text }: { roomId: string; text: string }) => {
        const room = rooms.get(roomId)
        if (!room) return
        const msg: ChatMessage = {
          id: `${Date.now()}-${Math.random()}`,
          authorName: socket.data.name, role: socket.data.role,
          text: text.slice(0, 500), timestamp: Date.now(),
        }
        room.chatMessages = [...room.chatMessages.slice(-100), msg]
        rooms.set(roomId, room)
        io.to(roomId).emit('new_message', msg)
      })

      // ── RESET ROOM ───────────────────────────────────────────────────
      socket.on('reset_room', ({ roomId }: { roomId: string }) => {
        const room = rooms.get(roomId)
        if (!room) return
        const sender = room.participants.find(p => p.socketId === socket.id && p.connected)
        if (!sender || (sender.role !== 'admin' && room.creatorSocketId !== socket.id)) return
        if (timers.has(roomId)) { clearInterval(timers.get(roomId)!); timers.delete(roomId) }
        const newRoom = createRoom(roomId, room.mode, room.timerMax, room.totalGames, room.creatorSocketId!)
        newRoom.participants = room.participants
        newRoom.chatMessages = room.chatMessages
        newRoom.pendingJoins = room.pendingJoins
        newRoom.canStartDraft = computeCanStart(newRoom.participants)
        if (room.mode === 'fearless') {
          newRoom.fearlessBannedChampionIds = room.fearlessBannedChampionIds
          newRoom.gameNumber = room.gameNumber + 1
        }
        rooms.set(roomId, newRoom)
        io.to(roomId).emit('draft_update', newRoom)
      })

      // ── DISCONNECT ───────────────────────────────────────────────────
      socket.on('disconnect', () => {
        const roomId = socket.data.roomId as string | undefined
        if (!roomId) return
        const room = rooms.get(roomId)
        if (!room) return

        const disconnectedParticipant = room.participants.find(p => p.socketId === socket.id)
        room.participants = room.participants.map(p =>
          p.socketId === socket.id ? { ...p, connected: false } : p
        )

        // Remove ready status so ready check pauses until they reconnect
        if (room.readyCheck?.active && disconnectedParticipant?.role.startsWith('player_')) {
          room.readyCheck.readyRoles = room.readyCheck.readyRoles.filter(
            r => r !== disconnectedParticipant.role
          )
          io.to(roomId).emit('ready_check_update', room.readyCheck)
        }

        room.canStartDraft = computeCanStart(room.participants)
        rooms.set(roomId, room)
        broadcastParticipants(io, room)
      })
    })

    res.socket.server.io = io
  }
  res.end()
}
