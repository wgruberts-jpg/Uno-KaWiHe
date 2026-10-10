# 03 — Arquitetura

## Visão
```
Navegador (React 19 + Vite + Tailwind)
   │  WebSocket (jogo, chat, sinalização)      │ HTTP (login, cadastro, /api/admin/*)
   ▼                                           ▼
Servidor Node/Express/TypeScript  ── motor UNO (unoEngine) ── persistência JSON local (data/)
   ▲
   └── WebRTC P2P (voz) entre navegadores; servidor só retransmite a sinalização
Ambiente 100% gratuito (AI Studio Free Tier) / Docker opcional.
```

## Módulos
| Módulo | Responsabilidade |
|---|---|
| `unoEngine.ts` | Regras do jogo, único motor (humanos e bots) |
| `server.ts` | HTTP, WebSocket, salas, rate limit, idempotência |
| `authService.ts` | Usuários, convites, JWT, bcrypt |
| `types/uno.ts` | Tipos compartilhados |
| `voiceChat.ts` | WebRTC no cliente (voz P2P) |
| Persistência | Escrita atômica de users/invites/stats em `./data/` |

## Segurança
JWT com `role`, rate limit composto, bcrypt, `JWT_SECRET` obrigatório, persistência local em arquivos JSON atômicos (sem custos externos).
