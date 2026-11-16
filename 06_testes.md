# 06 — Testes e critérios de aceitação

Total atual: **91 testes** em 5 suítes executadas via `npm test` (Vitest, 100% gratuito e local):
- `tests/unoEngine.test.ts` (**26 testes**): regras do baralho de 108 cartas, jogabilidade, turnos, UNO, reciclagem e 2v2.
- `tests/serverIntegration.test.ts` (**19 testes**): protocolo WS v2, reconexão, segurança de sockets, JWT admin, relatório de jogador e bloqueio de fogo amigo 2v2.
- `tests/tournamentEngine.test.ts` (**22 testes**): domínio puro de torneios (permissões, distribuição, byes, Md1/Md3/Md5, desempate, W.O., reinício e simulação).
- `tests/tournamentWo.test.ts` (**19 testes**): remoção de jogador por W.O. preservando as 108 cartas, `stagedCardPlay`, índices e bloqueio em 2v2.
- `tests/tournamentIntegration.test.ts` (**5 testes**): integração real HTTP/WS de torneios (Individual + Duplas 2v2).

Scripts auxiliares de carga (sob demanda): `npm run stress` e `npm run capacity`.

## Critérios de contrato
- UNO-001 a UNO-010 (Regras de baralho, cartas especiais, compra, UNO).
- SEC-001 a SEC-006 (Segurança de sockets, JWT admin, restrições).
- WS-001 a WS-005 (Idempotência, envelopes versionados).
- REC-001 a REC-005 (Reconexão segura e grace period).
- RTC-001 a RTC-004 (Sinalização e voz WebRTC).
- REG-2V2-01 a REG-2V2-06 e REG-TOR-01 a REG-TOR-06 (Modo Duplas 2v2 e Torneios).
- REG-FREE-01 (Respeito estrito ao AI Studio Free Tier).

## Regra
Nenhuma tarefa está concluída sem rodar `npm test` e verificar que todos os testes passam com sucesso.
