# 📄 ESPECIFICAÇÃO TÉCNICA E ARQUITETURA — UNO KAWIHE v2.1

Este documento descreve detalhadamente a arquitetura, protocolos de comunicação, modelo de dados e decisões de implementação do **Uno KaWiHe**. Ele foi estruturado de forma a servir como um manual completo para recriação total e idêntica do sistema a partir do zero por qualquer engenheiro de software ou modelo de Inteligência Artificial.

---

## 1. Visão Geral do Sistema
O **Uno KaWiHe** é uma plataforma full-stack de jogo de cartas UNO multiplayer em tempo real, focada em ambientes familiares e infantis (*Kids & Família*). O sistema opera sem banco de dados SQL pesado convencional para simplificar o deploy (utilizando armazenamento JSON estruturado persistente em disco) e oferece comunicação de voz direta **Peer-to-Peer (P2P)** via WebRTC (0% consumo de servidor de mídia) e comunicação de estado do jogo via WebSockets.

### Pilhas de Tecnologia (Tech Stack)
* **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, Lucide Icons.
* **Backend:** Node.js, Express, WebSockets (`ws`), TypeScript.
* **Comunicação em Tempo Real:** WebSockets (sincronização de estado da partida, chat da sala e lobbies) e WebRTC (voz P2P direta com sinalização via WebSocket).
* **Persistência:** Disco local (`data/users.json`, `data/invites.json`, `data/stats.json`) com sincronização atômica e cache em memória.
* **Deploy:** Docker, Docker Compose, compatível com qualquer VM (Oracle Cloud, AWS, GCP) com suporte a SSL (HTTPS) obrigatório para WebRTC.

---

## 2. Arquitetura e Estrutura de Pastas

```text
/
├── server.ts                 # Ponto de entrada do Servidor Express + WebSocket
├── server/
│   ├── unoEngine.ts          # Motor de Regras do Jogo UNO (Cartas, Turnos, Bots)
│   └── authService.ts        # Serviço de Autenticação, Cadastro e Controle de Convites
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
│   │   └── AuthModal.tsx     # Modal de Cadastro e Login com Convite
│   └── utils/
│       ├── avatars.ts        # Catálogo de Avatares e Categorias
│       └── cards.ts          # Utilitários de Geração de Cores e Cartas
```

---

## 3. Disposição do Tabuleiro e Oponentes (Mesa Radial)

O tabuleiro do jogo (`GameBoard.tsx`) utiliza uma disposição em arco semi-circular proporcional (Ângulos 0°, 90°, 180° e 270°):

* **Jogador Principal (0° - Base):** Posicionado na parte inferior com leque de cartas dinâmico, controles de turno e botão de grito UNO.
* **Oponente da Esquerda (90°):** Card vertical compacto na lateral esquerda.
* **Oponente do Topo (180°):** Disposição especial horizontal lado a lado (*Side-by-Side*) com dimensões fixas confortáveis para evitar encolhimento automático em telas grandes:
  * **Bloco Esquerdo:** Avatar circular de 40px, nome do jogador e pílula indicadora do número de cartas.
  * **Bloco Direito:** Leque visual compacto das cartas da mão e indicador `+X`.
* **Oponente da Direita (270°):** Card vertical compacto na lateral direita.

---

## 4. Estruturas e Modelos de Dados (Types)

### 4.1 Perfis de Usuário e Segurança (`UserProfile`)
```typescript
export type UserRole = 'admin' | 'player';

export interface UserProfile {
  id: string;          // Ex: "usr_edinho"
  username: string;    // Nome de usuário para login
  displayName: string; // Nome de exibição único
  avatar: string;      // Emoji do avatar
  role: UserRole;      // 'admin' ou 'player'
  tag?: string;        // Tag gerada pelo sistema (Ex: #1002)
  createdAt: string;
}
```

### 4.2 Códigos de Convite (`InviteCode`)
O acesso ao sistema exige convites iniciados com `@` (Ex: `@KWH1`), controlados pelo Administrador para garantir a privacidade da rede.
```typescript
export interface InviteCode {
  code: string;        // Ex: "@K9W2"
  createdBy: string;
  createdAt: string;
  expiresAt: string;   // ISO String ou "never"
  maxUses: number;
  usedCount: number;
  usedBy: string[];    // IDs dos usuários que usaram
  status: 'active' | 'used' | 'expired' | 'revoked';
}
```

### 4.3 Estado da Partida (`GameState`)
```typescript
export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
export type CardType = 'number' | 'skip' | 'reverse' | 'draw_two' | 'wild' | 'wild_draw_four';

export interface Card {
  id: string;
  color: CardColor;
  type: CardType;
  value?: number;      // 0 a 9 (apenas se type for 'number')
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isBot: boolean;
  isConnected: boolean;
  cardsCount: number;
  score: number;       // Pontos acumulados na sessão
  hasCalledUno: boolean;
}

export interface GameState {
  roomId: string;
  status: 'waiting' | 'playing' | 'ended';
  players: Player[];
  currentTurnPlayerId: string;
  currentTurnIndex: number;
  turnDirection: 1 | -1;
  turnTimeLeft: number;
  currentColor: CardColor;
  currentType?: CardType;
  currentValue?: number;
  topDiscardCard: Card | null;
  winnerId: string | null;
  unoVulnerablePlayerId: string | null; // Jogador com 1 carta que não gritou UNO
  deckCardsCount: number;
  spectatorsCount: number;
  spectatorCardsRevealed: boolean;
}
```

---

## 5. Protocolo de Comunicação WebSocket

Toda a sincronização de eventos entre o servidor e os clientes é realizada via conexões WebSocket persistentes.

### 5.1 Mensagens Enviadas pelo Cliente (`ClientMessage`)
```typescript
export type ClientMessage =
  | { type: 'create_room'; playerName: string; avatar: string; settings?: Partial<RoomSettings> }
  | { type: 'join_room'; roomId: string; playerName: string; avatar: string; existingPlayerId?: string; asSpectator?: boolean; spectatorRevealCards?: boolean }
  | { type: 'sync_session'; roomId: string; playerId: string }
  | { type: 'add_bot'; roomId: string }
  | { type: 'fill_bots'; roomId: string }
  | { type: 'start_solo'; playerName: string; avatar: string; botCount: number; settings?: Partial<RoomSettings> }
  | { type: 'update_settings'; roomId: string; settings: Partial<RoomSettings> }
  | { type: 'leave_room'; roomId: string; playerId: string }
  | { type: 'remove_bot'; roomId: string; botId: string }
  | { type: 'kick_player'; roomId: string; targetPlayerId: string }
  | { type: 'transfer_host'; roomId: string; targetPlayerId: string }
  | { type: 'start_game'; roomId: string }
  | { type: 'play_card'; roomId: string; playerId: string; cardId: string; chosenColor?: CardColor }
  | { type: 'draw_card'; roomId: string; playerId: string }
  | { type: 'pass_turn'; roomId: string; playerId: string }
  | { type: 'call_uno'; roomId: string; playerId: string }
  | { type: 'catch_uno'; roomId: string; playerId: string }
  | { type: 'send_chat'; roomId: string; playerId: string; text: string }
  | { type: 'send_emote'; roomId: string; playerId: string; emoteId: string }
  | { type: 'get_open_rooms' }
  // Mensagens de Sinalização WebRTC (retransmitidas aos destinatários)
  | { type: 'rtc_offer'; roomId: string; fromPlayerId: string; toPlayerId: string; offer: any }
  | { type: 'rtc_answer'; roomId: string; fromPlayerId: string; toPlayerId: string; answer: any }
  | { type: 'rtc_ice_candidate'; roomId: string; fromPlayerId: string; toPlayerId: string; candidate: any }
  | { type: 'rtc_voice_state'; roomId: string; playerId: string; isMuted: boolean; isDeafened: boolean; isSpeaking: boolean; joined: boolean };
```

### 5.2 Mensagens Enviadas pelo Servidor (`ServerMessage`)
```typescript
export type ServerMessage =
  | { type: 'room_joined'; roomId: string; playerId: string }
  | { type: 'game_state'; state: GameState }
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'game_log'; log: GameLog }
  | { type: 'sound_event'; sound: 'play' | 'draw' | 'uno' | 'reverse' | 'skip' | 'wild' | 'win' | 'penalty' }
  | { type: 'player_emote'; emote: ActiveEmote }
  | { type: 'open_rooms_list'; rooms: OpenRoomSummary[] }
  | { type: 'player_kicked'; reason: string }
  | { type: 'error'; message: string };
```

---

## 6. Implementação de Voz P2P WebRTC Estrita
Para manter o servidor livre de processamento de áudio pesado, a comunicação de voz utiliza uma arquitetura de **malha WebRTC (Full Mesh)**. Cada jogador estabelece conexões diretas individuais com todos os outros participantes ativos no canal de áudio da sala.

### 6.1 Prevenção de Eco de Hardware e Vazamento de Áudio
Para possibilitar testes com múltiplos aparelhos em proximidade física (ex: dois celulares lado a lado) e garantir isolamento, a implementação da classe `VoiceService` segue regras estritas de corte de áudio:

1. **Ativação Segura do Microfone (`getUserMedia`):**
   ```typescript
   navigator.mediaDevices.getUserMedia({
     audio: {
       echoCancellation: { ideal: true },
       noiseSuppression: { ideal: true },
       autoGainControl: { ideal: true }
     },
     video: false
   });
   ```
2. **Corte Total na Transmissão (Mute Ativo):**
   Ao ativar o Mute, o transmissor desabilita as faixas de áudio e as substitui por `null` nos emissores RTP das conexões Peer-to-Peer. Isso força o navegador a interromper fisicamente o envio de pacotes UDP de voz:
   ```typescript
   localStream.getAudioTracks().forEach(t => t.enabled = false);
   peerConnections.forEach(pc => {
     pc.getSenders().forEach(sender => {
       if (sender.track?.kind === 'audio') {
         sender.track.enabled = false;
         sender.replaceTrack(null).catch(() => {});
       }
     });
   });
   ```
3. **Corte Total no Receptor (Silenciamento por Software):**
   Ao receber o estado `{ isMuted: true }` via sinalização WebSocket de um jogador remoto, todos os outros jogadores imediatamente forçam o silenciamento do elemento `<audio>` associado àquele jogador:
   ```typescript
   const audio = remoteAudioElements.get(playerId);
   if (audio) {
     audio.muted = true;
     audio.volume = 0;
   }
   ```

---

## 7. Motor do Jogo UNO (`unoEngine.ts`)

O motor de jogo é responsável por gerenciar as regras oficiais do baralho e turnos, além da simulação de inteligência artificial de robôs (bots).

### 7.1 Fluxo de IA dos Bots
* **Velocidade de Ação:** Configurável de `1000ms` a `3000ms`.
* **Processo de Decisão:**
  1. O bot analisa suas cartas da mão.
  2. Filtra quais cartas são jogáveis sobre a carta no topo da pilha de descarte (`isCardPlayable()`).
  3. Se houver cartas válidas:
     * Prefere jogar cartas especiais de ataque (`+2`, `Coringa +4`, `Pular`, `Inverter`) se as regras estiverem favoráveis.
     * Caso contrário, joga uma carta numérica compatível.
     * Se jogar um Coringa, escolhe a cor predominante entre suas cartas restantes na mão.
  4. Se não houver cartas jogáveis:
     * O bot saca uma carta do baralho automaticamente.
     * Se a carta sacada for jogável, ele a joga imediatamente. Caso contrário, passa o turno.
  5. **Regra do UNO:** Se o bot ficar com apenas 1 carta, ele calcula uma chance de 85% de "Gritar UNO" instantaneamente. Se o bot falhar nos 15%, qualquer jogador humano pode clicar em "Pegar UNO" para puni-lo com a compra de 2 cartas.

---

## 8. Controle de Unicidade de Nomes

Para proteger contas de usuários cadastrados e manter a integridade visual da mesa de jogo:
1. **No Cadastro:** O servidor Express confere se o `displayName` solicitado já existe em `data/users.json` (Case-Insensitive). Se sim, bloqueia o cadastro de nova conta com esse apelido.
2. **Nas Salas de Espera:** Ao tentar entrar em uma sala com um nome de exibição, o servidor confere:
   * Se já há algum jogador conectado com esse apelido na mesma sala (bloqueia duplicados).
   * Se o apelido pertence a uma conta de usuário cadastrada e o jogador tentando entrar é um visitante não autenticado (bloqueia o roubo de identidade).

---

## 9. Persistência de Dados Baseada em Disco

A persistência de dados é mantida de forma leve no diretório estruturado `/data`.

* **`users.json`:** Armazena os perfis de usuários cadastrados (id, username, passwordHash de bcrypt, displayName, avatar, role, tag).
* **`invites.json`:** Lista de convites gerados por administradores para novos registros (code, expiresAt, maxUses, usedCount, usedBy).
* **`stats.json`:** Tabela de pontuações de carreira, partidas ganhas, rodadas jogadas e conquistas destravadas de cada ID de jogador.

Para evitar corrupção de arquivos em escritas concorrentes, as rotinas de persistência usam escritas síncronas atômicas temporárias em disco (`fs.writeFileSync`).

---

## 10. Procedimentos de Backup Local e Deploy em VM

O projeto possui fluxo padronizado de deploy e backup local de segurança na Máquina Virtual.

### 10.1 Comando Único de Atualização e Backup Local na VM
```bash
cd ~/Uno-KaWiHe && sudo chown -R $USER:$USER . && git tag -f -a backupanteslayout -m "Backup antes do novo layout" && mkdir -p ~/backups_kawihe && cp -r . ~/backups_kawihe/backup_$(date +%Y%m%d_%H%M%S) && git pull && docker compose up -d --build
```

#### O que o comando realiza:
1. **`cd ~/Uno-KaWiHe`**: Acessa o diretório raiz da aplicação na VM.
2. **`sudo chown -R $USER:$USER .`**: Corrige permissões de arquivo para o usuário atual.
3. **`git tag -f -a backupanteslayout`**: Cria/atualiza a tag local no Git.
4. **`cp -r . ~/backups_kawihe/backup_...`**: Copia o código, repositório Git e pasta de dados para o diretório de backups local.
5. **`git pull`**: Atualiza o repositório local com as alterações do repositório remoto.
6. **`docker compose up -d --build`**: Recompila as imagens Docker e reinicia a aplicação.

