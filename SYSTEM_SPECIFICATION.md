# 📄 ESPECIFICAÇÃO TÉCNICA E ARQUITETURA — UNO KAWIHE v2.2.3

Este documento descreve detalhadamente a arquitetura, protocolos de comunicação, modelo de dados, políticas de segurança e decisões de implementação do **Uno KaWiHe v2.2.3**. Ele foi estruturado de forma a servir como um manual completo para análise, manutenção e evolução do sistema.

---

## 1. Visão Geral do Sistema
O **Uno KaWiHe v2.2.3** é uma plataforma full-stack de jogo de cartas UNO multiplayer em tempo real, focada em ambientes familiares, infantis (*Kids & Família*), partidas em **Duplas 2v2** e **Torneios**. O sistema opera sem banco de dados SQL externo para simplificar o deploy e manter custo zero (utilizando armazenamento JSON estruturado com escrita atômica física `fsync` em disco), oferece comunicação de voz direta **Peer-to-Peer (P2P)** via WebRTC e comunicação de estado do jogo via WebSockets com envelope versão 2 (`protocolVersion: 2`).

### Pilhas de Tecnologia (Tech Stack)
* **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4, Lucide Icons, Motion, Canvas Confetti.
* **Backend:** Node.js, Express, WebSockets (`ws`), TypeScript (`tsx`).
* **Testes Automatizados:** Vitest (**109 testes** em 9 suítes: `unoEngine`, `serverIntegration`, `tournamentEngine`, `tournamentWo`, `tournamentIntegration`, `tournamentStress`, `importParser`, `importService`, `importIntegration`).
* **Segurança & Autenticação:** JWT (JSON Web Tokens) com verificação estrita de assinatura e perfil (`role: 'admin' | 'player'`), senha mínima padronizada em **4 caracteres**, Rate Limiting composto em memória com suporte a Cloudflare (`CF-Connecting-IP` e `trust proxy`), `bcryptjs` (com processamento em `worker_threads` nativa para lotes em massa) e criptografia nativa `crypto` (`randomUUID`, `randomInt`, `randomBytes`).
* **Comunicação em Tempo Real:** WebSockets (sincronização de estado da partida, torneios, chat e lobbies) e WebRTC (voz P2P direta com sinalização sanitizada via WebSocket).
* **Persistência Atômica e Lock Global:** Disco local (`data/users.json`, `data/invites.json`, `data/stats.json`, `data/tournaments.json`, `data/import_batches.json`) com sincronização física `fsyncSync` + `renameSync` e exclusão mútua in-process + `data/.kawihe.lock`.
* **Deploy:** Docker, Docker Compose ou execução direta via Node.js/AI Studio (100% Free Tier).

---

## 2. Arquitetura e Estrutura de Pastas

```text
/
├── server.ts                       # Servidor HTTP Express + WebSocket v2 + Rotas Admin/Torneios
├── server/
│   ├── unoEngine.ts                # Motor de Regras do Jogo UNO (Padrão, 2v2, W.O. e Bots)
│   ├── tournamentEngine.ts         # Domínio Puro de Torneios (Individual, Duplas, Desempates, W.O.)
│   ├── dataLock.ts                 # Escrita atômica, mutex FIFO e file lock multi-processo (.kawihe.lock)
│   ├── authService.ts              # Serviço de Autenticação, Usuários (status), Convites e JWT
│   ├── importParser.ts             # Parser RFC-4180 CSV/TSV/texto (512 KB / 200 linhas)
│   └── importService.ts            # Importador em massa, Worker bcrypt, WAL, impacto e ciclo de vida
├── auth-service/
│   ├── server.ts                   # Microserviço Central de Autenticação KaWiHe (SSO opcional)
│   └── Dockerfile                  # Container isolado do Auth Service
├── tests/
│   ├── unoEngine.test.ts           # Suíte Unitária do Motor UNO (26 testes)
│   ├── serverIntegration.test.ts   # Suíte de Integração HTTP/WS e Segurança (19 testes)
│   ├── tournamentEngine.test.ts    # Suíte Unitária do Domínio de Torneios (22 testes)
│   ├── tournamentWo.test.ts        # Suíte de W.O. e Invariante das 108 Cartas (19 testes)
│   ├── tournamentIntegration.test.ts # Suíte de Integração Real de Torneios (5 testes)
│   ├── tournamentStress.test.ts    # Suíte de Estresse & Progressão de Torneios (2 testes)
│   ├── importParser.test.ts        # Suíte do Parser RFC-4180 do Importador (6 testes)
│   ├── importService.test.ts       # Suíte do Importador, WAL, Ciclo de Vida e Benchmark Worker (7 testes)
│   └── importIntegration.test.ts   # Suíte de Integração HTTP/WS do Importador e Bloqueio Ao Vivo (3 testes)
├── src/
│   ├── App.tsx                     # Orquestrador Principal do Frontend
│   ├── main.tsx                    # Inicialização do React
│   ├── types/uno.ts                # Definições de Tipos TypeScript Compartilhados
│   ├── services/
│   │   ├── auth.ts                 # Cliente de Autenticação e Admin (REST API)
│   │   ├── voiceChat.ts            # Cliente WebRTC de Voz P2P (Full Mesh)
│   │   ├── sound.ts                # Efeitos Sonoros
│   │   └── statsManager.ts         # Gerenciador de Estatísticas e Troféus
│   ├── components/
│   │   ├── Sidebar.tsx             # Menu Lateral Retrátil
│   │   ├── LoginScreen.tsx         # Tela Inicial de Login/Cadastro
│   │   ├── Lobby.tsx               # Lobby Central (Criação de Sala, Entrada e Treino)
│   │   ├── GameBoard.tsx           # Tabuleiro Ativo (Mesa Radial, 2v2, Cartas, Ações)
│   │   ├── TournamentModal.tsx     # Painel de Torneios (Individual & Duplas 2v2)
│   │   ├── VoiceControls.tsx       # Controles de Voz P2P
│   │   ├── OpenRoomsModal.tsx      # Explorador de Salas Abertas
│   │   ├── RoomPreviewModal.tsx    # Pré-visualização de Sala
│   │   ├── InviteShareModal.tsx    # Compartilhamento de Convites
│   │   ├── AvatarSelectModal.tsx   # Seletor de Avatares
│   │   ├── ChatPanel.tsx           # Painel de Chat e Logs
│   │   ├── StatsModal.tsx          # Troféus e Estatísticas
│   │   ├── TableScoreboardModal.tsx# Placar da Mesa
│   │   ├── SettingsModal.tsx       # Configurações da Partida & Modo Kids
│   │   ├── HowToPlayModal.tsx      # Regras e Instruções
│   │   ├── GameOverModal.tsx       # Tela de Vitória/Revanche
│   │   ├── AdminRoomsModal.tsx     # Painel Administrativo de Salas, Usuários e Abas do Importador
│   │   ├── AdminImportPanel.tsx    # Importador de Usuários em Massa (Upload CSV / Colagem / Modos A-C)
│   │   ├── AdminImportHistoryPanel.tsx # Histórico de Lotes, Auditoria, Análise de Impacto e Ciclo de Vida
│   │   ├── AdminInvitesModal.tsx   # Gestão de Convites pelo Admin
│   │   ├── PlayerReportModal.tsx   # Relatório de Diagnóstico e Moderação
│   │   ├── VmMonitorModal.tsx      # Monitor de Métricas da VM
│   │   ├── VmGuideModal.tsx        # Guia de Infraestrutura/Microfone
│   │   ├── AuthModal.tsx           # Modal de Cadastro e Login
│   │   ├── UnoCard.tsx             # Componente Visual da Carta
│   │   ├── ColorPickerModal.tsx    # Seletor de Cor (Coringas)
│   │   ├── EmoteBubble.tsx         # Balão de Emote
│   │   ├── EmotePicker.tsx         # Seletor de Emotes
│   │   └── TableDirectionArrows.tsx# Indicador Visual de Sentido
│   └── utils/
│       ├── avatars.ts              # Catálogo de Avatares
│       └── emotes.ts               # Catálogo Oficial de Emotes
```

---

## 3. Arquitetura de Estado: GameState Público vs. HandState Privado

Para impedir totalmente a inspeção não autorizada de cartas de adversários no tráfego de rede ou no console do navegador (DevTools):

1. **Broadcast Público (`GameState`):**
   - Enviado para toda a sala.
   - Contém o topo do descarte (`discardPileTop`), a cor ativa (`currentColor`/`activeColor`), o ID do jogador do turno atual (`currentTurnPlayerId`), a contagem de cartas do baralho (`deckCardsCount`) e os dados dos jogadores contendo apenas `cardsCount` (número de cartas na mão) e estatísticas.

2. **Unicast Privado Autoritativo (`HandState`):**
   - Evento do tipo `hand_state` transmitido em mensagem privada **exclusivamente no socket WebSocket do jogador**.
   - Contém:
     - `hand`: O array com as cartas reais do jogador.
     - `playableCardIds`: Lista de IDs das cartas válidas para jogar no turno atual.
     - `canDraw`: Booleano autoritativo indicando se pode comprar.
     - `canPassTurn`: Booleano autoritativo indicando se pode passar a vez.

---

## 4. Protocolo WebSocket v2, Idempotência e Reconexão Segura

### 4.1 Envelope de Mensagens Versão 2
Todas as mensagens enviadas pelo cliente utilizam a estrutura com envelope versionado:
```typescript
export interface ClientMessageEnvelope {
  protocolVersion: 2;
  messageId: string; // UUIDv4 para garantia de idempotência
  roomId?: string;
  playerId?: string;
  reconnectToken?: string;
  type: string;
  [key: string]: any;
}
```

### 4.2 Cache Idempotente (`processedMessageCache`)
- O servidor retém um cache em memória com TTL de 60 segundos por `messageId`.
- Caso um pacote duplicado chegue ao servidor (por oscilação de rede do cliente), o servidor responde imediatamente com a confirmação em cache (`action_ack`) sem reprocessar a jogada.

### 4.3 Reconexão Resiliente e Proteção contra Usurpação via `reconnectToken`
- Ao entrar em uma sala (`room_joined`), o servidor emite um token secreto `reconnectToken` com 128 bits de entropia gerado com `crypto.randomUUID()`.
- O cliente salva o token no `sessionStorage` (destruído automaticamente ao fechar a aba).
- Ao reconectar via `sync_session` ou `join_room` com `existingPlayerId`, o cliente transmite o `reconnectToken`.
- O servidor valida o token em relação à sessão salva no mapa em memória `sessionReconnectTokens`.
- **Proteção Ativa:** Tentativas de usurpação de `playerId` de jogadores conectados ou desconectados sem o token correspondente são sumariamente bloqueadas com `UNAUTHENTICATED_SOCKET` ou `NOT_AUTHENTICATED`.

---

## 5. Arquitetura de Segurança, Rate Limiting e Gestão de Acesso

### 5.1 Autenticação Administrativa via JWT (sem Bypass de PIN)
Atalhos de PIN hardcoded foram removidos do código:
- **Painel e Rotas Admin (`/api/admin/*`, `/api/tournaments/*`):** Exigem autenticação via Bearer Token JWT assinado com `JWT_SECRET`, pertencente a usuário com `role === 'admin'` (para ações administrativas). Rotas `/api/admin/import/*`, `/api/tournaments/*`, `/api/admin/cli-status` e `POST /api/auth/login` rejeitam bypass por PIN sem senha bcrypt válida.
- Nas rotas `/api/admin/*` que opcionalmente suportam `x-admin-pin`, isso ocorre exclusivamente se `ADMIN_PIN` estiver explicitamente configurada via variável de ambiente no servidor; caso contrário recebem **HTTP 403 Forbidden**.

### 5.2 Estratégia Segura de IP e Rate Limiting Composto
O servidor Express opera com `app.set('trust proxy', 1)` e extrai o IP autoritativo dando prioridade ao header `CF-Connecting-IP` (inserido pela borda do Cloudflare e imune a spoofing pelo cliente):
```typescript
function getClientIp(req: express.Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
  if (req.ip) return req.ip;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}
```

O Rate Limiter em memória opera com limites compostos:
- **Falhas de Login (`!result.success && !result.accountBlocked`):**
  - Limite por Conta (`login_fail_acc:${username}`): máx. 5 falhas / 5 min (previne ataques de dicionário na conta).
  - Limite por IP Global (`login_ip` / `login_fail_ip:${clientIp}`): máx. 20 falhas / 5 min (permite logins válidos sequenciais, como scripts/clientes em NAT, barrando brute-force).
- **Cadastro (`reg_ip:${clientIp}`):** máx. 10 tentativas / 10 min por IP.
- **Validação de Convite:** máx. 20 consultas / 5 min por IP.

### 5.3 Configuração de Segredo (`JWT_SECRET`)
- Em produção (`.env` e `docker-compose.yml`), `JWT_SECRET` deve ser sempre definido com uma chave forte e aleatória.
- No código-fonte local (`authService.ts` / `auth-service/server.ts`), há fallback apenas para facilitar execução em ambiente de desenvolvimento/testes sem quebrar o bootstrap local.
- Nenhuma senha de usuário é mantida hardcoded no código-fonte.

### 5.4 Bootstrap Seguro de Contas e Ausência de Senhas Padrão
- **Zero Senhas Hardcoded:** Não existem senhas fixas ou fallbacks literais no código-fonte.
- **Preservação de Dados:** Se `data/users.json` já existir em disco, o servidor nunca altera ou sobrescreve senhas existentes.
- **Inicialização Dinâmica (Cold Start):** Caso a base de dados ainda não exista e `INITIAL_ADMIN_PASSWORD` não seja informada no `.env`, o sistema gera dinamicamente uma senha criptográfica aleatória de alta entropia (`crypto.randomBytes(12).toString('hex')`), exibindo-a uma única vez no console do servidor para o primeiro acesso e troca imediata.

### 5.5 Utilitários de Linha de Comando (`scripts/create-user.sh`)
- O script de criação de usuários `scripts/create-user.sh` exige obrigatoriamente a presença de `bcryptjs` (ou `bcrypt`).
- Caso a biblioteca criptográfica não esteja disponível, o script aborta imediatamente com `process.exit(1)`. O armazenamento de senhas em texto puro é estritamente proibido.
- Todas as senhas criadas via CLI são criptografadas com `bcrypt.hashSync(password, 12)`.

### 5.6 Políticas de Backup e Permissões Restritas
- O script `scripts/backup.sh` garante permissões seguras do diretório de destino (`chmod 700`) e dos arquivos compactados gerados (`chmod 600`), criando cópias isoladas de volumes Docker e da pasta local `./data`.

---

## 6. Implementação de Voz P2P WebRTC e Sanitização

Para manter o servidor livre de processamento de áudio pesado, a comunicação de voz utiliza uma arquitetura de **malha WebRTC (Full Mesh)**.

### Sanitização de Origem nos Sinais
Na retransmissão de mensagens de sinalização P2P (`rtc_offer`, `rtc_answer`, `rtc_ice_candidate`), o servidor **sempre sobrescreve o campo `fromPlayerId`** com o ID do jogador associado ao socket autenticado, impedindo falsificação de origem.

---

## 7. Persistência Atômica com `fsync` e Esquema de Dados (`./data/`)

A escrita dos arquivos JSON em `./data/` usa um fluxo físico de segurança atômica (`atomicWriteFileSync`: temp → `fsyncSync` → `renameSync`).

### 7.1 "Tabela" de Usuários (`data/users.json` — `UserRecord[]`)
| Campo | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Sim (PK) | Identificador imutável (`usr_edinho`, `usr_<ts>_<rand>`) |
| `username` | `string` | Sim (Unique) | Login em minúsculas e sem espaços |
| `passwordHash` | `string` | Sim | Hash `bcrypt` (mín. 4 caracteres; nunca retornado ao cliente) |
| `displayName` | `string` | Sim (Unique) | Nome público exibido nas mesas e lobby (normalizado NFKC, 2–18 chars) |
| `avatar` | `string` | Sim | Emoji/ícone do jogador |
| `role` | `'admin' \| 'player'` | Sim | Permissão de acesso (importação em lote fixa `'player'`) |
| `tag` | `string` | Opcional | Tag definitiva única de 4 dígitos (ex: `#0001`) |
| `createdAt` | `string` | Sim | Timestamp ISO 8601 de criação |
| `status` | `'active' \| 'disabled' \| 'archived'` | Opcional (default `'active'`) | Estado do ciclo de vida da conta |
| `statusUpdatedAt` | `string` | Opcional | Timestamp ISO 8601 da última alteração de status |
| `statusReason` | `string` | Opcional | Motivo administrativo da desativação/arquivamento |
| `createdByImportBatchId` | `string` | Opcional | ID do lote que criou a conta (proveniência) |
| `createdByImportOperationId` | `string` | Opcional | ID da operação individual no lote criador |

### 7.2 Outros Arquivos em `./data/` e Lock Multi-Processo
- **`data/.kawihe.lock`:** Lock exclusivo coordenado por `server/dataLock.ts` e `auth-service/server.ts` garantindo serialização entre operações concorrentes de cadastro, edição de perfil, redefinição de senha, importação e status.
- **`data/invites.json` (`InviteCode[]`):** `code` (`@XXXX`), `createdBy`, `createdAt`, `expiresAt`, `maxUses`, `usedCount`, `usedBy`, `status`.
- **`data/stats.json`:** Mapa indexado por `user.id` / `username` contendo `PlayerCareerStats` (vitórias, sequências, cartas jogadas, conquistas).
- **`data/tournaments.json`:** Estado persistido de torneios (`Tournament[]`), inscrições, rodadas e jogos para recuperação pós-reinício.
- **`data/import_batches.json` (`ImportBatch[]`):** Histórico completo de lotes de importação (`importBatchId`, `name`, `importTag`, `mode`, `sourceType`, `delimiterUsed`, `tournamentId`, `idempotencyKey`, `status`: `'running' | 'completed' | 'failed' | 'partial' | 'reconciling'`, `stepsCompleted` WAL, `summary`, `items` com `relationType`, `userOpStatus`, `enrollOpStatus`, `userPersistedAt`, `enrolledAt`, `outcome`, e `auditTrail`). **Privacidade:** nenhuma senha em texto puro, `passwordHash` ou payload CSV bruto é persistido.

### 7.3 Consistência Cross-File (WAL) & Desempenho do Importador
- **Protocolo WAL:** Lotes gravam `status: 'running'` com `stepsCompleted` (`usersSaved`, `tournamentSaved`, `batchFinalized`), checkpoint intermediário imediatamente após `saveUsers` (`usersSaved = true`) e atualização sequencial por item (`userOpStatus`, `enrollOpStatus`). Na inicialização do servidor, `reconcileIncompleteImportBatches` muda lotes pendentes para `'reconciling'` e conclui inscrições sem duplicar usuários ou sobrescrever inscrições anteriores (`partial`/`completed`/`failed`).
- **Parser 1 MB dedicado:** Apenas `/api/admin/import/*` aceita JSON até `1mb` (para suportar CSV até 512 KB com metadados), mantendo o limite padrão `100kb` nas demais rotas.
- **Benchmark Empírico (`worker_threads` bcrypt rounds=10, 200 registros):** ~16s–20,6s totais com **lag médio de Event Loop de ~10,3ms**, mantendo latência WebSocket estável durante importações máximas.
- **Evolução Futura Planejada (Torneios Duplas):** A V1 bloqueia inscrição individual em torneios `doubles`; a arquitetura prevê extensão futura para colunas `username;displayName;password;teamName` respeitando a regra de duplas sem improviso.

---

## 8. Suíte de Testes Automatizados (Vitest)

O sistema possui **109 testes automatizados** distribuídos em 9 arquivos, executados via `npm test` (`vitest run`):

1. **`tests/unoEngine.test.ts` (26 testes):** Composição das 108 cartas, jogabilidade (`isCardPlayable`), turnos, Reverse em 2 jogadores, reciclagem preservando cores, `pass_turn` / `MUST_DRAW_FIRST`, timeout, vitória com `+2`/`+4`, janela de UNO, bloqueio `UNO_SELF_CATCH` e regras do modo 2v2.
2. **`tests/serverIntegration.test.ts` (19 testes):** Proteção contra usurpação de socket (`UNAUTHENTICATED_SOCKET`), versionamento (`UNSUPPORTED_VERSION`), `reconnectToken`, idempotência, `MUST_DRAW_FIRST`, `UNO_SELF_CATCH`, `PLAYER_MISMATCH`, `NOT_AUTHENTICATED`, controle de acesso JWT Admin vs `role: 'player'` vs `x-admin-pin`, exclusão de salas privadas em `/api/rooms/open`, `/api/admin/player-report/:target`, ações de moderação e bloqueio de fogo amigo 2v2.
3. **`tests/tournamentEngine.test.ts` (22 testes):** Permissões admin, validação de séries (Md1/Md3/Md5) e equipes 2v2, distribuição determinística de mesas (2..4), chaveamento com byes, *early clinch*, classificação V1 sem desempate por `roundPointsWon`, desempate por partida extra ou decisão admin, W.O. por prazo de reconexão e pausa segura pós-reinicialização.
4. **`tests/tournamentWo.test.ts` (19 testes):** Remoção de jogador por W.O. em torneio individual preservando exatamente as 108 cartas e IDs únicos, recuperação de carta em `stagedCardPlay`, ajuste de `currentTurnIndex` em ambas as direções (`1` e `-1`), idempotência e rejeição em salas 2v2 ou salas comuns.
5. **`tests/tournamentIntegration.test.ts` (5 testes):** Integração real ponta a ponta via HTTP e WebSocket para criação, inscrição, simulação, partidas e conclusão de torneios Individual e Duplas 2v2.
6. **`tests/tournamentStress.test.ts` (2 testes):** Simulação progressiva completa ponta a ponta em escala Individual (8/16/32 jogadores com desempates) e Duplas 2v2 Md3 (4/8 equipes com *early clinch*) validando redução de chaves e campeão.
7. **`tests/importParser.test.ts` (6 testes):** Parser RFC-4180 (aspas, `;`/`,`/`\t`), remoção de BOM UTF-8, colunas reordenadas, detecção de ambiguidade de delimitador, limites de 512 KB / 200 registros e lista simples de usernames no Modo C.
8. **`tests/importService.test.ts` (7 testes):** Senha mínima padronizada de 4 caracteres (incluindo rejeição de `ADMIN_PIN` como senha), `displayName` obrigatório/NFKC, proveniência (`createdByImportBatchId` / `createdByImportOperationId`), privacidade sem armazenamento de senhas/hashes em `import_batches.json`, Modos A/B/C, bloqueio `doubles`, reconciliação WAL multi-item, ciclo de vida e benchmark empírico de 200 hashes `bcrypt` em Worker Thread.
9. **`tests/importIntegration.test.ts` (3 testes):** Bloqueio estrito sem JWT admin (incluindo rejeição de `x-admin-pin`), parser 1 MB dedicado, fluxo ponta a ponta Fases 1–4 com desconexão ao vivo de WebSocket (close `4003`) e bloqueio HTTP 403 no login.
