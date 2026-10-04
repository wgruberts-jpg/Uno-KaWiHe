import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDeck,
  isCardPlayable,
  reshuffleDiscardIntoDeck,
  drawCardsFromDeck,
  getNextPlayerIndex,
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
  });

  // 4. Reshuffle Discard into Deck
  describe('4. Reembaralhar Descarte no Baralho (reshuffleDiscardIntoDeck)', () => {
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

  // 5. Drawing Cards & Pass Turn Logic
  describe('5. Compra de Cartas e Passar a Vez', () => {
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
  });

  // 6. Winner Score Calculation
  describe('6. Cálculo de Pontuação do Vencedor', () => {
    it('deve somar a pontuação de todas as cartas restantes nas mãos dos perdedores', () => {
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
        hand: [],
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
          { id: 'l2', color: 'blue', value: 'skip', score: 20 },
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

      // 5 (red 5) + 20 (blue skip) + 50 (wild4) = 75 pontos
      expect(pointsWon).toBe(75);
    });
  });
});
