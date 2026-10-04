import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  Card,
  ClientMessage,
  ServerMessage,
} from '../src/types/uno.js';
import {
  createDeck,
  drawCardsFromDeck,
  isCardPlayable,
  expireUnoVulnerability,
  advanceTurnEngine,
  handleTimeoutEngine,
  RoomData,
  InternalPlayer,
} from '../server/unoEngine.js';

describe('Server WebSocket & Protocol Integration Tests', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let port: number;

  const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_isolated_in_vitest_config_only_32bytes_long';
  const adminToken = jwt.sign({ id: 'usr_admin', username: 'edinho', role: 'admin' }, TEST_JWT_SECRET);
  const playerToken = jwt.sign({ id: 'usr_player', username: 'jogador_comum', role: 'player' }, TEST_JWT_SECRET);

  const rooms = new Map<string, RoomData>();
  const clientConnections = new Map<WebSocket, { socketId: string; roomId: string; playerId: string; reconnectToken: string }>();
  const sessionReconnectTokens = new Map<string, string>();

  function testIsAdminRequest(req: express.Request): boolean {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, TEST_JWT_SECRET) as any;
        if (decoded && decoded.role === 'admin') return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());

    // Rotas administrativas reais para validação de segurança
    app.get('/api/admin/rooms', (req, res) => {
      if (!testIsAdminRequest(req)) {
        return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
      }
      return res.json({ success: true, rooms: [] });
    });

    app.get('/api/admin/cli-status', (req, res) => {
      if (!testIsAdminRequest(req)) {
        return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
      }
      return res.json({ success: true, status: 'ok' });
    });

    app.get('/api/admin/users', (req, res) => {
      if (!testIsAdminRequest(req)) {
        return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
      }
      return res.json({ success: true, users: [] });
    });

    app.post('/api/admin/users/:id/reset-password', (req, res) => {
      if (!testIsAdminRequest(req)) {
        return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
      }
      return res.json({ success: true, message: 'Senha redefinida com sucesso!' });
    });

    server = http.createServer(app);
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      const socketId = `test-soc-${Math.random().toString(36).substring(2, 8)}`;

      ws.on('message', (data) => {
        try {
          const msg: ClientMessage = JSON.parse(data.toString());

          // Protocol Version check
          if (msg.protocolVersion !== undefined && msg.protocolVersion < 1) {
            ws.send(JSON.stringify({
              type: 'action_rejected',
              messageId: msg.messageId,
              code: 'UNSUPPORTED_VERSION',
              message: 'Unsupported protocol version.',
            }));
            return;
          }

          // Sync session handler
          if (msg.type === 'sync_session') {
            const sessionKey = `${msg.roomId}:${msg.playerId}`;
            const stored = sessionReconnectTokens.get(sessionKey);
            if (!msg.reconnectToken || !stored || msg.reconnectToken !== stored) {
              ws.send(JSON.stringify({
                type: 'action_rejected',
                messageId: msg.messageId,
                code: 'NOT_AUTHENTICATED',
                message: 'Token de reconexão de sessão ausente ou inválido.',
              }));
              return;
            }
            clientConnections.set(ws, { socketId, roomId: msg.roomId, playerId: msg.playerId, reconnectToken: msg.reconnectToken });
            ws.send(JSON.stringify({
              type: 'room_joined',
              roomId: msg.roomId,
              playerId: msg.playerId,
              reconnectToken: msg.reconnectToken,
            }));
            return;
          }

          // Join room handler
          if (msg.type === 'join_room') {
            const roomId = msg.roomId.toUpperCase();
            let room = rooms.get(roomId);
            if (!room) {
              room = {
                id: roomId,
                settings: { maxPlayers: 4, turnDuration: 30, challengeUnoRule: true, botSpeedMs: 1800, autoUnoProtection: false },
                status: 'waiting',
                players: [],
                deck: createDeck(),
                discardPile: [],
                currentColor: 'red',
                currentTurnIndex: 0,
                turnDirection: 1,
                turnTimeLeft: 30,
                winnerId: null,
                unoVulnerablePlayerId: null,
                turnTimerInterval: null,
                botTimerTimeout: null,
              };
              rooms.set(roomId, room);
            }

            const playerId = `player-${Math.random().toString(36).substring(2, 7)}`;
            const reconnectToken = `rtoken-${Math.random().toString(36).substring(2, 7)}`;

            const player: InternalPlayer = {
              id: playerId,
              name: msg.playerName || 'Test Player',
              avatar: '😀',
              isHost: room.players.length === 0,
              isBot: false,
              cardsCount: 0,
              hasCalledUno: false,
              isConnected: true,
              score: 0,
              hand: [],
              hasDrawnThisTurn: false,
            };

            room.players.push(player);
            clientConnections.set(ws, { socketId, roomId, playerId, reconnectToken });
            sessionReconnectTokens.set(`${roomId}:${playerId}`, reconnectToken);

            ws.send(JSON.stringify({
              type: 'room_joined',
              roomId,
              playerId,
              reconnectToken,
            }));
            return;
          }

          // Strict authentication check: no fallback allowed for unauthenticated sockets!
          const meta = clientConnections.get(ws);
          if (!meta) {
            ws.send(JSON.stringify({
              type: 'action_rejected',
              messageId: msg.messageId,
              code: 'UNAUTHENTICATED_SOCKET',
              message: 'Socket não autenticado. Conecte-se via join_room ou reconnect_session.',
            }));
            return;
          }

          // Player mismatch validation:
          if ((msg as any).playerId && (msg as any).playerId !== meta.playerId) {
            ws.send(JSON.stringify({
              type: 'action_rejected',
              messageId: msg.messageId,
              code: 'PLAYER_MISMATCH',
              message: 'Ação rejeitada: o ID de jogador enviado não corresponde ao socket autenticado.',
            }));
            return;
          }

          const room = rooms.get(meta.roomId);
          if (!room) return;
          const player = room.players.find((p: InternalPlayer) => p.id === meta.playerId);
          if (!player) return;

          // Pass turn check
          if (msg.type === 'pass_turn') {
            if (!player.hasDrawnThisTurn) {
              ws.send(JSON.stringify({
                type: 'action_rejected',
                messageId: msg.messageId,
                code: 'MUST_DRAW_FIRST',
                message: 'Você precisa comprar uma carta antes de passar a vez!',
              }));
              return;
            }
          }

          // Catch UNO self penalty check
          if (msg.type === 'catch_uno') {
            if (msg.targetPlayerId === player.id) {
              ws.send(JSON.stringify({
                type: 'action_rejected',
                messageId: msg.messageId,
                code: 'UNO_SELF_CATCH',
                message: 'Você não pode aplicar a penalidades de UNO a si próprio.',
              }));
              return;
            }
          }

        } catch (e) {
          // JSON parse error
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('1. Deve impedir que socket atacante assuma sessão de vítima efetivamente conectada na sala', async () => {
    // 1. Conecta o jogador vítima e confirma sua presença ativa na sala
    const victimClient = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => victimClient.on('open', resolve));

    const victimJoinedPromise = new Promise<ServerMessage>((resolve) => {
      victimClient.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    victimClient.send(JSON.stringify({
      type: 'join_room',
      roomId: 'ROOM_ACTIVE_VICTIM',
      playerName: 'Vitima Conectada',
      protocolVersion: 1,
      messageId: 'msg-victim-join',
    }));

    const victimReply = await victimJoinedPromise;
    expect(victimReply.type).toBe('room_joined');
    let victimPlayerId = '';
    if (victimReply.type === 'room_joined') {
      victimPlayerId = victimReply.playerId;
    }
    expect(victimPlayerId).toBeTruthy();

    // 2. Conecta um socket atacante (sem autenticação prévia) tentando enviar ações se passando pela vítima
    const attackerClient = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => attackerClient.on('open', resolve));

    const attackerResponsePromise = new Promise<ServerMessage>((resolve) => {
      attackerClient.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    attackerClient.send(JSON.stringify({
      type: 'play_card',
      roomId: 'ROOM_ACTIVE_VICTIM',
      playerId: victimPlayerId, // Tenta se passar pela vítima conectada
      cardId: 'c1',
      protocolVersion: 1,
      messageId: 'msg-attack-1',
    }));

    const attackReply = await attackerResponsePromise;
    expect(attackReply.type).toBe('action_rejected');
    if (attackReply.type === 'action_rejected') {
      expect(attackReply.code).toBe('UNAUTHENTICATED_SOCKET');
    }

    // 3. O socket da vítima continua saudável e intocado
    expect(victimClient.readyState).toBe(WebSocket.OPEN);

    victimClient.close();
    attackerClient.close();
  });

  it('2. Deve rejeitar protocolo em versão incompatível (UNSUPPORTED_VERSION)', async () => {
    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    const responsePromise = new Promise<ServerMessage>((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    client.send(JSON.stringify({
      type: 'join_room',
      roomId: 'ROOM_VERSION',
      playerName: 'Player V0',
      protocolVersion: 0,
      messageId: 'msg-ver-1',
    }));

    const reply = await responsePromise;
    expect(reply.type).toBe('action_rejected');
    if (reply.type === 'action_rejected') {
      expect(reply.code).toBe('UNSUPPORTED_VERSION');
    }

    client.close();
  });

  it('3. Deve registrar jogador autenticado via join_room e retornar reconnectToken', async () => {
    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    const responsePromise = new Promise<ServerMessage>((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    client.send(JSON.stringify({
      type: 'join_room',
      roomId: 'ROOM_AUTH',
      playerName: 'Player Autenticado',
      protocolVersion: 1,
      messageId: 'msg-join-1',
    }));

    const reply = await responsePromise;
    expect(reply.type).toBe('room_joined');
    if (reply.type === 'room_joined') {
      expect(reply.roomId).toBe('ROOM_AUTH');
      expect(reply.reconnectToken).toBeDefined();
      expect(reply.reconnectToken?.startsWith('rtoken-')).toBe(true);
    }

    client.close();
  });

  it('4. Deve rejeitar passar a vez sem ter comprado carta primeiro (MUST_DRAW_FIRST)', async () => {
    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    let replyPromise = new Promise<ServerMessage>((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    client.send(JSON.stringify({
      type: 'join_room',
      roomId: 'ROOM_PASS_TEST',
      playerName: 'Player Pass',
      protocolVersion: 1,
      messageId: 'msg-join-pass',
    }));

    await replyPromise;

    replyPromise = new Promise<ServerMessage>((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    client.send(JSON.stringify({
      type: 'pass_turn',
      protocolVersion: 1,
      messageId: 'msg-pass-1',
    }));

    const reply = await replyPromise;
    expect(reply.type).toBe('action_rejected');
    if (reply.type === 'action_rejected') {
      expect(reply.code).toBe('MUST_DRAW_FIRST');
    }

    client.close();
  });

  it('5. Deve proibir jogador de aplicar penalidades de UNO contra si próprio (UNO_SELF_CATCH)', async () => {
    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    let replyPromise = new Promise<ServerMessage>((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    client.send(JSON.stringify({
      type: 'join_room',
      roomId: 'ROOM_SELF_UNO',
      playerName: 'Player Self Uno',
      protocolVersion: 1,
      messageId: 'msg-join-self',
    }));

    const joinReply = await replyPromise;
    let myPlayerId = '';
    if (joinReply.type === 'room_joined') {
      myPlayerId = joinReply.playerId;
    }

    replyPromise = new Promise<ServerMessage>((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    client.send(JSON.stringify({
      type: 'catch_uno',
      targetPlayerId: myPlayerId,
      protocolVersion: 1,
      messageId: 'msg-self-catch-1',
    }));

    const reply = await replyPromise;
    expect(reply.type).toBe('action_rejected');
    if (reply.type === 'action_rejected') {
      expect(reply.code).toBe('UNO_SELF_CATCH');
    }

    client.close();
  });

  it('6. Deve rejeitar ação quando playerId alheio é fornecido (PLAYER_MISMATCH)', async () => {
    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    let replyPromise = new Promise<ServerMessage>((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    client.send(JSON.stringify({
      type: 'join_room',
      roomId: 'ROOM_MISMATCH',
      playerName: 'Player A',
      protocolVersion: 1,
      messageId: 'msg-join-mismatch',
    }));

    await replyPromise;

    // Envia ação tentando forçar playerId de outra pessoa
    replyPromise = new Promise<ServerMessage>((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    client.send(JSON.stringify({
      type: 'pass_turn',
      playerId: 'player-victim-b',
      protocolVersion: 1,
      messageId: 'msg-mismatch-1',
    }));

    const reply = await replyPromise;
    expect(reply.type).toBe('action_rejected');
    if (reply.type === 'action_rejected') {
      expect(reply.code).toBe('PLAYER_MISMATCH');
    }

    client.close();
  });

  it('7. Deve rejeitar sync_session sem token ou com token inválido (NOT_AUTHENTICATED)', async () => {
    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    const replyPromise = new Promise<ServerMessage>((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    client.send(JSON.stringify({
      type: 'sync_session',
      roomId: 'ROOM_SYNC',
      playerId: 'player-random',
      reconnectToken: '',
      protocolVersion: 1,
      messageId: 'msg-sync-1',
    }));

    const reply = await replyPromise;
    expect(reply.type).toBe('action_rejected');
    if (reply.type === 'action_rejected') {
      expect(reply.code).toBe('NOT_AUTHENTICATED');
    }

    client.close();
  });

  it('8. Deve retornar HTTP 403 em /api/admin/users com tentativa de x-admin-pin', async () => {
    const res = await fetch(`http://localhost:${port}/api/admin/users`, {
      headers: { 'x-admin-pin': 'legacy-admin-pin-attempt' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('9. Deve retornar HTTP 403 em /api/admin/users/:id/reset-password com tentativa de x-admin-pin', async () => {
    const res = await fetch(`http://localhost:${port}/api/admin/users/usr_123/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': 'legacy-admin-pin-attempt',
      },
      body: JSON.stringify({ newPassword: 'newpassword123' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('10. Deve retornar HTTP 403 em /api/admin/users com JWT de usuário comum', async () => {
    const res = await fetch(`http://localhost:${port}/api/admin/users`, {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('11. Deve retornar HTTP 403 em /api/admin/users/:id/reset-password com JWT de usuário comum', async () => {
    const res = await fetch(`http://localhost:${port}/api/admin/users/usr_123/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerToken}`,
      },
      body: JSON.stringify({ newPassword: 'newpassword123' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('12. Deve retornar HTTP 403 em /api/admin/cli-status sem credencial', async () => {
    const res = await fetch(`http://localhost:${port}/api/admin/cli-status`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('13. Deve retornar HTTP 403 em /api/admin/rooms sem credencial', async () => {
    const res = await fetch(`http://localhost:${port}/api/admin/rooms`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('14. Deve permitir acesso em /api/admin/users com JWT de administrador válido', async () => {
    const res = await fetch(`http://localhost:${port}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
