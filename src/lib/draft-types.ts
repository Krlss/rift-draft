// ─── Shared types and constants between server (socket.ts) and client (draft/page.tsx) ─
// This file must ONLY contain types and plain data — no Node.js/browser APIs

export type DraftRole =
  | 'player_blue_1' | 'player_blue_2' | 'player_blue_3' | 'player_blue_4' | 'player_blue_5'
  | 'player_red_1' | 'player_red_2' | 'player_red_3' | 'player_red_4' | 'player_red_5'
  | 'coach_blue' | 'coach_red' | 'spectator'
  | 'admin' // Room administrator — can kick, start draft, no picks/bans

export type DraftMode = 'standard' | 'fearless'
export type ActionType = 'ban' | 'pick'
export type Team = 'blue' | 'red'

export interface DraftAction {
  type: ActionType
  team: Team
  position: number
}

// Standard competitive draft order (20 total steps)
export const STANDARD_DRAFT_ORDER: DraftAction[] = [
  // Phase 1: 6 bans (3 per team, alternating)
  { type: 'ban',  team: 'blue', position: 0 },
  { type: 'ban',  team: 'red',  position: 0 },
  { type: 'ban',  team: 'blue', position: 1 },
  { type: 'ban',  team: 'red',  position: 1 },
  { type: 'ban',  team: 'blue', position: 2 },
  { type: 'ban',  team: 'red',  position: 2 },
  // Phase 1: picks
  { type: 'pick', team: 'blue', position: 0 },
  { type: 'pick', team: 'red',  position: 0 },
  { type: 'pick', team: 'red',  position: 1 },
  { type: 'pick', team: 'blue', position: 1 },
  { type: 'pick', team: 'blue', position: 2 },
  { type: 'pick', team: 'red',  position: 2 },
  // Phase 2: 4 bans (2 per team)
  { type: 'ban',  team: 'red',  position: 3 },
  { type: 'ban',  team: 'blue', position: 3 },
  { type: 'ban',  team: 'red',  position: 4 },
  { type: 'ban',  team: 'blue', position: 4 },
  // Phase 2: picks
  { type: 'pick', team: 'red',  position: 3 },
  { type: 'pick', team: 'blue', position: 3 },
  { type: 'pick', team: 'blue', position: 4 },
  { type: 'pick', team: 'red',  position: 4 },
]

// Each action's position maps directly to the player number (position + 1 → player 1-5)
export function getActivePlayerRole(step: number): string | null {
  const action = STANDARD_DRAFT_ORDER[step]
  if (!action) return null
  return `player_${action.team}_${action.position + 1}`
}

export interface DraftSlot {
  championId: number | null
  championKey: string | null   // DDragon internal ID (e.g., "Bard") — for image URLs
  championName: string | null  // Display name (e.g., "Bardo")
  locked: boolean
}

export interface ChatMessage {
  id: string
  authorName: string
  role: DraftRole
  text: string
  timestamp: number
}

export interface Participant {
  socketId: string
  name: string
  role: DraftRole
  connected: boolean
}

export interface CoachNote {
  id: string
  authorName: string
  team: Team
  text: string
  step: number
  timestamp: number
}

export interface KickVoteInfo {
  targetSocketId: string
  targetName: string
  votes: number
  required: number
}

/** Pending join request — waiting for approval */
export interface JoinRequest {
  id: string
  socketId: string
  name: string
  role: DraftRole
  timestamp: number
}

/** State of the ready-check phase before draft starts */
export interface ReadyCheckState {
  active: boolean
  readyRoles: string[]   // roles (e.g. 'player_blue_1') that confirmed ready
  timeoutAt: number      // unix-ms timestamp for countdown display
}

export interface DraftState {
  roomId: string
  mode: DraftMode
  currentStep: number
  blueBans: DraftSlot[]
  redBans: DraftSlot[]
  bluePicks: DraftSlot[]
  redPicks: DraftSlot[]
  hoveredChampionKey: string | null
  hoveredChampionName: string | null
  hoveredTeam: Team | null
  timer: number | null
  timerMax: number
  isTimerRunning: boolean
  started: boolean
  finished: boolean
  fearlessBannedChampionIds: number[]
  activeTeam: Team
  activeActionType: ActionType
  activePlayerRole: string | null
  gameNumber: number
  totalGames: number
  chatMessages: ChatMessage[]
  participants: Participant[]
  coachNotes: CoachNote[]
  creatorSocketId: string | null
  kickVotes: Record<string, string[]>
  canStartDraft: boolean
  pendingJoins: JoinRequest[]
  readyCheck: ReadyCheckState | null
}
