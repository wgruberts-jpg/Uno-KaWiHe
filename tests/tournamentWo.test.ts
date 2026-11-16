import { describe, it, expect } from 'vitest';
import {
  InternalPlayer,
  RoomData,
  advanceTurnEngine,
  createDeck,
  drawCardsFromDeck,
  flushPendingTournamentWOs,
  getNextPlayerIndex,
  removeTournamentPlayerWO,
  reshuffleDiscardIntoDeck,
} from '../server/unoEngine.js';
import { Card, CardColor, CardValue, TurnDirection } from '../src/types/uno.js';

function makeCard(id: string, color: CardColor, value: CardValue, score = 5): Card {
  return { id, color, value, score };
}

function makePlayer(id: string, name: string, hand: Card[] = [], extras: Partial<InternalPlayer> = {}): InternalPlayer {
  return {
    id,
    name,
    avatar: '😀',
    isHost: false,
    isBot: false,
    cardsCount: hand.length,
    hasCalledUno: false,
    isConnected: true,
    score: 0,
    hand,
    hasDrawnThisTurn: false,
    ...extras,
  };
}

function makeTournamentRoom(overrides: Partial<RoomData> = {}): RoomData {
  return {
    id: 'ROOM_T1',
    tournamentId: 'tourney_1',
    settings: {
      maxPlayers: 4,
      gameMode: 'standard',
      turnDuration: 30,
      challengeUnoRule: true,
    },
    status: 'playing',
    players: [
      makePlayer('p0', 'Ana', [makeCard('c0', 'red', '1')]),
      makePlayer('p1', 'Beto', [makeCard('c1', 'blue', '2')]),
      makePlayer('p2', 'Caio', [makeCard('c2', 'green', '3')]),
      makePlayer('p3', 'Dani', [makeCard('c3', 'yellow', '4')]),
    ],
    deck: [makeCard('d1', 'red', '9')],
    discardPile: [
      makeCard('disc_a', 'red', '4'),
      makeCard('disc_b', 'blue', '4'),
      makeCard('disc_c', 'green', '7'),
    ],
    currentColor: 'green',
    currentTurnIndex: 1,
    turnDirection: 1,
    turnTimeLeft: 30,
    winnerId: null,
    winnerTeam: null,
    unoVulnerablePlayerId: null,
    turnTimerInterval: null,
    botTimerTimeout: null,
    ...overrides,
  };
}

describe('Tournament Match W.O. Player Removal & Discard Integration (Etapa 2B)', () => {
  it('1 & 4. remove jogador que não está na vez depois do índice atual mantendo currentTurnIndex e jogador da vez intactos', () => {
    const room = makeTournamentRoom({ currentTurnIndex: 1 }); // Beto (p1) na vez
    const res = removeTournamentPlayerWO(room, 'p3'); // Dani (índice 3 > 1)

    expect(res.outcome).toBe('removed');
    expect(res.wasCurrentTurn).toBe(false);
    expect(res.nextTurnPlayerId).toBe('p1');
    expect(room.players.map((p) => p.id)).toEqual(['p0', 'p1', 'p2']);
    expect(room.players[room.currentTurnIndex].id).toBe('p1');
  });

  it('3. remove jogador antes do índice atual ajustando currentTurnIndex corretamente (direção 1 e -1)', () => {
    const room = makeTournamentRoom({ currentTurnIndex: 2, turnDirection: -1 }); // Caio (índice 2)
    const res = removeTournamentPlayerWO(room, 'p0'); // Ana (índice 0 < 2)

    expect(res.outcome).toBe('removed');
    expect(res.wasCurrentTurn).toBe(false);
    expect(room.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(room.currentTurnIndex).toBe(1);
    expect(room.players[room.currentTurnIndex].id).toBe('p2'); // Caio continua na vez
    expect(room.turnDirection).toBe(-1); // Direção preservada
  });

  it('2a. remove o jogador atual em direção normal (1), avançando para o próximo correto inclusive no fim do array', () => {
    // Meio do array
    const roomMid = makeTournamentRoom({ currentTurnIndex: 1, turnDirection: 1 });
    const resMid = removeTournamentPlayerWO(roomMid, 'p1');
    expect(resMid.outcome).toBe('removed');
    expect(resMid.wasCurrentTurn).toBe(true);
    expect(roomMid.players[roomMid.currentTurnIndex].id).toBe('p2');

    // Último índice do array -> deve dar wrap para índice 0 (p0)
    const roomEnd = makeTournamentRoom({ currentTurnIndex: 3, turnDirection: 1 });
    const resEnd = removeTournamentPlayerWO(roomEnd, 'p3');
    expect(resEnd.outcome).toBe('removed');
    expect(roomEnd.currentTurnIndex).toBe(0);
    expect(roomEnd.players[roomEnd.currentTurnIndex].id).toBe('p0');
  });

  it('2b. remove o jogador atual em direção invertida (-1) inclusive no índice 0 e meio do array', () => {
    // Meio (índice 2 -> próximo no sentido -1 era p1 no índice 1)
    const roomMid = makeTournamentRoom({ currentTurnIndex: 2, turnDirection: -1 });
    const resMid = removeTournamentPlayerWO(roomMid, 'p2');
    expect(resMid.outcome).toBe('removed');
    expect(roomMid.players[roomMid.currentTurnIndex].id).toBe('p1');

    // Índice 0 (próximo no sentido -1 era p3 no último índice)
    const roomZero = makeTournamentRoom({ currentTurnIndex: 0, turnDirection: -1 });
    const resZero = removeTournamentPlayerWO(roomZero, 'p0');
    expect(resZero.outcome).toBe('removed');
    expect(roomZero.players[roomZero.currentTurnIndex].id).toBe('p3');
  });

  it('5 & 6. preserva a carta do topo da pilha de descarte e insere cartas eliminadas imediatamente abaixo do topo', () => {
    const cardX = makeCard('x', 'red', '5');
    const cardY = makeCard('y', 'blue', '6');
    const cardZ = makeCard('z', 'yellow', '8');
    const topCard = makeCard('disc_c', 'green', '7');

    const room = makeTournamentRoom({
      discardPile: [makeCard('disc_a', 'red', '4'), makeCard('disc_b', 'blue', '4'), topCard],
    });
    room.players[2].hand = [cardX, cardY, cardZ];

    const res = removeTournamentPlayerWO(room, 'p2');
    expect(res.discardedCardsCount).toBe(3);
    expect(room.discardPile.map((c) => c.id)).toEqual(['disc_a', 'disc_b', 'x', 'y', 'z', 'disc_c']);
    expect(room.discardPile[room.discardPile.length - 1].id).toBe('disc_c');
  });

  it('7 & 8. recicla posteriormente as cartas eliminadas quando o baralho acabar e normaliza wild e wild4 para color: "wild"', () => {
    // Cartas wild/wild4 na mão com cor marcada hipoteticamente como 'red'/'blue' para testar normalização obrigatória
    const elimWild = makeCard('elim_w', 'red', 'wild', 50);
    const elimWild4 = makeCard('elim_w4', 'blue', 'wild4', 50);
    const topCard = makeCard('top_green', 'green', '9');

    const room = makeTournamentRoom({
      deck: [],
      discardPile: [makeCard('base_1', 'yellow', '2'), topCard],
      currentColor: 'green',
    });
    room.players[3].hand = [elimWild, elimWild4];

    removeTournamentPlayerWO(room, 'p3');
    expect(room.discardPile.map((c) => c.id)).toEqual(['base_1', 'elim_w', 'elim_w4', 'top_green']);

    const drawn = drawCardsFromDeck(room, 3);
    expect(drawn.length).toBe(3);
    expect(room.discardPile.map((c) => c.id)).toEqual(['top_green']); // Topo preservado

    const recycledWild = drawn.find((c) => c.id === 'elim_w');
    const recycledWild4 = drawn.find((c) => c.id === 'elim_w4');
    expect(recycledWild?.color).toBe('wild');
    expect(recycledWild4?.color).toBe('wild');
  });

  it('9. recicla corretamente quando as únicas cartas disponíveis no descarte forem as dos jogadores eliminados', () => {
    const topCard = makeCard('only_top', 'blue', '3');
    const room = makeTournamentRoom({
      deck: [],
      discardPile: [topCard], // Apenas 1 carta antes do W.O.
      currentColor: 'blue',
    });
    room.players[2].hand = [
      makeCard('e_1', 'red', '6'),
      makeCard('e_2', 'yellow', '7'),
      makeCard('e_3', 'green', '8'),
    ];

    removeTournamentPlayerWO(room, 'p2');
    expect(room.discardPile.map((c) => c.id)).toEqual(['e_1', 'e_2', 'e_3', 'only_top']);

    // Esgotado o baralho, drawCardsFromDeck dispara reshuffleDiscardIntoDeck e compra as 3 cartas eliminadas
    const drawn = drawCardsFromDeck(room, 3);
    expect(drawn.map((c) => c.id).sort()).toEqual(['e_1', 'e_2', 'e_3']);
    expect(room.discardPile.map((c) => c.id)).toEqual(['only_top']);
    expect(room.deck.length).toBe(0);

    // Chamar reshuffleDiscardIntoDeck direto com 1 carta remanescente é seguro (no-op)
    reshuffleDiscardIntoDeck(room);
    expect(room.discardPile.map((c) => c.id)).toEqual(['only_top']);
  });

  it('10. preserva currentColor mesmo com cartas wild ou de outras cores indo para o descarte', () => {
    const room = makeTournamentRoom({ currentColor: 'yellow' });
    room.players[0].hand = [makeCard('r1', 'red', '5'), makeCard('w1', 'wild', 'wild', 50)];

    removeTournamentPlayerWO(room, 'p0');
    expect(room.currentColor).toBe('yellow');
  });

  it('11. limpa estados de UNO do jogador removido sem afetar vulnerabilidade de outros jogadores', () => {
    const roomA = makeTournamentRoom({
      unoVulnerablePlayerId: 'p1',
      unoVulnerableTurnCount: 7,
    });
    roomA.players[1].hasCalledUno = true;

    removeTournamentPlayerWO(roomA, 'p1');
    expect(roomA.unoVulnerablePlayerId).toBeNull();
    expect(roomA.unoVulnerableTurnCount).toBeUndefined();

    // Vulnerabilidade de terceiro permanece preservada
    const roomB = makeTournamentRoom({
      unoVulnerablePlayerId: 'p2',
      unoVulnerableTurnCount: 9,
    });
    removeTournamentPlayerWO(roomB, 'p0');
    expect(roomB.unoVulnerablePlayerId).toBe('p2');
    expect(roomB.unoVulnerableTurnCount).toBe(9);
  });

  it('12 & 13. preserva turnDirection ao reduzir para 2 jogadores e mantém fluxo de 2 jogadores (incluindo Reverse = Skip)', () => {
    const room = makeTournamentRoom({
      players: [
        makePlayer('p0', 'Ana', [makeCard('c0', 'red', '1')]),
        makePlayer('p1', 'Beto', [makeCard('c1', 'blue', '2')]),
        makePlayer('p2', 'Caio', [makeCard('c2', 'green', '3')]),
      ],
      currentTurnIndex: 0,
      turnDirection: -1 as TurnDirection,
    });

    const res = removeTournamentPlayerWO(room, 'p2');
    expect(res.outcome).toBe('removed');
    expect(res.remainingPlayersCount).toBe(2);
    expect(room.status).toBe('playing');
    expect(room.turnDirection).toBe(-1); // Não inverte arbitrariamente

    // Com 2 jogadores, Reverse aplica steps=2 => mantém turno no mesmo jogador
    const sameIdx = getNextPlayerIndex(room.currentTurnIndex, room.turnDirection, room.players.length, 2);
    expect(sameIdx).toBe(room.currentTurnIndex);
  });

  it('14. retorna void_insufficient_players quando restarem menos de dois jogadores sem escolher vencedor automático', () => {
    const room = makeTournamentRoom({
      players: [
        makePlayer('p0', 'Ana', [makeCard('c0', 'red', '1')]),
        makePlayer('p1', 'Beto', [makeCard('c1', 'blue', '2')]),
      ],
      currentTurnIndex: 0,
    });

    const res = removeTournamentPlayerWO(room, 'p1');
    expect(res.outcome).toBe('void_insufficient_players');
    expect(res.remainingPlayersCount).toBe(1);
    expect(room.status).toBe('ended');
    expect(room.winnerId).toBeNull();
    expect(room.winnerTeam).toBeNull();
  });

  it('15. cancela com segurança stagedCardPlay do jogador removido e serializa W.O. quando outro jogador tem stagedCardPlay ativo', () => {
    // Caso A: stagedCardPlay é do próprio jogador removido -> cancelado imediatamente e carta fica na mão antes do descarte
    const stagedCard = makeCard('staged_c', 'red', 'draw2', 20);
    const roomSelf = makeTournamentRoom({
      stagedCardPlay: {
        card: stagedCard,
        playerId: 'p1',
        playerName: 'Beto',
        playerAvatar: '😀',
        timestamp: 1000,
        delaySeconds: 1.5,
      },
    });
    roomSelf.players[1].hand = [stagedCard, makeCard('other_c', 'blue', '5')];

    const resSelf = removeTournamentPlayerWO(roomSelf, 'p1');
    expect(resSelf.outcome).toBe('removed');
    expect(resSelf.cancelledStagedPlay).toBe(true);
    expect(roomSelf.stagedCardPlay).toBeNull();
    expect(roomSelf.discardPile.map((c) => c.id)).toContain('staged_c');
    expect(roomSelf.discardPile.map((c) => c.id)).toContain('other_c');

    // Caso B: stagedCardPlay pertence a p0 -> remoção de p1 é serializada (adiada) sem alterar alvo/estado durante animação
    const roomOther = makeTournamentRoom({
      currentTurnIndex: 0,
      stagedCardPlay: {
        card: makeCard('p0_card', 'green', 'draw2', 20),
        playerId: 'p0',
        playerName: 'Ana',
        playerAvatar: '😀',
        timestamp: 1000,
        delaySeconds: 1.5,
      },
    });

    const resDefer = removeTournamentPlayerWO(roomOther, 'p1');
    expect(resDefer.outcome).toBe('deferred_staged_play');
    expect(roomOther.players.map((p) => p.id)).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(roomOther.pendingWoPlayerIds).toEqual(['p1']);

    // Quando a jogada de p0 finaliza (stagedCardPlay = null), flushPendingTournamentWOs executa o W.O. enfileirado
    roomOther.stagedCardPlay = null;
    const flushed = flushPendingTournamentWOs(roomOther);
    expect(flushed.length).toBe(1);
    expect(flushed[0].outcome).toBe('removed');
    expect(roomOther.players.map((p) => p.id)).toEqual(['p0', 'p2', 'p3']);
  });

  it('16. protege contra execução duplicada do mesmo W.O. (idempotência)', () => {
    const room = makeTournamentRoom();
    const first = removeTournamentPlayerWO(room, 'p2');
    expect(first.outcome).toBe('removed');
    const snapshotDiscard = room.discardPile.map((c) => c.id);
    const snapshotTurn = room.currentTurnIndex;

    const second = removeTournamentPlayerWO(room, 'p2');
    expect(second.outcome).toBe('already_removed');
    expect(second.discardedCardsCount).toBe(0);
    expect(room.discardPile.map((c) => c.id)).toEqual(snapshotDiscard);
    expect(room.currentTurnIndex).toBe(snapshotTurn);
  });

  it('17. garante que salas normais sem tournamentId jamais utilizem remoção automática por W.O.', () => {
    const normalRoom = makeTournamentRoom({ tournamentId: undefined });
    const initialPlayers = normalRoom.players.map((p) => p.id);
    const initialHand = normalRoom.players[2].hand.map((c) => c.id);
    const initialDiscard = normalRoom.discardPile.map((c) => c.id);

    const res = removeTournamentPlayerWO(normalRoom, 'p2');
    expect(res.outcome).toBe('not_tournament_room');
    expect(normalRoom.players.map((p) => p.id)).toEqual(initialPlayers);
    expect(normalRoom.players[2].hand.map((c) => c.id)).toEqual(initialHand);
    expect(normalRoom.discardPile.map((c) => c.id)).toEqual(initialDiscard);
  });

  it('18 (Req. A). recupera carta transitória em stagedCardPlay mesmo se já tiver sido removida da mão do jogador sem perda ou duplicação', () => {
    const transientCard = makeCard('staged_transient', 'yellow', 'skip', 20);
    const handCard = makeCard('hand_keep', 'blue', '9', 9);
    const topCard = makeCard('top_c', 'red', '3', 3);

    const room = makeTournamentRoom({
      discardPile: [makeCard('base_0', 'green', '1', 1), topCard],
      stagedCardPlay: {
        card: transientCard,
        playerId: 'p1',
        playerName: 'Beto',
        playerAvatar: '😀',
        timestamp: 1000,
        delaySeconds: 1.5,
      },
    });
    // Carta em stagedCardPlay não está mais em players[1].hand (zona transitória pura)
    room.players[1].hand = [handCard];

    const res = removeTournamentPlayerWO(room, 'p1');
    expect(res.outcome).toBe('removed');
    expect(res.cancelledStagedPlay).toBe(true);
    expect(res.discardedCardsCount).toBe(2);
    expect(room.stagedCardPlay).toBeNull();

    const discardIds = room.discardPile.map((c) => c.id);
    expect(discardIds).toEqual(['base_0', 'hand_keep', 'staged_transient', 'top_c']);
    expect(discardIds.filter((id) => id === 'staged_transient').length).toBe(1);
  });

  it('19 (Req. B). conserva exatamente as 108 cartas e seus IDs originais únicos após W.O., stagedCardPlay, compras e reciclagem', () => {
    const fullDeck = createDeck();
    expect(fullDeck.length).toBe(108);
    const originalIds = new Set(fullDeck.map((c) => c.id));
    expect(originalIds.size).toBe(108);

    const p0Hand = fullDeck.splice(0, 7);
    const p1Hand = fullDeck.splice(0, 7);
    const p2Hand = fullDeck.splice(0, 7);
    const p3Hand = fullDeck.splice(0, 7);
    const initialDiscard = fullDeck.splice(0, 1);

    // Move 1 carta de p1 para stagedCardPlay (simulando carta em transição)
    const p1Staged = p1Hand.pop()!;

    const room = makeTournamentRoom({
      deck: fullDeck,
      discardPile: initialDiscard,
      currentColor: initialDiscard[0].color === 'wild' ? 'red' : initialDiscard[0].color,
      currentTurnIndex: 1,
      players: [
        makePlayer('p0', 'Ana', p0Hand),
        makePlayer('p1', 'Beto', p1Hand),
        makePlayer('p2', 'Caio', p2Hand),
        makePlayer('p3', 'Dani', p3Hand),
      ],
      stagedCardPlay: {
        card: p1Staged,
        playerId: 'p1',
        playerName: 'Beto',
        playerAvatar: '😀',
        timestamp: 1000,
        delaySeconds: 1.5,
      },
    });

    const collectAllCardIds = (r: RoomData): string[] => {
      const seenInHandsAndPiles: string[] = [
        ...r.deck.map((c) => c.id),
        ...r.discardPile.map((c) => c.id),
        ...r.players.flatMap((p) => p.hand.map((c) => c.id)),
      ];
      if (r.stagedCardPlay && !seenInHandsAndPiles.includes(r.stagedCardPlay.card.id)) {
        seenInHandsAndPiles.push(r.stagedCardPlay.card.id);
      }
      return seenInHandsAndPiles;
    };

    const assert108Invariant = (r: RoomData) => {
      const allIds = collectAllCardIds(r);
      expect(allIds.length).toBe(108);
      const unique = new Set(allIds);
      expect(unique.size).toBe(108);
      for (const id of originalIds) {
        expect(unique.has(id)).toBe(true);
      }
    };

    // Antes dos W.O.s
    assert108Invariant(room);

    // 1o W.O.: jogador atual com stagedCardPlay transitória
    const wo1 = removeTournamentPlayerWO(room, 'p1');
    expect(wo1.outcome).toBe('removed');
    expect(wo1.discardedCardsCount).toBe(7);
    assert108Invariant(room);

    // 2o W.O.: jogador fora da vez
    const wo2 = removeTournamentPlayerWO(room, 'p3');
    expect(wo2.outcome).toBe('removed');
    expect(wo2.discardedCardsCount).toBe(7);
    assert108Invariant(room);

    // Compra todo o restante do baralho e força reciclagem do descarte (contendo cartas dos eliminados)
    const toDraw = room.deck.length + 5;
    const bought = drawCardsFromDeck(room, toDraw);
    room.players[0].hand.push(...bought);
    assert108Invariant(room);
  });

  it('20 (Req. C). rejeita remoção individual por W.O. em salas 2v2 (team_2v2 e doubles_elimination) sem alterar estado', () => {
    const room2v2 = makeTournamentRoom({
      settings: {
        maxPlayers: 4,
        gameMode: 'team_2v2',
        turnDuration: 30,
        challengeUnoRule: true,
        tournamentId: 'tourney_dup_1',
        tournamentFormat: 'doubles_elimination',
      },
    });
    const beforePlayers = room2v2.players.map((p) => p.id);
    const beforeTurn = room2v2.currentTurnIndex;

    const res = removeTournamentPlayerWO(room2v2, 'p1');
    expect(res.outcome).toBe('rejected_2v2_doubles');
    expect(room2v2.players.map((p) => p.id)).toEqual(beforePlayers);
    expect(room2v2.currentTurnIndex).toBe(beforeTurn);

    // Mesmo se gameMode estiver padrão mas tournamentFormat for doubles_elimination
    const roomDoublesFormat = makeTournamentRoom({
      settings: {
        maxPlayers: 4,
        gameMode: 'standard',
        turnDuration: 30,
        challengeUnoRule: true,
        tournamentFormat: 'doubles_elimination',
      },
    });
    expect(removeTournamentPlayerWO(roomDoublesFormat, 'p0').outcome).toBe('rejected_2v2_doubles');
  });

  it('21 (Req. D). reinicializa hasDrawnThisTurn do próximo jogador quando o jogador atual sai por W.O.', () => {
    const room = makeTournamentRoom({
      currentTurnIndex: 1,
      turnDirection: 1,
      roundTurnCount: 4,
      unoVulnerablePlayerId: 'p0',
      unoVulnerableTurnCount: 3,
    });
    room.players[1].hasDrawnThisTurn = true;
    // Garante que resíduo eventual em p2 também seja zerado na transição da vez
    room.players[2].hasDrawnThisTurn = true;

    const res = removeTournamentPlayerWO(room, 'p1');
    expect(res.outcome).toBe('removed');
    expect(res.wasCurrentTurn).toBe(true);
    expect(res.nextTurnPlayerId).toBe('p2');
    expect(room.players[room.currentTurnIndex].id).toBe('p2');
    expect(room.players[room.currentTurnIndex].hasDrawnThisTurn).toBe(false);
    expect(room.roundTurnCount).toBe(5); // Avançou 1 turno ao transferir vez
  });

  it('22 (Req. D). mantém sequência exata de turnos sem pular nem duplicar jogador após W.O. nos dois sentidos (1 e -1)', () => {
    // Sentido horário (1): [p0, p1, p2, p3], vez de p1 -> remove p1 -> próximo esperado p2 -> p3 -> p0 -> p2
    const roomCw = makeTournamentRoom({ currentTurnIndex: 1, turnDirection: 1 });
    removeTournamentPlayerWO(roomCw, 'p1');
    const orderCw: string[] = [roomCw.players[roomCw.currentTurnIndex].id];
    for (let i = 0; i < 3; i++) {
      advanceTurnEngine(roomCw, 1);
      orderCw.push(roomCw.players[roomCw.currentTurnIndex].id);
    }
    expect(orderCw).toEqual(['p2', 'p3', 'p0', 'p2']);

    // Sentido anti-horário (-1): [p0, p1, p2, p3], vez de p0 -> remove p0 -> próximo esperado p3 -> p2 -> p1 -> p3
    const roomCcw = makeTournamentRoom({ currentTurnIndex: 0, turnDirection: -1 });
    removeTournamentPlayerWO(roomCcw, 'p0');
    const orderCcw: string[] = [roomCcw.players[roomCcw.currentTurnIndex].id];
    for (let i = 0; i < 3; i++) {
      advanceTurnEngine(roomCcw, 1);
      orderCcw.push(roomCcw.players[roomCcw.currentTurnIndex].id);
    }
    expect(orderCcw).toEqual(['p3', 'p2', 'p1', 'p3']);
  });
});
