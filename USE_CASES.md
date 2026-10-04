# 📊 CASOS DE USO — UNO KAWIHE v2.2

Este documento mapeia os principais fluxos de uso, interações, cenários de segurança e validações de testes do sistema **Uno KaWiHe v2.2**, detalhando pré-condições, fluxos principais, cenários alternativos e comportamentos esperados.

---

## 👥 Atores do Sistema
* **Jogador Visitante (Guest):** Usuário que joga partidas rápidas ou assiste como espectador sem registrar conta, utilizando apelido temporário que não colida com nomes registrados.
* **Jogador Registrado (Player):** Usuário autenticado via login/senha que acumula conquistas, troféus e estatísticas históricas de carreira salvas no perfil.
* **Administrador (Admin - Edinho):** Usuário autenticado com credenciais com perfil `role === 'admin'`, detentor de acesso exclusivo ao painel administrativo (`/api/admin/*`), listagem e gerenciamento de usuários, redefinição de senhas, criação de convites e monitoramento de salas em tempo real.

---

## 🎯 Caso de Uso 1: Cadastro de Nova Conta com Convite e Proteção por Rate Limit
* **Descrição:** Permite que um jogador crie um perfil persistente para acumular vitórias e estatísticas.
* **Pré-condições:** O jogador deve possuir um código de convite válido (iniciado com `@`, ex: `@KWH1`).
* **Fluxo Principal:**
  1. O usuário clica em "Entrar / Criar Conta" no menu lateral.
  2. Seleciona a aba "Cadastrar".
  3. Preenche: Usuário, Senha, Nome de Jogador (displayName), escolhe um Avatar e digita o Código de Convite.
  4. O sistema avalia o rate limit do IP do cliente (máx. 5 cadastros a cada 10 minutos).
  5. O sistema valida se o código de convite existe, se está ativo, se não expirou e se possui saldo de usos restantes (`usedCount < maxUses`).
  6. O sistema normaliza o nome (Unicode NFKC) e valida se o Nome de Jogador é único.
  7. O cadastro gera uma tag exclusiva aleatória via `crypto.randomInt` (ex: `#1042`), grava no disco via escrita atômica `fsyncSync` + `renameSync`, queima o uso do convite e autentica o usuário emitindo um JWT assinado com `role: 'player'`.
* **Fluxos Alternativos / Exceções:**
  * *Muitas Tentativas de Cadastro:* O sistema bloqueia com HTTP 429 exibindo o tempo restante de espera (`retryAfter`).
  * *Código Incorreto, Expirado ou Esgotado:* O sistema barra o cadastro com mensagem amigável explicativa.
  * *Nome já Existente:* O sistema exibe: *"O nome de jogador já foi escolhido por outro usuário! Quem escolheu primeiro escolheu."*

---

## 🔐 Caso de Uso 2: Autenticação Segura e Painel Administrativo
* **Descrição:** Acesso exclusivo do Administrador para gerenciamento de salas, usuários e redefinição de senhas.
* **Pré-condições:** O usuário deve estar logado com credenciais de administrador (`role === 'admin'`).
* **Fluxo Principal:**
  1. O Administrador efetua login fornecendo seu usuário e senha. O sistema valida contra ataques de força bruta com rate limiting composto (máx. 5 tentativas por usuário e 20 por IP global a cada 5 minutos).
  2. O backend valida a senha via `bcrypt` e gera um token JWT assinado com a chave segura `JWT_SECRET`.
  3. Ao acessar rotas como `/api/admin/users`, `/api/admin/rooms`, `/api/admin/cli-status` ou `/api/admin/users/:id/reset-password`, o token é transmitido no header `Authorization: Bearer <token>`.
  4. O servidor valida a assinatura e o perfil do usuário, concedendo acesso aos dados de telemetria e ações de moderação.
* **Fluxos Alternativos / Exceções:**
  * *Tentativa de Acesso com PIN antigo (`x-admin-pin`):* O servidor ignora o PIN e retorna **HTTP 403 Forbidden**.
  * *Tentativa de Acesso com JWT de Jogador Comum (`role: 'player'`):* O servidor rejeita a requisição e retorna **HTTP 403 Forbidden**.
  * *Requisição Anônima:* O servidor rejeita imediatamente com **HTTP 403 Forbidden**.

---

## 🌐 Caso de Uso 3: Explorador de Salas Públicas e Entrada Rápida
* **Descrição:** Jogadores buscam salas disponíveis abertas para jogar sem precisar digitar códigos manuais.
* **Fluxo Principal:**
  1. No lobby, o jogador clica em "Salas Abertas" ou "Explorar Salas Abertas" no menu lateral.
  2. Um modal exibe todas as salas ativas criadas no servidor que possuem jogadores humanos conectados.
  3. Cada linha mostra: Código da Sala, Nome do Anfitrião, quantidade de jogadores/limite (ex: `2/4`), tempo de turno e avatares dos jogadores na mesa.
  4. Se a sala tiver vagas disponíveis (`players < maxPlayers`), exibe o botão **`[ 🎮 Entrar na Sala ]`**.
  5. Se a sala estiver cheia ou com jogo em andamento, exibe o botão **`[ 📺 Assistir Partida ]`**.
  6. O jogador clica no botão e entra imediatamente na sala, recebendo o evento `room_joined` acompanhado de um `reconnectToken` secreto com 128 bits de entropia gerado com `crypto.randomUUID()`.

---

## 🔄 Caso de Uso 4: Reconexão de Sessão e Proteção contra Usurpação
* **Descrição:** Se a conexão WebSocket do jogador oscilar ou cair temporariamente, ele reconecta sem perder a partida ou revelar suas cartas aos oponentes.
* **Fluxo Principal:**
  1. O cliente detecta a perda do socket e tenta reatar a conexão WebSocket.
  2. O cliente envia a mensagem `sync_session` contendo o `roomId`, o `playerId` e o `reconnectToken` secreto armazenado em seu `sessionStorage`.
  3. O servidor valida se o `reconnectToken` confere exatamente com o token registrado na sessão em memória.
  4. Sendo válido, o servidor reata a sessão e envia o `HandState` privado e o `GameState` atualizado.
* **Fluxos Alternativos / Exceções:**
  * *Token Ausente, Inválido ou Tentativa de Usurpar Jogador Conectado:* O servidor rejeita a tentativa com `NOT_AUTHENTICATED` ou `UNAUTHENTICATED_SOCKET`. O socket atacante não consegue interagir com a sala nem usurpar o assento da vítima.

---

## ⏱️ Caso de Uso 5: Jogada com Expiração do Timer de Turno
* **Descrição:** Trata a expiração do tempo de turno de forma justa e sem duplicação de cartas.
* **Fluxo Principal:**
  1. É a vez do jogador e o tempo da sala começa a decrementar.
  2. **Cenário A (Não comprou carta):** O timer atinge 0s sem nenhuma ação. O servidor compra 1 carta automaticamente para o jogador e passa a vez.
  3. **Cenário B (Já comprou carta na sua vez):** O jogador clicou no baralho e sacou 1 carta, mas o timer atingiu 0s sem que ele jogasse ou clicasse em passar. O servidor detecta `hasDrawnThisTurn === true`, **não saca cartas extras** e apenas encerra a vez passando para o próximo jogador.

---

## 📢 Caso de Uso 6: Declaração e Punição de UNO com Proteção Infantil
* **Descrição:** Gerencia o grito de UNO, acusação por oponentes e proteção automática.
* **Fluxo Principal:**
  1. O jogador joga uma carta e fica com apenas 1 carta restante na mão.
  2. Se a sala possui o **Modo Infantil (`autoUnoProtection`)** ativado, o servidor aciona o grito de UNO automaticamente pelo jogador.
  3. Se o Modo Infantil não estiver ativo:
     - O jogador pode clicar em **`[ 📢 GRITAR UNO! ]`**.
     - Se esquecer de gritar, fica marcado como vulnerável durante todo o turno do próximo jogador ($N+1$).
     - Qualquer oponente na sua vez pode clicar em **`[ Pegar UNO ]`** para aplicar a penalidade de 2 cartas.
     - Se um jogador tentar clicar em pegar UNO contra si mesmo, o servidor rejeita a ação com o código `UNO_SELF_CATCH`.
     - Ao final do turno do próximo jogador ($N+2$), se o acerto não for realizado, a vulnerabilidade expira automaticamente.

---

## 🧪 Caso de Uso 7: Execução da Suíte Completa de Testes (`npm test`)
* **Descrição:** Permite validar regras de negócio, integridade de WebSocket e políticas de segurança em menos de 2 segundos.
* **Fluxo Principal:**
  1. O desenvolvedor executa `npx vitest run --reporter=verbose` no terminal.
  2. O runner executa **38 testes automatizados** com 100% de aprovação:
     - **24 testes unitários** no `tests/unoEngine.test.ts` (108 cartas, regras de descarte, rotação, Skip/UNO, vitória, penalidades e temporizadores).
     - **14 testes de integração e segurança** no `tests/serverIntegration.test.ts` (proteção de socket ativo da vítima, envelopes versionados, rejeição de `x-admin-pin`, bloqueio de JWT de jogador comum em rotas admin, autorização de admin via JWT, validação de tokens e rate limits).
