# 07 — Histórico

- 2026-11-16 · v2.2.3 · Implementação completa do **Importador de Usuários em Massa** (Fases 1 a 4): padronização de senha mínima em 4 caracteres, `displayName` obrigatório/NFKC, bloqueio de `doubles` na V1, hashing `bcrypt` em `worker_threads` (benchmark 200 registros: lag médio ~10,6ms), lock global `data/.kawihe.lock` (`server/dataLock.ts` + `auth-service`), WAL/reconciliação entre JSONs (`data/import_batches.json`), privacidade zero-credencial e gestão de ciclo de vida (`active`/`disabled`/`archived`/exclusão segura) com desconexão WebSocket imediata. Suíte expandida para **106/106 testes** em 8 suítes.
- 2026-11-16 · v2.2.3 · Sincronização completa de `AGENTS.md`, `00`–`09`, `README.md`, `SYSTEM_SPECIFICATION.md`, `USE_CASES.md`, `GAME_MANUAL.md`, `Game_changes.MD`, `Game_funcionalidades` e `manualSH.md` com o estado real do código (Torneios, Modo Duplas 2v2, esquemas JSON em `data/`, Monitor VM e **91/91 testes** passando).
- v2.2.3 · Implementação de Torneios (Individual + Duplas 2v2 em `tournamentEngine.ts`), remoção segura por W.O. (`tournamentWo.test.ts`), Modo Duplas 2v2 (`team_2v2`), monitor de métricas de VM (`/api/admin/vm-metrics`) e expansão da suíte para 91 testes.
- 2026-10-10 · Sistema · Criação dos arquivos de documentação na raiz (00 a 09) e reforço da regra inquebrável de uso 100% gratuito (Free Tier) no AI Studio. Testes: 42/42 passando.
- v2.2 · Auditoria de segurança, `reconnectToken`, protocolo v2 com idempotência, relatórios admin e guia de microfone.
- v2.1 · Base original: motor, salas, voz, contas por convite, Modo Kids.
