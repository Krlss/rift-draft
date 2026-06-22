# Rift Draft 🎯

> Simulador de draft competitivo multijugador para League of Legends — estándar y Fearless Draft.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-white?logo=socket.io&logoColor=black)](https://socket.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)

## ✨ Características

- 🏆 **Draft estándar** — flujo competitivo completo (6 bans por equipo, 5 picks)
- 💀 **Fearless Draft** — los campeones jugados no pueden repetirse en partidas siguientes
- 🎥 **Modo Stream** — overlay fullscreen para OBS/transmisiones
- 🔐 **Links de invitación encriptados** — comparte sin revelar el código de sala en cámara
- 👥 **Multijugador en tiempo real** — hasta 10 jugadores + espectadores + coaches
- ⚡ **Ready Check** — confirmación de conexión antes de iniciar
- 💬 **Chat integrado** — comunicación en tiempo real dentro de la sala
- 🔇 **Modo streamer** — código de sala oculto por defecto

## 🚀 Instalación

```bash
# Clonar repositorio
git clone https://github.com/Krlss/rift-draft.git
cd rift-draft

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local si es necesario

# Iniciar en desarrollo
npm run dev
```

Abre [http://localhost:3000/draft](http://localhost:3000/draft) en tu navegador.

## ⚙️ Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `NEXT_PUBLIC_SOLO_MODE` | Permite a un admin controlar todos los slots (desarrollo) | `false` |
| `RIOT_API_KEY` | Clave Riot API (no requerida para el draft) | — |

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org) (App Router)
- **WebSockets**: [Socket.IO](https://socket.io)
- **Lenguaje**: TypeScript
- **Estilos**: CSS Modules + Variables CSS custom
- **Assets**: [Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) (público, sin API key)

## 📋 Reglas — Fearless Draft

En el modo Fearless:
- Un campeón **baneado** puede volver a ser baneado o pickeado en partidas siguientes ✅
- Un campeón **jugado (pick)** queda bloqueado para el resto de la serie 🚫

## 📄 Licencia

MIT — Rift Draft no está afiliado ni respaldado por Riot Games.  
*League of Legends es marca registrada de Riot Games, Inc.*
