# 🃏 MANUAL DE JOGO — UNO KAWIHE v2.2

Bem-vindo ao **Uno KaWiHe v2.2**, o jogo de cartas mais divertido do mundo feito sob medida para brincar com a família, amigos e crianças em um ambiente seguro, privado, sem anúncios e totalmente autoritativo! Este manual explica passo a passo o funcionamento do jogo, o significado de cada carta, as regras oficiais aplicadas, a disposição visual da mesa e as proteções especiais do nosso sistema.

---

## 🌟 1. Objetivo do Jogo
O objetivo principal é simples: ser o **primeiro jogador a ficar sem cartas na mão**!  
A cada rodada que você ganha, você acumula pontos com base nas cartas que sobraram na mão dos seus adversários. O primeiro a atingir a meta da mesa consagra-se o grande campeão da sessão!

---

## 🎮 2. Como Funciona a Partida (O Fluxo de Turno Autoritativo)
Na sua vez de jogar, você deve comparar a carta que está no topo da **Pilha de Descarte (Mesa)** com as cartas da sua mão.

Você pode jogar uma carta da sua mão se ela corresponder a **pelo menos um** dos seguintes critérios:
1. **Mesma Cor:** A carta tem a mesma cor da carta da mesa (Vermelho, Azul, Verde ou Amarelo) ou da cor ativa escolhida (`activeColor`).
2. **Mesmo Número ou Símbolo:** A carta tem o mesmo número (0-9) ou o mesmo símbolo especial (Pular, Inverter, +2).
3. **Coringa:** Cartas pretas especiais (Coringa comum ou Coringa +4) podem ser jogadas sobre **qualquer** cor ou número da mesa!

> 💡 **Se você não tiver nenhuma carta jogável:** Você clica no baralho para **Comprar uma Carta**. Depois de comprar, se a carta for jogável, você pode jogá-la; caso contrário, deve passar clicando no botão *"Passar Turno"*.  
> 🛡️ **Garantia de Regra:** O servidor não permite passar o turno sem antes comprar pelo menos uma carta (retornando a mensagem de segurança `MUST_DRAW_FIRST`).

---

## ⏱️ 3. Regra de Tempo e Expiração de Turno
Cada turno possui um tempo limite configurável na sala (ex: 15s, 25s, 40s ou tempo ilimitado no Modo Criança).
- **Se você ainda NÃO comprou uma carta no seu turno** e o tempo acabar: O servidor saca 1 carta automaticamente para você e passa a vez para o próximo jogador.
- **Se você JÁ comprou uma carta no seu turno** e o tempo acabar: O servidor não adiciona cartas extras; ele apenas encerra o seu tempo e **passa a vez automaticamente**.

---

## 📐 4. Disposição do Tabuleiro e Mesa de Jogo
A mesa de jogo foi desenvolvida em formato radial curvo e proporcional, otimizada para telas de celular e monitores sem que nenhum elemento fique espremido:

* **Sua Mão (Base - 0°):** Suas cartas ficam organizadas na parte inferior da tela, com destaque visual autoritativo gerado pelo servidor apenas para as cartas válidas de jogar, botões de ação e o grande botão de gritar **UNO!**.
* **Oponente da Esquerda (90°) & Direita (270°):** Cards verticais compactos e bem posicionados nas laterais, exibindo a contagem de cartas do oponente.
* **Oponente do Topo (180°):** Disposição especial horizontal lado a lado (*Side-by-Side*), com dimensões sólidas (avatar de 40px e representação visual das cartas lado a lado) mantendo perfeita leitura em qualquer tela.

---

## 🎨 5. Guia de Cartas Especiais

| Carta | Nome da Carta | Efeito Prático no Jogo |
| :---: | :--- | :--- |
| 🚫 | **Bloqueio (Pular)** | O próximo jogador na linha de turnos **perde a vez** de jogar. |
| 🔄 | **Inverter Sentido** | Muda o fluxo da mesa! Se o jogo estava rodando no sentido horário, ele passa a rodar no sentido anti-horário. *Nota: Se a partida for de apenas 2 jogadores, ela funciona como uma carta de Bloqueio.* |
| ➕2 | **Comprar Duas (+2)** | O próximo jogador é obrigado a **comprar 2 cartas do baralho** e ainda **perde a vez** de jogar naquela rodada. |
| 🎨 | **Coringa Comum** | Pode ser jogado sobre qualquer carta. Quem o joga escolhe qual será a **nova cor** que continuará o jogo (Vermelho, Azul, Verde ou Amarelo). |
| ➕4 | **Coringa Comprar Quatro (+4)** | A carta mais poderosa! Além de permitir que você escolha a nova cor do jogo, o próximo jogador é obrigado a **comprar 4 cartas do baralho** e **perde a vez**. |

---

## 📢 6. A Regra Sagrada do "UNO!"
Quando você jogar uma carta e perceber que ficou com **apenas 1 carta restante na mão**, você deve **gritar UNO**!

* **Como fazer isso no jogo:** Clique no botão brilhante **`[ 📢 GRITAR UNO! ]`** quando estiver com 1 ou 2 cartas!
* **A Punição:** Se você esquecer de gritar UNO e ficar vulnerável com 1 carta, qualquer outro adversário na mesa pode clicar no botão de **"Pegar UNO"** contra você. O servidor aplicará a punição e você terá que **comprar 2 cartas de penalidade** imediatamente!
* **Bloqueio Anti-Fraude:** O servidor impede que um jogador aplique a penalidade de UNO contra si mesmo (`UNO_SELF_CATCH`).

### 👶 Proteção Infantil (Auto-UNO)
Como o Uno KaWiHe é voltado para crianças e noites de jogos de família descontraídas, temos a **Proteção Automática de UNO (Kids Mode)**!
* **Como ativar:** Abra as **Configurações (⚙️)** no menu e ligue a opção *"Proteção Anti-Esquecimento de UNO"*.
* **O que ela faz:** Quando ativada, se uma criança ficar com 1 carta, o servidor grita UNO automaticamente para ela, protegendo as crianças pequenas de levarem punições indesejadas!

---

## 📊 7. Sistema de Pontuação de Carreira e Validação
Ao final de cada partida, os pontos são computados e salvos permanentemente no seu perfil:
* **Cartas Numéricas (0 a 9):** Valem o número estampado na carta (Ex: um 7 vale 7 pontos).
* **Cartas Especiais (🚫, 🔄, ➕2):** Valem **20 pontos** cada.
* **Coringas (🎨, ➕4):** Valem **50 pontos** cada.

Suas vitórias totais e pontuação histórica são exibidas como troféus dourados no menu **"Troféus & Estatísticas"** da sua barra lateral! O motor de regras do Uno KaWiHe v2.2 é 100% testado por uma suíte de testes unitários automatizados (`Vitest`).
