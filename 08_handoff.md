# 08 — Protocolo de passagem entre Agentes

Objetivo: qualquer Agente assume o projeto lendo os arquivos na raiz, trabalha, e deixa tudo registrado para o próximo.

## Bloco HANDOFF
```
HANDOFF
tarefa: <o que foi pedido>
feito: <lista curta>
arquivos alterados: <caminhos>
regras alteradas/criadas: <IDs>
testes: <rodados? passaram/falharam, quantos>
divergências encontradas: <código x documentação>
regra AI Studio Free Tier: <respeitada?>
próximo passo sugerido: <1 item>
```

## Regras
- Respeito absoluto ao ambiente AI Studio e uso gratuito (Free Tier).
- Nunca introduzir dependências ou serviços pagos.

## Último registro
```
HANDOFF
tarefa: implementar módulo completo de Importador de Usuários em Massa (Fases 1 a 4) com integridade cross-file, concorrência, privacidade, ciclo de vida e benchmark Worker bcrypt
feito:
  - Padronização de senha mínima em 4 caracteres (cadastro público, adminCreateUser, adminResetPassword, importação, UI e auth-service)
  - Parser RFC-4180 (CSV/TSV/texto, BOM UTF-8, colunas dinâmicas, 512 KB / 200 registros)
  - Hashing bcrypt em worker_threads nativa fora do lock (lag médio ~10,6ms em 200 registros)
  - Lock centralizado in-process + file lock data/.kawihe.lock (dataLock.ts + auth-service)
  - WAL em data/import_batches.json + reconcileIncompleteImportBatches no boot
  - Modos A (create_only), B (create_and_enroll), C (enroll_existing) com bloqueio de torneios doubles na V1
  - Ciclo de vida active/disabled/archived, desconexão WS ao vivo (4003), análise de impacto e exclusão segura sem dependências
  - UI completa (AdminImportPanel + AdminImportHistoryPanel) sem window.confirm e limpeza de credenciais após commit
arquivos alterados: src/types/uno.ts, server/dataLock.ts, server/authService.ts, auth-service/server.ts, server/importParser.ts, server/importService.ts, server.ts, src/services/auth.ts, src/components/AdminImportPanel.tsx, src/components/AdminImportHistoryPanel.tsx, src/components/AdminRoomsModal.tsx, tests/importParser.test.ts, tests/importService.test.ts, tests/importIntegration.test.ts, documentação completa
regras alteradas/criadas: REG-IMP-01 a REG-IMP-09, ADR-008 a ADR-010, UC-IMP-01 a UC-IMP-04
testes: rodados (npm test) — 106/106 passaram em 8 suítes
divergências encontradas: nenhuma pendente; auth-service e server.ts alinhados no status 403 para contas bloqueadas e 4 caracteres de senha mínima
regra AI Studio Free Tier: respeitada (100% gratuito/local, worker_threads e JSON atômico nativos)
próximo passo sugerido: implementar suporte futuro a importação de equipes doubles (teamName) quando priorizado
```

