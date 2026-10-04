# 📄 ESPECIFICAÇÃO TÉCNICA E ARQUITETURA — UNO KAWIHE v2.2

Este documento descreve detalhadamente a arquitetura, protocolos de comunicação, modelo de dados, políticas de segurança e decisões de implementação do **Uno KaWiHe v2.2**. Ele foi estruturado de forma a servir como um manual completo para recriação total e idêntica do sistema a partir do zero por qualquer engenheiro de software ou modelo de Inteligência Artificial.

---

## 1. Visão Geral do Sistema
O **Uno KaWiHe v2.2** é uma plataforma full-stack de jogo de cartas UNO multiplayer em tempo real, focada em ambientes familiares e infantis (*Kids & Família*). O sistema opera sem banco de dados SQL pesado convencional para simplificar o deploy (utilizando armazenamento JSON estruturado com escrita atômica física `fsync` em disco) e oferece comunicação de voz direta **Peer-to-Peer (P2P)** via WebRTC (0% consumo de servidor de mídia) e comunicação de estado do jogo via WebSockets com envelope de mensagens versão 2 (`protocolVersion: 2`).

### Pilhas de Tecnologia (Tech Stack)
* **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, Lucide Icons.
* **Backend:** Node.js, Express, WebSockets (`ws`), TypeScript.
* **Testes Automatizados:** Vitest (38 testes automatizados: 24 unitários cobrindo o motor de jogo `unoEngine` e 14 de integração e segurança em `serverIntegration`).
* **Segurança & Autenticação:** JWT (JSON Web Tokens) com verificação estrita de assinatura e perfil (`role: 'admin' | 'player'`), Rate Limiting composto em memória com suporte a Cloudflare (`CF-Connecting-IP` e `trust proxy`), e criptografia nativa `crypto` (`randomUUID`, `randomInt`, `randomBytes`).
* **Comunicação em Tempo Real:** WebSockets (sincronização de estado da partida, chat da sala e lobbies) e WebRTC (voz P2P direta com sinalização sanitizada via WebSocket).
* **Persistência Atômica:** Disco local (`data/users.json`, `data/invites.json`, `data/stats.json`) com sincronização física `fsyncSync` + `renameSync` e cache em memória.
* **Deploy:** Docker, Docker Compose com fail-fast obrigatório de `JWT_SECRET`, compatível com qualquer VM (Oracle Cloud, AWS, GCP) com suporte a SSL (HTTPS) obrigatório para WebRTC.

---

## 2. Arquitetura e Estrutura de Pastas

```text
/
├── server.ts                 # Ponto de entrada do Servidor Express + WebSocket
├── server/
│   ├── unoEngine.ts          # Motor de Regras do Jogo UNO (Cartas, Turnos, Bots)
│   └── authService.ts        # Serviço de Autenticação, Cadastro e Controle de Convites
├── auth-service/
│   ├── server.ts             # Microserviço Central de Autenticação KaWiHe (SSO / Multi-Jogos)
│   └── Dockerfile            # Container isolado do Auth Service
├── tests/
│   ├── unoEngine.test.ts     # Suíte de Testes Unitários Automatizados (24 testes)
│   └── serverIntegration.test.ts # Suíte de Testes de Integração e Segurança (14 testes)
├── src/
│   ├── App.tsx               # Orquestrador Principal do Frontend (Modais e Estados)
│   ├── main.tsx              # Inicialização do React
│   ├── index.html            # Ponto de entrada HTML
│   ├── types/
│   │   └── uno.ts            # Definições de Tipos TypeScript Compartilhados
│   ├── services/
│   │   ├── auth.ts           # Cliente de Autenticação (REST API)
│   │   └── voiceChat.ts      # Cliente WebRTC de Voz P2P (Malha de Conexões)
│   ├── components/
│   │   ├── Sidebar.tsx       # Menu Lateral Retrátil (Barra de Ícones / Expandido)
│   │   ├── Lobby.tsx         # Lobby Central (Criação de Sala, Entrada e Treino)
│   │   ├── GameBoard.tsx     # Tabuleiro de Jogo Ativo (Mesa Radial, Jogadores, Baralho)
│   │   ├── VoiceControls.tsx # Controles de Voz (Microfone, Som, Sair)
│   │   ├── OpenRoomsModal.tsx# Explorador de Salas Abertas ao Vivo
│   │   ├── InviteShareModal.tsx # Modal de Compartilhamento de Convites (WhatsApp)
│   │   ├── AvatarSelectModal.tsx # Seletor de Avatares Categorizados
│   │   ├── ChatPanel.tsx     # Painel Lateral de Chat e Logs de Ações
│   │   ├── StatsModal.tsx    # Modal de Troféus e Estatísticas do Usuário
│   │   ├── SettingsModal.tsx # Modal de Configurações da Partida & Modo Kids
│   │   ├── AdminRoomsModal.tsx # Painel Administrativo de Salas e Usuários
│   │   └── AuthModal.tsx     # Modal de Cadastro e Login com Convite
│   └── utils/
│       ├── avatars.ts        # Catálogo de Avatares e Categorias
│       └── cards.ts          # Utilitários de Geração de Cores e Cartas
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

### 5.1 Autenticação Administrativa Exclusiva via JWT
O uso de senhas ou PINs fixos em rotas (`x-admin-pin`, `ADMIN_PIN`) foi completamente descontinuado:
- **Painel e Rotas Admin (`/api/admin/*`):** Exigem autenticação estrita via Bearer Token JWT assinado com `JWT_SECRET`, pertencente a usuário com `role === 'admin'`.
- Qualquer requisição com PIN, sem token ou com token de jogador regular (`role: 'player'`) recebe **HTTP 403 Forbidden**.

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
- **Login:**
  - Limite por Conta (`login_account:${username}`): máx. 5 tentativas / 5 min (previne ataques de dicionário na conta).
  - Limite por IP Global (`login_ip:${clientIp}`): máx. 20 tentativas / 5 min (previne ataques distribuídos sem bloquear famílias na mesma rede NAT).
- **Cadastro:** máx. 5 tentativas / 10 min por IP.
- **Validação de Convite:** máx. 10 consultas / 5 min por IP.

### 5.3 Fail-Fast de Configuração (`JWT_SECRET`)
- Em produção e desenvolvimento, `authService.ts` e `auth-service/server.ts` executam `process.exit(1)` imediatamente caso a variável de ambiente `JWT_SECRET` esteja ausente ou vazia.
- Nenhum segredo hardcoded é mantido no código executável; o segredo de testes é injetado isoladamente via configuração do runner Vitest em `vite.config.ts`.
- O `docker-compose.yml` utiliza `${JWT_SECRET:?Erro...}` para garantir que nenhum container inicie sem o `.env` configurado.

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

## 7. Persistência Atômica com `fsync`

A escrita dos arquivos JSON em `./data/` usa um fluxo físico de segurança atômica:
```typescript
function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tempPath, 'w');
  fs.writeSync(fd, data, 0, 'utf-8');
  fs.fsyncSync(fd); // Força gravação física no disco rígido/SSD
  fs.closeSync(fd);
  fs.renameSync(tempPath, filePath); // Substituição atômica no sistema de arquivos
}
```

---

## 8. Suíte de Testes Automatizados (Vitest)

O sistema possui uma cobertura de **38 testes automatizados** (24 unitários no `unoEngine.test.ts` e 14 de integração e segurança em `serverIntegration.test.ts`) executados via `npm test` (`vitest run` ou `npx vitest run --reporter=verbose`).

### A) Testes Unitários do Motor (`tests/unoEngine.test.ts` - 24 testes)
- **Composição do Baralho:** 108 cartas, verificação por cor e tipo.
- **Jogabilidade (`isCardPlayable`):** Validação de regras de descarte, cores ativas e coringas (`wild` e `wild4`).
- **Navegação de Turnos:** Sentido horário, anti-horário, saltos (`steps = 2`) e efeito de Reverso com 2 jogadores.
- **Primeira Carta do Descarte:** Tratamento de cartas especiais neutras e re-saque de Wild4 inicial.
- **Reciclagem do Descarte:** Preservação de cores de cartas coloridas e reset apenas de Coringas.
- **Timer de Turno e Passar a Vez:** Exigência de compra prévia (`hasDrawnThisTurn === true`) e testes do temporizador (`handleTimeoutEngine`) com e sem compra.
- **Vitória com Ação (+2/+4):** Permissão de vitória com cartas especiais como última carta e cálculo de pontos dos perdedores.
- **Janela de UNO e Casos Limite:** Testes de Skip com UNO catch, +2 contra A com 2 jogadores, encerramento de janela ao comprar carta (`draw_card`), bloqueio de auto-multa (`UNO_SELF_CATCH`) e expiração autoritativa.

### B) Testes de Integração de Protocolo e Segurança (`tests/serverIntegration.test.ts` - 14 testes)
1. **Proteção de Sessão Ativa de Vítima Conectada:** Prova que um socket atacante não consegue usurpar a sessão ou enviar ações em nome de um jogador vítima efetivamente conectado à sala (`UNAUTHENTICATED_SOCKET`).
2. **Incompatibilidade de Versão:** Rejeita requisições com `protocolVersion` incompatível (`UNSUPPORTED_VERSION`).
3. **Autenticação e Reconexão:** Garante a emissão e validação de `reconnectToken` seguro gerado com `crypto.randomUUID()`.
4. **Validação de Ação (`MUST_DRAW_FIRST`):** Valida a rejeição do servidor quando o jogador tenta passar a vez sem comprar.
5. **Bloqueio de Auto-Multa (`UNO_SELF_CATCH`):** Rejeita via WebSocket tentativas de aplicar penalidades de UNO a si próprio.
6. **Rejeição por Identidade Incompatível (`PLAYER_MISMATCH`):** Bloqueia ações com ID adulterado em sockets conectados.
7. **Rejeição de Sync sem Credencial (`NOT_AUTHENTICATED`):** Rejeita `sync_session` com token vazio ou inválido.
8. **Negação de Admin PIN em Usuários:** `/api/admin/users` com `x-admin-pin` retorna HTTP 403.
9. **Negação de Admin PIN em Reset de Senha:** `/api/admin/users/:id/reset-password` com `x-admin-pin` retorna HTTP 403.
10. **Negação de Usuário Regular em Listagem Admin:** `/api/admin/users` com JWT de jogador comum retorna HTTP 403.
11. **Negação de Usuário Regular em Reset de Senha:** `/api/admin/users/:id/reset-password` com JWT comum retorna HTTP 403.
12. **Negação de Rota CLI Anônima:** `/api/admin/cli-status` sem credencial retorna HTTP 403.
13. **Negação de Rota de Salas Anônima:** `/api/admin/rooms` sem credencial retorna HTTP 403.
14. **Autorização de Admin com JWT Válido:** `/api/admin/users` com JWT de Administrador (`role: 'admin'`) retorna HTTP 200 com sucesso.
