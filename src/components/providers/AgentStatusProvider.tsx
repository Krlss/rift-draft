'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react'

// ─── Types ────────────────────────────────────────────────────────────────
export interface LivePlayer {
  summonerName: string
  championName: string
  level: number
  kills: number
  deaths: number
  assists: number
  cs: number
  position: string
  team: 'ORDER' | 'CHAOS'
  isDead: boolean
  items: unknown[]
  skinID: number
  summonerSpells: unknown
  runes: unknown
}

export interface LiveGameData {
  activePlayer: {
    summonerName: string
    level: number
    currentGold: number
    championStats: Record<string, number>
  }
  players: LivePlayer[]
  gameData: {
    gameMode: string
    gameTime: number
    mapName: string
  }
  events: { Events: unknown[] }
  timestamp: number
}

export interface ChampSelectData {
  myTeam: unknown[]
  theirTeam: unknown[]
  actions: unknown[][]
  localPlayerCellId: number
  timer: unknown
  localSummoner: unknown
  timestamp: number
}

interface AgentStatus {
  agentConnected: boolean
  lolClientConnected: boolean
  gamePhase: string
  champSelectData: ChampSelectData | null
  liveGameData: LiveGameData | null
}

interface AgentStatusContextValue extends AgentStatus {
  reconnect: () => void
}

// ─── Context ──────────────────────────────────────────────────────────────
const AgentStatusContext = createContext<AgentStatusContextValue>({
  agentConnected: false,
  lolClientConnected: false,
  gamePhase: 'None',
  champSelectData: null,
  liveGameData: null,
  reconnect: () => {},
})

export function useAgentStatus() {
  return useContext(AgentStatusContext)
}

// ─── Provider ─────────────────────────────────────────────────────────────
export default function AgentStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AgentStatus>({
    agentConnected: false,
    lolClientConnected: false,
    gamePhase: 'None',
    champSelectData: null,
    liveGameData: null,
  })

  const [ws, setWs] = useState<WebSocket | null>(null)

  const connect = useCallback(() => {
    // Only in browser
    if (typeof window === 'undefined') return

    const socket = new WebSocket('ws://127.0.0.1:8765')

    socket.onopen = () => {
      console.log('[WS] Connected to LoL Stats Agent')
      setStatus((prev) => ({ ...prev, agentConnected: true }))
    }

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        handleMessage(message)
      } catch (e) {
        console.error('[WS] Failed to parse message', e)
      }
    }

    socket.onclose = () => {
      console.log('[WS] Disconnected from LoL Stats Agent')
      setStatus((prev) => ({
        ...prev,
        agentConnected: false,
        lolClientConnected: false,
        gamePhase: 'None',
        liveGameData: null,
      }))
      // Auto-reconnect after 5 seconds
      setTimeout(connect, 5000)
    }

    socket.onerror = () => {
      socket.close()
    }

    setWs(socket)
    return socket
  }, [])

  function handleMessage(msg: { type: string; payload: unknown }) {
    switch (msg.type) {
      case 'INITIAL_STATE': {
        const p = msg.payload as {
          lolClientConnected: boolean
          inChampSelect: boolean
          inGame: boolean
          champSelectData: ChampSelectData | null
          liveGameData: LiveGameData | null
        }
        setStatus((prev) => ({
          ...prev,
          lolClientConnected: p.lolClientConnected,
          gamePhase: p.inGame ? 'InProgress' : p.inChampSelect ? 'ChampSelect' : 'None',
          champSelectData: p.champSelectData,
          liveGameData: p.liveGameData,
        }))
        break
      }
      case 'LCU_CONNECTED':
        setStatus((prev) => ({ ...prev, lolClientConnected: true }))
        break
      case 'LCU_DISCONNECTED':
        setStatus((prev) => ({
          ...prev,
          lolClientConnected: false,
          gamePhase: 'None',
          champSelectData: null,
          liveGameData: null,
        }))
        break
      case 'CHAMP_SELECT_UPDATE':
        setStatus((prev) => ({
          ...prev,
          gamePhase: 'ChampSelect',
          champSelectData: msg.payload as ChampSelectData,
        }))
        break
      case 'CHAMP_SELECT_END':
        setStatus((prev) => ({
          ...prev,
          gamePhase: 'None',
          champSelectData: null,
        }))
        break
      case 'GAME_PHASE_CHANGE':
        setStatus((prev) => ({
          ...prev,
          gamePhase: (msg.payload as { phase: string }).phase,
        }))
        break
      case 'LIVE_GAME_UPDATE':
        setStatus((prev) => ({
          ...prev,
          liveGameData: msg.payload as LiveGameData,
        }))
        break
    }
  }

  useEffect(() => {
    const socket = connect()
    return () => {
      socket?.close()
    }
  }, [connect])

  const reconnect = useCallback(() => {
    ws?.close()
  }, [ws])

  return (
    <AgentStatusContext.Provider value={{ ...status, reconnect }}>
      {children}
    </AgentStatusContext.Provider>
  )
}
