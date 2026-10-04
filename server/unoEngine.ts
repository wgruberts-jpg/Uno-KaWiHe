import { Card, CardColor, CardValue, GameState, Player, RematchVote, RoomSettings, StagedCardPlay, TurnDirection } from '../src/types/uno.js';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];

  colors.forEach((color) => {
    // One 0
    deck.push({
      id: `${color}-0-${Math.random().toString(36).substring(2, 7)}`,
      color,
      value: '0',
      score: 0,
    });

    // Two of 1-9
    for (let i = 1; i <= 9; i++) {
      const val = i.toString() as CardValue;
      deck.push({
        id: `${color}-${val}-a-${Math.random().toString(36).substring(2, 7)}`,
        color,
        value: val,
        score: i,
      });
      deck.push({
        id: `${color}-${val}-b-${Math.random().toString(36).substring(2, 7)}`,
        color,
        value: val,
        score: i,
      });
    }

    // Two of Skip, Reverse, Draw2
    const actions: CardValue[] = ['skip', 'reverse', 'draw2'];
    actions.forEach((val) => {
      deck.push({
        id: `${color}-${val}-a-${Math.random().toString(36).substring(2, 7)}`,
        color,
        value: val,
        score: 20,
      });
      deck.push({
        id: `${color}-${val}-b-${Math.random().toString(36).substring(2, 7)}`,
        color,
        value: val,
        score: 20,
      });
    });
  });

  // Four Wild and Four Wild Draw4
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: `wild-${i}-${Math.random().toString(36).substring(2, 7)}`,
      color: 'wild',
      value: 'wild',
      score: 50,
    });
    deck.push({
      id: `wild4-${i}-${Math.random().toString(36).substring(2, 7)}`,
      color: 'wild',
      value: 'wild4',
      score: 50,
    });
  }

  // Shuffle deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

export interface InternalPlayer extends Player {
  hand: Card[];
  hasDrawnThisTurn: boolean;
}

export interface RoomData {
  id: string;
  creatorName?: string;
  settings: RoomSettings;
  status: 'waiting' | 'playing' | 'paused' | 'ended';
  players: InternalPlayer[];
  deck: Card[];
  discardPile: Card[];
  currentColor: CardColor;
  currentTurnIndex: number;
  turnDirection: TurnDirection;
  turnTimeLeft: number;
  winnerId: string | null;
  unoVulnerablePlayerId: string | null;
  unoVulnerableTurnCount?: number;
  turnTimerInterval: NodeJS.Timeout | null;
  botTimerTimeout: NodeJS.Timeout | null;
  emptyRoomTimeout?: NodeJS.Timeout | null;
  spectators?: Array<{ id: string; name: string; avatar: string; isConnected: boolean }>;
  stagedCardPlay?: StagedCardPlay | null;
  stagedCardTimeout?: NodeJS.Timeout | null;
  rematchVotes?: Record<string, RematchVote>;
  spectatorCardsRevealed?: boolean;
  // Session & Round statistics
  roundStartTime?: number;
  roundTurnCount?: number;
  tableScores?: Record<string, { playerId: string; name: string; avatar: string; wins: number; points: number; roundsPlayed: number }>;
  fastestRoundSeconds?: number | null;
  fewestTurnsRound?: number | null;
  lastRoundDurationSeconds?: number;
  lastRoundTurnCount?: number;
  lastRoundPointsWon?: number;
  lastRoundIsFastest?: boolean;
}

export function isCardPlayable(card: Card, topCard: Card, currentColor: CardColor): boolean {
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export function reshuffleDiscardIntoDeck(room: RoomData) {
  if (room.discardPile.length <= 1) return;
  const top = room.discardPile.pop()!;
  const toShuffle = room.discardPile;
  room.discardPile = [top];

  // Reset colors on wild cards in discard
  toShuffle.forEach((c) => {
    if (c.value === 'wild' || c.value === 'wild4') {
      c.color = 'wild';
    }
  });

  for (let i = toShuffle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [toShuffle[i], toShuffle[j]] = [toShuffle[j], toShuffle[i]];
  }

  room.deck.push(...toShuffle);
}

export function drawCardsFromDeck(room: RoomData, count: number): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      reshuffleDiscardIntoDeck(room);
    }
    if (room.deck.length > 0) {
      drawn.push(room.deck.pop()!);
    }
  }
  return drawn;
}

export function getNextPlayerIndex(currentIndex: number, direction: TurnDirection, totalPlayers: number, steps = 1): number {
  let next = (currentIndex + direction * steps) % totalPlayers;
  if (next < 0) next += totalPlayers;
  return next;
}

export function expireUnoVulnerability(room: RoomData) {
  if (room.unoVulnerablePlayerId) {
    const vulnPlayer = room.players.find((p) => p.id === room.unoVulnerablePlayerId);
    // If player no longer has 1 card or called UNO, clear vulnerability immediately
    if (!vulnPlayer || vulnPlayer.hand.length !== 1 || vulnPlayer.hasCalledUno) {
      room.unoVulnerablePlayerId = null;
      delete room.unoVulnerableTurnCount;
      return;
    }
    // If the round turn count passed the catch window
    if (
      typeof room.unoVulnerableTurnCount === 'number' &&
      (room.roundTurnCount || 0) > room.unoVulnerableTurnCount + 1
    ) {
      room.unoVulnerablePlayerId = null;
      delete room.unoVulnerableTurnCount;
    }
  }
}

export function advanceTurnEngine(room: RoomData, steps = 1) {
  if (room.players[room.currentTurnIndex]) {
    room.players[room.currentTurnIndex].hasDrawnThisTurn = false;
  }
  room.roundTurnCount = (room.roundTurnCount || 0) + 1;
  expireUnoVulnerability(room);
  room.currentTurnIndex = getNextPlayerIndex(
    room.currentTurnIndex,
    room.turnDirection,
    room.players.length,
    steps
  );
}

export function handleTimeoutEngine(room: RoomData): { player: InternalPlayer; drewCard: boolean } {
  const player = room.players[room.currentTurnIndex];
  let drewCard = false;
  if (!player.hasDrawnThisTurn) {
    const drawn = drawCardsFromDeck(room, 1);
    player.hand.push(...drawn);
    player.cardsCount = player.hand.length;
    drewCard = true;
  }
  player.hasDrawnThisTurn = false;
  advanceTurnEngine(room, 1);
  return { player, drewCard };
}
