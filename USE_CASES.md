# 📊 CASOS DE USO — UNO KAWIHE v2.2

Este documento mapeia os principais fluxos de uso, interações e cenários de testes do sistema **Uno KaWiHe v2.2**, detalhando as pré-condições, fluxos principais, cenários alternativos e comportamentos esperados.

---

## 👥 Atores do Sistema
* **Jogador Visitante (Guest):** Usuário que joga sem registrar conta, utilizando apelido temporário que não colida com nomes registrados.
* **Jogador Registrado (Player):** Usuário autenticado que acumula conquistas, troféus e estatísticas de carreira.
* **Administrador (Admin - Edinho):** Usuário com privilégios de moderação total, visualização de painel de salas ativas, gerador de convites de cadastro e executor de rotinas de backup da VM.

---

## 🎯 Caso de Uso 1: Cadastro de Nova Conta com Convite
* **Descrição:** Permite que um jogador crie um perfil persistente para acumular vitórias.
* **Pré-condições:** O jogador deve possuir um código de convite válido (iniciado com `@`, ex: `@KWH1`).
* **Fluxo Principal:**
  1. O usuário clica em "Entrar / Criar Conta" no menu lateral.
  2. Seleciona a aba "Cadastrar".
  3. Preenche: Usuário, Senha, Nome de Jogador (displayName), escolhe um Avatar e o Código de Convite.
  4. O sistema valida se o código de convite está ativo, se não expirou e se tem usos restantes.
  5. O sistema normaliza o nome (Unicode NFKC) e valida se o Nome de Jogador é único.
  6. A conta é criada, o convite é atualizado e gravado no disco via escrita atômica `fsyncSync`, e o usuário é logado.
* **Fluxos Alternativos / Exceções:**
  * *Código Incorreto ou Expirado:* O sistema barra o cadastro com mensagem amigável.
  * *Nome já Existente:* O sistema exibe: *"O nome de jogador já foi escolhido por outro usuário! Quem escolheu primeiro escolheu."*

---

## 🌐 Caso de Uso 2: Explorador de Salas Públicas e Entrada Rápida
* **Descrição:** Jogadores buscam salas disponíveis abertas para jogar sem precisar digitar códigos manuais.
* **Fluxo Principal:**
  1. No lobby, o jogador clica em "Salas Abertas" ou "Explorar Salas Abertas" no menu lateral.
  2. Um modal exibe todas as salas ativas criadas no servidor que possuem jogadores humanos conectados.
  3. Cada linha mostra: Código da Sala, Nome do Anfitrião, quantidade de jogadores/limite (ex: `2/4`), tempo de turno e avatares dos jogadores na mesa.
  4. Se a sala tiver vagas disponíveis (`players < maxPlayers`), exibe o botão **`[ 🎮 Entrar na Sala ]`**.
  5. Se a sala estiver cheia ou com jogo em andamento, exibe o botão **`[ 📺 Assistir Partida ]`**.
  6. O jogador clica no botão e entra imediatamente na sala, recebendo o evento `room_joined` acompanhado de um `reconnectToken` secreto.

---

## 🔄 Caso de Uso 3: Reconexão de Sessão após Desconexão de Rede
* **Descrição:** Se a conexão WebSocket do jogador oscilar ou cair temporariamente, ele reconecta sem perder a partida ou revelar suas cartas aos oponentes.
* **Fluxo Principal:**
  1. O cliente detecta a perda do socket e tenta reatar a conexão WebSocket.
  2. O cliente envia a mensagem `sync_session` contendo o `roomId`, o `playerId` e o `reconnectToken` secreto armazenado em seu `sessionStorage`.
  3. O servidor valida se o `reconnectToken` confere exatamente com o token registrado na sessão.
  4. Sendo válido, o servidor reata a sessão e envia o `HandState` privado e o `GameState` atualizado.
* **Fluxos Alternativos / Exceções:**
  * *Token Ausente ou Inválido:* O servidor rejeita a tentativa com o código de erro `NOT_AUTHENTICATED`, impedindo que terceiros assumam a vaga do jogador.

---

## ⏱️ Caso de Uso 4: Jogada com Expiração do Timer de Turno
* **Descrição:** Trata a expiração do tempo de turno de forma justa e sem duplicação de cartas.
* **Fluxo Principal:**
  1. É a vez do jogador e o tempo da sala começa a decrementar.
  2. **Cenário A (Não comprou carta):** O timer atinge 0s sem nenhuma ação. O servidor compra 1 carta automaticamente para o jogador e passa a vez.
  3. **Cenário B (Já comprou carta na sua vez):** O jogador clicou no baralho e sacou 1 carta, mas o timer atingiu 0s sem que ele jogasse ou clicasse em passar. O servidor detecta `hasDrawnThisTurn === true`, **não saca cartas extras** e apenas encerra a vez passando para o próximo jogador.

---

## 📢 Caso de Uso 5: Declaração e Punição de UNO com Proteção Infantil
* **Descrição:** Gerencia o grito de UNO, acusação por oponentes e proteção automática.
* **Fluxo Principal:**
  1. O jogador joga uma carta e fica com apenas 1 carta restante na mão.
  2. Se a sala possui o **Modo Infantil (`autoUnoProtection`)** ativado, o servidor aciona o grito de UNO automaticamente pelo jogador.
  3. Se o Modo Infantil não estiver ativo:
     - O jogador pode clicar em **`[ 📢 GRITAR UNO! ]`**.
     - Se esquecer de gritar, fica marcado como vulnerável. Qualquer oponente pode clicar em **`[ Pegar UNO ]`** para aplicar a penalidade de 2 cartas.
     - Se um jogador tentar clicar em pegar UNO contra si mesmo, o servidor rejeita a ação com o código `UNO_SELF_CATCH`.

---

## 🧪 Caso de Uso 6: Execução da Suíte de Testes do Motor (`npm test`)
* **Descrição:** Permite ao desenvolvedor ou sistema de CI/CD validar as regras do motor em milissegundos.
* **Fluxo Principal:**
  1. O engenheiro executa `npm test` no terminal.
  2. O `Vitest` executa os 14 testes unitários do arquivo `tests/unoEngine.test.ts`.
  3. Validações de 108 cartas do baralho, regras de `isCardPlayable`, rotação de turnos, reciclagem do descarte mantendo cor de cartas normais, expiração de timer e soma de pontos são verificadas com 100% de sucesso.
