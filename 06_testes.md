# 06 — Testes e critérios de aceitação

Total atual: **109 testes** em 9 suítes executadas via `npm test` (Vitest, 100% gratuito e local):
- `tests/unoEngine.test.ts` (**26 testes**): regras do baralho de 108 cartas, jogabilidade, turnos, UNO, reciclagem e 2v2.
- `tests/serverIntegration.test.ts` (**19 testes**): protocolo WS v2, reconexão, segurança de sockets, JWT admin, relatório de jogador e bloqueio de fogo amigo 2v2.
- `tests/tournamentEngine.test.ts` (**22 testes**): domínio puro de torneios (permissões, distribuição, byes, Md1/Md3/Md5, desempate, W.O., reinício e simulação).
- `tests/tournamentWo.test.ts` (**19 testes**): remoção de jogador por W.O. preservando as 108 cartas, `stagedCardPlay`, índices e bloqueio em 2v2.
- `tests/tournamentIntegration.test.ts` (**5 testes**): integração real HTTP/WS de torneios (Individual + Duplas 2v2).
- `tests/tournamentStress.test.ts` (**2 testes**): progressão completa ponta a ponta em escala Individual (8/16/32) com desempates e Duplas 2v2 Md3 (4/8) com *early clinch*.
- `tests/importParser.test.ts` (**6 testes**): parser RFC-4180 CSV/TSV/texto, UTF-8 BOM, colunas reordenadas, ambiguidade de delimitador, limites de 512 KB / 200 registros e lista simples no Modo C.
- `tests/importService.test.ts` (**7 testes**): padronização de senha 4 caracteres (incluindo rejeição de `ADMIN_PIN` como senha), `displayName` obrigatório/NFKC, proveniência (`createdByImportBatchId` / `createdByImportOperationId`), privacidade zero-credencial, Modos A/B/C, bloqueio `doubles`, WAL recovery multi-item, gestão de ciclo de vida + benchmark empírico de 200 hashes `bcrypt` em Worker Thread.
- `tests/importIntegration.test.ts` (**3 testes**): autorização JWT estrita (sem PIN fallback), parser HTTP 1 MB em `/api/admin/import/*`, ciclo completo Fases 1–4 com desconexão WebSocket ao vivo (código `4003`) e bloqueio de login HTTP 403.

Scripts auxiliares de carga e torneio (sob demanda): `npm run stress`, `npm run capacity` e `npm run tournament-test`.

## Critérios de contrato
- UNO-001 a UNO-010 (Regras de baralho, cartas especiais, compra, UNO).
- SEC-001 a SEC-006 (Segurança de sockets, JWT admin, restrições).
- WS-001 a WS-005 (Idempotência, envelopes versionados).
- REC-001 a REC-005 (Reconexão segura e grace period).
- RTC-001 a RTC-004 (Sinalização e voz WebRTC).
- REG-2V2-01 a REG-2V2-06 e REG-TOR-01 a REG-TOR-06 (Modo Duplas 2v2 e Torneios).
- REG-IMP-01 a REG-IMP-09 (Importador de Usuários em Massa, WAL, Concorrência, Privacidade e Ciclo de Vida).
- REG-FREE-01 (Respeito estrito ao AI Studio Free Tier).

## Regra
Nenhuma tarefa está concluída sem rodar `npm test` e verificar que todos os testes passam com sucesso.

