# 06 — Testes e critérios de aceitação

Total declarado: **42** = 24 unitários do motor + 18 de integração/segurança/relatórios admin.
Comando para rodar: `npm test` (via Vitest, 100% gratuito e local).

## Critérios de contrato
- UNO-001 a UNO-010 (Regras de baralho, cartas especiais, compra, UNO).
- SEC-001 a SEC-007 (Segurança de sockets, JWT admin, restrições).
- WS-001 a WS-005 (Idempotência, envelopes versionados).
- REC-001 a REC-005 (Reconexão segura e grace period).
- RTC-001 a RTC-004 (Sinalização e voz WebRTC).
- REG-FREE-01 (Respeito estrito ao AI Studio Free Tier).

## Regra
Nenhuma tarefa está concluída sem rodar `npm test` e verificar que todos os testes passam com sucesso.
