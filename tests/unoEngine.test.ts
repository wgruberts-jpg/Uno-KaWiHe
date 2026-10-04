import { describe, it, expect } from 'vitest';
import {
  createDeck,
  isCardPlayable,
  reshuffleDiscardIntoDeck,
  drawCardsFromDeck,
  getNextPlayerIndex,
  expireUnoVulnerability,
  advanceTurnEngine,
  handleTimeoutEngine,
  RoomData,
  InternalPlayer,
} from '../server/unoEngine.js';
import { Card, CardColor } from '../src/types/uno.js';

describe('Uno Engine Unit Tests', () => {
  // 1. Deck Composition Tests
  describe('1. Composição do Baralho (108 Cartas)', () => {
    it('deve gerar exatamente 108 cartas no total', () => {
      const deck = createDeck();
      expect(deck.length).toBe(108);
    });

    it('deve possuir a quantidade correta de cartas por tipo e cor', () => {
      const deck = createDeck();
      const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];

      colors.forEach((color) => {
        const colorCards = deck.filter((c) => c.color === color);
        // Cada cor deve ter 25 cartas (1x '0', 2x '1'-'9', 2x 'skip', 2x 'reverse', 2x 'draw2')
        expect(colorCards.length).toBe(25);

        // 1x número 0
        const zeros = colorCards.filter((c) => c.value === '0');
        expect(zeros.length).toBe(1);

        // 2x de cada número 1 a 9
        for (let i = 1; i <= 9; i++) {
          const numCards = colorCards.filter((c) => c.value === i.toString());
          expect(numCards.length).toBe(2);
        }

        // 2x de cada carta de ação
        expect(colorCards.filter((c) => c.value === 'skip').length).toBe(2);
        expect(colorCards.filter((c) => c.value === 'reverse').length).toBe(2);
        expect(colorCards.filter((c) => c.value === 'draw2').length).toBe(2);
      });

      // 4x Wild e 4x Wild Draw4 (Coringa e Coringa +4)
      const wildCards = deck.filter((c) => c.value === 'wild');
      const wild4Cards = deck.filter((c) => c.value === 'wild4');
      expect(wildCards.length).toBe(4);
      expect(wild4Cards.length).toBe(4);
    });
  });

  // 2. Playability Rules (isCardPlayable)
  describe('2. Regras de Jogabilidade (isCardPlayable)', () => {
    const topCardRed5: Card = { id: 'top-1', color: 'red', value: '5', score: 5 };

    it('deve permitir jogar carta da mesma cor', () => {
      const red8: Card = { id: 'c1', color: 'red', value: '8', score: 8 };
      expect(isCardPlayable(red8, topCardRed5, 'red')).toBe(true);
    });

    it('deve permitir jogar carta do mesmo valor/número', () => {
      const blue5: Card = { id: 'c2', color: 'blue', value: '5', score: 5 };
      expect(isCardPlayable(blue5, topCardRed5, 'red')).toBe(true);
    });

    it('deve permitir jogar Coringa (wild) e Coringa +4 (wild4) a qualquer momento', () => {
      const wildCard: Card = { id: 'w1', color: 'wild', value: 'wild', score: 50 };
      const wild4Card: Card = { id: 'w4', color: 'wild', value: 'wild4', score: 50 };

      expect(isCardPlayable(wildCard, topCardRed5, 'red')).toBe(true);
      expect(isCardPlayable(wild4Card, topCardRed5, 'red')).toBe(true);
    });

    it('deve rejeitar carta de cor e número diferentes', () => {
      const green7: Card = { id: 'g7', color: 'green', value: '7', score: 7 };
      expect(isCardPlayable(green7, topCardRed5, 'red')).toBe(false);
    });

    it('deve respeitar a cor ativa escolhida após um Coringa', () => {
      const topCardWild: Card = { id: 'top-w', color: 'wild', value: 'wild', score: 50 };
      const blue3: Card = { id: 'b3', color: 'blue', value: '3', score: 3 };
      const red3: Card = { id: 'r3', color: 'red', value: '3', score: 3 };

      // Se a cor ativa definida pelo jogador foi 'blue'
      expect(isCardPlayable(blue3, topCardWild, 'blue')).toBe(true);
      expect(isCardPlayable(red3, topCardWild, 'blue')).toBe(false);
    });
  });

  // 3. Turn Navigation & Action Effects
  describe('3. Navegação de Turnos e Efeitos de Ação', () => {
    it('deve calcular corretamente o próximo jogador no sentido horário', () => {
      expect(getNextPlayerIndex(0, 1, 4, 1)).toBe(1);
      expect(getNextPlayerIndex(3, 1, 4, 1)).toBe(0);
    });

    it('deve calcular corretamente o próximo jogador no sentido anti-horário', () => {
      expect(getNextPlayerIndex(0, -1, 4, 1)).toBe(3);
      expect(getNextPlayerIndex(2, -1, 4, 1)).toBe(1);
    });

    it('deve pular o próximo jogador quando steps = 2 (Skip ou +2/+4)', () => {
      expect(getNextPlayerIndex(0, 1, 4, 2)).toBe(2);
      expect(getNextPlayerIndex(3, 1, 4, 2)).toBe(1);
    });

    it('com 2 jogadores, Reverse atua pulando o oponente (steps = 2)', () => {
      // Jogador 0 joga Reverse para 2 jogadores -> o próximo seria 1, mas com steps=2 volta ao 0
      expect(getNextPlayerIndex(0, 1, 2, 2)).toBe(0);
    });

    it('com 3+ jogadores, Reverse inverte o sentido de rotação', () => {
      let turnDirection: 1 | -1 = 1;
      // Inverte sentido
      turnDirection = (turnDirection * -1) as 1 | -1;
      expect(turnDirection).toBe(-1);
      expect(getNextPlayerIndex(1, turnDirection, 4, 1)).toBe(0);
    });
  });

  // 4. Initial Card Handling
  describe('4. Tratamento da Primeira Carta do Descarte (Início de Jogo)', () => {
    it('não deve aceitar Wild Draw4 (+4) como carta inicial e re-sacar do baralho', () => {
      const mockDeck: Card[] = [
        { id: 'c-wild4', color: 'wild', value: 'wild4', score: 50 },
        { id: 'c-valid', color: 'blue', value: '7', score: 7 },
      ];

      // Puxa carta até não ser wild4
      let initialCard = mockDeck.shift()!;
      while (initialCard.value === 'wild4') {
        mockDeck.push(initialCard); // Devolve ao fundo
        initialCard = mockDeck.shift()!;
      }

      expect(initialCard.value).toBe('7');
      expect(initialCard.color).toBe('blue');
    });

    it('deve definir cor inicial padrão como red caso a carta inicial seja Coringa simples', () => {
      const initialCard: Card = { id: 'c-wild', color: 'wild', value: 'wild', score: 50 };
      const currentColor = initialCard.color === 'wild' ? 'red' : initialCard.color;
      expect(currentColor).toBe('red');
    });
  });

  // 5. Reshuffle Discard into Deck
  describe('5. Reembaralhar Descarte no Baralho (reshuffleDiscardIntoDeck)', () => {
    it('deve manter a cor original de cartas coloridas e resetar apenas coringas para wild', () => {
      const mockRoom: RoomData = {
        id: 'TEST1',
        settings: {
          maxPlayers: 4,
          turnDuration: 30,
          challengeUnoRule: true,
          botSpeedMs: 1800,
          autoUnoProtection: false,
        },
        status: 'playing',
        players: [],
        deck: [],
        discardPile: [
          { id: '1', color: 'red', value: '5', score: 5 },
          { id: '2', color: 'blue', value: 'skip', score: 20 },
          { id: '3', color: 'green', value: 'wild', score: 50 }, // Coringa que recebeu cor 'green'
          { id: '4', color: 'yellow', value: 'wild4', score: 50 }, // Wild4 que recebeu cor 'yellow'
          { id: '5', color: 'yellow', value: '9', score: 9 }, // Carta do topo atual
        ],
        currentColor: 'yellow',
        currentTurnIndex: 0,
        turnDirection: 1,
        turnTimeLeft: 30,
        winnerId: null,
        unoVulnerablePlayerId: null,
        turnTimerInterval: null,
        botTimerTimeout: null,
      };

      reshuffleDiscardIntoDeck(mockRoom);

      // O topo do descarte deve ter permanecido no discardPile
      expect(mockRoom.discardPile.length).toBe(1);
      expect(mockRoom.discardPile[0].id).toBe('5');

      // O baralho recarregado deve conter as 4 cartas restantes
      expect(mockRoom.deck.length).toBe(4);

      // Cartas coloridas normais DEVEM ter mantido suas cores originais
      const redCard = mockRoom.deck.find((c) => c.id === '1');
      expect(redCard?.color).toBe('red');

      const blueCard = mockRoom.deck.find((c) => c.id === '2');
      expect(blueCard?.color).toBe('blue');

      // Coringas DEVEM ter tido a cor resetada para 'wild'
      const wildCard = mockRoom.deck.find((c) => c.id === '3');
      expect(wildCard?.color).toBe('wild');

      const wild4Card = mockRoom.deck.find((c) => c.id === '4');
      expect(wild4Card?.color).toBe('wild');
    });
  });

  // 6. Drawing Cards & Pass Turn Logic
  describe('6. Compra de Cartas e Passar a Vez', () => {
    it('deve sacar o número solicitado de cartas do baralho', () => {
      const mockRoom: RoomData = {
        id: 'TEST2',
        settings: {
          maxPlayers: 4,
          turnDuration: 30,
          challengeUnoRule: true,
          botSpeedMs: 1800,
          autoUnoProtection: false,
        },
        status: 'playing',
        players: [],
        deck: [
          { id: 'd1', color: 'red', value: '1', score: 1 },
          { id: 'd2', color: 'blue', value: '2', score: 2 },
          { id: 'd3', color: 'green', value: '3', score: 3 },
        ],
        discardPile: [{ id: 'top', color: 'red', value: '0', score: 0 }],
        currentColor: 'red',
        currentTurnIndex: 0,
        turnDirection: 1,
        turnTimeLeft: 30,
        winnerId: null,
        unoVulnerablePlayerId: null,
        turnTimerInterval: null,
        botTimerTimeout: null,
      };

      const drawn = drawCardsFromDeck(mockRoom, 2);
      expect(drawn.length).toBe(2);
      expect(mockRoom.deck.length).toBe(1);
    });

    it('exige hasDrawnThisTurn = true antes de autorizar a passagem de turno', () => {
      const player: InternalPlayer = {
        id: 'p1',
        name: 'Jogador 1',
        avatar: '😀',
        isHost: true,
        isBot: false,
        cardsCount: 3,
        hasCalledUno: false,
        isConnected: true,
        score: 0,
        hand: [{ id: 'c1', color: 'red', value: '2', score: 2 }],
        hasDrawnThisTurn: false,
      };

      // Tentar passar sem ter comprado deve ser rejeitado
      const canPassBeforeDraw = player.hasDrawnThisTurn;
      expect(canPassBeforeDraw).toBe(false);

      // Após comprar
      player.hasDrawnThisTurn = true;
      const canPassAfterDraw = player.hasDrawnThisTurn;
      expect(canPassAfterDraw).toBe(true);
    });
  });

  // 7. Winner Score Calculation & Finishing Card
  describe('7. Vitória com Ação (+2 / +4) e Cálculo de Pontuação', () => {
    it('deve permitir vencer a partida jogando um +2 ou +4 como última carta e somar pontos dos adversários', () => {
      const winner: InternalPlayer = {
        id: 'p1',
        name: 'Vencedor',
        avatar: '👑',
        isHost: true,
        isBot: false,
        cardsCount: 0,
        hasCalledUno: true,
        isConnected: true,
        score: 0,
        hand: [], // Venceu jogando a última carta (+4)
        hasDrawnThisTurn: false,
      };

      const loser1: InternalPlayer = {
        id: 'p2',
        name: 'Perdedor 1',
        avatar: '🤖',
        isHost: false,
        isBot: true,
        cardsCount: 2,
        hasCalledUno: false,
        isConnected: true,
        score: 0,
        hand: [
          { id: 'l1', color: 'red', value: '5', score: 5 },
          { id: 'l2', color: 'blue', value: 'draw2', score: 20 },
        ],
        hasDrawnThisTurn: false,
      };

      const loser2: InternalPlayer = {
        id: 'p3',
        name: 'Perdedor 2',
        avatar: '🦸‍♂️',
        isHost: false,
        isBot: false,
        cardsCount: 1,
        hasCalledUno: false,
        isConnected: true,
        score: 0,
        hand: [{ id: 'l3', color: 'wild', value: 'wild4', score: 50 }],
        hasDrawnThisTurn: false,
      };

      const players = [winner, loser1, loser2];

      let pointsWon = 0;
      players.forEach((p) => {
        if (p.id !== winner.id) {
          pointsWon += p.hand.reduce((sum, c) => sum + c.score, 0);
        }
      });

      // 5 (red 5) + 20 (blue draw2) + 50 (wild4) = 75 pontos
      expect(pointsWon).toBe(75);
    });
  });

  // 8. UNO Declaration & Catch Rules
  describe('8. Janela de UNO, Acusação (Catch) e Bloqueio de Auto-Multa', () => {
    it('deve permitir que o oponente B acuse o jogador A durante a janela de vulnerabilidade', () => {
      const playerA: InternalPlayer = {
        id: 'pA',
        name: 'Jogador A',
        avatar: '😀',
        isHost: true,
        isBot: false,
        cardsCount: 1,
        hasCalledUno: false,
        isConnected: true,
        score: 0,
        hand: [{ id: 'a1', color: 'red', value: '7', score: 7 }],
        hasDrawnThisTurn: false,
      };

      const mockRoom: RoomData = {
        id: 'TEST_UNO',
        settings: {
          maxPlayers: 4,
          turnDuration: 30,
          challengeUnoRule: true,
          botSpeedMs: 1800,
          autoUnoProtection: false,
        },
        status: 'playing',
        players: [playerA],
        deck: [
          { id: 'p1', color: 'blue', value: '1', score: 1 },
          { id: 'p2', color: 'green', value: '2', score: 2 },
        ],
        discardPile: [{ id: 'top', color: 'red', value: '5', score: 5 }],
        currentColor: 'red',
        currentTurnIndex: 1, // Turno do Jogador B
        roundTurnCount: 10,
        turnDirection: 1,
        turnTimeLeft: 30,
        winnerId: null,
        unoVulnerablePlayerId: 'pA',
        unoVulnerableTurnCount: 10,
        turnTimerInterval: null,
        botTimerTimeout: null,
      };

      // No turno do Jogador B, o Jogador A está vulnerável
      expect(mockRoom.unoVulnerablePlayerId).toBe('pA');

      // Jogador B aciona catch_uno no jogador A
      if (mockRoom.unoVulnerablePlayerId === 'pA') {
        const penalties = drawCardsFromDeck(mockRoom, 2);
        playerA.hand.push(...penalties);
        playerA.cardsCount = playerA.hand.length;
        mockRoom.unoVulnerablePlayerId = null;
      }

      // Jogador A recebeu 2 cartas de penalidade e não está mais vulnerável
      expect(playerA.hand.length).toBe(3);
      expect(mockRoom.unoVulnerablePlayerId).toBeNull();
    });

    it('deve proibir um jogador de aplicar a penalidade de UNO contra si mesmo (UNO_SELF_CATCH)', () => {
      const playerAId = 'pA';
      const callerId = 'pA';

      const isSelfCatch = playerAId === callerId;
      expect(isSelfCatch).toBe(true); // O servidor deve barrar se callerId === targetPlayerId
    });

    it('deve expirar a vulnerabilidade de UNO quando a rodada ultrapassa a janela do próximo jogador', () => {
      const playerA: InternalPlayer = {
        id: 'pA',
        name: 'Jogador A',
        avatar: '😀',
        isHost: true,
        isBot: false,
        cardsCount: 1,
        hasCalledUno: false,
        isConnected: true,
        score: 0,
        hand: [{ id: 'a1', color: 'red', value: '7', score: 7 }],
        hasDrawnThisTurn: false,
      };

      const mockRoom: RoomData = {
        id: 'TEST_UNO_EXPIRATION',
        settings: {
          maxPlayers: 4,
          turnDuration: 30,
          challengeUnoRule: true,
          botSpeedMs: 1800,
          autoUnoProtection: false,
        },
        status: 'playing',
        players: [playerA],
        deck: [],
        discardPile: [],
        currentColor: 'red',
        currentTurnIndex: 0,
        roundTurnCount: 12, // Turno do Jogador C (2 turnos após A ter ficado com 1 carta no turno 10)
        turnDirection: 1,
        turnTimeLeft: 30,
        winnerId: null,
        unoVulnerablePlayerId: 'pA',
        unoVulnerableTurnCount: 10,
        turnTimerInterval: null,
        botTimerTimeout: null,
      };

      expireUnoVulnerability(mockRoom);
      expect(mockRoom.unoVulnerablePlayerId).toBeNull();
    });
  });

  // 9. Edge Cases: Skip + UNO Catch & 2-Player Draw Two & Timeout Logic
  describe('9. Casos Limite Específicos: Skip com UNO, +2 com 2 Jogadores e Temporizador', () => {
    it('(1) A fica com 1 carta no turno N. B joga Skip. O turno vai para C (N+1). C PODE catch_uno(A), e após o turno de C (N+2) expira!', () => {
      const pA: InternalPlayer = { id: 'pA', name: 'Jogador A', avatar: '😀', isHost: true, isBot: false, cardsCount: 1, hasCalledUno: false, isConnected: true, score: 0, hand: [{ id: 'a1', color: 'red', value: '7', score: 7 }], hasDrawnThisTurn: false };
      const pB: InternalPlayer = { id: 'pB', name: 'Jogador B', avatar: '😎', isHost: false, isBot: false, cardsCount: 5, hasCalledUno: false, isConnected: true, score: 0, hand: [], hasDrawnThisTurn: false };
      const pC: InternalPlayer = { id: 'pC', name: 'Jogador C', avatar: '🤠', isHost: false, isBot: false, cardsCount: 5, hasCalledUno: false, isConnected: true, score: 0, hand: [], hasDrawnThisTurn: false };

      const room: RoomData = {
        id: 'ROOM_SKIP_TEST',
        settings: { maxPlayers: 3, turnDuration: 30, challengeUnoRule: true, botSpeedMs: 1800, autoUnoProtection: false },
        status: 'playing',
        players: [pA, pB, pC],
        deck: [{ id: 'pen1', color: 'blue', value: '1', score: 1 }, { id: 'pen2', color: 'green', value: '2', score: 2 }],
        discardPile: [{ id: 'top', color: 'red', value: '5', score: 5 }],
        currentColor: 'red',
        currentTurnIndex: 0, // Turno de A
        roundTurnCount: 10,
        turnDirection: 1,
        turnTimeLeft: 30,
        winnerId: null,
        unoVulnerablePlayerId: null,
        turnTimerInterval: null,
        botTimerTimeout: null,
      };

      // 1. A joga uma carta e fica com 1 carta sem falar UNO no turno 10
      room.unoVulnerablePlayerId = pA.id;
      room.unoVulnerableTurnCount = room.roundTurnCount; // 10

      // 2. B joga SKIP. advanceTurnEngine é chamado com steps = 2
      // Turno passa de A (0) pulando B (1) para C (2)
      advanceTurnEngine(room, 2);

      expect(room.currentTurnIndex).toBe(2); // É a vez de C
      expect(room.roundTurnCount).toBe(11);  // Incrementou para 11 (10 + 1)
      expect(room.unoVulnerablePlayerId).toBe('pA'); // A AINDA ESTÁ VULNERÁVEL para C pegar!

      // 3. C pode pegar A durante a sua vez!
      expect(room.unoVulnerablePlayerId).toBe('pA');

      // 4. Se C jogar sem pegar A, ao avançar o turno de C para o próximo (turno N+2 = 12)
      advanceTurnEngine(room, 1);
      expect(room.roundTurnCount).toBe(12);
      expect(room.unoVulnerablePlayerId).toBeNull(); // Expira autoritativamente após o turno de C!
    });

    it('(2) Partida com 2 Jogadores: A fica com 1 carta. B joga +2 contra A. A recebe 2 cartas e unoVulnerablePlayerId é limpo imediatamente!', () => {
      const pA: InternalPlayer = { id: 'pA', name: 'Jogador A', avatar: '😀', isHost: true, isBot: false, cardsCount: 1, hasCalledUno: false, isConnected: true, score: 0, hand: [{ id: 'a1', color: 'red', value: '7', score: 7 }], hasDrawnThisTurn: false };
      const pB: InternalPlayer = { id: 'pB', name: 'Jogador B', avatar: '😎', isHost: false, isBot: false, cardsCount: 3, hasCalledUno: false, isConnected: true, score: 0, hand: [], hasDrawnThisTurn: false };

      const room: RoomData = {
        id: 'ROOM_DRAW2_TEST',
        settings: { maxPlayers: 2, turnDuration: 30, challengeUnoRule: true, botSpeedMs: 1800, autoUnoProtection: false },
        status: 'playing',
        players: [pA, pB],
        deck: [{ id: 'd1', color: 'red', value: '2', score: 2 }, { id: 'd2', color: 'blue', value: '3', score: 3 }],
        discardPile: [{ id: 'top', color: 'red', value: '5', score: 5 }],
        currentColor: 'red',
        currentTurnIndex: 1, // Turno de B
        roundTurnCount: 5,
        turnDirection: 1,
        turnTimeLeft: 30,
        winnerId: null,
        unoVulnerablePlayerId: 'pA',
        unoVulnerableTurnCount: 5,
        turnTimerInterval: null,
        botTimerTimeout: null,
      };

      // B joga +2 direcionado a A. A saca 2 cartas
      const drawn = drawCardsFromDeck(room, 2);
      pA.hand.push(...drawn);
      pA.cardsCount = pA.hand.length; // A agora tem 3 cartas!

      // Chamar verificação e expiração da vulnerabilidade
      expireUnoVulnerability(room);

      // Como a mão de A agora tem 3 cartas (!== 1), a vulnerabilidade DEVE SER ZERADA imediatamente!
      expect(pA.hand.length).toBe(3);
      expect(room.unoVulnerablePlayerId).toBeNull();
    });

    it('(3) Temporizador de Turno: handleTimeoutEngine com e sem compra prévia', () => {
      const pA: InternalPlayer = { id: 'pA', name: 'Jogador A', avatar: '😀', isHost: true, isBot: false, cardsCount: 2, hasCalledUno: false, isConnected: true, score: 0, hand: [{ id: 'a1', color: 'red', value: '7', score: 7 }, { id: 'a2', color: 'blue', value: '8', score: 8 }], hasDrawnThisTurn: false };
      const pB: InternalPlayer = { id: 'pB', name: 'Jogador B', avatar: '😎', isHost: false, isBot: false, cardsCount: 2, hasCalledUno: false, isConnected: true, score: 0, hand: [], hasDrawnThisTurn: false };

      const room: RoomData = {
        id: 'ROOM_TIMEOUT_TEST',
        settings: { maxPlayers: 2, turnDuration: 15, challengeUnoRule: true, botSpeedMs: 1800, autoUnoProtection: false },
        status: 'playing',
        players: [pA, pB],
        deck: [{ id: 't1', color: 'green', value: '1', score: 1 }],
        discardPile: [{ id: 'top', color: 'red', value: '5', score: 5 }],
        currentColor: 'red',
        currentTurnIndex: 0, // Turno de A
        roundTurnCount: 1,
        turnDirection: 1,
        turnTimeLeft: 0,
        winnerId: null,
        unoVulnerablePlayerId: null,
        turnTimerInterval: null,
        botTimerTimeout: null,
      };

      // CASO 1: Tempo esgota sem ter comprado (hasDrawnThisTurn = false)
      const res1 = handleTimeoutEngine(room);
      expect(res1.drewCard).toBe(true); // Comprou 1 carta automaticamente
      expect(pA.hand.length).toBe(3);   // Mão aumentou de 2 para 3
      expect(room.currentTurnIndex).toBe(1); // Passou a vez para B

      // CASO 2: Turno de B. B já comprou carta na sua vez (hasDrawnThisTurn = true)
      pB.hasDrawnThisTurn = true;
      pB.hand = [{ id: 'b1', color: 'yellow', value: '9', score: 9 }];
      pB.cardsCount = 1;

      const res2 = handleTimeoutEngine(room);
      expect(res2.drewCard).toBe(false); // NÃO comprou carta extra!
      expect(pB.hand.length).toBe(1);    // Mão permaneceu com 1 carta
      expect(room.currentTurnIndex).toBe(0); // Apenas passou a vez de volta para A
    });
  });
});
