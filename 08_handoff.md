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
tarefa: revisar as últimas funcionalidades (WAL import_batches.json, segurança/auth, simulador tournament-test.mjs e testes) conforme AGENTS.md e documentos normativos
feito:
  - Endurecimento de segurança: removidos fallbacks ADMIN_PIN de loginUser, auth-service/server.ts e getAuthenticatedRequestUser (/api/tournaments/*); protegido GET /api/admin/cli-status com isAdminRequest; restaurado bcrypt factor 12 no bootstrap e initializedDataDir dinâmico
  - Rate limiting composto em server.ts: 10/10min IP no cadastro, 5 falhas/5min conta + 20 falhas/5min IP no login, 20/5min IP em convites (CF-Connecting-IP + trust proxy)
  - Consolidação da máquina de estados WAL em ImportBatchStatus (running, completed, failed, partial, reconciling), checkpoint usersSaved, proveniência em UserRecord, badges na UI e correção do acúmulo sequencial em reconcileIncompleteImportBatches
  - Atualizado scripts/tournament-test.mjs para autenticação JWT estrita (--user/--password/--token), loop safety guard e múltiplos espectadores (preservando scripts/capacity-test.mjs intacto)
  - Reescrito tests/tournamentStress.test.ts usando API real de tournamentEngine e expandido tests/importService.test.ts; removida pasta residual 774007
  - Sincronizados AGENTS.md, 02-08, README.md, USE_CASES.md, SYSTEM_SPECIFICATION.md, manualSH.md, Game_funcionalidades e Game_changes.MD
arquivos alterados: server.ts, server/authService.ts, auth-service/server.ts, server/importService.ts, src/types/uno.ts, src/components/AdminImportHistoryPanel.tsx, scripts/tournament-test.mjs, tests/tournamentStress.test.ts, tests/importService.test.ts, docs na raiz
regras alteradas/criadas: REG-ADM-01, REG-SEG-01, REG-IMP-06 atualizadas para refletir o contrato estrito
testes: npm test (109/109 em 9 suítes passando), tsc --noEmit e vite build verdes
divergências encontradas: tests/tournamentStress.test.ts estava silenciosamente inativo por assinaturas antigas; /api/admin/cli-status estava aberto e loginUser/tournament routes tinham atalho de PIN; documentação citava 106/8 e valores antigos de rate limit
regra AI Studio Free Tier: respeitada (100% gratuito/local, zero serviços externos pagos)
próximo passo sugerido: executar scripts/tournament-test.mjs na VM informando --password com a senha real do administrador configurada no servidor
```

