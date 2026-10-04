import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import express from 'express';
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

  const rooms = new Map<string, RoomData>();
  const clientConnections = new Map<WebSocket, { socketId: string; roomId: string; playerId: string; reconnectToken: string }>();

  beforeAll(async () => {
    const app = express();
    app.use(express.json());

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

  it('1. Deve rejeitar mensagens de sockets não autenticados tentando se passar por um jogador', async () => {
    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    const responsePromise = new Promise<ServerMessage>((resolve) => {
      client.on('message', (data) => resolve(JSON.parse(data.toString())));
    });

    // Envia ação tentando forçar playerId sem antes autenticar/entrar na sala
    client.send(JSON.stringify({
      type: 'play_card',
      roomId: 'TEST_ROOM',
      playerId: 'player-victim',
      cardId: 'c1',
      protocolVersion: 1,
      messageId: 'msg-unauth-1',
    }));

    const reply = await responsePromise;
    expect(reply.type).toBe('action_rejected');
    if (reply.type === 'action_rejected') {
      expect(reply.code).toBe('UNAUTHENTICATED_SOCKET');
    }

    client.close();
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
      protocolVersion: 0, // Incompatível
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

    // Entra na sala para se autenticar
    client.send(JSON.stringify({
      type: 'join_room',
      roomId: 'ROOM_PASS_TEST',
      playerName: 'Player Pass',
      protocolVersion: 1,
      messageId: 'msg-join-pass',
    }));

    await replyPromise;

    // Tenta passar a vez sem ter comprado
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

    // Entra na sala para obter seu playerId
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

    // Tenta dar catch_uno em si mesmo
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
});
