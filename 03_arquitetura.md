# 03 — Arquitetura

## Visão
```
Navegador (React 19 + Vite + Tailwind)
   │  WebSocket (jogo, chat, sinalização)      │ HTTP (login, cadastro, /api/admin/*)
   ▼                                           ▼
Servidor Node/Express/TypeScript  ── unoEngine + tournamentEngine ── persistência JSON local (data/)
   ▲
   └── WebRTC P2P (voz) entre navegadores; servidor só retransmite a sinalização
Ambiente 100% gratuito (AI Studio Free Tier) / Docker opcional.
```

## Módulos
| Módulo | Responsabilidade |
|---|---|
| `server/unoEngine.ts` | Regras do jogo UNO, modo 2v2, W.O. seguro e bots |
| `server/tournamentEngine.ts` | Domínio puro e determinístico de torneios (Individual e Duplas) |
| `server/authService.ts` | Usuários (`UserRecord`), convites (`InviteCode`), JWT, bcrypt |
| `server.ts` | HTTP, WebSocket v2, salas, torneios, rate limit, idempotência |
| `src/types/uno.ts` | Tipos compartilhados entre servidor e cliente |
| `src/services/voiceChat.ts` | WebRTC no cliente (voz P2P) |
| Persistência (`./data/`) | Escrita atômica (`fsync` + `rename`) de `users.json`, `invites.json`, `stats.json`, `tournaments.json` |

## Estrutura dos Dados (`./data/`)
- **`users.json`** (`UserRecord[]`): `id`, `username`, `passwordHash`, `displayName`, `avatar`, `role`, `tag`, `createdAt`.
- **`invites.json`** (`InviteCode[]`): `code`, `createdBy`, `createdAt`, `expiresAt`, `maxUses`, `usedCount`, `usedBy`, `status`.
- **`stats.json`**: mapa indexado por usuário com `PlayerCareerStats`.
- **`tournaments.json`**: lista persistida de torneios, inscrições, rodadas e jogos.

## Segurança
JWT com `role`, rate limit composto, bcrypt, `JWT_SECRET` via ambiente em produção, persistência local em arquivos JSON atômicos (sem banco pago ou custos externos).
