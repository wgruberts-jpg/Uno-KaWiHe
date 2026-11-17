# 🧠 BRIEFING DE TRANSFERÊNCIA PARA AGENTES

## 1. Objetivo
Este documento visa fornecer ao próximo Agente o contexto mínimo necessário para assumir o desenvolvimento do projeto **Uno KaWiHe** sem fricção, garantindo a continuidade das implementações e a integridade do sistema.

## 2. Regras de Ouro para o Agente
Como este projeto é um ambiente de jogo real-time, Agentes devem seguir rigorosamente estas diretrizes:

1. **🔒 REGRA INQUEBRÁVEL — AI STUDIO & USO 100% GRATUITO (FREE TIER):**
   - Respeite estritamente o ambiente suportado pelo AI Studio. **NADA PAGO** pode ser implantado, sugerido ou configurado.
   - É terminantemente proibido introduzir dependências, serviços externos pagos, bancos de dados corporativos pagos (como Oracle Cloud pago, RDS cobrado, etc.) ou APIs cobradas.
   - Utilize sempre recursos nativos, locais, self-hosted ou planos gratuitos (ex: persistência atômica em arquivos JSON locais, WebSockets integrados no Node.js e WebRTC P2P para voz).
   - Na dúvida se algo requer pagamento ou suporte no AI Studio, adote a alternativa gratuita local ou pergunte.
2. **O Servidor é a Única Autoridade:** O cliente apenas envia intenções. Toda validação (regras de UNO, identidade, contagem de cartas, penalidades, modo 2v2, chaves de torneio e importação em massa) ocorre estritamente no `server.ts`, `server/unoEngine.ts`, `server/tournamentEngine.ts`, `server/authService.ts` e `server/importService.ts`.
3. **Segurança em Primeiro Lugar:**
   - Nunca hardcode segredos em produção (configure `JWT_SECRET` e `INITIAL_ADMIN_PASSWORD` via `.env`).
   - Use apenas autenticação via JWT válido (`role === 'admin'` para rotas administrativas; `/api/admin/import/*` e `/api/tournaments/*` exigem Bearer JWT e `POST /api/auth/login` não aceita `ADMIN_PIN` como senha).
   - Scripts de manutenção (na pasta `/scripts/`) devem ser executados com cautela e em ambiente seguro.
4. **Contrato Funcional:** Antes de qualquer alteração, consulte `/Game_funcionalidades` e `/02_regras.md`. Se o comportamento real do código divergir deste contrato, priorize a correção do código e, posteriormente, a atualização do contrato.
5. **Validar antes de Confirmar:**
   - Sempre execute `npm test` antes de assumir que o sistema está saudável (109 testes em 9 suítes).
   - Se uma tarefa resultar em mudanças estruturais, execute `npm run lint` (`tsc --noEmit`) e `npm run build` para garantir a integridade.

## 3. Estado Atual do Sistema
- **Versão / Status:** `v2.2.3` · Operacional.
- **Protocolo de Comunicação:** WebSocket com envelope versionado (`protocolVersion: 2`), idempotência por `messageId` (60s) e `reconnectToken` secreto.
- **Persistência (JSON Atômico em `/data/` com `fsync` + `rename` + lock global `data/.kawihe.lock`):**
  - `data/users.json` (`UserRecord`: `id`, `username`, `passwordHash`, `displayName`, `avatar`, `role`, `tag`, `createdAt`, `status`, `statusUpdatedAt`, `statusReason`, `createdByImportBatchId`, `createdByImportOperationId`)
  - `data/invites.json` (`InviteCode`: `code`, `createdBy`, `createdAt`, `expiresAt`, `maxUses`, `usedCount`, `usedBy`, `status`)
  - `data/stats.json` (mapa de estatísticas de carreira `PlayerCareerStats` por usuário)
  - `data/tournaments.json` (estado completo de torneios, chaves, rodadas e partidas)
  - `data/import_batches.json` (histórico, WAL em estados `'running' | 'completed' | 'failed' | 'partial' | 'reconciling'` e trilha de auditoria dos lotes de importação, sem senhas ou hashes)
- **Funcionalidades & Destaques Atuais:**
  - Modo **Duplas 2v2** (`team_2v2`) com assentos alternados `[A1, B1, A2, B2]`, visão da mão do parceiro (`teammateHand`) e proteção contra fogo amigo no `catch_uno`.
  - **Sistema de Torneios** (`server/tournamentEngine.ts`): modalidades Individual (mesas 2..4, desempate por partida extra ou decisão admin) e Duplas 2v2 (Md1/Md3/Md5 com byes e early clinch), simulação pré-início, W.O. seguro (preservando invariante das 108 cartas) e pausa automática para decisão em reinício de servidor.
  - **Importador de Usuários em Massa** (`server/importParser.ts` + `server/importService.ts` + `server/dataLock.ts`): upload CSV ou colagem (512 KB / 200 registros), senha mínima padronizada de 4 caracteres, `displayName` obrigatório e único (NFKC), hashing `bcrypt` em `worker_threads` nativa, WAL com checkpoint intermediário (`usersSaved`) e reconciliação automática (`reconcileIncompleteImportBatches`), modos `create_only`/`create_and_enroll`/`enroll_existing` (bloqueando `doubles` na V1) e ciclo de vida `active`/`disabled`/`archived`/exclusão segura com desconexão WebSocket imediata (`4003`).
  - Simulador progressivo de torneios (`scripts/tournament-test.mjs`) via JWT real + WebSockets e script de carga (`scripts/capacity-test.mjs` preservado).
  - Painel de diagnóstico de jogadores (`/api/admin/player-report/:target`), moderação administrativa, status CLI protegido (`/api/admin/cli-status`) e monitor de métricas da VM (`/api/admin/vm-metrics`).
  - Correção de dupla sala ao iniciar treino, proteção contra clique duplo e guia de liberação de microfone (Firefox/Chrome via HTTP/IP).
- **Suíte de Testes:** **109 testes** passando via Vitest em 9 suítes (`unoEngine.test.ts`: 26, `serverIntegration.test.ts`: 19, `tournamentEngine.test.ts`: 22, `tournamentWo.test.ts`: 19, `tournamentIntegration.test.ts`: 5, `tournamentStress.test.ts`: 2, `importParser.test.ts`: 6, `importService.test.ts`: 7, `importIntegration.test.ts`: 3).

## 4. Estrutura de Documentação e Planejamento (Raiz)
- `/00_visao.md` a `/09_prompts.md`: Contrato modular de visão, casos de uso, regras, arquitetura, status/planejamento, ADRs, testes, histórico, handoff e prompts de auditoria.
- `/Game_funcionalidades`: Contrato normativo detalhado do jogo.
- `/Game_changes.MD`: Evolução técnica, auditoria de regras e roteiro de entregas.
- `/SYSTEM_SPECIFICATION.md`: Arquitetura técnica, esquema de dados JSON e protocolo de rede.
- `/GAME_MANUAL.md`: Manual oficial de regras do jogo, 2v2, torneios e guia de microfone para PC.
- `/manualSH.md`: Guia de scripts shell de automação, limpeza, testes de carga e deploy.
- `/USE_CASES.md`: Mapeamento de casos de uso e cenários de teste.

## 5. Protocolo de Ação do Agente
Ao assumir a próxima tarefa, o Agente deve:
1. **Auditoria:** Ler `04_status.md`, `02_regras.md` e a seção pertinente de `Game_funcionalidades`.
2. **Verificação:** Executar `npm test` para garantir a linha de base (109/109).
3. **Implementação:** Seguir os padrões de TypeScript do projeto e a regra AI Studio Free Tier.
4. **Verificação de Regressão:** Executar `npm test`, `npm run lint` e `npm run build`.
5. **Atualização:** Atualizar `04_status.md`, `07_historico.md`, `08_handoff.md` e os documentos normativos impactados.

---
*Este documento é a fonte da verdade para qualquer Agente que assuma este ambiente.*
