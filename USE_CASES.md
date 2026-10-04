# 📊 CASOS DE USO — UNO KAWIHE v2.1

Este documento mapeia os principais fluxos de uso, interações e cenários de testes do sistema **Uno KaWiHe**, detalhando as pré-condições, fluxos principais, cenários alternativos e comportamentos esperados.

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
  5. O sistema valida se o Nome de Jogador é único.
  6. A conta é criada, o convite é atualizado com um uso e o usuário é logado automaticamente.
* **Fluxos Alternativos / Exceções:**
  * *Código Incorreto ou Expirado:* O sistema barra o cadastro com mensagem amigável instruindo a pedir um novo código ao Edinho.
  * *Nome já Existente:* Se o nome solicitado já estiver cadastrado por outro usuário, o sistema exibe: *"O nome de jogador já foi escolhido por outro usuário! Quem escolheu primeiro escolheu."*

---

## 🌐 Caso de Uso 2: Explorador de Salas Públicas e Entrada Rápida
* **Descrição:** Jogadores buscam salas disponíveis abertas para jogar sem precisar digitar códigos manuais.
* **Fluxo Principal:**
  1. No lobby, o jogador clica em "Salas Abertas" ou "Explorar Salas Abertas" no menu lateral.
  2. Um modal exibe todas as salas ativas criadas no servidor que possuem jogadores humanos conectados.
  3. Cada linha mostra: Código da Sala, Nome do Anfitrião, quantidade de jogadores/limite (ex: `2/4`), tempo de turno e avatares dos jogadores na mesa.
  4. Se a sala tiver vagas disponíveis (`players < maxPlayers`), exibe o botão **`[ 🎮 Entrar na Sala ]`**.
  5. Se a sala estiver cheia ou com jogo em andamento, exibe o botão **`[ 📺 Assistir Partida ]`**.
  6. O jogador clica no botão e entra imediatamente na sala, sincronizando os WebSockets.

---

## 💌 Caso de Uso 3: Criação de Sala e Envio de Convites por WhatsApp
* **Descrição:** Um anfitrião cria uma sala privada e chama amigos para jogar em tempo real.
* **Fluxo Principal:**
  1. No lobby, o jogador define suas configurações de preferência (Tempo de Turno, limite de jogadores) e clica em "Criar Sala Privada".
  2. A sala é criada e ele entra no lobby de espera como Anfitrião (`Host`).
  3. Ele clica no botão verde **`[ 💌 Convidar ]`**.
  4. Abre o modal contendo o código curto da sala (ex: `J7X2`) e um link direto para entrar.
  5. Ele clica em **"Compartilhar Convite no WhatsApp"**.
  6. O sistema abre o WhatsApp Web ou aplicativo com o texto de convite pronto com link de redirecionamento automático contendo a sala.

---

## 🎙️ Caso de Uso 4: Controle de Voz P2P e Eliminação de Eco
* **Descrição:** Jogadores conversam por voz com zero lag diretamente de seus navegadores (celular/computador).
* **Fluxo Principal:**
  1. Ao entrar no lobby de espera, o jogador clica no botão verde **`[ ((•)) Voz P2P ]`**.
  2. O navegador solicita permissão de uso de microfone (com cancelamento acústico ideal). O usuário aceita.
  3. O jogador entra na chamada e fala em tempo real com todos os conectados na sala.
  4. Para mutar sua voz temporariamente, o jogador clica no botão **`[ 🎙️ Mutar Mic ]`** (que vira vermelho `[ 🚫 Mic Mutado ]`). A linha de RTP WebRTC é cortada fisicamente e o áudio dele zera nos outros telefones.
  5. Para evitar eco quando estiver testando dois celulares na mesma sala física, ele clica em **`[ 🔊 Som ]`** (que vira amarelo `[ 🔇 Som Mutado ]`). Os alto-falantes dele são silenciados por software instantaneamente.

---

## 🤖 Caso de Uso 5: Modo Treino Rápido com Robôs (Bots)
* **Descrição:** Jogador joga sozinho contra inteligências artificiais sem precisar criar conexões de rede ou esperar amigos.
* **Fluxo Principal:**
  1. No lobby principal, no card de "Modo Treino Rápido", o jogador escolhe contra quantos robôs quer jogar (1, 2 ou 3).
  2. Clica em **"Iniciar Treino"**.
  3. O jogo inicia imediatamente. Os robôs tomam decisões inteligentes baseadas nas regras oficiais, jogam cartas especiais e reagem em velocidades personalizadas (entre 1 e 3 segundos por ação).

---

## 👑 Caso de Uso 6: Painel de Controle de Mesa Administrativa (Exclusivo ADM)
* **Descrição:** O Administrador Edinho monitora a integridade do servidor e atende chamados de suporte de jogadores.
* **Pré-condições:** Estar logado com conta administrativa (`role: 'admin'`).
* **Fluxo Principal:**
  1. Na barra lateral fixa esquerda, o Admin visualiza os botões exclusivos: **"Gerenciar Convites"** e **"Deploy Servidor VM"**.
  2. Ao abrir o painel de gerenciamento, o Admin pode ver uma lista de todas as salas ativas no servidor, quantidade de humanos e robôs em cada mesa.
  3. Se houver uma sala travada ou com comportamento abusivo, o Admin pode forçar o fechamento daquela sala em tempo real com um clique.
  4. No painel de convites, o Admin cria novos códigos promocionais (ex: `@AMIGO1`, de uso único ou múltiplos usos) para liberar acesso a novos conhecidos.
  5. No painel de Deploy, o Admin consulta os comandos prontos para atualizações do servidor Docker e monitoramento de desempenho de rede na VM.

---

## 💾 Caso de Uso 7: Execução de Backup Local e Atualização na VM
* **Descrição:** O Administrador executa a rotina de segurança local na VM antes de aplicar novas atualizações de layout ou funcionalidades.
* **Fluxo Principal:**
  1. O Administrador acessa o terminal da Máquina Virtual no diretório do projeto (`~/Uno-KaWiHe`).
  2. Executa o comando em lote de atualização:
     `cd ~/Uno-KaWiHe && sudo chown -R $USER:$USER . && git tag -f -a backupanteslayout -m "Backup antes do novo layout" && mkdir -p ~/backups_kawihe && cp -r . ~/backups_kawihe/backup_$(date +%Y%m%d_%H%M%S) && git pull && docker compose up -d --build`
  3. O sistema ajusta as permissões de arquivo do projeto.
  4. Cria uma tag local `backupanteslayout` no repositório Git da VM.
  5. Copia integralmente o estado atual da aplicação, histórico do Git e pasta `data` para o diretório de backups local (`~/backups_kawihe/backup_...`).
  6. Baixa a versão mais recente (`git pull`) e reconstrói os containers Docker (`docker compose up -d --build`).
