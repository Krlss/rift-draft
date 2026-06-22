// Data Dragon utilities — champion images, item images, etc.
// No API key needed, all public assets

const DATA_DRAGON_VERSION = '14.12.1'
const BASE_URL = `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}`

export const DDragon = {
  // Champion square portrait
  championPortrait: (championName: string) =>
    `${BASE_URL}/img/champion/${championName}.png`,

  // Champion splash art (loading screen)
  championSplash: (championName: string, skinNum = 0) =>
    `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championName}_${skinNum}.jpg`,

  // Champion loading screen tile
  championLoading: (championName: string, skinNum = 0) =>
    `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${championName}_${skinNum}.jpg`,

  // Item icon
  itemIcon: (itemId: number) =>
    `${BASE_URL}/img/item/${itemId}.png`,

  // Summoner spell icon
  spellIcon: (spellName: string) =>
    `${BASE_URL}/img/spell/${spellName}.png`,

  // Rune icon
  runeIcon: (iconPath: string) =>
    `https://ddragon.leagueoflegends.com/cdn/img/${iconPath}`,

  // Profile icon
  profileIcon: (iconId: number) =>
    `${BASE_URL}/img/profileicon/${iconId}.png`,

  // Champion centered crop (1215×717, used in collection/client overview)
  championCentered: (championName: string, skinNum = 0) => {
    // Some champions have different file names on the CDN for centered art
    const centeredExceptions: Record<string, string> = {
      'Fiddlesticks': 'FiddleSticks',  // CDN still uses old capitalization
      'Nunu':         'Nunu',           // Nunu & Willump → Nunu
    }
    const cdnName = centeredExceptions[championName] ?? championName
    return `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${cdnName}_${skinNum}.jpg`
  },
}

// Map internal champion name to display name and vice-versa
export function normalizeChampionName(name: string): string {
  const exceptions: Record<string, string> = {
    // Spanish display names → DDragon internal key
    "Bardo": "Bard",
    "Fuego Fatuo": "WillowWisp",
    // English exceptions
    "Aurelion Sol": "AurelionSol",
    "Bel'Veth": "Belveth",
    "Cho'Gath": "Chogath",
    "Dr. Mundo": "DrMundo",
    "Jarvan IV": "JarvanIV",
    "Kai'Sa": "Kaisa",
    "Kha'Zix": "Khazix",
    "Kog'Maw": "KogMaw",
    "LeBlanc": "Leblanc",
    "Lee Sin": "LeeSin",
    "Master Yi": "MasterYi",
    "Miss Fortune": "MissFortune",
    "Nunu & Willump": "Nunu",
    "Nunu y Willump": "Nunu",
    "Rek'Sai": "RekSai",
    "Renata Glasc": "Renata",
    "Tahm Kench": "TahmKench",
    "Twisted Fate": "TwistedFate",
    "Vel'Koz": "Velkoz",
    "Wukong": "MonkeyKing",
    "Xin Zhao": "XinZhao",
    "K'Sante": "KSante",
    "Briar": "Briar",
  }
  return exceptions[name] || name.replace(/[^a-zA-Z0-9]/g, '')
}

export function formatGameTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatKDA(kills: number, deaths: number, assists: number): string {
  const kda = deaths === 0 ? (kills + assists) : (kills + assists) / deaths
  return kda.toFixed(2)
}

export const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const
export type Position = typeof POSITIONS[number]

export const POSITION_LABELS: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungla',
  MIDDLE: 'Mid',
  BOTTOM: 'Bot',
  UTILITY: 'Support',
}

export const POSITION_ICONS: Record<string, string> = {
  TOP:     'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top.png',
  JUNGLE:  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle.png',
  MIDDLE:  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png',
  BOTTOM:  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png',
  UTILITY: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png',
}

/** Ordered array matching POSITION_NAMES order [Top, Jungla, Mid, Bot, Support] */
export const POSITION_ICON_URLS = [
  POSITION_ICONS.TOP,
  POSITION_ICONS.JUNGLE,
  POSITION_ICONS.MIDDLE,
  POSITION_ICONS.BOTTOM,
  POSITION_ICONS.UTILITY,
]
