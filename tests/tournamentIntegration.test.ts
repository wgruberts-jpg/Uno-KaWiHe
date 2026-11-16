import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import { WebSocket } from 'ws';

const tempDataDir = vi.hoisted(() => {
  const dir = `${process.cwd()}/.tmp_tourn_test_${process.pid}_${Date.now()}`;
  process.env.DATA_DIR = dir;
  process.env.DISABLE_AUTO_START = 'true';
  return dir;
});

import {
  server,
  rooms,
  tournaments,
  checkWinCondition,
} from '../server.js';
import { getAllUsers, generateToken } from '../server/authService.js';
import { rankIndividualGroupEntries } from '../server/tournamentEngine.js';
import { ServerMessage } from '../src/types/uno.js';

interface TestWsClient {
  ws: WebSocket;
  messages: ServerMessage[];
  waitFor: (predicate: (msg: ServerMessage) => boolean, timeoutMs?: number) => Promise<ServerMessage>;
  send: (payload: Record<string, unknown>) => void;
  close: () => Promise<void>;
}

async function connectWsClient(port: number, token?: string): Promise<TestWsClient> {
  const url = token
    ? `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`
    : `ws://127.0.0.1:${port}/ws`;
  const ws = new WebSocket(url);
  const messages: ServerMessage[] = [];
  const listeners: Array<(msg: ServerMessage) => void> = [];

  ws.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString()) as ServerMessage;
      messages.push(parsed);
      for (const fn of [...listeners]) {
        fn(parsed);
      }
    } catch {
      // ignore malformed
    }
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), 4000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const waitFor = (predicate: (msg: ServerMessage) => boolean, timeoutMs = 4000): Promise<ServerMessage> => {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = listeners.indexOf(onMsg);
        if (idx >= 0) listeners.splice(idx, 1);
        reject(new Error(`Timeout waiting for WS message. Received types: ${messages.map((m) => m.type).join(', ')}`));
      }, timeoutMs);
      const onMsg = (msg: ServerMessage) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          const idx = listeners.indexOf(onMsg);
          if (idx >= 0) listeners.splice(idx, 1);
          resolve(msg);
        }
      };
      listeners.push(onMsg);
    });
  };

  const send = (payload: Record<string, unknown>) => {
    ws.send(JSON.stringify({ protocolVersion: 2, ...payload }));
  };

  const close = async () => {
    if (ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 1000);
      ws.once('close', () => {
        clearTimeout(t);
        resolve();
      });
      ws.close();
    });
  };

  return { ws, messages, waitFor, send, close };
}

async function apiJson(port: number, route: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe('Etapas 3 e 4 - Integração Real HTTP/WS de Torneios (Individual + Duplas 2v2)', () => {
  let port = 0;
  let adminToken = '';
  let willToken = '';
  let henryToken = '';
  let grazyToken = '';
  let millyToken = '';
  let alineToken = '';
  let guilhermeToken = '';
  const tokensByUserId: Record<string, string> = {};
  const openClients: TestWsClient[] = [];

  beforeAll(async () => {
    const users = getAllUsers();
    const admin = users.find((u) => u.username === 'edinho')!;
    const will = users.find((u) => u.username === 'will')!;
    const henry = users.find((u) => u.username === 'henry')!;
    const grazy = users.find((u) => u.username === 'grazy')!;
    const milly = users.find((u) => u.username === 'milly')!;
    const aline = users.find((u) => u.username === 'aline')!;
    const guilherme = users.find((u) => u.username === 'guilherme')!;

    adminToken = generateToken(admin);
    willToken = generateToken(will);
    henryToken = generateToken(henry);
    grazyToken = generateToken(grazy);
    millyToken = generateToken(milly);
    alineToken = generateToken(aline);
    guilhermeToken = generateToken(guilherme);

    tokensByUserId[admin.id] = adminToken;
    tokensByUserId[will.id] = willToken;
    tokensByUserId[henry.id] = henryToken;
    tokensByUserId[grazy.id] = grazyToken;
    tokensByUserId[milly.id] = millyToken;
    tokensByUserId[aline.id] = alineToken;
    tokensByUserId[guilherme.id] = guilhermeToken;

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    while (openClients.length > 0) {
      const c = openClients.pop()!;
      await c.close();
    }
    for (const room of rooms.values()) {
      if (room.turnTimerInterval) clearInterval(room.turnTimerInterval);
      if (room.botTimerTimeout) clearTimeout(room.botTimerTimeout);
      if (room.stagedCardTimeout) clearTimeout(room.stagedCardTimeout);
      if (room.emptyRoomTimeout) clearTimeout(room.emptyRoomTimeout);
    }
    rooms.clear();
    tournaments.clear();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  });

  it('bloqueia criação/início de torneio para não-admins e permite fluxo completo REST + WS autenticado até campeão', async () => {
    // 1. RBAC: jogador comum não cria nem simula torneio
    const unauthRes = await apiJson(port, '/api/tournaments', {
      method: 'POST',
      body: { name: 'Sem Token' },
    });
    expect(unauthRes.status).toBe(403);

    const playerCreateRes = await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: willToken,
      body: { name: 'Torneio Ilegal' },
    });
    expect(playerCreateRes.status).toBe(403);

    // 2. Admin cria torneio individual mesa única (1 partida, atraso de animação 0s)
    const createRes = await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: {
        id: 'tourn_etapa3_1',
        name: 'Copa KaWiHe Mesa Única',
        modality: 'individual',
        gamesPerGroup: 1,
        advancePerGroup: 1,
        spectatorMode: 'table_only',
        playAnimationDelaySeconds: 0,
        seed: 42,
      },
    });
    expect(createRes.status).toBe(201);
    expect(createRes.data.tournament.config.id).toBe('tourn_etapa3_1');

    // Simulação admin funciona e jogador comum é barrado
    const simDenied = await apiJson(port, '/api/tournaments/tourn_etapa3_1/simulate', {
      method: 'POST',
      token: willToken,
      body: { entryCount: 3 },
    });
    expect(simDenied.status).toBe(403);

    const simOk = await apiJson(port, '/api/tournaments/tourn_etapa3_1/simulate', {
      method: 'POST',
      token: adminToken,
      body: { entryCount: 3 },
    });
    expect(simOk.status).toBe(200);
    expect(simOk.data.simulation.rounds[0].tableSizes).toEqual([3]);

    // 3. Jogador comum não pode inscrever terceiros; inscrição própria e pelo admin funcionam
    const thirdPartyDenied = await apiJson(port, '/api/tournaments/tourn_etapa3_1/register', {
      method: 'POST',
      token: willToken,
      body: { username: 'henry' },
    });
    expect(thirdPartyDenied.status).toBe(403);

    expect((await apiJson(port, '/api/tournaments/tourn_etapa3_1/register', { method: 'POST', token: willToken })).status).toBe(200);
    expect((await apiJson(port, '/api/tournaments/tourn_etapa3_1/register', { method: 'POST', token: henryToken })).status).toBe(200);
    expect((await apiJson(port, '/api/tournaments/tourn_etapa3_1/register', { method: 'POST', token: grazyToken })).status).toBe(200);

    // 4. Jogador comum não inicia o torneio
    const startDenied = await apiJson(port, '/api/tournaments/tourn_etapa3_1/start', {
      method: 'POST',
      token: willToken,
    });
    expect(startDenied.status).toBe(403);

    // Admin inicia o torneio -> gera sala privada vinculada aos 3 userIds
    const startRes = await apiJson(port, '/api/tournaments/tourn_etapa3_1/start', {
      method: 'POST',
      token: adminToken,
    });
    expect(startRes.status).toBe(200);
    expect(startRes.data.createdRoomIds).toHaveLength(1);
    const roomId = startRes.data.createdRoomIds[0] as string;
    const gameId = startRes.data.tournament.rounds[0].groups[0].games[0].id as string;

    const createdRoom = rooms.get(roomId)!;
    expect(createdRoom).toBeTruthy();
    expect(createdRoom.tournamentId).toBe('tourn_etapa3_1');
    expect(createdRoom.players).toHaveLength(3);
    expect(createdRoom.players.every((p) => !p.isBot && !p.isConnected && !!p.userId)).toBe(true);

    // Sala de torneio NÃO aparece em salas abertas públicas (REST nem WS)
    const openHttp = await apiJson(port, '/api/rooms/open');
    expect(openHttp.data.rooms.some((r: any) => r.id === roomId)).toBe(false);

    // 5. Tentativa de spoofing sem JWT (só nome/playerId) deve ser REJEITADA
    const spoofClient = await connectWsClient(port);
    openClients.push(spoofClient);
    spoofClient.send({
      type: 'register_lobby',
      name: 'Will',
      avatar: '🦸‍♂️',
      playerId: 'usr_will',
    });
    spoofClient.send({
      type: 'join_room',
      messageId: 'spoof-join-1',
      roomId,
      playerName: 'Will',
      avatar: '🦸‍♂️',
    });
    const spoofReject = await spoofClient.waitFor((m) => m.type === 'action_rejected' && m.messageId === 'spoof-join-1');
    expect((spoofReject as any).code).toBe('NOT_AUTHENTICATED');

    // Spoofing via sync_session também deve ser REJEITADO
    spoofClient.send({
      type: 'sync_session',
      messageId: 'spoof-sync-1',
      roomId,
      playerId: createdRoom.players[0].id,
    });
    const spoofSyncReject = await spoofClient.waitFor((m) => m.type === 'action_rejected' && m.messageId === 'spoof-sync-1');
    expect((spoofSyncReject as any).code).toBe('NOT_AUTHENTICATED');

    // 6. Usuário autenticado fora da mesa (Milly) é REJEITADO com FORBIDDEN
    const millyClient = await connectWsClient(port, millyToken);
    openClients.push(millyClient);
    millyClient.send({
      type: 'join_room',
      messageId: 'milly-join-1',
      roomId,
      playerName: 'Will',
      avatar: '🦄',
    });
    const millyReject = await millyClient.waitFor((m) => m.type === 'action_rejected' && m.messageId === 'milly-join-1');
    expect((millyReject as any).code).toBe('FORBIDDEN');

    // Espectador também bloqueado no modo table_only
    millyClient.send({
      type: 'join_room',
      messageId: 'milly-spec-1',
      roomId,
      playerName: 'Milly',
      asSpectator: true,
    });
    const specReject = await millyClient.waitFor((m) => m.type === 'action_rejected' && m.messageId === 'milly-spec-1');
    expect((specReject as any).code).toBe('FORBIDDEN');

    // 7. Will e Henry entram nos assentos oficiais via JWT
    const willClient = await connectWsClient(port, willToken);
    const henryClient = await connectWsClient(port, henryToken);
    openClients.push(willClient, henryClient);

    willClient.send({ type: 'join_room', roomId, playerName: 'Nome Ignorado', avatar: '🦸‍♂️' });
    const willJoined = (await willClient.waitFor((m) => m.type === 'room_joined')) as any;
    expect(willJoined.playerId).toBe('entry_usr_will');

    henryClient.send({ type: 'join_room', roomId, playerName: 'Henry', avatar: '⚡' });
    const henryJoined = (await henryClient.waitFor((m) => m.type === 'room_joined')) as any;
    expect(henryJoined.playerId).toBe('entry_usr_henry');

    // 8. Admin tenta iniciar com Grazy ainda ausente -> rejeitado SEM criar bot e SEM remover Grazy!
    const premStart = await apiJson(port, `/api/tournaments/tourn_etapa3_1/games/${gameId}/start`, {
      method: 'POST',
      token: adminToken,
    });
    expect(premStart.status).toBe(400);
    expect(createdRoom.players).toHaveLength(3);
    expect(createdRoom.players.some((p) => p.isBot)).toBe(false);
    expect(createdRoom.status).toBe('waiting');

    // Jogador comum tentando iniciar via WS também é bloqueado
    willClient.send({ type: 'start_game', messageId: 'will-start-1', playerId: willJoined.playerId });
    const willStartReject = await willClient.waitFor((m) => m.type === 'action_rejected' && m.messageId === 'will-start-1');
    expect((willStartReject as any).code).toBe('FORBIDDEN');

    // 9. Bloqueio de mutações manuais na sala de torneio (server-side FORBIDDEN)
    const forbiddenActions: Array<{ type: string; extra?: Record<string, unknown> }> = [
      { type: 'add_bot' },
      { type: 'fill_bots' },
      { type: 'set_team', extra: { team: 'B' } },
      { type: 'update_settings', extra: { settings: { turnDuration: 5 } } },
      { type: 'toggle_spectator_reveal', extra: { reveal: true } },
      { type: 'transfer_host', extra: { targetPlayerId: henryJoined.playerId } },
      { type: 'claim_host' },
      { type: 'kick_player', extra: { targetPlayerId: henryJoined.playerId } },
      { type: 'restart_game' },
      { type: 'return_to_lobby' },
      { type: 'vote_rematch', extra: { ready: true } },
    ];

    for (let i = 0; i < forbiddenActions.length; i++) {
      const act = forbiddenActions[i];
      const msgId = `forb-${i}`;
      willClient.send({ type: act.type, messageId: msgId, playerId: willJoined.playerId, ...(act.extra || {}) });
      const rej = (await willClient.waitFor((m) => m.type === 'action_rejected' && m.messageId === msgId)) as any;
      expect(rej.code).toBe('FORBIDDEN');
    }
    expect(createdRoom.players.some((p) => p.isBot)).toBe(false);
    expect(createdRoom.settings.turnDuration).toBe(30);

    // Verifica que leave_room em waiting no torneio NÃO remove assento nem destrói a sala
    henryClient.send({ type: 'leave_room', roomId, playerId: henryJoined.playerId });
    await henryClient.waitFor((m) => m.type === 'left_room_confirmed');
    expect(rooms.has(roomId)).toBe(true);
    expect(createdRoom.players).toHaveLength(3);
    expect(createdRoom.players.find((p) => p.id === henryJoined.playerId)?.isConnected).toBe(false);

    // Henry reconecta via join_room
    henryClient.send({ type: 'join_room', roomId, playerName: 'Henry', avatar: '⚡' });
    await henryClient.waitFor((m) => m.type === 'room_joined');

    // Grazy também entra via register_lobby com token (testando fluxo alternativo de token)
    const grazyClient = await connectWsClient(port);
    openClients.push(grazyClient);
    grazyClient.send({ type: 'register_lobby', token: grazyToken, name: 'Grazy', avatar: '🌸' });
    grazyClient.send({ type: 'join_room', roomId, playerName: 'Grazy', avatar: '🌸' });
    const grazyJoined = (await grazyClient.waitFor((m) => m.type === 'room_joined')) as any;
    expect(grazyJoined.playerId).toBe('entry_usr_grazy');

    // 10. Todos os 3 humanos conectados -> Admin inicia partida oficial!
    const validStart = await apiJson(port, `/api/tournaments/tourn_etapa3_1/games/${gameId}/start`, {
      method: 'POST',
      token: adminToken,
    });
    expect(validStart.status).toBe(200);
    expect(createdRoom.status).toBe('playing');
    expect(createdRoom.players).toHaveLength(3);
    expect(createdRoom.players.every((p) => !p.isBot && p.hand.length === 7)).toBe(true);

    // 11. Prepara jogada final do Will via WS real play_card
    const willIdx = createdRoom.players.findIndex((p) => p.id === 'entry_usr_will');
    createdRoom.currentTurnIndex = willIdx;
    const willSeat = createdRoom.players[willIdx];
    const finalCard = { id: 'win-card-will', color: createdRoom.currentColor, value: '7' as const, score: 7 };
    willSeat.hand = [finalCard];

    willClient.send({
      type: 'play_card',
      playerId: willSeat.id,
      cardId: finalCard.id,
    });

    await willClient.waitFor((m) => m.type === 'game_state' && m.state.status === 'ended');

    // Verifica torneio atualizado até campeão
    const tournGet = await apiJson(port, '/api/tournaments/tourn_etapa3_1', { token: willToken });
    expect(tournGet.status).toBe(200);
    expect(tournGet.data.tournament.status).toBe('finished');
    expect(tournGet.data.tournament.championEntryId).toBe('entry_usr_will');

    const groupId = tournGet.data.tournament.rounds[0].groups[0].id;
    const ranking = tournGet.data.standingsByGroup[groupId].standings;
    expect(ranking[0].entryId).toBe('entry_usr_will');
    expect(ranking[0].wins).toBe(1);

    // 12. Idempotência: chamada duplicada de checkWinCondition não dobra vitórias
    checkWinCondition(createdRoom, willSeat);
    const tournAfterDup = tournaments.get('tourn_etapa3_1')!;
    const gameAfterDup = tournAfterDup.rounds[0].groups[0].games[0];
    expect(gameAfterDup.processedEventIds).toHaveLength(1);
    const groupAfterDup = tournAfterDup.rounds[0].groups[0];
    const rankingAfterDup = rankIndividualGroupEntries(groupAfterDup, tournAfterDup.config.tieBreakerPolicy).standings;
    expect(rankingAfterDup.find((s) => s.entryId === 'entry_usr_will')?.wins).toBe(1);
  });

  it('aplica política de espectador tv_hidden e executa W.O. em partida ativa com progressão para Jogo 2 sem bots', async () => {
    // Torneio com 2 jogos por mesa e modo tv_hidden
    await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: {
        id: 'tourn_etapa3_wo',
        name: 'Copa KaWiHe W.O.',
        modality: 'individual',
        gamesPerGroup: 2,
        advancePerGroup: 1,
        spectatorMode: 'tv_hidden',
        playAnimationDelaySeconds: 0,
      },
    });
    await apiJson(port, '/api/tournaments/tourn_etapa3_wo/register', { method: 'POST', token: willToken });
    await apiJson(port, '/api/tournaments/tourn_etapa3_wo/register', { method: 'POST', token: henryToken });
    await apiJson(port, '/api/tournaments/tourn_etapa3_wo/register', { method: 'POST', token: grazyToken });

    const startRes = await apiJson(port, '/api/tournaments/tourn_etapa3_wo/start', {
      method: 'POST',
      token: adminToken,
    });
    const roomId1 = startRes.data.createdRoomIds[0] as string;
    const gameId1 = startRes.data.tournament.rounds[0].groups[0].games[0].id as string;

    const willClient = await connectWsClient(port, willToken);
    const henryClient = await connectWsClient(port, henryToken);
    const grazyClient = await connectWsClient(port, grazyToken);
    const tvClient = await connectWsClient(port, millyToken);
    openClients.push(willClient, henryClient, grazyClient, tvClient);

    willClient.send({ type: 'join_room', roomId: roomId1, playerName: 'Will' });
    henryClient.send({ type: 'join_room', roomId: roomId1, playerName: 'Henry' });
    grazyClient.send({ type: 'join_room', roomId: roomId1, playerName: 'Grazy' });
    // Mesmo pedindo cartas abertas ($), tv_hidden mantém spectatorCardsRevealed = false
    tvClient.send({ type: 'join_room', roomId: `$${roomId1}`, playerName: 'Milly', asSpectator: true, spectatorRevealCards: true });

    await Promise.all([
      willClient.waitFor((m) => m.type === 'room_joined'),
      henryClient.waitFor((m) => m.type === 'room_joined'),
      grazyClient.waitFor((m) => m.type === 'room_joined'),
      tvClient.waitFor((m) => m.type === 'room_joined'),
    ]);

    const room1 = rooms.get(roomId1)!;
    expect(room1.spectatorCardsRevealed).toBe(false);

    // Admin inicia Jogo 1
    const gs1 = await apiJson(port, `/api/tournaments/tourn_etapa3_wo/games/${gameId1}/start`, {
      method: 'POST',
      token: adminToken,
    });
    expect(gs1.status).toBe(200);
    expect(room1.status).toBe('playing');

    // Grazy abandona durante partida -> W.O. individual (não vira Bot!)
    grazyClient.send({ type: 'leave_room', roomId: roomId1, playerId: 'entry_usr_grazy' });
    await grazyClient.waitFor((m) => m.type === 'left_room_confirmed');

    expect(room1.players).toHaveLength(2);
    expect(room1.players.some((p) => p.isBot)).toBe(false);
    expect(room1.woRemovedPlayerIds).toContain('entry_usr_grazy');
    expect(room1.status).toBe('playing');

    // Soma de cartas permanece exata (108 cartas)
    const totalCardsAfterWo =
      room1.deck.length +
      room1.discardPile.length +
      room1.players.reduce((acc, p) => acc + p.hand.length, 0);
    expect(totalCardsAfterWo).toBe(108);

    // Henry também abandona -> resta 1 jogador -> anulação automática + abertura do Jogo 2
    henryClient.send({ type: 'leave_room', roomId: roomId1, playerId: 'entry_usr_henry' });
    await henryClient.waitFor((m) => m.type === 'left_room_confirmed');

    expect(room1.status).toBe('ended');
    const tournState = tournaments.get('tourn_etapa3_wo')!;
    const game1 = tournState.rounds[0].groups[0].games[0];
    const game2 = tournState.rounds[0].groups[0].games[1];
    expect(game1.status).toBe('void');
    expect(game1.resultReason).toBe('void_insufficient_players');
    expect(game2.status).toBe('playing');
    expect(game2.roomId).toBeTruthy();
    expect(game2.roomId).not.toBe(roomId1);
    expect(rooms.has(game2.roomId!)).toBe(true);
  });

  it('preserva fluxo normal de sala casual com bots sem interferência do torneio', async () => {
    const casualClient = await connectWsClient(port);
    openClients.push(casualClient);

    casualClient.send({
      type: 'create_room',
      playerName: 'CasualPlayer',
      avatar: '🎲',
      settings: { maxPlayers: 4, gameMode: 'standard', turnDuration: 30, isPrivate: false },
    });

    const joined = (await casualClient.waitFor((m) => m.type === 'room_joined')) as any;
    const casualRoom = rooms.get(joined.roomId)!;
    expect(casualRoom.tournamentId).toBeUndefined();

    casualClient.send({ type: 'add_bot', playerId: joined.playerId });
    await casualClient.waitFor((m) => m.type === 'game_state' && m.state.players.some((p) => p.isBot));

    casualClient.send({ type: 'start_game', playerId: joined.playerId });
    const playingMsg = await casualClient.waitFor((m) => m.type === 'game_state' && m.state.status === 'playing');
    if (playingMsg.type === 'game_state') {
      expect(playingMsg.state.players.length).toBe(2);
    }
  });

  it('Etapa 4: executa torneio de Duplas 2v2 completo (3 equipes com BYE, Md3 2-0, assentos alternados, W.O. da dupla e campeã)', async () => {
    // 1. Cria torneio de duplas Md3
    const createRes = await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: {
        id: 'tourn_dup_etapa4',
        name: 'Copa Duplas 2v2',
        modality: 'doubles',
        bestOf: 3,
        spectatorMode: 'tv_reveal',
        playAnimationDelaySeconds: 0,
        seed: 77,
      },
    });
    expect(createRes.status).toBe(201);

    // Tentativa de inscrição individual em torneio de duplas é rejeitada
    const indivReg = await apiJson(port, '/api/tournaments/tourn_dup_etapa4/register', {
      method: 'POST',
      token: willToken,
    });
    expect(indivReg.status).toBe(400);

    // Jogador comum não cadastra equipes
    const nonAdmTeam = await apiJson(port, '/api/tournaments/tourn_dup_etapa4/teams', {
      method: 'POST',
      token: willToken,
      body: { teamId: 'team_alfa', name: 'Alfa', userIds: ['will', 'henry'] },
    });
    expect(nonAdmTeam.status).toBe(403);

    // Admin cadastra 3 equipes (6 jogadores)
    expect(
      (await apiJson(port, '/api/tournaments/tourn_dup_etapa4/teams', {
        method: 'POST',
        token: adminToken,
        body: { teamId: 'team_alfa', name: 'Alfa', userIds: ['will', 'henry'] },
      })).status
    ).toBe(201);
    expect(
      (await apiJson(port, '/api/tournaments/tourn_dup_etapa4/teams', {
        method: 'POST',
        token: adminToken,
        body: { teamId: 'team_beta', name: 'Beta', userIds: ['grazy', 'milly'] },
      })).status
    ).toBe(201);
    expect(
      (await apiJson(port, '/api/tournaments/tourn_dup_etapa4/teams', {
        method: 'POST',
        token: adminToken,
        body: { teamId: 'team_gama', name: 'Gama', userIds: ['aline', 'guilherme'] },
      })).status
    ).toBe(201);

    // Rejeita jogador repetido em outra equipe
    const dupMember = await apiJson(port, '/api/tournaments/tourn_dup_etapa4/teams', {
      method: 'POST',
      token: adminToken,
      body: { teamId: 'team_err', name: 'Err', userIds: ['will', 'aline'] },
    });
    expect(dupMember.status).toBe(400);

    // Edição antes do início permitida (e revertida)
    expect(
      (await apiJson(port, '/api/tournaments/tourn_dup_etapa4/teams/team_gama', {
        method: 'PUT',
        token: adminToken,
        body: { userIds: ['guilherme', 'aline'] },
      })).status
    ).toBe(200);

    // 2. Admin inicia torneio -> Rodada 1 tem 1 confronto (2 equipes) + 1 BYE automático
    const startRes = await apiJson(port, '/api/tournaments/tourn_dup_etapa4/start', {
      method: 'POST',
      token: adminToken,
    });
    expect(startRes.status).toBe(200);
    expect(startRes.data.createdRoomIds).toHaveLength(1);

    // Após início, equipes estão congeladas
    const frozenEdit = await apiJson(port, '/api/tournaments/tourn_dup_etapa4/teams/team_gama', {
      method: 'PUT',
      token: adminToken,
      body: { userIds: ['aline', 'guilherme'] },
    });
    expect(frozenEdit.status).toBe(400);

    const r1RoomId = startRes.data.createdRoomIds[0] as string;
    const r1Room = rooms.get(r1RoomId)!;
    expect(r1Room.settings.gameMode).toBe('team_2v2');
    expect(r1Room.settings.tournamentFormat).toBe('doubles_elimination');
    expect(r1Room.players).toHaveLength(4);
    expect(r1Room.players.some((p) => p.isBot)).toBe(false);
    // Assentos alternados: A, B, A, B
    expect(r1Room.players.map((p) => p.team)).toEqual(['A', 'B', 'A', 'B']);

    const round1 = startRes.data.tournament.rounds[0];
    const matchGroup = round1.groups.find((g: any) => !g.byeWinnerEntryId)!;
    const byeGroup = round1.groups.find((g: any) => !!g.byeWinnerEntryId)!;
    expect(byeGroup.status).toBe('finished');
    const r1Game1Id = matchGroup.games[0].id as string;

    // Helper para conectar os 4 jogadores reais da sala 2v2 e iniciar partida
    const connectAllPlayersToRoom = async (targetRoomId: string) => {
      const targetRoom = rooms.get(targetRoomId)!;
      const clientsBySeatId: Record<string, TestWsClient> = {};
      for (const seat of targetRoom.players) {
        const tok = tokensByUserId[seat.userId!];
        const cli = await connectWsClient(port, tok);
        openClients.push(cli);
        cli.send({ type: 'join_room', roomId: targetRoomId, playerName: seat.name });
        const joined = (await cli.waitFor((m) => m.type === 'room_joined')) as any;
        expect(joined.playerId).toBe(seat.id);
        clientsBySeatId[seat.id] = cli;
      }
      return clientsBySeatId;
    };

    // Helper para vencer a partida atual pelo primeiro assento da equipe desejada
    const winCurrentGameByTeam = async (targetRoomId: string, winningEntryId: string, clientsBySeatId: Record<string, TestWsClient>) => {
      const targetRoom = rooms.get(targetRoomId)!;
      const seatIdx = targetRoom.players.findIndex((p) => p.tournamentEntryId === winningEntryId);
      const seat = targetRoom.players[seatIdx];
      targetRoom.currentTurnIndex = seatIdx;
      const winCard = { id: `win-${targetRoomId}-${seat.id}`, color: targetRoom.currentColor, value: '9' as const, score: 9 };
      seat.hand = [winCard];
      clientsBySeatId[seat.id].send({ type: 'play_card', playerId: seat.id, cardId: winCard.id });
      await clientsBySeatId[seat.id].waitFor((m) => m.type === 'game_state' && m.state.status === 'ended');
    };

    // Jogo 1 da Série Md3 (R1_M1_G1)
    const r1g1Clients = await connectAllPlayersToRoom(r1RoomId);
    expect((await apiJson(port, `/api/tournaments/tourn_dup_etapa4/games/${r1Game1Id}/start`, { method: 'POST', token: adminToken })).status).toBe(200);
    const seriesWinnerEntry = matchGroup.entryIds[0] as string;
    await winCurrentGameByTeam(r1RoomId, seriesWinnerEntry, r1g1Clients);

    // Verifica placar 1-0 e criação automática do Jogo 2
    let tournState = (await apiJson(port, '/api/tournaments/tourn_dup_etapa4', { token: adminToken })).data;
    expect(tournState.seriesSummaryByGroup[matchGroup.id].winsByEntryId[seriesWinnerEntry]).toBe(1);
    const r1Game2 = tournState.tournament.rounds[0].groups[0].games[1];
    expect(r1Game2.status).toBe('playing');
    const r1Room2Id = r1Game2.roomId as string;

    // Jogo 2 da Série Md3 (R1_M1_G2) -> 2-0 fecha série (early_clinch no G3) e abre Final vs BYE!
    const r1g2Clients = await connectAllPlayersToRoom(r1Room2Id);
    expect((await apiJson(port, `/api/tournaments/tourn_dup_etapa4/games/${r1Game2.id}/start`, { method: 'POST', token: adminToken })).status).toBe(200);
    await winCurrentGameByTeam(r1Room2Id, seriesWinnerEntry, r1g2Clients);

    tournState = (await apiJson(port, '/api/tournaments/tourn_dup_etapa4', { token: adminToken })).data;
    expect(tournState.tournament.rounds).toHaveLength(2);
    expect(tournState.tournament.rounds[1].label).toBe('Final');
    const finalGroup = tournState.tournament.rounds[1].groups[0];
    expect(finalGroup.entryIds).toContain(seriesWinnerEntry);
    expect(finalGroup.entryIds).toContain(byeGroup.byeWinnerEntryId);
    const finalGame1 = finalGroup.games[0];
    expect(finalGame1.status).toBe('playing');
    const finalRoomId = finalGame1.roomId as string;

    // Na Final: conecta todos os 4 finalistas, inicia Jogo 1, e testa W.O. da dupla via leave_room!
    const finalClients = await connectAllPlayersToRoom(finalRoomId);
    expect((await apiJson(port, `/api/tournaments/tourn_dup_etapa4/games/${finalGame1.id}/start`, { method: 'POST', token: adminToken })).status).toBe(200);

    const finalRoom = rooms.get(finalRoomId)!;
    // Jogador da equipe BYE abandona explicitamente -> equipe inteira perde por W.O. e adversária é campeã!
    const byeSeat = finalRoom.players.find((p) => p.tournamentEntryId === byeGroup.byeWinnerEntryId)!;
    finalClients[byeSeat.id].send({ type: 'leave_room', roomId: finalRoomId, playerId: byeSeat.id });
    await finalClients[byeSeat.id].waitFor((m) => m.type === 'left_room_confirmed');

    expect(finalRoom.status).toBe('ended');
    expect(finalRoom.players.some((p) => p.isBot)).toBe(false);

    const finalCheck = (await apiJson(port, '/api/tournaments/tourn_dup_etapa4', { token: adminToken })).data;
    expect(finalCheck.tournament.status).toBe('finished');
    expect(finalCheck.tournament.championEntryId).toBe(seriesWinnerEntry);
    expect(finalCheck.tournament.rounds[1].groups[0].games[0].resultReason).toBe('wo');
    expect(finalCheck.tournament.rounds[1].groups[0].games[1].status).toBe('void');
  });

  it('Etapa 4: executa torneio Individual multi-mesa (6 jogadores -> 2 mesas de 3 -> Final -> Campeão)', async () => {
    await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: {
        id: 'tourn_ind_multi',
        name: 'Copa Individual 6 Jogadores',
        modality: 'individual',
        gamesPerGroup: 1,
        advancePerGroup: 1,
        playAnimationDelaySeconds: 0,
        seed: 11,
      },
    });

    for (const tok of [willToken, henryToken, grazyToken, millyToken, alineToken, guilhermeToken]) {
      const reg = await apiJson(port, '/api/tournaments/tourn_ind_multi/register', { method: 'POST', token: tok });
      expect(reg.status).toBe(200);
    }

    const startRes = await apiJson(port, '/api/tournaments/tourn_ind_multi/start', {
      method: 'POST',
      token: adminToken,
    });
    expect(startRes.status).toBe(200);
    // 6 jogadores => 2 mesas simultâneas de 3 jogadores
    expect(startRes.data.createdRoomIds).toHaveLength(2);
    const [roomAId, roomBId] = startRes.data.createdRoomIds as string[];
    const gAId = startRes.data.tournament.rounds[0].groups[0].games[0].id as string;
    const gBId = startRes.data.tournament.rounds[0].groups[1].games[0].id as string;

    const connectAndWinTable = async (tRoomId: string, tGameId: string) => {
      const r = rooms.get(tRoomId)!;
      expect(r.players).toHaveLength(3);
      const clis: Record<string, TestWsClient> = {};
      for (const s of r.players) {
        const c = await connectWsClient(port, tokensByUserId[s.userId!]);
        openClients.push(c);
        c.send({ type: 'join_room', roomId: tRoomId, playerName: s.name });
        await c.waitFor((m) => m.type === 'room_joined');
        clis[s.id] = c;
      }
      expect((await apiJson(port, `/api/tournaments/tourn_ind_multi/games/${tGameId}/start`, { method: 'POST', token: adminToken })).status).toBe(200);
      r.currentTurnIndex = 0;
      const winnerSeat = r.players[0];
      const winCard = { id: `wc-${tRoomId}`, color: r.currentColor, value: '5' as const, score: 5 };
      winnerSeat.hand = [winCard];
      clis[winnerSeat.id].send({ type: 'play_card', playerId: winnerSeat.id, cardId: winCard.id });
      await clis[winnerSeat.id].waitFor((m) => m.type === 'game_state' && m.state.status === 'ended');
      return winnerSeat.tournamentEntryId!;
    };

    const winnerA = await connectAndWinTable(roomAId, gAId);
    // Apenas Mesa 1 terminou -> ainda não cria Final
    let midState = tournaments.get('tourn_ind_multi')!;
    expect(midState.rounds).toHaveLength(1);

    const winnerB = await connectAndWinTable(roomBId, gBId);
    // Agora Mesa 1 e Mesa 2 terminaram -> Final gerada automaticamente com 2 finalistas!
    midState = tournaments.get('tourn_ind_multi')!;
    expect(midState.rounds).toHaveLength(2);
    expect(midState.rounds[1].label).toBe('Final');
    const finalGroup = midState.rounds[1].groups[0];
    expect(finalGroup.entryIds).toHaveLength(2);
    expect(finalGroup.entryIds).toContain(winnerA);
    expect(finalGroup.entryIds).toContain(winnerB);
    const finalRoomId = finalGroup.games[0].roomId!;

    const finalRoom = rooms.get(finalRoomId)!;
    expect(finalRoom.players).toHaveLength(2);
    const fClients: Record<string, TestWsClient> = {};
    for (const s of finalRoom.players) {
      const c = await connectWsClient(port, tokensByUserId[s.userId!]);
      openClients.push(c);
      c.send({ type: 'join_room', roomId: finalRoomId, playerName: s.name });
      await c.waitFor((m) => m.type === 'room_joined');
      fClients[s.id] = c;
    }
    expect((await apiJson(port, `/api/tournaments/tourn_ind_multi/games/${finalGroup.games[0].id}/start`, { method: 'POST', token: adminToken })).status).toBe(200);

    finalRoom.currentTurnIndex = 0;
    const champSeat = finalRoom.players[0];
    const champCard = { id: 'wc-final', color: finalRoom.currentColor, value: '8' as const, score: 8 };
    champSeat.hand = [champCard];
    fClients[champSeat.id].send({ type: 'play_card', playerId: champSeat.id, cardId: champCard.id });
    await fClients[champSeat.id].waitFor((m) => m.type === 'game_state' && m.state.status === 'ended');

    const finalTourn = tournaments.get('tourn_ind_multi')!;
    expect(finalTourn.status).toBe('finished');
    expect(finalTourn.championEntryId).toBe(champSeat.tournamentEntryId);
  });
});
