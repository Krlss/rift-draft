// Riot Games API client — server-side only
// API Key stored in .env.local as RIOT_API_KEY

const API_KEY = process.env.RIOT_API_KEY || ''
const REGION_URL: Record<string, string> = {
  na1: 'https://na1.api.riotgames.com',
  euw1: 'https://euw1.api.riotgames.com',
  kr: 'https://kr.api.riotgames.com',
  la1: 'https://la1.api.riotgames.com',
  la2: 'https://la2.api.riotgames.com',
}

const ROUTING_URL: Record<string, string> = {
  na1: 'https://americas.api.riotgames.com',
  euw1: 'https://europe.api.riotgames.com',
  kr: 'https://asia.api.riotgames.com',
  la1: 'https://americas.api.riotgames.com',
  la2: 'https://americas.api.riotgames.com',
}

async function riotFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'X-Riot-Token': API_KEY,
    },
    next: { revalidate: 300 }, // Cache for 5 minutes
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Riot API error ${res.status}: ${text}`)
  }

  return res.json()
}

// ─── Summoner ─────────────────────────────────────────────────────────────
export async function getSummonerByName(summonerName: string, region = 'la2') {
  const base = REGION_URL[region] || REGION_URL.la2
  return riotFetch(
    `${base}/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}?api_key=${API_KEY}`
  ) as Promise<{
    id: string
    accountId: string
    puuid: string
    name: string
    profileIconId: number
    summonerLevel: number
  }>
}

export async function getSummonerByPuuid(puuid: string, region = 'la2') {
  const base = REGION_URL[region] || REGION_URL.la2
  return riotFetch(
    `${base}/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${API_KEY}`
  ) as Promise<{ id: string; name: string; profileIconId: number; summonerLevel: number }>
}

// ─── Ranked Stats ─────────────────────────────────────────────────────────
export interface RankedEntry {
  leagueId: string
  queueType: string
  tier: string
  rank: string
  summonerId: string
  summonerName: string
  leaguePoints: number
  wins: number
  losses: number
  veteran: boolean
  inactive: boolean
  freshBlood: boolean
  hotStreak: boolean
}

export async function getRankedStats(summonerId: string, region = 'la2'): Promise<RankedEntry[]> {
  const base = REGION_URL[region] || REGION_URL.la2
  return riotFetch(
    `${base}/lol/league/v4/entries/by-summoner/${summonerId}?api_key=${API_KEY}`
  ) as Promise<RankedEntry[]>
}

// ─── Champion Mastery ─────────────────────────────────────────────────────
export interface ChampionMastery {
  championId: number
  championLevel: number
  championPoints: number
  lastPlayTime: number
  championPointsSinceLastLevel: number
  championPointsUntilNextLevel: number
  chestGranted: boolean
  tokensEarned: number
  summonerId: string
}

export async function getTopMastery(summonerId: string, region = 'la2', count = 10): Promise<ChampionMastery[]> {
  const base = REGION_URL[region] || REGION_URL.la2
  return riotFetch(
    `${base}/lol/champion-mastery/v4/champion-masteries/by-summoner/${summonerId}/top?count=${count}&api_key=${API_KEY}`
  ) as Promise<ChampionMastery[]>
}

export async function getMasteryForChampion(summonerId: string, championId: number, region = 'la2'): Promise<ChampionMastery> {
  const base = REGION_URL[region] || REGION_URL.la2
  return riotFetch(
    `${base}/lol/champion-mastery/v4/champion-masteries/by-summoner/${summonerId}/by-champion/${championId}?api_key=${API_KEY}`
  ) as Promise<ChampionMastery>
}

// ─── Live Game ────────────────────────────────────────────────────────────
export interface LiveGameParticipant {
  teamId: number
  spell1Id: number
  spell2Id: number
  championId: number
  profileIconId: number
  summonerName: string
  bot: boolean
  summonerId: string
  gameCustomizationObjects: unknown[]
  perks: unknown
}

export interface LiveGameData {
  gameId: number
  gameType: string
  gameStartTime: number
  mapId: number
  gameLength: number
  platformId: string
  gameMode: string
  gameQueueConfigId: number
  participants: LiveGameParticipant[]
  bannedChampions: { pickTurn: number; championId: number; teamId: number }[]
}

export async function getLiveGame(summonerId: string, region = 'la2'): Promise<LiveGameData | null> {
  try {
    const base = REGION_URL[region] || REGION_URL.la2
    return await riotFetch(
      `${base}/lol/spectator/v5/active-games/by-summoner/${summonerId}?api_key=${API_KEY}`
    ) as Promise<LiveGameData>
  } catch {
    return null // Player not in game
  }
}

// ─── Match History ────────────────────────────────────────────────────────
export async function getMatchIds(puuid: string, region = 'la2', count = 20, queue?: number): Promise<string[]> {
  const routing = ROUTING_URL[region] || ROUTING_URL.la2
  const queueParam = queue ? `&queue=${queue}` : ''
  return riotFetch(
    `${routing}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}${queueParam}&api_key=${API_KEY}`
  ) as Promise<string[]>
}

export async function getMatch(matchId: string, region = 'la2'): Promise<unknown> {
  const routing = ROUTING_URL[region] || ROUTING_URL.la2
  return riotFetch(
    `${routing}/lol/match/v5/matches/${matchId}?api_key=${API_KEY}`
  )
}

// ─── Champion Data (Data Dragon) ──────────────────────────────────────────
const DDRAGON_VERSION = '14.12.1'

export interface ChampionData {
  id: string
  key: string
  name: string
  title: string
  blurb: string
  info: { attack: number; defense: number; magic: number; difficulty: number }
  image: { full: string; sprite: string; group: string }
  tags: string[]
  partype: string
  stats: Record<string, number>
}

let championCache: Record<string, ChampionData> | null = null

export async function getAllChampions(): Promise<Record<string, ChampionData>> {
  if (championCache) return championCache

  const res = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/es_MX/champion.json`,
    { next: { revalidate: 86400 } } // Cache 24 hours
  )
  const data = await res.json() as { data: Record<string, ChampionData> }
  championCache = data.data
  return championCache
}

export async function getChampionById(id: number): Promise<ChampionData | undefined> {
  const all = await getAllChampions()
  return Object.values(all).find((c) => parseInt(c.key) === id)
}

// ─── Rank utilities ───────────────────────────────────────────────────────
export function formatRank(entry: RankedEntry | undefined): string {
  if (!entry) return 'Sin rankear'
  return `${entry.tier} ${entry.rank} ${entry.leaguePoints}LP`
}

export function getRankColor(tier: string): string {
  const colors: Record<string, string> = {
    IRON: '#5a5a5a',
    BRONZE: '#8c6239',
    SILVER: '#8fa3b2',
    GOLD: '#c89b3c',
    PLATINUM: '#00c0a0',
    EMERALD: '#00a86b',
    DIAMOND: '#576ace',
    MASTER: '#9b59b6',
    GRANDMASTER: '#e74c3c',
    CHALLENGER: '#f1c40f',
  }
  return colors[tier] || '#888'
}

export function getRankIcon(tier: string): string {
  const icons: Record<string, string> = {
    IRON: '⚫',
    BRONZE: '🟤',
    SILVER: '⚪',
    GOLD: '🟡',
    PLATINUM: '🔵',
    EMERALD: '💚',
    DIAMOND: '💎',
    MASTER: '🔮',
    GRANDMASTER: '👑',
    CHALLENGER: '🏆',
  }
  return icons[tier] || '❓'
}
