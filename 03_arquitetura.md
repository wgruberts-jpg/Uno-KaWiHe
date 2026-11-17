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
| `server/authService.ts` | Usuários (`UserRecord` + `status`), convites (`InviteCode`), JWT, bcrypt |
| `server/dataLock.ts` | Escrita atômica (`fsync` + `rename`), mutex FIFO e file lock `data/.kawihe.lock` |
| `server/importParser.ts` | Parser RFC-4180 CSV/TSV/texto (512 KB / 200 registros, auto-detecção de delimitador) |
| `server/importService.ts` | Importador em massa, `worker_threads` bcrypt, WAL/reconciliação, ciclo de vida e impacto |
| `server.ts` | HTTP (parser 1 MB em `/api/admin/import/*`), WS v2, salas, torneios, rate limit |
| `src/types/uno.ts` | Tipos compartilhados entre servidor e cliente |
| `src/services/voiceChat.ts` | WebRTC no cliente (voz P2P) |
| Persistência (`./data/`) | Escrita atômica sincronizada em `users.json`, `invites.json`, `stats.json`, `tournaments.json`, `import_batches.json` |

## Estrutura dos Dados (`./data/`)
- **`users.json`** (`UserRecord[]`): `id`, `username`, `passwordHash`, `displayName`, `avatar`, `role`, `tag`, `createdAt`, `status` (`active` \| `disabled` \| `archived`), `statusUpdatedAt`, `statusReason`, `createdByImportBatchId`, `createdByImportOperationId`.
- **`invites.json`** (`InviteCode[]`): `code`, `createdBy`, `createdAt`, `expiresAt`, `maxUses`, `usedCount`, `usedBy`, `status`.
- **`stats.json`**: mapa indexado por usuário com `PlayerCareerStats`.
- **`tournaments.json`**: lista persistida de torneios, inscrições, rodadas e jogos.
- **`import_batches.json`** (`ImportBatch[]`): metadados de lotes, máquina de estados WAL (`running`, `completed`, `failed`, `partial`, `reconciling`), resumo, itens rastreados (`relationType`, `userOpStatus`, `enrollOpStatus`, `outcome`), `stepsCompleted` e `auditTrail` — sem senhas ou hashes.

## Segurança
JWT com `role` (JWT estrito sem PIN fallback em `/api/admin/import/*`, `/api/tournaments/*` e `/api/auth/login`), `/api/admin/cli-status` protegido, rate limit composto por falhas, bcrypt em Worker Thread para lotes, `JWT_SECRET` via ambiente em produção, lock multi-processo `data/.kawihe.lock` e persistência local em JSON atômico (sem banco pago ou custos externos).

