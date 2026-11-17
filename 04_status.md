# 04 — Status e Planejamento

Atualizado em: 2026-11-16 · Versão: v2.2.3 · **Respeitando AI Studio Free Tier (100% Gratuito)**

## Implementado
- Servidor autoritativo com validação das jogadas (`unoEngine.ts` + `server.ts`).
- `reconnectToken` secreto (`crypto.randomUUID()`) obrigatório na reconexão.
- Envelope `protocolVersion: 2` com idempotência por `messageId` (cache 60s).
- `hand_state` privado e suporte a espectadores (`hidden_cards` / `reveal_cards`).
- Persistência atômica sincronizada em JSON local (`data/users.json`, `invites.json`, `stats.json`, `tournaments.json`, `import_batches.json`) com `fsyncSync` + `renameSync` + lock `data/.kawihe.lock` (`server/dataLock.ts`).
- Modo Kids com UNO automático (`autoUnoProtection`).
- Modo Duplas 2v2 (`team_2v2`) com assentos alternados `[A1, B1, A2, B2]`, `teammateHand` compartilhada e proteção contra fogo amigo em `catch_uno`.
- Sistema de Torneios (`tournamentEngine.ts` + `TournamentModal.tsx`): Individual e Duplas (Md1/Md3/Md5), simulação pré-início, desempates, W.O. seguro preservando invariante das 108 cartas e recuperação pós-reinício.
- **Importador de Usuários em Massa (Fases 1 a 4 — `AdminImportPanel.tsx` + `AdminImportHistoryPanel.tsx` + `server/importService.ts`):**
  - Upload CSV / colagem com parser RFC-4180 (`server/importParser.ts`), limite de 512 KB e 200 registros, senha mínima padronizada em **4 caracteres**, `displayName` obrigatório e único (NFKC), `role` forçado como `'player'`.
  - Modos `create_only`, `create_and_enroll` e `enroll_existing` (com bloqueio explícito para torneios `doubles` na V1).
  - Hashing `bcrypt` (rounds=10) em `worker_threads` nativa (benchmark empírico de 200 registros: ~20,6s total com **lag médio de Event Loop de ~10,6ms**, mantendo WebSockets sem jitter).
  - Consistência WAL entre `users.json`, `tournaments.json` e `import_batches.json` com reconciliação automática (`reconcileIncompleteImportBatches`).
  - Ciclo de vida de contas (`active` | `disabled` | `archived`) com bloqueio em login/JWT/WS (close `4003`), preview de impacto e exclusão segura apenas sem dependências históricas.
- Painel admin completo: gestão de usuários (`create`, `reset-password`, `delete`, importação em massa), convites, relatório de jogador (`/api/admin/player-report/:target`), moderação e monitor de métricas da VM (`/api/admin/vm-metrics`).
- Ferramenta de simulação e teste automatizado de torneios de ponta a ponta (`scripts/tournament-test.mjs` / `npm run tournament-test`) com suporte a Individual e Duplas 2v2, provisionamento de contas de teste JWT, partidas em tempo real via WebSocket, desempates e telemetria de VM.
- Guia de microfone para PC em HTTP/IP (Firefox/Chrome) e guia de VM.
- Suíte de testes: **106 testes** passando em 8 arquivos (`unoEngine`: 26, `serverIntegration`: 19, `tournamentEngine`: 22, `tournamentWo`: 19, `tournamentIntegration`: 5, `importParser`: 6, `importService`: 6, `importIntegration`: 3).

## Planejamento / Backlog (v2.3 — Free Tier)
- Evolução futura do Importador: suporte a importação de equipes para torneios `doubles` (`username;displayName;password;teamName`), exportação de metadados de lote sem credenciais e senha temporária com troca obrigatória no primeiro login.
- Conversão automática para bot ou passagem de turno após 45s quando jogador desconectar em sala com `turnTimeLimit = 0`.
- Rate limiting específico por segundo para chat e sinalização ICE/WebRTC no WebSocket.
- Suporte opcional a servidor TURN self-hosted (Coturn gratuito) caso redes 4G com NAT simétrico exijam relay de voz.
- Hardening automático de permissões (`chmod 700 data/` e `chmod 600` em backups) no script de deploy.

## Próximo passo sugerido
Validar `npm test`, `npm run lint` e `npm run build` antes de qualquer alteração de funcionalidade.

