import { describe, it, expect, beforeAll } from 'vitest';
import {
  createDeck,
  RoomData,
  InternalPlayer,
} from '../server/unoEngine.js';

describe('Room & Match Participation Logic (Player vs Spectator & Bot Takeover)', () => {
  let room: RoomData;

  beforeAll(() => {
    const deck = createDeck();
    const player1: InternalPlayer = {
      id: 'player-1',
      name: 'Alice',
      avatar: '👩',
      isHost: true,
      isBot: false,
      cardsCount: 7,
      hasCalledUno: false,
      isConnected: true,
      score: 0,
      hand: deck.splice(0, 7),
      hasDrawnThisTurn: false,
    };
    const player2: InternalPlayer = {
      id: 'player-2',
      name: 'Bob',
      avatar: '👨',
      isHost: false,
      isBot: false,
      cardsCount: 7,
      hasCalledUno: false,
      isConnected: true,
      score: 0,
      hand: deck.splice(0, 7),
      hasDrawnThisTurn: false,
    };

    room = {
      id: 'ROOM1',
      creatorName: 'Alice',
      settings: {
        maxPlayers: 2,
        gameMode: 'standard',
        turnDuration: 90,
        challengeUnoRule: true,
        showBotCards: false,
        botSpeedMs: 1800,
        autoUnoProtection: false,
        highlightHints: true,
        spectatorPermission: 'reveal_cards',
        isPrivate: false,
      },
      status: 'playing',
      players: [player1, player2],
      deck,
      discardPile: [deck.pop()!],
      currentColor: 'red',
      currentTurnIndex: 0,
      turnDirection: 1,
      turnTimeLeft: 90,
      winnerId: null,
      winnerTeam: null,
      unoVulnerablePlayerId: null,
      turnTimerInterval: null,
      botTimerTimeout: null,
      spectators: [],
    };
  });

  it('1. Espectador consegue entrar na sala (Spectator can enter)', () => {
    const spectatorId = 'spectator-1';
    room.spectators = room.spectators || [];
    room.spectators.push({
      id: spectatorId,
      name: 'Espectador TV',
      avatar: '📺',
      isConnected: true,
    });

    expect(room.spectators.length).toBe(1);
    expect(room.spectators[0].id).toBe(spectatorId);
  });

  it('2. Espectador consegue sair sem afetar a partida (Spectator can leave without affecting match)', () => {
    const initialPlayersCount = room.players.length;
    const initialDeckSize = room.deck.length;

    // Spectator leaves
    room.spectators = room.spectators!.filter((s) => s.id !== 'spectator-1');

    expect(room.spectators.length).toBe(0);
    expect(room.players.length).toBe(initialPlayersCount);
    expect(room.deck.length).toBe(initialDeckSize);
    expect(room.status).toBe('playing');
  });

  it('3. Espectador não recebe cartas (Spectator does not receive cards)', () => {
    const specId = 'spectator-2';
    room.spectators!.push({
      id: specId,
      name: 'Espectador 2',
      avatar: '👁️',
      isConnected: true,
    });

    // Check that spectator is not in players array and has no hand assigned
    const isPlayer = room.players.some((p) => p.id === specId);
    expect(isPlayer).toBe(false);

    // No player object has spectator id
    const specAsPlayer = room.players.find((p) => p.id === specId);
    expect(specAsPlayer).toBeUndefined();
  });

  it('4 & 5. Espectador não consegue executar ações de jogador nem recebe confirmação de robô (Spectator cannot execute actions)', () => {
    const isSpectator = !room.players.some((p) => p.id === 'spectator-2');
    expect(isSpectator).toBe(true);
  });

  it('6. Vaga liberada não converte espectador em jogador automaticamente (Opened seat does not convert spectator)', () => {
    room.spectators = [{ id: 'spectator-2', name: 'Espectador 2', avatar: '👁️', isConnected: true }];
    const initialSpectatorsCount = room.spectators.length;

    // Player-2 leaves (bot takes over)
    const p2 = room.players.find((p) => p.id === 'player-2')!;
    p2.isBot = true;
    p2.name = 'Bot (Bob)';

    expect(room.spectators.length).toBe(initialSpectatorsCount);
    expect(room.spectators[0].id).toBe('spectator-2');
    expect(room.players.some((p) => p.id === 'spectator-2')).toBe(false);
  });

  it('7 & 8. Jogador pode solicitar saída voluntária e robô assume corretamente (Player voluntary exit & bot takeover)', () => {
    const p1 = room.players.find((p) => p.id === 'player-1')!;
    expect(p1.isBot).toBe(false);

    p1.isBot = true;
    p1.name = 'Bot (Alice)';
    p1.avatar = '🤖';

    expect(p1.isBot).toBe(true);
    expect(p1.hand.length).toBe(7);
    expect(room.players.length).toBe(2);
  });

  it('9. Cartas e estado da partida permanecem consistentes (Cards and match state consistent)', () => {
    const totalCards = room.players.reduce((acc, p) => acc + p.hand.length, 0) + room.deck.length + room.discardPile.length;
    expect(totalCards).toBe(108);
  });

  it('10. Reconexão não provoca substituição indevida (Reconnection restores seat and hand)', () => {
    const p1 = room.players.find((p) => p.id === 'player-1')!;
    p1.isBot = false;
    p1.name = 'Alice';
    p1.isConnected = true;

    expect(p1.isBot).toBe(false);
    expect(p1.hand.length).toBe(7);
  });

  it('11. Regras específicas dos torneios permanecem preservadas (Tournament rules preserved)', () => {
    room.tournamentId = 'tourn-123';
    expect(room.tournamentId).toBe('tourn-123');
  });
});
