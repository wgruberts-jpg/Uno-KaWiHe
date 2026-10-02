import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  Card,
  CardColor,
  ChatMessage,
  ClientMessage,
  GameLog,
  GameState,
  Player,
  ServerMessage
} from './src/types/uno.js';
import {
  createDeck,
  drawCardsFromDeck,
  getNextPlayerIndex,
  InternalPlayer,
  isCardPlayable,
  RoomData
} from './server/unoEngine.js';
import { EMOTES_MAP } from './src/utils/emotes.js';
import {
  registerUser,
  loginUser,
  getUserFromToken,
  verifyAdminPin,
  getAllInvites,
  saveInvites,
  getAllUsers
} from './server/authService.js';

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());

// Auth Microservice Proxy or Fallback Local Handler
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL;

app.post('/api/auth/register', async (req, res) => {
  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.error('Failed to proxy register to auth service, falling back to local:', err);
    }
  }
  const result = await registerUser(req.body);
  return res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/auth/login', async (req, res) => {
  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.error('Failed to proxy login to auth service, falling back to local:', err);
    }
  }
  const result = await loginUser(req.body);
  return res.status(result.success ? 200 : 401).json(result);
});

app.get('/api/auth/me', async (req, res) => {
  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/me`, {
        headers: { Authorization: req.headers.authorization || '' },
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.error('Failed to proxy /me to auth service, falling back to local:', err);
    }
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }
  const token = authHeader.split(' ')[1];
  const user = getUserFromToken(token);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Sessão expirada.' });
  }
  return res.json({ success: true, user });
});

app.post('/api/auth/verify-admin-pin', async (req, res) => {
  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/verify-admin-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.error('Failed to proxy verify-admin-pin to auth service, falling back to local:', err);
    }
  }
  const { pin } = req.body;
  const isValid = verifyAdminPin(pin);
  if (isValid) {
    return res.json({ success: true, message: 'PIN correto!' });
  } else {
    return res.status(403).json({ success: false, error: 'PIN de Administrador incorreto!' });
  }
});

// Invites API Routes
app.get('/api/invites/validate/:code', async (req, res) => {
  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/invites/validate/${encodeURIComponent(req.params.code)}`);
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch {
      // fallback
    }
  }

  let code = req.params.code?.trim().toUpperCase();
  if (!code.startsWith('@')) code = '@' + code;
  const invites = getAllInvites();
  const invite = invites.find((i) => i.code.toUpperCase() === code);

  if (!invite) return res.json({ valid: false, error: 'Código de convite não encontrado.' });
  if (invite.status === 'revoked') return res.json({ valid: false, error: 'Este convite foi cancelado pelo Administrador.' });
  if (invite.status === 'expired' || (invite.expiresAt !== 'never' && new Date(invite.expiresAt) < new Date())) {
    return res.json({ valid: false, error: 'Este convite já expirou! Peça um novo convite ao Edinho.' });
  }
  if (invite.usedCount >= invite.maxUses || invite.status === 'used') {
    return res.json({ valid: false, error: 'Este convite já foi utilizado o número máximo de vezes.' });
  }

  return res.json({ valid: true, code: invite.code, expiresAt: invite.expiresAt, remainingUses: invite.maxUses - invite.usedCount });
});

app.get('/api/invites', async (req, res) => {
  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/invites`, {
        headers: { Authorization: req.headers.authorization || '' },
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch {
      // fallback
    }
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }
  const token = authHeader.split(' ')[1];
  const user = getUserFromToken(token);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const invites = getAllInvites();
  return res.json({ success: true, invites });
});

app.post('/api/invites', async (req, res) => {
  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization || '',
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch {
      // fallback
    }
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }
  const token = authHeader.split(' ')[1];
  const user = getUserFromToken(token);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const { durationHours = 24, maxUses = 1, customCode, createdBy = 'Edinho' } = req.body;
  let code = '';
  if (customCode && typeof customCode === 'string') {
    let clean = customCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.startsWith('@')) clean = clean.substring(1);
    clean = clean.substring(0, 4);
    if (clean.length < 2) {
      return res.status(400).json({ success: false, error: 'O código personalizado deve ter entre 2 e 4 caracteres.' });
    }
    code = `@${clean}`;
  } else {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let rand = '';
    for (let i = 0; i < 4; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `@${rand}`;
  }

  const invites = getAllInvites();
  if (invites.some((i) => i.code === code && i.status === 'active')) {
    return res.status(400).json({ success: false, error: 'Este código de convite já existe e está ativo.' });
  }

  let expiresAt = 'never';
  if (durationHours > 0) {
    expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
  }

  const newInvite = {
    code,
    createdBy,
    createdAt: new Date().toISOString(),
    expiresAt,
    maxUses: Math.max(1, Number(maxUses) || 1),
    usedCount: 0,
    usedBy: [],
    status: 'active' as const,
  };

  invites.unshift(newInvite);
  saveInvites(invites);
  return res.json({ success: true, invite: newInvite });
});

app.delete('/api/invites/:code', async (req, res) => {
  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/invites/${encodeURIComponent(req.params.code)}`, {
        method: 'DELETE',
        headers: { Authorization: req.headers.authorization || '' },
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch {
      // fallback
    }
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }
  const token = authHeader.split(' ')[1];
  const user = getUserFromToken(token);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  let code = req.params.code?.trim().toUpperCase();
  if (!code.startsWith('@')) code = '@' + code;

  const invites = getAllInvites();
  const invite = invites.find((i) => i.code.toUpperCase() === code);
  if (!invite) {
    return res.status(404).json({ success: false, error: 'Convite não encontrado.' });
  }

  invite.status = 'revoked';
  saveInvites(invites);
  return res.json({ success: true, message: 'Convite revogado com sucesso.' });
});

// User Career Stats storage
const userStatsMemory = new Map<string, any>();

app.get('/api/user/stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }
  const token = authHeader.split(' ')[1];
  const user = getUserFromToken(token);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/user/stats`, {
        headers: { Authorization: req.headers.authorization || '' },
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch {
      // fallback
    }
  }

  const stats = userStatsMemory.get(user.id) || null;
  return res.json({ success: true, stats });
});

app.post('/api/user/stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }
  const token = authHeader.split(' ')[1];
  const user = getUserFromToken(token);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  const { stats } = req.body;
  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/user/stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization || '',
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch {
      // fallback
    }
  }

  userStatsMemory.set(user.id, stats);
  return res.json({ success: true, message: 'Estatísticas salvas com sucesso' });
});

// Admin Room Management Helper
function isAdminRequest(req: any): boolean {
  const pinHeader = req.headers['x-admin-pin'];
  if (pinHeader === '774007' || pinHeader === process.env.ADMIN_PIN || pinHeader === '1234') {
    return true;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const user = getUserFromToken(authHeader.split(' ')[1]);
    if (user && user.role === 'admin') return true;
  }
  return false;
}

// REST API for Room Administration
app.get('/api/admin/cli-status', (req, res) => {
  const activeRooms = Array.from(rooms.values());
  const allUsers = getAllUsers();
  const humanCount = activeRooms.reduce((acc, r) => acc + r.players.filter((p) => !p.isBot && p.isConnected).length, 0);
  const botCount = activeRooms.reduce((acc, r) => acc + r.players.filter((p) => p.isBot).length, 0);

  let output = `\n======================================================\n`;
  output += `           🎴 UNO KAWIHE - MONITOR DA VM\n`;
  output += `======================================================\n`;
  output += `🟢 Servidor: ONLINE (Porta 3000)\n`;
  output += `🏠 Salas Abertas: ${activeRooms.length}\n`;
  output += `👥 Jogadores Conectados: ${humanCount} humano(s), ${botCount} robô(s)\n`;
  output += `📋 Usuários Cadastrados: ${allUsers.length}\n`;
  output += `------------------------------------------------------\n`;

  if (activeRooms.length === 0) {
    output += `(Nenhuma sala ativa no momento)\n`;
  } else {
    activeRooms.forEach((r) => {
      const statusStr = r.status === 'playing' ? '🎮 EM JOGO' : '⏳ LOBBY';
      output += `\n[SALA #${r.id}] - ${statusStr} | Turno: ${r.settings.turnDuration}s | ${r.players.length}/${r.settings.maxPlayers} vagas\n`;
      r.players.forEach((p) => {
        const role = p.isHost ? '👑 Anfitrião' : p.isBot ? '🤖 Robô' : '🎮 Jogador';
        const conn = p.isConnected ? '🟢 Online' : '🔴 Desconectado';
        const cards = r.status === 'playing' ? `(${p.hand?.length || 0} cartas)` : '';
        output += `   • ${p.avatar} ${p.name} [${role}] ${cards} - ${conn}\n`;
      });
    });
  }

  output += `\n------------------------------------------------------\n`;
  output += `👤 USUÁRIOS REGISTRADOS NO SISTEMA:\n`;
  allUsers.forEach((u) => {
    // Check if user is currently playing in any active room
    let onlineRoom: string | null = null;
    activeRooms.forEach((r) => {
      const p = r.players.find((pl) => !pl.isBot && pl.isConnected && (pl.name.toLowerCase() === u.displayName.toLowerCase() || pl.name.toLowerCase() === u.username.toLowerCase()));
      if (p) onlineRoom = r.id;
    });

    const statusBadge = onlineRoom ? `🟢 ONLINE (Na Sala #${onlineRoom})` : `⚪ Offline`;
    output += `   ${u.avatar} ${u.displayName} (@${u.username} ${u.tag || ''}) - [${u.role === 'admin' ? '👑 Admin' : '🎮 Jogador'}] -> ${statusBadge}\n`;
  });
  output += `======================================================\n\n`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(output);
});

// Get all users with online & room status
app.get('/api/admin/users', (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const allUsers = getAllUsers();
  const activeRooms = Array.from(rooms.values());

  const userList = allUsers.map((u) => {
    let isOnline = false;
    let currentRoomId: string | null = null;
    let roomStatus: string | null = null;

    activeRooms.forEach((r) => {
      const match = r.players.find(
        (p) => !p.isBot && p.isConnected && (p.name.toLowerCase() === u.displayName.toLowerCase() || p.name.toLowerCase() === u.username.toLowerCase())
      );
      if (match) {
        isOnline = true;
        currentRoomId = r.id;
        roomStatus = r.status;
      }
    });

    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      role: u.role,
      tag: u.tag,
      createdAt: u.createdAt,
      isOnline,
      currentRoomId,
      roomStatus,
    };
  });

  return res.json({ success: true, users: userList });
});

// Send message to a specific room
app.post('/api/admin/rooms/:id/message', (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const room = rooms.get(req.params.id?.toUpperCase());
  if (!room) {
    return res.status(404).json({ success: false, error: 'Sala não encontrada.' });
  }

  const { text, sender = '👑 Admin Edinho' } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, error: 'Mensagem vazia.' });
  }

  const chatMsg: ChatMessage = {
    id: `admin-msg-${Date.now()}`,
    playerId: 'admin',
    playerName: sender,
    avatar: '👑',
    text: text.trim(),
    timestamp: Date.now(),
  };

  broadcastToRoom(room.id, { type: 'chat_message', message: chatMsg });
  broadcastLog(room, `💬 ${sender}: ${text.trim()}`, 'chat', sender);

  return res.json({ success: true, message: `Mensagem transmitida para a Sala #${room.id} com sucesso!` });
});

app.get('/api/admin/rooms', (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const list = Array.from(rooms.values()).map((r) => ({
    id: r.id,
    status: r.status,
    playersCount: r.players.length,
    maxPlayers: r.settings.maxPlayers,
    turnDuration: r.settings.turnDuration,
    roundTurnCount: r.roundTurnCount || 0,
    players: r.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost,
      isBot: p.isBot,
      isConnected: p.isConnected,
      cardsCount: p.hand?.length || 0,
    })),
  }));

  return res.json({ success: true, rooms: list });
});

app.post('/api/admin/rooms/:id/close', (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const room = rooms.get(req.params.id?.toUpperCase());
  if (!room) {
    return res.status(404).json({ success: false, error: 'Sala não encontrada.' });
  }

  const reason = req.body.reason || 'Esta sala foi encerrada pelo Administrador Edinho.';
  broadcastToRoom(room.id, { type: 'player_kicked', reason });
  stopTurnTimer(room);
  rooms.delete(room.id);

  return res.json({ success: true, message: `Sala ${room.id} fechada com sucesso.` });
});

app.post('/api/admin/rooms/:id/kick', (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const room = rooms.get(req.params.id?.toUpperCase());
  if (!room) {
    return res.status(404).json({ success: false, error: 'Sala não encontrada.' });
  }

  const { targetPlayerId, reason = 'Você foi expulso pelo Administrador.' } = req.body;
  const idx = room.players.findIndex((p) => p.id === targetPlayerId);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Jogador não encontrado na sala.' });
  }

  const removed = room.players.splice(idx, 1)[0];
  // Find connection to notify
  clientConnections.forEach((meta, ws) => {
    if (meta.playerId === targetPlayerId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'player_kicked', reason }));
      clientConnections.delete(ws);
    }
  });

  broadcastLog(room, `🚫 ${removed.name} foi expulso da sala pelo Administrador.`, 'system');
  syncRoomState(room);

  return res.json({ success: true, message: `${removed.name} foi expulso com sucesso.` });
});

app.post('/api/admin/broadcast', (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const { message, sender = '👑 Admin Edinho' } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Mensagem não pode estar vazia.' });
  }

  const announcement: ServerMessage = {
    type: 'global_announcement',
    message: message.trim(),
    sender,
    timestamp: Date.now(),
  };

  rooms.forEach((room) => {
    broadcastToRoom(room.id, announcement);
    broadcastLog(room, `📢 [AVISO GLOBAL]: ${message.trim()}`, 'system', sender);
  });

  return res.json({ success: true, message: 'Aviso global transmitido a todas as salas com sucesso.' });
});

// In-memory rooms repository
const rooms = new Map<string, RoomData>();
// Map client WebSocket to playerId and roomId
const clientConnections = new Map<WebSocket, { roomId: string; playerId: string }>();

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

const BOT_NAMES = ['Bot Luna', 'Bot Thor', 'Bot Maya', 'Bot Max', 'Bot Neo', 'Bot Zoe'];
const BOT_AVATARS = ['🤖', '🦊', '🐼', '🐯', '🦁', '🦉'];

function broadcastToRoom(roomId: string, message: ServerMessage) {
  const payload = JSON.stringify(message);
  clientConnections.forEach((meta, ws) => {
    if (meta.roomId === roomId && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

function sendGameStateToPlayer(ws: WebSocket, room: RoomData, playerId: string) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return;

  const publicPlayers: Player[] = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isHost: p.isHost,
    isBot: p.isBot,
    cardsCount: p.hand.length,
    hasCalledUno: p.hasCalledUno,
    isConnected: p.isConnected,
    score: p.score,
    botHand: room.settings.showBotCards && p.isBot ? p.hand : undefined,
  }));

  const activePlayer = room.players[room.currentTurnIndex];

  const clientState: GameState = {
    roomId: room.id,
    status: room.status,
    players: publicPlayers,
    myHand: player.hand,
    discardPileTop: room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null,
    currentColor: room.currentColor,
    currentTurnPlayerId: activePlayer ? activePlayer.id : '',
    turnDirection: room.turnDirection,
    turnTimeLeft: room.turnTimeLeft,
    turnDuration: room.settings.turnDuration,
    drawCountPenalty: 0,
    winnerId: room.winnerId,
    unoVulnerablePlayerId: room.unoVulnerablePlayerId,
    deckCardsCount: room.deck.length,
    settings: room.settings,
    roundDurationSeconds: room.lastRoundDurationSeconds,
    roundTurnCount: room.lastRoundTurnCount,
    roundPointsWon: room.lastRoundPointsWon,
    isFastestWin: room.lastRoundIsFastest,
    tableScores: room.tableScores,
    tableFastestSeconds: room.fastestRoundSeconds,
  };

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'game_state', state: clientState }));
  }
}

function syncRoomState(room: RoomData) {
  clientConnections.forEach((meta, ws) => {
    if (meta.roomId === room.id && ws.readyState === WebSocket.OPEN) {
      sendGameStateToPlayer(ws, room, meta.playerId);
    }
  });
}

function broadcastLog(room: RoomData, text: string, type: GameLog['type'] = 'action', playerName?: string) {
  const log: GameLog = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    text,
    type,
    playerName,
  };
  broadcastToRoom(room.id, { type: 'game_log', log });
}

function broadcastSound(roomId: string, sound: 'play' | 'draw' | 'uno' | 'reverse' | 'skip' | 'wild' | 'win' | 'penalty') {
  broadcastToRoom(roomId, { type: 'sound_event', sound });
}

function broadcastBotChat(room: RoomData, bot: InternalPlayer, text: string) {
  const chatMsg: ChatMessage = {
    id: Math.random().toString(36).substring(2, 9),
    playerId: bot.id,
    playerName: bot.name,
    avatar: bot.avatar,
    text,
    timestamp: Date.now(),
  };
  broadcastToRoom(room.id, { type: 'chat_message', message: chatMsg });
}

function addBotToRoom(room: RoomData): InternalPlayer | null {
  if (room.players.length >= room.settings.maxPlayers) return null;
  const botIdx = room.players.filter((p) => p.isBot).length;
  const botName = BOT_NAMES[botIdx % BOT_NAMES.length];
  const botAvatar = BOT_AVATARS[botIdx % BOT_AVATARS.length];

  const botPlayer: InternalPlayer = {
    id: `bot-${Math.random().toString(36).substring(2, 9)}`,
    name: botName,
    avatar: botAvatar,
    isHost: false,
    isBot: true,
    cardsCount: 0,
    hasCalledUno: false,
    isConnected: true,
    score: 0,
    hand: [],
    hasDrawnThisTurn: false,
  };

  room.players.push(botPlayer);
  return botPlayer;
}

function startGame(room: RoomData) {
  room.deck = createDeck();
  room.status = 'playing';
  room.winnerId = null;
  room.unoVulnerablePlayerId = null;
  room.turnDirection = 1;
  room.currentTurnIndex = Math.floor(Math.random() * room.players.length);

  // Stats tracking for current round
  room.roundStartTime = Date.now();
  room.roundTurnCount = 0;
  if (!room.tableScores) room.tableScores = {};
  room.players.forEach((p) => {
    if (!room.tableScores![p.id]) {
      room.tableScores![p.id] = {
        playerId: p.id,
        name: p.name,
        avatar: p.avatar,
        wins: 0,
        points: p.score || 0,
        roundsPlayed: 0,
      };
    }
    room.tableScores![p.id].name = p.name;
    room.tableScores![p.id].avatar = p.avatar;
    room.tableScores![p.id].roundsPlayed += 1;
  });

  // Deal 7 cards each
  room.players.forEach((p) => {
    p.hand = drawCardsFromDeck(room, 7);
    p.hasCalledUno = false;
    p.hasDrawnThisTurn = false;
  });

  // Top initial card: must not be Wild +4
  let initialCard = drawCardsFromDeck(room, 1)[0];
  while (initialCard.value === 'wild4') {
    room.deck.unshift(initialCard);
    initialCard = drawCardsFromDeck(room, 1)[0];
  }
  room.discardPile = [initialCard];
  room.currentColor = initialCard.color === 'wild' ? 'red' : initialCard.color;

  broadcastLog(
    room,
    `🎮 O jogo começou! Carta inicial: ${room.currentColor.toUpperCase()} ${initialCard.value.toUpperCase()}.`,
    'action'
  );
  broadcastSound(room.id, 'play');
  syncRoomState(room);
  startTurnTimer(room);
}

function stopTurnTimer(room: RoomData) {
  if (room.turnTimerInterval) {
    clearInterval(room.turnTimerInterval);
    room.turnTimerInterval = null;
  }
  if (room.botTimerTimeout) {
    clearTimeout(room.botTimerTimeout);
    room.botTimerTimeout = null;
  }
}

function startTurnTimer(room: RoomData) {
  stopTurnTimer(room);
  if (room.status !== 'playing') return;

  room.turnTimeLeft = room.settings.turnDuration > 0 ? room.settings.turnDuration : 999;
  const currentPlayer = room.players[room.currentTurnIndex];
  if (!currentPlayer) return;

  // If currentPlayer is a Bot, schedule bot action
  if (currentPlayer.isBot) {
    scheduleBotTurn(room, currentPlayer);
  }

  // Only run countdown timer if turnDuration is > 0
  if (room.settings.turnDuration > 0) {
    room.turnTimerInterval = setInterval(() => {
      room.turnTimeLeft -= 1;
      if (room.turnTimeLeft <= 0) {
        handleTurnTimeout(room);
      } else {
        // Sync clock every 3 seconds to keep UI tidy
        if (room.turnTimeLeft % 3 === 0) {
          syncRoomState(room);
        }
      }
    }, 1000);
  }
}

function handleTurnTimeout(room: RoomData) {
  const player = room.players[room.currentTurnIndex];
  if (!player) return;

  broadcastLog(room, `Tempo esgotado para ${player.name}! Comprou 1 carta automaticamente.`, 'action', player.name);
  const drawn = drawCardsFromDeck(room, 1);
  player.hand.push(...drawn);
  player.hasDrawnThisTurn = false;
  broadcastSound(room.id, 'draw');

  // Advance turn
  advanceTurn(room, 1);
}

function advanceTurn(room: RoomData, steps = 1) {
  room.players[room.currentTurnIndex].hasDrawnThisTurn = false;
  room.roundTurnCount = (room.roundTurnCount || 0) + 1;
  room.currentTurnIndex = getNextPlayerIndex(room.currentTurnIndex, room.turnDirection, room.players.length, steps);
  syncRoomState(room);
  startTurnTimer(room);
}

function checkWinCondition(room: RoomData, player: InternalPlayer): boolean {
  if (player.hand.length === 0) {
    room.status = 'ended';
    room.winnerId = player.id;
    stopTurnTimer(room);

    // Calculate score
    let points = 0;
    room.players.forEach((p) => {
      if (p.id !== player.id) {
        points += p.hand.reduce((sum, c) => sum + c.score, 0);
      }
    });
    player.score += points;

    // Calculate duration & turns
    const durationSeconds = Math.max(1, Math.round((Date.now() - (room.roundStartTime || Date.now())) / 1000));
    const turnCount = room.roundTurnCount || 1;
    const isFastest = !room.fastestRoundSeconds || durationSeconds < room.fastestRoundSeconds;
    if (isFastest) {
      room.fastestRoundSeconds = durationSeconds;
    }
    if (!room.fewestTurnsRound || turnCount < room.fewestTurnsRound) {
      room.fewestTurnsRound = turnCount;
    }

    room.lastRoundDurationSeconds = durationSeconds;
    room.lastRoundTurnCount = turnCount;
    room.lastRoundPointsWon = points;
    room.lastRoundIsFastest = isFastest;

    if (!room.tableScores) room.tableScores = {};
    if (!room.tableScores[player.id]) {
      room.tableScores[player.id] = {
        playerId: player.id,
        name: player.name,
        avatar: player.avatar,
        wins: 0,
        points: 0,
        roundsPlayed: 1,
      };
    }
    room.tableScores[player.id].wins += 1;
    room.tableScores[player.id].points += points;

    let winMsg = `🏆 ${player.name} VENCEU A PARTIDA! (+${points} pontos)`;
    if (isFastest) {
      winMsg += ` ⚡ NOVO RECORDE DA MESA: ${durationSeconds}s!`;
    }
    broadcastLog(room, winMsg, 'uno', player.name);
    broadcastSound(room.id, 'win');
    syncRoomState(room);
    return true;
  }
  return false;
}

function botSendEmote(room: RoomData, botId: string, emoteId: string, delay = 500) {
  setTimeout(() => {
    if (room.status !== 'playing') return;
    const emote = EMOTES_MAP[emoteId];
    if (!emote) return;
    broadcastToRoom(room.id, {
      type: 'player_emote',
      emote: {
        id: `emote-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        playerId: botId,
        emoteId: emote.id,
        emoji: emote.emoji,
        phrase: emote.phrase,
        soundType: emote.soundType,
        timestamp: Date.now(),
      },
    });
  }, delay);
}

function scheduleBotTurn(room: RoomData, bot: InternalPlayer) {
  // Use configured bot speed (Calm/Infantil 3.0s, Normal 1.8s, Fast 0.8s)
  const baseSpeed = room.settings.botSpeedMs || 1800;
  const delay = Math.max(300, baseSpeed * (0.85 + Math.random() * 0.3));

  room.botTimerTimeout = setTimeout(() => {
    if (room.status !== 'playing') return;
    if (room.players[room.currentTurnIndex]?.id !== bot.id) return;

    // Check if any human is vulnerable to UNO catch (only if autoUnoProtection is false)!
    if (!room.settings.autoUnoProtection && room.unoVulnerablePlayerId && room.unoVulnerablePlayerId !== bot.id) {
      const vulnerable = room.players.find((p) => p.id === room.unoVulnerablePlayerId);
      if (vulnerable && Math.random() < 0.6) {
        // 60% chance bot catches player
        const penalized = drawCardsFromDeck(room, 2);
        vulnerable.hand.push(...penalized);
        room.unoVulnerablePlayerId = null;
        broadcastLog(room, `🚨 ${bot.name} pegou ${vulnerable.name} sem gritar UNO! (+2 cartas)`, 'penalty', bot.name);
        broadcastSound(room.id, 'penalty');
        syncRoomState(room);
      }
    }

    const topCard = room.discardPile[room.discardPile.length - 1];
    const playableCards = bot.hand.filter((c) => isCardPlayable(c, topCard, room.currentColor));

    if (playableCards.length > 0) {
      // Pick best playable card: prefer special cards (+2, skip, reverse) or matching color high value
      let chosenCard = playableCards.find((c) => c.value === 'draw2' || c.value === 'skip' || c.value === 'reverse');
      if (!chosenCard) {
        chosenCard = playableCards.find((c) => c.color === room.currentColor) || playableCards[0];
      }

      // Pick color if wild
      let chosenColor: CardColor | undefined;
      if (chosenCard.color === 'wild') {
        const colorCounts: Record<CardColor, number> = { red: 0, blue: 0, green: 0, yellow: 0, wild: 0 };
        bot.hand.forEach((c) => {
          if (c.color !== 'wild') colorCounts[c.color]++;
        });
        const highestColor = (['red', 'blue', 'green', 'yellow'] as CardColor[]).reduce((a, b) =>
          colorCounts[a] >= colorCounts[b] ? a : b
        );
        chosenColor = highestColor;
      }

      // Bot calls UNO when down to 1
      if (bot.hand.length === 2) {
        bot.hasCalledUno = true;
        broadcastLog(room, `🔊 ${bot.name}: "UNO!"`, 'uno', bot.name);
        broadcastSound(room.id, 'uno');
        if (Math.random() < 0.65) {
          botSendEmote(room, bot.id, 'ahaa', 300);
        }
      }

      executePlayCard(room, bot, chosenCard.id, chosenColor);
    } else {
      // Draw card
      const drawn = drawCardsFromDeck(room, 1);
      bot.hand.push(...drawn);
      broadcastLog(room, `${bot.name} comprou 1 carta.`, 'action', bot.name);
      broadcastSound(room.id, 'draw');

      if (Math.random() < 0.3) {
        botSendEmote(room, bot.id, 'cry', 500);
      }

      // Check if newly drawn card is playable
      const newCard = drawn[0];
      if (newCard && isCardPlayable(newCard, topCard, room.currentColor)) {
        setTimeout(() => {
          if (room.status !== 'playing') return;
          let chosenColor: CardColor | undefined;
          if (newCard.color === 'wild') chosenColor = 'blue';
          executePlayCard(room, bot, newCard.id, chosenColor);
        }, 800);
      } else {
        advanceTurn(room, 1);
      }
    }
  }, delay);
}

function executePlayCard(
  room: RoomData,
  player: InternalPlayer,
  cardId: string,
  chosenColor?: CardColor,
  ws?: WebSocket
) {
  const cardIndex = player.hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: 'Carta não encontrada na sua mão.' }));
    }
    return;
  }

  const card = player.hand[cardIndex];
  const topCard = room.discardPile[room.discardPile.length - 1];

  if (!isCardPlayable(card, topCard, room.currentColor)) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: `Esta carta não pode ser jogada agora! A cor atual é ${room.currentColor.toUpperCase()} ou valor ${topCard.value.toUpperCase()}.`,
        })
      );
    }
    return;
  }

  // Remove card from player hand
  player.hand.splice(cardIndex, 1);
  room.discardPile.push(card);

  // If player has 1 card left and didn't call UNO
  if (player.hand.length === 1 && !player.hasCalledUno) {
    if (room.settings.autoUnoProtection) {
      player.hasCalledUno = true;
      broadcastLog(room, `🛡️ ${player.name} ativou o UNO automaticamente (Proteção Infantil)!`, 'uno', player.name);
      broadcastSound(room.id, 'uno');
    } else {
      room.unoVulnerablePlayerId = player.id;
    }
  } else if (player.hand.length !== 1) {
    player.hasCalledUno = false;
  }

  // Handle card colors
  if (card.color === 'wild') {
    room.currentColor = chosenColor || 'red';
  } else {
    room.currentColor = card.color;
  }

  // Card effects
  let steps = 1;
  let logText = `${player.name} jogou ${card.color.toUpperCase()} ${card.value.toUpperCase()}.`;
  let soundToPlay: 'play' | 'reverse' | 'skip' | 'wild' = 'play';

  if (card.value === 'reverse') {
    if (room.players.length === 2) {
      steps = 2; // acts as skip in 2 players
      logText = `${player.name} jogou Reverso! Joga novamente.`;
    } else {
      room.turnDirection = (room.turnDirection * -1) as -1 | 1;
      logText = `${player.name} inverteu o sentido do jogo!`;
    }
    soundToPlay = 'reverse';
  } else if (card.value === 'skip') {
    steps = 2;
    const skippedIdx = getNextPlayerIndex(room.currentTurnIndex, room.turnDirection, room.players.length, 1);
    const skippedPlayer = room.players[skippedIdx];
    logText = `${player.name} pulou a vez de ${skippedPlayer.name}!`;
    soundToPlay = 'skip';
  } else if (card.value === 'draw2') {
    steps = 2;
    const targetIdx = getNextPlayerIndex(room.currentTurnIndex, room.turnDirection, room.players.length, 1);
    const targetPlayer = room.players[targetIdx];
    const penaltyCards = drawCardsFromDeck(room, 2);
    targetPlayer.hand.push(...penaltyCards);
    logText = `${player.name} jogou +2! ${targetPlayer.name} comprou 2 cartas e perdeu a vez.`;
    broadcastSound(room.id, 'draw');

    // Bot emotes
    if (player.isBot && Math.random() < 0.6) {
      botSendEmote(room, player.id, Math.random() < 0.5 ? 'joga_pouco' : 'laugh', 400);
    }
    if (targetPlayer.isBot && Math.random() < 0.65) {
      botSendEmote(room, targetPlayer.id, Math.random() < 0.5 ? 'cry' : 'e_agora', 700);
    }
  } else if (card.value === 'wild4') {
    steps = 2;
    const targetIdx = getNextPlayerIndex(room.currentTurnIndex, room.turnDirection, room.players.length, 1);
    const targetPlayer = room.players[targetIdx];
    const penaltyCards = drawCardsFromDeck(room, 4);
    targetPlayer.hand.push(...penaltyCards);
    logText = `${player.name} jogou CORINGA +4! Nova cor: ${room.currentColor.toUpperCase()}. ${targetPlayer.name} comprou 4 cartas e perdeu a vez!`;
    soundToPlay = 'wild';
    broadcastSound(room.id, 'draw');

    // Bot emotes
    if (player.isBot && Math.random() < 0.75) {
      botSendEmote(room, player.id, Math.random() < 0.5 ? 'joga_pouco' : 'laugh', 400);
    }
    if (targetPlayer.isBot && Math.random() < 0.75) {
      botSendEmote(room, targetPlayer.id, Math.random() < 0.5 ? 'cry' : 'e_agora', 700);
    }
  } else if (card.value === 'wild') {
    logText = `${player.name} jogou CORINGA! Mudou a cor para ${room.currentColor.toUpperCase()}.`;
    soundToPlay = 'wild';
  }

  broadcastLog(room, logText, 'action', player.name);
  broadcastSound(room.id, soundToPlay);

  if (checkWinCondition(room, player)) {
    return;
  }

  advanceTurn(room, steps);
}

// WebSocket setup
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (data: string) => {
    try {
      const msg: ClientMessage = JSON.parse(data.toString());

      if (msg.type === 'start_solo') {
        const roomId = generateRoomId();
        const hostPlayer: InternalPlayer = {
          id: `player-${Math.random().toString(36).substring(2, 9)}`,
          name: msg.playerName.trim() || 'Jogador',
          avatar: msg.avatar || '🦸‍♂️',
          isHost: true,
          isBot: false,
          cardsCount: 0,
          hasCalledUno: false,
          isConnected: true,
          score: 0,
          hand: [],
          hasDrawnThisTurn: false,
        };

        const count = Math.max(1, Math.min(3, msg.botCount || 1));
        const duration = msg.settings?.turnDuration !== undefined ? msg.settings.turnDuration : 25;
        const room: RoomData = {
          id: roomId,
          settings: {
            maxPlayers: count + 1,
            turnDuration: duration,
            challengeUnoRule: msg.settings?.challengeUnoRule ?? true,
            showBotCards: msg.settings?.showBotCards ?? false,
            botSpeedMs: msg.settings?.botSpeedMs ?? 1800,
            autoUnoProtection: msg.settings?.autoUnoProtection ?? false,
            highlightHints: msg.settings?.highlightHints ?? true,
          },
          status: 'waiting',
          players: [hostPlayer],
          deck: [],
          discardPile: [],
          currentColor: 'red',
          currentTurnIndex: 0,
          turnDirection: 1,
          turnTimeLeft: duration > 0 ? duration : 999,
          winnerId: null,
          unoVulnerablePlayerId: null,
          turnTimerInterval: null,
          botTimerTimeout: null,
        };

        // Add the selected number of bots
        for (let i = 0; i < count; i++) {
          addBotToRoom(room);
        }

        rooms.set(roomId, room);
        clientConnections.set(ws, { roomId, playerId: hostPlayer.id });

        ws.send(JSON.stringify({ type: 'room_joined', roomId, playerId: hostPlayer.id }));
        startGame(room);
        return;
      }

      if (msg.type === 'leave_room') {
        clientConnections.delete(ws);
        const room = rooms.get(msg.roomId.toUpperCase());
        if (room) {
          const idx = room.players.findIndex((p) => p.id === msg.playerId);
          if (idx !== -1) {
            const leaving = room.players[idx];
            if (room.status === 'waiting' || room.status === 'ended') {
              room.players.splice(idx, 1);
            } else {
              leaving.isConnected = false;
            }

            broadcastLog(room, `${leaving.name} saiu da sala.`, 'system');

            if (leaving.isHost) {
              leaving.isHost = false;
              const nextHost = room.players.find((p) => !p.isBot && p.isConnected && p.id !== leaving.id);
              if (nextHost) {
                nextHost.isHost = true;
                broadcastLog(room, `👑 ${nextHost.name} agora é o novo Anfitrião da sala!`, 'system');
              }
            }

            const hasOnlineHumans = room.players.some((p) => !p.isBot && p.isConnected);
            if (!hasOnlineHumans && (room.status === 'waiting' || room.status === 'ended')) {
              stopTurnTimer(room);
              rooms.delete(room.id);
            } else if (room.status === 'playing' && room.players[room.currentTurnIndex]?.id === leaving.id) {
              advanceTurn(room, 1);
            } else {
              syncRoomState(room);
            }
          }
        }
        return;
      }

      if (msg.type === 'create_room') {
        const roomId = generateRoomId();
        const hostPlayer: InternalPlayer = {
          id: `player-${Math.random().toString(36).substring(2, 9)}`,
          name: msg.playerName.trim() || 'Jogador 1',
          avatar: msg.avatar || '🦸‍♂️',
          isHost: true,
          isBot: false,
          cardsCount: 0,
          hasCalledUno: false,
          isConnected: true,
          score: 0,
          hand: [],
          hasDrawnThisTurn: false,
        };

        const duration = msg.settings?.turnDuration !== undefined ? msg.settings.turnDuration : 90;
        const room: RoomData = {
          id: roomId,
          settings: {
            maxPlayers: msg.settings?.maxPlayers || 4,
            turnDuration: duration,
            challengeUnoRule: msg.settings?.challengeUnoRule ?? true,
            showBotCards: msg.settings?.showBotCards ?? false,
            botSpeedMs: msg.settings?.botSpeedMs ?? 1800,
            autoUnoProtection: msg.settings?.autoUnoProtection ?? false,
            highlightHints: msg.settings?.highlightHints ?? true,
          },
          status: 'waiting',
          players: [hostPlayer],
          deck: [],
          discardPile: [],
          currentColor: 'red',
          currentTurnIndex: 0,
          turnDirection: 1,
          turnTimeLeft: duration > 0 ? duration : 999,
          winnerId: null,
          unoVulnerablePlayerId: null,
          turnTimerInterval: null,
          botTimerTimeout: null,
        };

        rooms.set(roomId, room);
        clientConnections.set(ws, { roomId, playerId: hostPlayer.id });

        ws.send(JSON.stringify({ type: 'room_joined', roomId, playerId: hostPlayer.id }));
        broadcastLog(room, `Sala ${roomId} criada por ${hostPlayer.name}.`, 'system');
        syncRoomState(room);
        return;
      }

      if (msg.type === 'sync_session') {
        const cleanRoomId = (msg.roomId || '').replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
        const room = rooms.get(cleanRoomId);
        if (room) {
          const player = room.players.find((p) => p.id === msg.playerId);
          if (player) {
            player.isConnected = true;
            clientConnections.set(ws, { roomId: room.id, playerId: player.id });
            ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: player.id }));
            syncRoomState(room);
            return;
          } else if (room.status === 'waiting') {
            // Player had an ID from another session/room, but is trying to access this existing waiting room.
            // Automatically join them!
            // If room has bot and is full, replace a bot
            if (room.players.length >= room.settings.maxPlayers) {
              const botIdx = room.players.findIndex((p) => p.isBot);
              if (botIdx !== -1) {
                room.players.splice(botIdx, 1);
              }
            }

            if (room.players.length < room.settings.maxPlayers) {
              const newPlayer: InternalPlayer = {
                id: `player-${Math.random().toString(36).substring(2, 9)}`,
                name: 'Jogador',
                avatar: '🎲',
                isHost: room.players.filter((p) => !p.isBot && p.isConnected).length === 0,
                isBot: false,
                cardsCount: 0,
                hasCalledUno: false,
                isConnected: true,
                score: 0,
                hand: [],
                hasDrawnThisTurn: false,
              };

              room.players.push(newPlayer);
              clientConnections.set(ws, { roomId: room.id, playerId: newPlayer.id });
              ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: newPlayer.id }));
              broadcastLog(room, `${newPlayer.name} entrou na sala!`, 'system');
              syncRoomState(room);
              return;
            }
          }
        }
        return;
      }

      if (msg.type === 'join_room') {
        const cleanRoomId = (msg.roomId || '').replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
        const room = rooms.get(cleanRoomId);
        if (!room) {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Sala #${cleanRoomId} não encontrada. Verifique se o código está correto ou se a sala já expirou.`
          }));
          return;
        }

        // Check if existing player in THIS room is reconnecting
        if (msg.existingPlayerId) {
          const existing = room.players.find((p) => p.id === msg.existingPlayerId);
          if (existing) {
            existing.isConnected = true;
            clientConnections.set(ws, { roomId: room.id, playerId: existing.id });
            ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: existing.id }));
            syncRoomState(room);
            return;
          }
        }

        // Check if player by same name/avatar is reconnecting to a game in progress
        if (room.status === 'playing') {
          const disc = room.players.find((p) => !p.isBot && !p.isConnected && p.name.toLowerCase() === msg.playerName.trim().toLowerCase());
          if (disc) {
            disc.isConnected = true;
            clientConnections.set(ws, { roomId: room.id, playerId: disc.id });
            ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: disc.id }));
            broadcastLog(room, `🔄 ${disc.name} reconectou à partida!`, 'system');
            syncRoomState(room);
            return;
          }

          ws.send(JSON.stringify({ type: 'error', message: 'A partida já está em andamento nesta sala.' }));
          return;
        }

        // If room is full with bots, replace a bot with the real human player!
        if (room.players.length >= room.settings.maxPlayers) {
          const botIdx = room.players.findIndex((p) => p.isBot);
          if (botIdx !== -1) {
            const removedBot = room.players.splice(botIdx, 1)[0];
            broadcastLog(room, `🤖 ${removedBot.name} deu espaço para ${msg.playerName || 'Jogador'} entrar na mesa.`, 'system');
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'A sala já está cheia (máximo de 4 jogadores atingido).' }));
            return;
          }
        }

        const hasOnlineHost = room.players.some((p) => p.isHost && !p.isBot && p.isConnected);

        const newPlayer: InternalPlayer = {
          id: `player-${Math.random().toString(36).substring(2, 9)}`,
          name: msg.playerName.trim() || `Jogador ${room.players.length + 1}`,
          avatar: msg.avatar || '🎲',
          isHost: !hasOnlineHost && room.players.filter((p) => !p.isBot).length === 0,
          isBot: false,
          cardsCount: 0,
          hasCalledUno: false,
          isConnected: true,
          score: 0,
          hand: [],
          hasDrawnThisTurn: false,
        };

        room.players.push(newPlayer);
        clientConnections.set(ws, { roomId: room.id, playerId: newPlayer.id });

        ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: newPlayer.id }));
        broadcastLog(room, `${newPlayer.name} entrou na sala!`, 'system');
        syncRoomState(room);
        return;
      }

      // Global Admin WebSocket Messages
      if (msg.type === 'admin_get_rooms') {
        const isAdm = msg.adminSecret === '774007' || msg.adminSecret === process.env.ADMIN_PIN || msg.adminSecret === '1234';
        if (isAdm) {
          const list = Array.from(rooms.values()).map((r) => ({
            id: r.id,
            status: r.status,
            playersCount: r.players.length,
            maxPlayers: r.settings.maxPlayers,
            turnDuration: r.settings.turnDuration,
            roundTurnCount: r.roundTurnCount || 0,
            players: r.players.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              isHost: p.isHost,
              isBot: p.isBot,
              isConnected: p.isConnected,
              cardsCount: p.hand?.length || 0,
            })),
          }));
          ws.send(JSON.stringify({ type: 'admin_rooms_list', rooms: list }));
        }
        return;
      }

      if (msg.type === 'admin_close_room') {
        const isAdm = msg.adminSecret === '774007' || msg.adminSecret === process.env.ADMIN_PIN || msg.adminSecret === '1234';
        if (isAdm) {
          const targetRoom = rooms.get(msg.roomId?.toUpperCase());
          if (targetRoom) {
            broadcastToRoom(targetRoom.id, {
              type: 'player_kicked',
              reason: msg.reason || 'Esta sala foi encerrada pelo Administrador Edinho.',
            });
            stopTurnTimer(targetRoom);
            rooms.delete(targetRoom.id);
          }
        }
        return;
      }

      if (msg.type === 'admin_force_end_game') {
        const isAdm = msg.adminSecret === '774007' || msg.adminSecret === process.env.ADMIN_PIN || msg.adminSecret === '1234';
        if (isAdm) {
          const targetRoom = rooms.get(msg.roomId?.toUpperCase());
          if (targetRoom) {
            stopTurnTimer(targetRoom);
            targetRoom.status = 'waiting';
            targetRoom.winnerId = null;
            targetRoom.unoVulnerablePlayerId = null;
            targetRoom.discardPile = [];
            targetRoom.deck = [];
            targetRoom.players.forEach((p) => {
              p.hand = [];
              p.hasCalledUno = false;
              p.hasDrawnThisTurn = false;
            });
            broadcastLog(targetRoom, '⚠️ Partida encerrada pelo Administrador. A sala retornou ao Lobby.', 'system');
            syncRoomState(targetRoom);
          }
        }
        return;
      }

      if (msg.type === 'admin_global_broadcast') {
        const isAdm = msg.adminSecret === '774007' || msg.adminSecret === process.env.ADMIN_PIN || msg.adminSecret === '1234';
        if (isAdm && msg.message) {
          const announcement: ServerMessage = {
            type: 'global_announcement',
            message: msg.message.trim(),
            sender: msg.sender || '👑 Admin Edinho',
            timestamp: Date.now(),
          };
          rooms.forEach((r) => {
            broadcastToRoom(r.id, announcement);
            broadcastLog(r, `📢 [AVISO GLOBAL]: ${msg.message}`, 'system', msg.sender || 'Admin Edinho');
          });
        }
        return;
      }

      let meta = clientConnections.get(ws);
      if (!meta && 'roomId' in msg && 'playerId' in msg && msg.roomId && msg.playerId) {
        meta = { roomId: msg.roomId, playerId: msg.playerId };
        clientConnections.set(ws, meta);
      }
      if (!meta) return;

      const room = rooms.get(meta.roomId.toUpperCase());
      if (!room) return;
      const player = room.players.find((p) => p.id === meta.playerId);
      if (!player) return;

      if (msg.type === 'add_bot') {
        if (!player.isHost) return;
        if (room.players.length >= room.settings.maxPlayers) return;

        const newBot = addBotToRoom(room);
        if (newBot) {
          broadcastLog(room, `${newBot.name} foi adicionado à mesa.`, 'system');
          syncRoomState(room);
        }
        return;
      }

      if (msg.type === 'fill_bots') {
        if (!player.isHost) return;
        let addedCount = 0;
        while (room.players.length < room.settings.maxPlayers) {
          const newBot = addBotToRoom(room);
          if (newBot) addedCount++;
        }
        if (addedCount > 0) {
          broadcastLog(room, `${addedCount} robôs entraram na sala para completar a mesa!`, 'system');
          syncRoomState(room);
        }
        return;
      }

      if (msg.type === 'remove_bot') {
        if (!player.isHost) return;
        const idx = room.players.findIndex((p) => p.id === msg.botId && p.isBot);
        if (idx !== -1) {
          const removed = room.players.splice(idx, 1)[0];
          broadcastLog(room, `${removed.name} foi removido.`, 'system');
          syncRoomState(room);
        }
        return;
      }

      if (msg.type === 'kick_player') {
        if (!player.isHost) return;
        if (msg.targetPlayerId === player.id) return; // Cannot kick self

        const idx = room.players.findIndex((p) => p.id === msg.targetPlayerId);
        if (idx !== -1) {
          const target = room.players.splice(idx, 1)[0];
          // Notify target player connection
          clientConnections.forEach((meta, wsClient) => {
            if (meta.playerId === target.id && wsClient.readyState === WebSocket.OPEN) {
              wsClient.send(
                JSON.stringify({
                  type: 'player_kicked',
                  reason: msg.reason || `Você foi expulso da sala por ${player.name}.`,
                })
              );
              clientConnections.delete(wsClient);
            }
          });

          broadcastLog(room, `🚫 ${target.name} foi expulso da sala por ${player.name}.`, 'system');
          syncRoomState(room);
        }
        return;
      }

      if (msg.type === 'transfer_host') {
        if (!player.isHost) return;
        const target = room.players.find((p) => p.id === msg.targetPlayerId && !p.isBot && p.isConnected);
        if (target && target.id !== player.id) {
          player.isHost = false;
          target.isHost = true;
          broadcastLog(room, `👑 ${target.name} foi promovido a novo Anfitrião da sala!`, 'system');
          syncRoomState(room);
        }
        return;
      }

      if (msg.type === 'update_settings') {
        if (!player.isHost) return;
        room.settings = {
          ...room.settings,
          ...msg.settings,
        };
        broadcastLog(room, `⚙️ As configurações da mesa foram atualizadas!`, 'system');
        syncRoomState(room);
        return;
      }

      if (msg.type === 'start_game' || msg.type === 'restart_game') {
        if (!player.isHost && msg.type === 'start_game') return;
        // Clean disconnected players before starting
        room.players = room.players.filter((p) => p.isBot || p.isConnected);
        if (room.players.length < 2) {
          addBotToRoom(room);
        }

        startGame(room);
        return;
      }

      if (msg.type === 'return_to_lobby' || msg.type === 'reset_room') {
        stopTurnTimer(room);
        room.status = 'waiting';
        room.winnerId = null;
        room.unoVulnerablePlayerId = null;
        room.discardPile = [];
        room.deck = [];

        // Clean out disconnected human players
        room.players = room.players.filter((p) => p.isBot || p.isConnected);

        // Ensure an active host exists
        const hasHost = room.players.some((p) => p.isHost && !p.isBot && p.isConnected);
        if (!hasHost) {
          const firstHuman = room.players.find((p) => !p.isBot && p.isConnected);
          if (firstHuman) {
            firstHuman.isHost = true;
          }
        }

        // Reset player cards
        room.players.forEach((p) => {
          p.hand = [];
          p.hasCalledUno = false;
          p.hasDrawnThisTurn = false;
        });

        broadcastLog(room, `🏠 A sala voltou para o Lobby de espera. Pronto para configurar ou iniciar nova partida!`, 'system');
        syncRoomState(room);
        return;
      }

      if (msg.type === 'play_card') {
        if (room.status !== 'playing') return;
        if (room.players[room.currentTurnIndex].id !== player.id) {
          ws.send(JSON.stringify({ type: 'error', message: 'Aguarde a sua vez de jogar!' }));
          return;
        }

        executePlayCard(room, player, msg.cardId, msg.chosenColor, ws);
        return;
      }

      if (msg.type === 'draw_card') {
        if (room.status !== 'playing') return;
        if (room.players[room.currentTurnIndex].id !== player.id) return;
        if (player.hasDrawnThisTurn) return;

        const drawn = drawCardsFromDeck(room, 1);
        player.hand.push(...drawn);
        player.hasDrawnThisTurn = true;

        broadcastLog(room, `${player.name} comprou 1 carta.`, 'action', player.name);
        broadcastSound(room.id, 'draw');
        syncRoomState(room);
        return;
      }

      if (msg.type === 'pass_turn') {
        if (room.status !== 'playing') return;
        if (room.players[room.currentTurnIndex].id !== player.id) return;
        if (!player.hasDrawnThisTurn) {
          ws.send(JSON.stringify({ type: 'error', message: 'Você precisa comprar uma carta antes de passar a vez!' }));
          return;
        }

        broadcastLog(room, `${player.name} passou a vez.`, 'action', player.name);
        advanceTurn(room, 1);
        return;
      }

      if (msg.type === 'call_uno') {
        if (room.status !== 'playing') return;
        if (player.hand.length <= 2) {
          player.hasCalledUno = true;
          if (room.unoVulnerablePlayerId === player.id) {
            room.unoVulnerablePlayerId = null;
          }
          broadcastLog(room, `🔊 ${player.name} gritou: "UNO!"`, 'uno', player.name);
          broadcastSound(room.id, 'uno');
          syncRoomState(room);
        }
        return;
      }

      if (msg.type === 'catch_uno') {
        if (room.status !== 'playing') return;
        if (room.unoVulnerablePlayerId === msg.targetPlayerId) {
          const target = room.players.find((p) => p.id === msg.targetPlayerId);
          if (target && target.hand.length === 1 && !target.hasCalledUno) {
            const penalties = drawCardsFromDeck(room, 2);
            target.hand.push(...penalties);
            room.unoVulnerablePlayerId = null;
            broadcastLog(room, `🚨 ${player.name} pegou ${target.name} sem falar UNO! ${target.name} comprou 2 cartas de penalidade!`, 'penalty', player.name);
            broadcastSound(room.id, 'penalty');
            syncRoomState(room);
          }
        }
        return;
      }

      if (msg.type === 'send_chat') {
        const text = msg.text.trim();
        if (!text) return;

        const chatMsg: ChatMessage = {
          id: Math.random().toString(36).substring(2, 9),
          playerId: player.id,
          playerName: player.name,
          avatar: player.avatar,
          text,
          timestamp: Date.now(),
        };

        broadcastToRoom(room.id, { type: 'chat_message', message: chatMsg });
        return;
      }

      if (msg.type === 'send_emote') {
        const emote = EMOTES_MAP[msg.emoteId];
        if (!emote) return;

        broadcastToRoom(room.id, {
          type: 'player_emote',
          emote: {
            id: `emote-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            playerId: player.id,
            emoteId: emote.id,
            emoji: emote.emoji,
            phrase: emote.phrase,
            soundType: emote.soundType,
            timestamp: Date.now(),
          },
        });
        return;
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    const meta = clientConnections.get(ws);
    if (!meta) return;

    clientConnections.delete(ws);
    const room = rooms.get(meta.roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === meta.playerId);
    if (player) {
      player.isConnected = false;
      broadcastLog(room, `${player.name} desconectou.`, 'system');

      if (player.isHost) {
        player.isHost = false;
        const nextHost = room.players.find((p) => !p.isBot && p.isConnected && p.id !== player.id);
        if (nextHost) {
          nextHost.isHost = true;
          broadcastLog(room, `👑 ${nextHost.name} agora é o novo Anfitrião da sala!`, 'system');
        }
      }

      const hasOnlineHumans = room.players.some((p) => !p.isBot && p.isConnected);
      if (!hasOnlineHumans) {
        // Keep the room alive for 5 minutes so other players can join or the host can reconnect!
        if (!room.emptyRoomTimeout) {
          room.emptyRoomTimeout = setTimeout(() => {
            const currentRoom = rooms.get(room.id);
            if (currentRoom) {
              const stillNoHumans = currentRoom.players.every((p) => p.isBot || !p.isConnected);
              if (stillNoHumans) {
                stopTurnTimer(currentRoom);
                rooms.delete(currentRoom.id);
                console.log(`[Room Cleanup] Sala #${currentRoom.id} encerrada por inatividade (5min).`);
              }
            }
          }, 5 * 60 * 1000);
        }
      } else {
        syncRoomState(room);
      }
    }
  });
});

// Production vs Dev mode setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`UNO Multiplayer Server running on port ${PORT}`);
  });
}

startServer();
