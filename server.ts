import express from 'express';
import http from 'http';
import fs from 'fs';
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
  ServerMessage,
  OpenRoomSummary
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
  getAllUsers,
  updateUserProfile,
  adminCreateUser,
  adminResetPassword,
  adminDeleteUser
} from './server/authService.js';

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

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

app.post('/api/auth/update-profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }
  const token = authHeader.split(' ')[1];
  const user = getUserFromToken(token);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Sessão expirada.' });
  }
  const { displayName, avatar } = req.body;
  const updated = updateUserProfile(user.id, displayName, avatar);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
  }
  return res.json({ success: true, user: updated });
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

// Public Open Rooms API
app.get('/api/rooms/open', (_req, res) => {
  const openRooms: OpenRoomSummary[] = Array.from(rooms.values())
    .filter((r) => r.players.some((p) => !p.isBot && p.isConnected))
    .map((r) => {
      const host = r.players.find((p) => p.isHost && !p.isBot) || r.players.find((p) => !p.isBot) || r.players[0];
      return {
        id: r.id,
        status: r.status,
        playersCount: r.players.length,
        maxPlayers: r.settings.maxPlayers,
        hostName: host ? host.name : 'Anfitrião',
        hostAvatar: host ? host.avatar : '🎲',
        turnDuration: r.settings.turnDuration,
        spectatorsCount: r.spectators?.length || 0,
        players: r.players.map((p) => ({
          name: p.name,
          avatar: p.avatar,
          isHost: p.isHost,
          isBot: p.isBot,
        })),
      };
    });
  return res.json({ success: true, rooms: openRooms });
});

// User Career Stats storage with persistent disk file
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {}
}

function getAllStats(): Record<string, any> {
  ensureDataDir();
  try {
    if (fs.existsSync(STATS_FILE)) {
      return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const fd = fs.openSync(tempPath, 'w');
  fs.writeSync(fd, data, 0, 'utf-8');
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tempPath, filePath);
}


function saveStats(statsMap: Record<string, any>): void {
  ensureDataDir();
  try {
    atomicWriteFileSync(STATS_FILE, JSON.stringify(statsMap, null, 2));
  } catch (e) {
    console.error('Erro ao salvar stats.json:', e);
  }
}


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

  const statsMap = getAllStats();
  const stats = statsMap[user.id] || statsMap[user.username.toLowerCase()] || null;
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

  const statsMap = getAllStats();
  statsMap[user.id] = stats;
  statsMap[user.username.toLowerCase()] = stats;
  saveStats(statsMap);

  return res.json({ success: true, message: 'Estatísticas salvas com sucesso' });
});

// Admin Room Management Helper
function isAdminRequest(req: any): boolean {
  const pinHeader = req.headers['x-admin-pin'];
  if (pinHeader === '774007' || pinHeader === process.env.ADMIN_PIN) {
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
  const lobbyList = Array.from(onlinePlayers.values());
  allUsers.forEach((u) => {
    // Check if user is currently playing in any active room or in lobby
    let onlineRoom: string | null = null;
    let inLobby = false;

    activeRooms.forEach((r) => {
      const p = r.players.find((pl) => !pl.isBot && pl.isConnected && (
        pl.id === u.id ||
        pl.name.toLowerCase() === u.displayName.toLowerCase() ||
        pl.name.toLowerCase() === u.username.toLowerCase()
      ));
      if (p) onlineRoom = r.id;
    });

    if (!onlineRoom) {
      inLobby = lobbyList.some((lp) => 
        lp.id === u.id ||
        lp.name.toLowerCase() === u.displayName.toLowerCase() ||
        lp.name.toLowerCase() === u.username.toLowerCase()
      );
    }

    let statusBadge = `⚪ Offline`;
    if (onlineRoom) {
      statusBadge = `🟢 ONLINE (Na Sala #${onlineRoom})`;
    } else if (inLobby) {
      statusBadge = `🟢 ONLINE (No Lobby / Painel)`;
    }

    output += `   ${u.avatar} ${u.displayName} (@${u.username} ${u.tag || ''}) - [${u.role === 'admin' ? '👑 Admin' : '🎮 Jogador'}] -> ${statusBadge}\n`;
  });
  output += `======================================================\n\n`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(output);
});

// Get all users with online & room status
app.get('/api/admin/users', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  let allUsers = getAllUsers();
  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/admin/users`, {
        headers: {
          Authorization: req.headers.authorization || '',
          'x-admin-pin': (req.headers['x-admin-pin'] as string) || '774007',
        },
      });
      const data = await response.json();
      if (data.success && Array.isArray(data.users)) {
        allUsers = data.users;
      }
    } catch (err) {
      console.error('Failed to proxy /api/admin/users to auth service, falling back to local:', err);
    }
  }

  const activeRooms = Array.from(rooms.values());
  const lobbyList = Array.from(onlinePlayers.values());

  // Check caller from JWT token
  let callerId: string | null = null;
  let callerUsername: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const caller = getUserFromToken(authHeader.split(' ')[1]);
    if (caller) {
      callerId = caller.id;
      callerUsername = caller.username.toLowerCase();
    }
  }

  const userList = allUsers.map((u) => {
    let isOnline = false;
    let currentRoomId: string | null = null;
    let roomStatus: string | null = null;

    const uUsername = u.username.toLowerCase();
    const uDisplayName = u.displayName.toLowerCase();

    // 1. Check active game rooms
    for (const r of activeRooms) {
      const match = r.players.find(
        (p) => !p.isBot && p.isConnected && (
          p.id === u.id ||
          p.name.toLowerCase() === uDisplayName ||
          p.name.toLowerCase() === uUsername
        )
      );
      if (match) {
        isOnline = true;
        currentRoomId = r.id;
        roomStatus = r.status;
        break;
      }
    }

    // 2. Check online lobby / WebSocket players registry
    if (!isOnline) {
      for (const lp of lobbyList) {
        if (
          lp.id === u.id ||
          lp.name.toLowerCase() === uDisplayName ||
          lp.name.toLowerCase() === uUsername
        ) {
          isOnline = true;
          currentRoomId = lp.roomId || null;
          if (lp.roomId) {
            const r = rooms.get(lp.roomId);
            if (r) roomStatus = r.status;
          }
          break;
        }
      }
    }

    // 3. If this user is the authenticated caller making this request right now
    if (!isOnline && (callerId || callerUsername)) {
      if ((callerId && u.id === callerId) || (callerUsername && uUsername === callerUsername)) {
        isOnline = true;
      }
    }

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

// Admin: Create user directly (without invite code)
app.post('/api/admin/users/create', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/admin/users/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization || '',
          'x-admin-pin': (req.headers['x-admin-pin'] as string) || '774007',
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.error('Failed to proxy /api/admin/users/create, falling back to local:', err);
    }
  }

  const result = await adminCreateUser(req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// Admin: Reset any user password
app.post('/api/admin/users/:id/reset-password', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/admin/users/${encodeURIComponent(req.params.id)}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization || '',
          'x-admin-pin': (req.headers['x-admin-pin'] as string) || '774007',
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.error('Failed to proxy /api/admin/users/:id/reset-password, falling back to local:', err);
    }
  }

  const { newPassword } = req.body;
  const result = await adminResetPassword(req.params.id, newPassword);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// Admin: Delete user
app.delete('/api/admin/users/:id', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  if (AUTH_SERVICE_URL) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/admin/users/${encodeURIComponent(req.params.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: req.headers.authorization || '',
          'x-admin-pin': (req.headers['x-admin-pin'] as string) || '774007',
        },
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.error('Failed to proxy /api/admin/users/:id delete, falling back to local:', err);
    }
  }

  const result = adminDeleteUser(req.params.id);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
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

interface ConnectionMeta {
  socketId: string;
  roomId: string;
  playerId: string;
  reconnectToken: string;
}

// Map client WebSocket to connection metadata
const clientConnections = new Map<WebSocket, ConnectionMeta>();

function generateReconnectToken(): string {
  return `rtoken-${Math.random().toString(36).substring(2, 12)}-${Date.now()}`;
}

// Map (roomId + ':' + playerId) -> secret reconnectToken
const sessionReconnectTokens = new Map<string, string>();

function registerClientConnection(ws: WebSocket, socketId: string, roomId: string, playerId: string, providedToken?: string): string {
  const tokenKey = `${roomId}:${playerId}`;
  let reconnectToken = providedToken || sessionReconnectTokens.get(tokenKey) || generateReconnectToken();
  sessionReconnectTokens.set(tokenKey, reconnectToken);

  clientConnections.set(ws, {
    socketId,
    roomId,
    playerId,
    reconnectToken,
  });
  return reconnectToken;
}


// Idempotency window for message processing
interface MessageCacheItem {
  result: any;
  expiresAt: number;
}
const processedMessageCache = new Map<string, MessageCacheItem>();

function cleanMessageCache() {
  const now = Date.now();
  for (const [id, item] of processedMessageCache.entries()) {
    if (item.expiresAt < now) {
      processedMessageCache.delete(id);
    }
  }
}
setInterval(cleanMessageCache, 30000);

function cacheMessageResult(messageId: string | undefined, resultPayload: any) {
  if (!messageId) return;
  processedMessageCache.set(messageId, {
    result: resultPayload,
    expiresAt: Date.now() + 60000, // 60s TTL
  });
}

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
  const isSpectator = !player && (room.spectators?.some((s) => s.id === playerId) ?? false);
  if (!player && !isSpectator) return;

  const spectatorCanSeeHands = room.spectatorCardsRevealed ?? (room.settings.spectatorMode === 'reveal_cards');

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
    botHand: (room.settings.showBotCards && p.isBot) || (isSpectator && spectatorCanSeeHands) ? p.hand : undefined,
  }));

  const activePlayer = room.players[room.currentTurnIndex];

  const clientState: GameState = {
    roomId: room.id,
    creatorName: room.creatorName,
    status: room.status,
    players: publicPlayers,
    spectators: room.spectators?.map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, isConnected: s.isConnected })),
    myHand: player ? player.hand : [],
    discardPileTop: room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null,
    currentColor: room.currentColor,
    activeColor: room.currentColor === 'wild' ? 'red' : room.currentColor,
    currentTurnPlayerId: activePlayer ? activePlayer.id : '',

    turnDirection: room.turnDirection,
    turnTimeLeft: room.turnTimeLeft,
    turnDuration: room.settings.turnDuration,
    drawCountPenalty: 0,
    winnerId: room.winnerId,
    unoVulnerablePlayerId: room.unoVulnerablePlayerId,
    deckCardsCount: room.deck.length,
    settings: room.settings,
    isSpectator: isSpectator,
    spectatorCardsRevealed: spectatorCanSeeHands,
    stagedCardPlay: room.stagedCardPlay,
    rematchVotes: room.rematchVotes,
    roundDurationSeconds: room.lastRoundDurationSeconds,
    roundTurnCount: room.lastRoundTurnCount,
    roundPointsWon: room.lastRoundPointsWon,
    isFastestWin: room.lastRoundIsFastest,
    tableScores: room.tableScores,
    tableFastestSeconds: room.fastestRoundSeconds,
  };

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'game_state', state: clientState }));

    if (player) {
      const topCard = room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null;
      const playableCardIds = topCard
        ? player.hand.filter((card) => isCardPlayable(card, topCard, room.currentColor)).map((card) => card.id)
        : player.hand.map((card) => card.id);

      const isMyTurn = activePlayer && activePlayer.id === player.id;
      const handStatePayload = {
        type: 'hand_state' as const,
        hand: player.hand,
        playableCardIds,
        canDraw: isMyTurn && !player.hasDrawnThisTurn && room.status === 'playing',
        canPassTurn: isMyTurn && player.hasDrawnThisTurn && room.status === 'playing',
      };

      ws.send(JSON.stringify(handStatePayload));
    }
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

  if (player.hasDrawnThisTurn) {
    broadcastLog(room, `⏱️ Tempo esgotado para ${player.name}! Vez passada automaticamente.`, 'action', player.name);
  } else {
    broadcastLog(room, `⏱️ Tempo esgotado para ${player.name}! Comprou 1 carta automaticamente.`, 'action', player.name);
    const drawn = drawCardsFromDeck(room, 1);
    player.hand.push(...drawn);
    broadcastSound(room.id, 'draw');
  }

  player.hasDrawnThisTurn = false;
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

function finalizePlayCard(
  room: RoomData,
  player: InternalPlayer,
  cardId: string,
  chosenColor?: CardColor
) {
  const cardIndex = player.hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return;

  const card = player.hand[cardIndex];

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

  // Animation staging: if playAnimationDelay is configured (or default 1.5s)
  const animDelaySeconds = room.settings.playAnimationDelay !== undefined ? room.settings.playAnimationDelay : 1.5;

  if (animDelaySeconds > 0) {
    if (room.stagedCardTimeout) {
      clearTimeout(room.stagedCardTimeout);
      room.stagedCardTimeout = null;
    }

    room.stagedCardPlay = {
      card,
      playerId: player.id,
      playerName: player.name,
      playerAvatar: player.avatar,
      chosenColor,
      timestamp: Date.now(),
      delaySeconds: animDelaySeconds,
    };

    syncRoomState(room);

    room.stagedCardTimeout = setTimeout(() => {
      room.stagedCardTimeout = null;
      room.stagedCardPlay = null;
      finalizePlayCard(room, player, cardId, chosenColor);
    }, animDelaySeconds * 1000);
  } else {
    finalizePlayCard(room, player, cardId, chosenColor);
  }
}

// WebSocket setup
const wss = new WebSocketServer({ server, path: '/ws' });

const onlinePlayers = new Map<WebSocket, { id: string; name: string; avatar: string; roomId: string | null }>();

function broadcastOnlinePlayers() {
  const playersList = Array.from(onlinePlayers.values());
  const payload = JSON.stringify({ type: 'lobby_online_players', players: playersList });
  onlinePlayers.forEach((meta, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch (e) {}
    }
  });
}

function updatePlayerRoom(ws: WebSocket, roomId: string | null) {
  const meta = onlinePlayers.get(ws);
  if (meta) {
    meta.roomId = roomId;
    broadcastOnlinePlayers();
  }
}

wss.on('connection', (ws: WebSocket) => {
  const socketId = `soc-${Math.random().toString(36).substring(2, 10)}`;

  ws.on('message', (data: string) => {
    try {
      const msg: ClientMessage = JSON.parse(data.toString());

      // 1. Protocol Version Check
      if (msg.protocolVersion !== undefined && typeof msg.protocolVersion === 'number' && msg.protocolVersion < 1) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'action_rejected',
              messageId: msg.messageId,
              code: 'UNSUPPORTED_VERSION',
              message: 'Unsupported protocol version.',
            })
          );
        }
        return;
      }

      // 2. Idempotency Check (if messageId is provided and already processed)
      if (msg.messageId && processedMessageCache.has(msg.messageId)) {
        const cached = processedMessageCache.get(msg.messageId);
        if (cached && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(cached.result));
        }
        return;
      }

      // 3. Socket Identity Verification (PLAYER_MISMATCH)
      const socketMeta = clientConnections.get(ws);
      const msgPlayerId = (msg as any).playerId;
      if (socketMeta && socketMeta.playerId && msgPlayerId && typeof msgPlayerId === 'string' && msgPlayerId !== socketMeta.playerId) {
        if (ws.readyState === WebSocket.OPEN) {
          const rejectMsg = {
            type: 'action_rejected',
            messageId: msg.messageId,
            code: 'PLAYER_MISMATCH' as const,
            message: 'Identity mismatch: cannot send actions on behalf of another player.',
          };
          ws.send(JSON.stringify(rejectMsg));
          cacheMessageResult(msg.messageId, rejectMsg);
        }
        return;
      }

      if (msg.type === 'register_lobby') {
        const pId = msg.playerId || `player-${Math.random().toString(36).substring(2, 9)}`;
        onlinePlayers.set(ws, {
          id: pId,
          name: msg.name,
          avatar: msg.avatar,
          roomId: null
        });
        broadcastOnlinePlayers();
        return;
      }

      if (msg.type === 'send_lobby_chat') {
        const payload = JSON.stringify({
          type: 'lobby_chat_message',
          message: {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: msg.name,
            avatar: msg.avatar,
            text: msg.text,
            timestamp: Date.now()
          }
        });
        onlinePlayers.forEach((meta, clientWs) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            try {
              clientWs.send(payload);
            } catch (e) {}
          }
        });
        return;
      }

      if (msg.type === 'send_lobby_invite') {
        const payload = JSON.stringify({
          type: 'lobby_invite_received',
          invite: {
            fromName: msg.name,
            fromAvatar: msg.avatar,
            roomId: msg.roomId,
            timestamp: Date.now()
          }
        });
        onlinePlayers.forEach((meta, clientWs) => {
          if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
            try {
              clientWs.send(payload);
            } catch (e) {}
          }
        });
        return;
      }

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
        const reconnectToken = registerClientConnection(ws, socketId, roomId, hostPlayer.id);
        updatePlayerRoom(ws, roomId);

        ws.send(JSON.stringify({ type: 'room_joined', roomId, playerId: hostPlayer.id, reconnectToken }));
        startGame(room);
        return;
      }

      if (msg.type === 'leave_room') {
        const cleanRoomId = (msg.roomId || '').replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();

        // 1. Remove this connection and any other socket registered to this player in this room
        clientConnections.delete(ws);
        clientConnections.forEach((meta, clientWs) => {
          if (meta.playerId === msg.playerId && meta.roomId === cleanRoomId) {
            clientConnections.delete(clientWs);
          }
        });

        // 2. Send acknowledgment to the client
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'left_room_confirmed', roomId: cleanRoomId }));
          }
        } catch (e) {}
        updatePlayerRoom(ws, null);

        const room = rooms.get(cleanRoomId);
        if (room) {
          const idx = room.players.findIndex((p) => p.id === msg.playerId);
          if (idx !== -1) {
            const leaving = room.players[idx];
            const originalName = leaving.name;

            // Voice leave
            broadcastToRoom(room.id, {
              type: 'rtc_voice_state',
              roomId: room.id,
              playerId: leaving.id,
              isMuted: true,
              isDeafened: true,
              isSpeaking: false,
              joined: false,
            });

            if (leaving.isHost) {
              leaving.isHost = false;
              const nextHost = room.players.find((p) => !p.isBot && p.isConnected && p.id !== leaving.id);
              if (nextHost) {
                nextHost.isHost = true;
                broadcastLog(room, `👑 ${nextHost.name} agora é o novo Anfitrião da sala!`, 'system');
              }
            }

            if (room.status === 'waiting' || room.status === 'ended') {
              room.players.splice(idx, 1);
              broadcastLog(room, `${originalName} saiu da sala.`, 'system');
            } else {
              // Active match (playing or paused): A Bot automatically assumes the cards and position!
              const cleanBotName = originalName.startsWith('Bot ') ? originalName : `Bot (${originalName})`;
              leaving.isBot = true;
              leaving.isConnected = true;
              leaving.name = cleanBotName;
              leaving.avatar = '🤖';

              broadcastLog(
                room,
                `🤖 ${originalName} saiu da partida. Um Robô assumiu as cartas para o jogo continuar!`,
                'system'
              );

              // If it was the leaving player's turn, trigger bot turn
              if (room.status === 'playing' && room.players[room.currentTurnIndex]?.id === leaving.id) {
                scheduleBotTurn(room, leaving);
              }
            }

            const hasOnlineHumans = room.players.some((p) => !p.isBot && p.isConnected);
            if (!hasOnlineHumans) {
              stopTurnTimer(room);
              rooms.delete(room.id);
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
          creatorName: hostPlayer.name,
          settings: {
            maxPlayers: msg.settings?.maxPlayers || 4,
            turnDuration: duration,
            challengeUnoRule: msg.settings?.challengeUnoRule ?? true,
            showBotCards: msg.settings?.showBotCards ?? false,
            botSpeedMs: msg.settings?.botSpeedMs ?? 1800,
            autoUnoProtection: msg.settings?.autoUnoProtection ?? false,
            highlightHints: msg.settings?.highlightHints ?? true,
            spectatorPermission: msg.settings?.spectatorPermission ?? 'hidden_cards',
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
        const reconnectToken = registerClientConnection(ws, socketId, roomId, hostPlayer.id);
        updatePlayerRoom(ws, roomId);

        ws.send(JSON.stringify({ type: 'room_joined', roomId, playerId: hostPlayer.id, reconnectToken }));
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
            const storedToken = sessionReconnectTokens.get(`${room.id}:${player.id}`);
            if (storedToken && msg.reconnectToken && msg.reconnectToken !== storedToken) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'action_rejected',
                    messageId: msg.messageId,
                    code: 'NOT_AUTHENTICATED' as const,
                    message: 'Token de reconexão de sessão inválido.',
                  })
                );
              }
              return;
            }

            player.isConnected = true;
            const hasOtherOnlineHost = room.players.some((p) => p.isHost && !p.isBot && p.isConnected && p.id !== player.id);
            const isCreator = !!(room.creatorName && player.name.toLowerCase() === room.creatorName.toLowerCase());
            if (!hasOtherOnlineHost || isCreator) {
              room.players.forEach((p) => { p.isHost = false; });
              player.isHost = true;
            }
            const reconnectToken = registerClientConnection(ws, socketId, room.id, player.id, msg.reconnectToken);
            updatePlayerRoom(ws, room.id);
            ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: player.id, reconnectToken }));
            syncRoomState(room);
            return;
          }
 else if (room.status === 'waiting') {
            // Check if there is an offline player slot that was disconnected
            const disc = room.players.find((p) => !p.isBot && !p.isConnected);
            if (disc) {
              disc.isConnected = true;
              const reconnectToken = registerClientConnection(ws, socketId, room.id, disc.id);
              updatePlayerRoom(ws, room.id);
              ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: disc.id, reconnectToken }));
              syncRoomState(room);
              return;
            }
          }
        }
        return;
      }

      if (msg.type === 'join_room') {
        const rawRoomInput = (msg.roomId || '').trim();
        const startsWithDollar = rawRoomInput.startsWith('$');
        const startsWithStar = rawRoomInput.startsWith('*');
        // Note: '@' is used as prefix in invite codes, so do NOT treat '@' as spectator mode
        const wantsSpectator = msg.asSpectator === true || startsWithDollar || startsWithStar;
        const wantsRevealHands = msg.spectatorRevealCards === true || startsWithDollar;

        const cleanRoomId = rawRoomInput.replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
        const room = rooms.get(cleanRoomId);
        if (!room) {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Sala #${cleanRoomId} não encontrada. Verifique se o código está correto ou se a sala já expirou.`
          }));
          return;
        }

        // If explicitly joining as Spectator / Tournament Broadcast
        if (wantsSpectator) {
          const permission = room.settings.spectatorPermission ?? 'hidden_cards';
          if (permission === 'disabled') {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'O criador desta sala bloqueou o modo espectador / transmissão externa.'
            }));
            return;
          }

          const canRevealCards = permission === 'reveal_cards' && wantsRevealHands;

          if (!room.spectators) room.spectators = [];
          const spectatorId = `spectator-${Math.random().toString(36).substring(2, 9)}`;
          const spectatorObj = {
            id: spectatorId,
            name: msg.playerName?.trim() ? `[TV] ${msg.playerName.trim()}` : `Espectador ${room.spectators.length + 1}`,
            avatar: msg.avatar || (canRevealCards ? '📺' : '👁️'),
            isConnected: true,
          };

          if (canRevealCards) {
            room.spectatorCardsRevealed = true;
          }

          room.spectators.push(spectatorObj);
          const reconnectToken = registerClientConnection(ws, socketId, room.id, spectatorId);

          ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: spectatorId, reconnectToken }));
          broadcastLog(
            room,
            `📺 ${spectatorObj.name} conectou na transmissão (${canRevealCards ? 'Cartas Abertas' : 'Apenas Mesa'})!`,
            'system'
          );
          syncRoomState(room);
          return;
        }

        const requestedName = msg.playerName.trim() || `Jogador ${room.players.length + 1}`;
        const isOriginalCreator = !!(room.creatorName && requestedName.toLowerCase() === room.creatorName.toLowerCase());

        // 1. Check if existing player in THIS room is reconnecting by existingPlayerId
        if (msg.existingPlayerId) {
          const existing = room.players.find((p) => p.id === msg.existingPlayerId);
          if (existing) {
            existing.isConnected = true;
            if (msg.avatar) existing.avatar = msg.avatar;
            if (msg.playerName?.trim()) existing.name = msg.playerName.trim();
            const hasOtherOnlineHost = room.players.some((p) => p.isHost && !p.isBot && p.isConnected && p.id !== existing.id);
            const isCreator = !!(room.creatorName && existing.name.toLowerCase() === room.creatorName.toLowerCase());
            if (!hasOtherOnlineHost || isCreator) {
              room.players.forEach((p) => { p.isHost = false; });
              existing.isHost = true;
            }
            const reconnectToken = registerClientConnection(ws, socketId, room.id, existing.id);
            updatePlayerRoom(ws, room.id);
            ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: existing.id, reconnectToken }));
            broadcastLog(room, `🔄 ${existing.name} reconectou à sala!`, 'system');
            syncRoomState(room);
            return;
          }
        }

        // 2. Check if a player with matching name was disconnected in this room (reconnect slot)
        const discMatch = room.players.find(
          (p) => !p.isBot && !p.isConnected && p.name.trim().toLowerCase() === requestedName.toLowerCase()
        );
        if (discMatch) {
          discMatch.isConnected = true;
          if (msg.avatar) discMatch.avatar = msg.avatar;
          const hasOtherOnlineHost = room.players.some((p) => p.isHost && !p.isBot && p.isConnected && p.id !== discMatch.id);
          if (!hasOtherOnlineHost || isOriginalCreator) {
            room.players.forEach((p) => { p.isHost = false; });
            discMatch.isHost = true;
          }
          const reconnectToken = registerClientConnection(ws, socketId, room.id, discMatch.id);
          updatePlayerRoom(ws, room.id);
          ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: discMatch.id, reconnectToken }));
          broadcastLog(room, `🔄 ${discMatch.name} reconectou à sala!`, 'system');
          syncRoomState(room);
          return;
        }

        // 3. If game is already in progress and not an existing player: join as waiting spectator
        if (room.status === 'playing') {
          if (!room.spectators) room.spectators = [];
          const spectatorId = `spectator-${Math.random().toString(36).substring(2, 9)}`;
          const spectatorObj = {
            id: spectatorId,
            name: requestedName || `Espectador ${room.spectators.length + 1}`,
            avatar: msg.avatar || '👀',
            isConnected: true,
          };
          room.spectators.push(spectatorObj);
          const reconnectToken = registerClientConnection(ws, socketId, room.id, spectatorId);
          updatePlayerRoom(ws, room.id);

          ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: spectatorId, reconnectToken }));
          broadcastLog(room, `👀 ${spectatorObj.name} entrou na sala como Espectador (Aguardando próxima rodada)!`, 'system');
          syncRoomState(room);
          return;
        }

        // 4. Room is waiting: If room has bot and is full, replace a bot for human player
        if (room.players.length >= room.settings.maxPlayers) {
          const botIdx = room.players.findIndex((p) => p.isBot);
          if (botIdx !== -1) {
            const removedBot = room.players.splice(botIdx, 1)[0];
            broadcastLog(room, `🤖 ${removedBot.name} deu espaço para ${requestedName} entrar na mesa.`, 'system');
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'A sala já está cheia (máximo de 4 jogadores atingido).' }));
            return;
          }
        }

        // 5. Check if active online player already has this exact name
        const isNameTakenInRoom = room.players.some(
          (p) => p.isConnected && !p.isBot && p.name.trim().toLowerCase() === requestedName.toLowerCase()
        );
        if (isNameTakenInRoom) {
          ws.send(JSON.stringify({
            type: 'error',
            message: `O nome "${requestedName}" já está em uso por outro jogador conectado nesta sala! Escolha outro apelido ou nome para entrar.`
          }));
          return;
        }

        const hasOnlineHost = room.players.some((p) => p.isHost && !p.isBot && p.isConnected);
        const shouldBeHost = !hasOnlineHost || isOriginalCreator;

        if (shouldBeHost && isOriginalCreator) {
          room.players.forEach((p) => { p.isHost = false; });
        }

        const newPlayer: InternalPlayer = {
          id: `player-${Math.random().toString(36).substring(2, 9)}`,
          name: requestedName,
          avatar: msg.avatar || '🎲',
          isHost: shouldBeHost,
          isBot: false,
          cardsCount: 0,
          hasCalledUno: false,
          isConnected: true,
          score: 0,
          hand: [],
          hasDrawnThisTurn: false,
        };

        room.players.push(newPlayer);
        const reconnectToken = registerClientConnection(ws, socketId, room.id, newPlayer.id);
        updatePlayerRoom(ws, room.id);

        ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerId: newPlayer.id, reconnectToken }));

        broadcastLog(room, `${newPlayer.name} entrou na sala!`, 'system');
        syncRoomState(room);
        return;
      }

      // Public Open Rooms WebSocket Message
      if (msg.type === 'get_open_rooms') {
        const openRooms: OpenRoomSummary[] = Array.from(rooms.values())
          .filter((r) => r.players.some((p) => !p.isBot && p.isConnected))
          .map((r) => {
            const host = r.players.find((p) => p.isHost && !p.isBot) || r.players.find((p) => !p.isBot) || r.players[0];
            return {
              id: r.id,
              status: r.status,
              playersCount: r.players.length,
              maxPlayers: r.settings.maxPlayers,
              hostName: host ? host.name : 'Anfitrião',
              hostAvatar: host ? host.avatar : '🎲',
              turnDuration: r.settings.turnDuration,
              spectatorsCount: r.spectators?.length || 0,
              players: r.players.map((p) => ({
                name: p.name,
                avatar: p.avatar,
                isHost: p.isHost,
                isBot: p.isBot,
              })),
            };
          });
        ws.send(JSON.stringify({ type: 'open_rooms_list', rooms: openRooms }));
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
        const room = rooms.get(String(msg.roomId).trim().toUpperCase());
        if (room && room.players.some((p) => p.id === msg.playerId && p.isConnected)) {
          registerClientConnection(ws, socketId, room.id, String(msg.playerId));
          meta = clientConnections.get(ws);
        }
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

      if (msg.type === 'claim_host') {
        const targetPlayer = player || room.players.find((p) => p.id === msg.playerId);
        if (!targetPlayer) return;

        room.players.forEach((p) => {
          p.isHost = false;
        });
        targetPlayer.isHost = true;
        broadcastLog(room, `👑 ${targetPlayer.name} assumiu a liderança como Anfitrião da sala!`, 'system');
        syncRoomState(room);
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
        // Ensure player requesting start is recognized as host if no active host exists
        if (!player.isHost) {
          const hasActiveHost = room.players.some((p) => p.isHost && !p.isBot && p.isConnected);
          if (!hasActiveHost || msg.type === 'start_game') {
            room.players.forEach((p) => { p.isHost = false; });
            player.isHost = true;
          }
        }

        // Clean disconnected human players before starting
        room.players = room.players.filter((p) => p.isBot || p.isConnected);

        // Ensure minimum 2 players by auto-adding a Bot if needed
        if (room.players.length < 2) {
          addBotToRoom(room);
        }

        room.rematchVotes = {};
        startGame(room);
        return;
      }

      if (msg.type === 'pause_game') {
        if (room.status !== 'playing') return;
        stopTurnTimer(room);
        room.status = 'paused';
        broadcastLog(room, `⏸️ ${player.name} pausou a partida!`, 'system');
        syncRoomState(room);
        return;
      }

      if (msg.type === 'resume_game') {
        if (room.status !== 'paused') return;
        room.status = 'playing';
        startTurnTimer(room);
        broadcastLog(room, `▶️ ${player.name} retomou a partida!`, 'system');
        syncRoomState(room);
        return;
      }

      if (msg.type === 'return_to_lobby' || msg.type === 'reset_room') {
        stopTurnTimer(room);
        room.status = 'waiting';
        room.winnerId = null;
        room.unoVulnerablePlayerId = null;
        room.discardPile = [];
        room.deck = [];
        room.stagedCardPlay = null;
        room.rematchVotes = {};

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

      if (msg.type === 'vote_rematch') {
        if (!room.rematchVotes) room.rematchVotes = {};
        const pId = msg.playerId || player?.id || '';
        const playerName = player ? player.name : (room.spectators?.find((s) => s.id === pId)?.name || 'Jogador');

        room.rematchVotes[pId] = {
          playerId: pId,
          playerName,
          ready: msg.ready,
          phrase: msg.phrase,
          timestamp: Date.now(),
        };

        if (msg.phrase) {
          broadcastLog(room, `💬 ${playerName}: "${msg.phrase}"`, 'chat', playerName);
        }
        syncRoomState(room);

        // Check if all connected human players voted ready
        const humanPlayers = room.players.filter((p) => !p.isBot && p.isConnected);
        const readyCount = humanPlayers.filter((p) => room.rematchVotes?.[p.id]?.ready).length;
        if (humanPlayers.length > 0 && readyCount === humanPlayers.length && room.status === 'ended') {
          broadcastLog(room, `✨ Todos os jogadores confirmaram! Iniciando nova rodada...`, 'system');
          setTimeout(() => {
            room.rematchVotes = {};
            startGame(room);
          }, 1500);
        }
        return;
      }

      if (msg.type === 'toggle_spectator_reveal') {
        if (player && player.isHost) {
          room.spectatorCardsRevealed = msg.reveal;
          broadcastLog(room, `👁️ O Anfitrião ${msg.reveal ? 'liberou a visão das cartas para os Espectadores' : 'ocultou as cartas dos Espectadores'}.`, 'system');
          syncRoomState(room);
        }
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
        if (room.players[room.currentTurnIndex].id !== player.id) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'action_rejected', messageId: msg.messageId, code: 'NOT_YOUR_TURN' as const, message: 'Aguarde a sua vez de jogar!' }));
          }
          return;
        }
        if (!player.hasDrawnThisTurn) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'action_rejected', messageId: msg.messageId, code: 'MUST_DRAW_FIRST' as const, message: 'Você precisa comprar uma carta antes de passar a vez!' }));
          }
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
        if (msg.targetPlayerId === player.id) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'action_rejected',
                messageId: msg.messageId,
                code: 'UNO_SELF_CATCH' as const,
                message: 'Você não pode aplicar a penalidades de UNO a si próprio.',
              })
            );
          }
          return;
        }
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

      // WebRTC Peer-to-Peer Voice Signaling (Zero server audio processing)
      if (msg.type === 'rtc_offer') {
        const targetPlayerId = msg.toPlayerId;
        for (const [clientWs, clientMeta] of clientConnections.entries()) {
          if (clientMeta.roomId === room.id && clientMeta.playerId === targetPlayerId && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'rtc_offer',
              fromPlayerId: player.id,
              toPlayerId: targetPlayerId,
              offer: msg.offer,
            }));
            break;
          }
        }
        return;
      }

      if (msg.type === 'rtc_answer') {
        const targetPlayerId = msg.toPlayerId;
        for (const [clientWs, clientMeta] of clientConnections.entries()) {
          if (clientMeta.roomId === room.id && clientMeta.playerId === targetPlayerId && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'rtc_answer',
              fromPlayerId: player.id,
              toPlayerId: targetPlayerId,
              answer: msg.answer,
            }));
            break;
          }
        }
        return;
      }

      if (msg.type === 'rtc_ice_candidate') {
        const targetPlayerId = msg.toPlayerId;
        for (const [clientWs, clientMeta] of clientConnections.entries()) {
          if (clientMeta.roomId === room.id && clientMeta.playerId === targetPlayerId && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'rtc_ice_candidate',
              fromPlayerId: player.id,
              toPlayerId: targetPlayerId,
              candidate: msg.candidate,
            }));
            break;
          }
        }
        return;
      }

      if (msg.type === 'rtc_voice_state') {
        broadcastToRoom(room.id, {
          type: 'rtc_voice_state',
          roomId: room.id,
          playerId: player.id,
          isMuted: !!msg.isMuted,
          isDeafened: !!msg.isDeafened,
          isSpeaking: !!msg.isSpeaking,
          joined: !!msg.joined,
        });
        return;
      }


      // Automatically keep onlinePlayers roomId in sync with clientConnections!
      const conn = clientConnections.get(ws);
      const onlineMeta = onlinePlayers.get(ws);
      if (onlineMeta) {
        const targetRoomId = conn ? conn.roomId : null;
        if (onlineMeta.roomId !== targetRoomId) {
          onlineMeta.roomId = targetRoomId;
          broadcastOnlinePlayers();
        }
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    // Delete from online lobby registry and notify
    onlinePlayers.delete(ws);
    broadcastOnlinePlayers();

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
