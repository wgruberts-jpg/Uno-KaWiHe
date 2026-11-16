import { Card, CardColor, CardValue, GameState, Player, RematchVote, RoomSettings, StagedCardPlay, TurnDirection, TeamId, GameMode } from '../src/types/uno.js';

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
  userId?: string;
  tournamentEntryId?: string;
}

export interface RoomData {
  id: string;
  creatorName?: string;
  ownerUserId?: string;
  tournamentId?: string;
  tournamentGroupId?: string;
  tournamentGameId?: string;
  tournamentSpectatorMode?: 'table_only' | 'tv_hidden' | 'tv_reveal';
  woRemovedPlayerIds?: string[];
  pendingWoPlayerIds?: string[];
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
  winnerTeam?: TeamId | null;
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
  return next === 0 ? 0 : next;
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

export interface TournamentWoRemovalResult {
  outcome:
    | 'removed'
    | 'void_insufficient_players'
    | 'deferred_staged_play'
    | 'not_tournament_room'
    | 'rejected_2v2_doubles'
    | 'already_removed'
    | 'player_not_found'
    | 'game_not_active';
  removedPlayerId?: string;
  removedPlayerName?: string;
  discardedCardsCount: number;
  remainingPlayersCount: number;
  wasCurrentTurn: boolean;
  cancelledStagedPlay: boolean;
  nextTurnPlayerId?: string;
}

/**
 * Remove um jogador por W.O. durante uma partida de sala de torneio individual (100% puro, sem timers):
 *  - Exclusivo para salas com `room.tournamentId` e modalidade individual (rejeita `team_2v2` / `doubles_elimination`)
 *  - Protegido contra execução duplicada do mesmo W.O.
 *  - Serializa remoção se outro jogador possuir `stagedCardPlay` em andamento
 *  - Cancela `stagedCardPlay` se pertencer ao jogador eliminado e conserva sua carta no descarte sem duplicação
 *  - Move todas as cartas da mão do jogador eliminado para a pilha de descarte imediatamente abaixo do topo
 *  - Preserva `currentColor`, `turnDirection` e a carta do topo
 *  - Limpa estados de UNO relacionados ao jogador eliminado e reinicializa estado do próximo turno
 *  - Ajusta `currentTurnIndex` em todas as posições/direções ou retorna `void_insufficient_players` se restarem < 2
 */
export function removeTournamentPlayerWO(room: RoomData, playerId: string): TournamentWoRemovalResult {
  if (!room.tournamentId) {
    return {
      outcome: 'not_tournament_room',
      discardedCardsCount: 0,
      remainingPlayersCount: room.players.length,
      wasCurrentTurn: false,
      cancelledStagedPlay: false,
    };
  }

  if (
    room.settings?.gameMode === 'team_2v2' ||
    room.settings?.tournamentFormat === 'doubles_elimination'
  ) {
    return {
      outcome: 'rejected_2v2_doubles',
      discardedCardsCount: 0,
      remainingPlayersCount: room.players.length,
      wasCurrentTurn: false,
      cancelledStagedPlay: false,
    };
  }

  if (room.status !== 'playing' && room.status !== 'paused') {
    return {
      outcome: 'game_not_active',
      discardedCardsCount: 0,
      remainingPlayersCount: room.players.length,
      wasCurrentTurn: false,
      cancelledStagedPlay: false,
    };
  }

  if (room.woRemovedPlayerIds?.includes(playerId)) {
    return {
      outcome: 'already_removed',
      discardedCardsCount: 0,
      remainingPlayersCount: room.players.length,
      wasCurrentTurn: false,
      cancelledStagedPlay: false,
    };
  }

  const removeIdx = room.players.findIndex((p) => p.id === playerId);
  if (removeIdx === -1) {
    return {
      outcome: 'player_not_found',
      discardedCardsCount: 0,
      remainingPlayersCount: room.players.length,
      wasCurrentTurn: false,
      cancelledStagedPlay: false,
    };
  }

  let cancelledStagedPlay = false;
  let recoveredStagedCard: Card | null = null;
  if (room.stagedCardPlay) {
    if (room.stagedCardPlay.playerId !== playerId) {
      if (!room.pendingWoPlayerIds) room.pendingWoPlayerIds = [];
      if (!room.pendingWoPlayerIds.includes(playerId)) {
        room.pendingWoPlayerIds.push(playerId);
      }
      return {
        outcome: 'deferred_staged_play',
        discardedCardsCount: 0,
        remainingPlayersCount: room.players.length,
        wasCurrentTurn: removeIdx === room.currentTurnIndex,
        cancelledStagedPlay: false,
      };
    }
    recoveredStagedCard = room.stagedCardPlay.card;
    room.stagedCardPlay = null;
    cancelledStagedPlay = true;
  }

  if (!room.woRemovedPlayerIds) room.woRemovedPlayerIds = [];
  room.woRemovedPlayerIds.push(playerId);
  if (room.pendingWoPlayerIds?.length) {
    room.pendingWoPlayerIds = room.pendingWoPlayerIds.filter((id) => id !== playerId);
  }

  const oldTurnIdx = room.currentTurnIndex;
  const wasCurrentTurn = removeIdx === oldTurnIdx;
  const removedPlayer = room.players[removeIdx];

  // Limpa estados de UNO e turno relacionados ao jogador removido
  removedPlayer.hasCalledUno = false;
  removedPlayer.hasDrawnThisTurn = false;
  if (room.unoVulnerablePlayerId === removedPlayer.id) {
    room.unoVulnerablePlayerId = null;
    delete room.unoVulnerableTurnCount;
  }

  // Move cartas da mão para a pilha de descarte imediatamente abaixo do topo (preservando topo e currentColor)
  const removedHand = removedPlayer.hand.splice(0, removedPlayer.hand.length);
  removedPlayer.cardsCount = 0;

  // Se stagedCardPlay já havia retirado a carta da mão (zona transitória), incorpora sem duplicar nem perder
  if (
    recoveredStagedCard &&
    !removedHand.some((c) => c.id === recoveredStagedCard!.id) &&
    !room.discardPile.some((c) => c.id === recoveredStagedCard!.id) &&
    !room.deck.some((c) => c.id === recoveredStagedCard!.id)
  ) {
    removedHand.push(recoveredStagedCard);
  }

  if (removedHand.length > 0) {
    if (room.discardPile.length > 0) {
      const topCard = room.discardPile.pop()!;
      room.discardPile.push(...removedHand, topCard);
    } else {
      room.discardPile.push(...removedHand);
    }
  }

  // Remove participante ativo da sala
  room.players.splice(removeIdx, 1);
  const remaining = room.players.length;

  // Menos de 2 jogadores restantes -> partida inválida (sem escolher vencedor automático)
  if (remaining < 2) {
    room.currentTurnIndex = 0;
    room.status = 'ended';
    room.winnerId = null;
    room.winnerTeam = null;
    room.pendingWoPlayerIds = [];
    return {
      outcome: 'void_insufficient_players',
      removedPlayerId: removedPlayer.id,
      removedPlayerName: removedPlayer.name,
      discardedCardsCount: removedHand.length,
      remainingPlayersCount: remaining,
      wasCurrentTurn,
      cancelledStagedPlay,
    };
  }

  // Ajusta currentTurnIndex preservando turnDirection atual
  if (removeIdx < oldTurnIdx) {
    room.currentTurnIndex = oldTurnIdx - 1;
  } else if (removeIdx > oldTurnIdx) {
    room.currentTurnIndex = oldTurnIdx % remaining;
  } else {
    // O jogador removido era exatamente o jogador da vez
    if (room.turnDirection === 1) {
      room.currentTurnIndex = oldTurnIdx % remaining;
    } else {
      room.currentTurnIndex = (oldTurnIdx - 1 + remaining) % remaining;
    }
  }

  const nextPlayer = room.players[room.currentTurnIndex];

  // Quando houve transferência de vez por W.O., garante início limpo de turno para o próximo jogador
  if (wasCurrentTurn && nextPlayer) {
    nextPlayer.hasDrawnThisTurn = false;
    room.roundTurnCount = (room.roundTurnCount || 0) + 1;
    expireUnoVulnerability(room);
  }

  return {
    outcome: 'removed',
    removedPlayerId: removedPlayer.id,
    removedPlayerName: removedPlayer.name,
    discardedCardsCount: removedHand.length,
    remainingPlayersCount: remaining,
    wasCurrentTurn,
    cancelledStagedPlay,
    nextTurnPlayerId: nextPlayer?.id,
  };
}

export function flushPendingTournamentWOs(room: RoomData): TournamentWoRemovalResult[] {
  if (!room.tournamentId || !room.pendingWoPlayerIds?.length || room.stagedCardPlay) {
    return [];
  }
  const results: TournamentWoRemovalResult[] = [];
  while (room.pendingWoPlayerIds.length > 0 && (room.status === 'playing' || room.status === 'paused')) {
    const nextId = room.pendingWoPlayerIds.shift()!;
    const res = removeTournamentPlayerWO(room, nextId);
    results.push(res);
    if (res.outcome === 'void_insufficient_players') {
      break;
    }
  }
  return results;
}

export function getTeammate(room: RoomData, player: InternalPlayer): InternalPlayer | undefined {
  if (room.settings.gameMode !== 'team_2v2' || !player.team) return undefined;
  return room.players.find((p) => p.id !== player.id && p.team === player.team);
}

export function assignTeams2v2(room: RoomData): void {
  if (room.settings.gameMode !== 'team_2v2') return;

  const teamA: InternalPlayer[] = [];
  const teamB: InternalPlayer[] = [];
  const unassigned: InternalPlayer[] = [];

  room.players.forEach((p) => {
    if (p.team === 'A' && teamA.length < 2) {
      teamA.push(p);
    } else if (p.team === 'B' && teamB.length < 2) {
      teamB.push(p);
    } else {
      unassigned.push(p);
    }
  });

  unassigned.forEach((p) => {
    if (teamA.length < 2) {
      p.team = 'A';
      teamA.push(p);
    } else {
      p.team = 'B';
      teamB.push(p);
    }
  });

  teamA.forEach((p) => { p.team = 'A'; });
  teamB.forEach((p) => { p.team = 'B'; });

  // Alternate seating: A1, B1, A2, B2 so turns naturally alternate between opposing teams
  if (teamA.length === 2 && teamB.length === 2) {
    room.players = [teamA[0], teamB[0], teamA[1], teamB[1]];
  }
}

export function calculate2v2WinScore(room: RoomData, winningPlayer: InternalPlayer): number {
  const opponents = room.players.filter((p) => p.team !== winningPlayer.team);
  return opponents.reduce((sum, opp) => sum + opp.hand.reduce((s, c) => s + c.score, 0), 0);
}
