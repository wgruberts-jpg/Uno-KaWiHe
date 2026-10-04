# 📄 ESPECIFICAÇÃO TÉCNICA E ARQUITETURA — UNO KAWIHE v2.2

Este documento descreve detalhadamente a arquitetura, protocolos de comunicação, modelo de dados e decisões de implementação do **Uno KaWiHe v2.2**. Ele foi estruturado de forma a servir como um manual completo para recriação total e idêntica do sistema a partir do zero por qualquer engenheiro de software ou modelo de Inteligência Artificial.

---

## 1. Visão Geral do Sistema
O **Uno KaWiHe v2.2** é uma plataforma full-stack de jogo de cartas UNO multiplayer em tempo real, focada em ambientes familiares e infantis (*Kids & Família*). O sistema opera sem banco de dados SQL pesado convencional para simplificar o deploy (utilizando armazenamento JSON estruturado com escrita atômica física `fsync` em disco) e oferece comunicação de voz direta **Peer-to-Peer (P2P)** via WebRTC (0% consumo de servidor de mídia) e comunicação de estado do jogo via WebSockets com envelope de mensagens versão 2 (`protocolVersion: 2`).

### Pilhas de Tecnologia (Tech Stack)
* **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, Lucide Icons.
* **Backend:** Node.js, Express, WebSockets (`ws`), TypeScript.
* **Testes Automatizados:** Vitest (14 testes unitários cobrindo o motor de jogo `unoEngine`).
* **Comunicação em Tempo Real:** WebSockets (sincronização de estado da partida, chat da sala e lobbies) e WebRTC (voz P2P direta com sinalização sanitizada via WebSocket).
* **Persistência Atômica:** Disco local (`data/users.json`, `data/invites.json`, `data/stats.json`) com sincronização física `fsyncSync` + `renameSync` e cache em memória.
* **Deploy:** Docker, Docker Compose, compatível com qualquer VM (Oracle Cloud, AWS, GCP) com suporte a SSL (HTTPS) obrigatório para WebRTC.

---

## 2. Arquitetura e Estrutura de Pastas

```text
/
├── server.ts                 # Ponto de entrada do Servidor Express + WebSocket
├── server/
│   ├── unoEngine.ts          # Motor de Regras do Jogo UNO (Cartas, Turnos, Bots)
│   └── authService.ts        # Serviço de Autenticação, Cadastro e Controle de Convites
├── tests/
│   └── unoEngine.test.ts     # Suíte de Testes Unitários Automatizados (Vitest)
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

## 4. Protocolo WebSocket v2, Idempotência e Reconexão

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

### 4.3 Reconexão Resiliente via `reconnectToken`
- Ao entrar em uma sala (`room_joined`), o servidor emite um token secreto `reconnectToken`.
- O cliente salva o token no `sessionStorage`.
- Ao reconectar via `sync_session`, o cliente transmite o `reconnectToken`.
- O servidor valida o token em relação à sessão salva. Tentativas de usurpação de `playerId` sem token válido são imediatamente rejeitadas com `NOT_AUTHENTICATED`.

---

## 5. Implementação de Voz P2P WebRTC e Sanitização

Para manter o servidor livre de processamento de áudio pesado, a comunicação de voz utiliza uma arquitetura de **malha WebRTC (Full Mesh)**.

### 5.1 Sanitização de Origem nos Sinais
Na retransmissão de mensagens de sinalização P2P (`webrtc_offer`, `webrtc_answer`, `webrtc_candidate`), o servidor **sempre sobrescreve o campo `fromPlayerId`** com o ID do jogador associado ao socket autenticado, impedindo falsificação de origem.

---

## 6. Persistência Atômica com `fsync`

A escrita dos arquivos JSON em `./data/` usa um fluxo físico de segurança atômica:
```typescript
function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const fd = fs.openSync(tempPath, 'w');
  fs.writeSync(fd, data, 0, 'utf-8');
  fs.fsyncSync(fd); // Força gravação física no disco rígido/SSD
  fs.closeSync(fd);
  fs.renameSync(tempPath, filePath); // Substituição atômica no sistema de arquivos
}
```

---

## 7. Suíte de Testes Automatizados (Vitest)

O motor de regras `unoEngine.ts` possui cobertura de testes unitários automatizados executados via `npm test` (`vitest run`).
- **Composição do Baralho:** 108 cartas, verificação por cor e tipo.
- **Jogabilidade (`isCardPlayable`):** Validação de regras de descarte, cores ativas e coringas.
- **Navegação de Turnos:** Sentido horário, anti-horário, saltos (`steps = 2`) e efeito de Reverso com 2 jogadores.
- **Reciclagem do Descarte:** Preservação de cores de cartas coloridas e reset apenas de Coringas.
- **Timer de Turno:** Expiração com e sem compra prévia.
- **Pontuação:** Cálculo correto da soma das cartas dos perdedores ao vencer a rodada.
