# 04 — Status e Planejamento

Atualizado em: 2026-11-16 · Versão: v2.2.3 · **Respeitando AI Studio Free Tier (100% Gratuito)**

## Implementado
- Servidor autoritativo com validação das jogadas (`unoEngine.ts` + `server.ts`).
- `reconnectToken` secreto (`crypto.randomUUID()`) obrigatório na reconexão.
- Envelope `protocolVersion: 2` com idempotência por `messageId` (cache 60s).
- `hand_state` privado e suporte a espectadores (`hidden_cards` / `reveal_cards`).
- Persistência atômica em JSON local (`data/users.json`, `invites.json`, `stats.json`, `tournaments.json`) com `fsyncSync` + `renameSync`.
- Modo Kids com UNO automático (`autoUnoProtection`).
- Modo Duplas 2v2 (`team_2v2`) com assentos alternados `[A1, B1, A2, B2]`, `teammateHand` compartilhada e proteção contra fogo amigo em `catch_uno`.
- Sistema de Torneios (`tournamentEngine.ts` + `TournamentModal.tsx`): Individual e Duplas (Md1/Md3/Md5), simulação pré-início, desempates, W.O. seguro preservando invariante das 108 cartas e recuperação pós-reinício.
- Painel admin completo: gestão de usuários (`create`, `reset-password`, `delete`), convites, relatório de jogador (`/api/admin/player-report/:target`), moderação e monitor de métricas da VM (`/api/admin/vm-metrics`).
- Guia de microfone para PC em HTTP/IP (Firefox/Chrome) e guia de VM.
- Suíte de testes: **91 testes** passando em 5 arquivos (`unoEngine`: 26, `serverIntegration`: 19, `tournamentEngine`: 22, `tournamentWo`: 19, `tournamentIntegration`: 5).

## Planejamento / Backlog (v2.3 — Free Tier)
- Conversão automática para bot ou passagem de turno após 45s quando jogador desconectar em sala com `turnTimeLimit = 0`.
- Rate limiting específico por segundo para chat e sinalização ICE/WebRTC no WebSocket.
- Suporte opcional a servidor TURN self-hosted (Coturn gratuito) caso redes 4G com NAT simétrico exijam relay de voz.
- Hardening automático de permissões (`chmod 700 data/` e `chmod 600` em backups) no script de deploy.

## Próximo passo sugerido
Validar `npm test`, `npm run lint` e `npm run build` antes de qualquer alteração de funcionalidade.
