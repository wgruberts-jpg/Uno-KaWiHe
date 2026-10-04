import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const INVITES_FILE = path.join(DATA_DIR, 'invites.json');
const JWT_SECRET = process.env.JWT_SECRET || 'kawihe_jwt_super_secret_key_2026';
const ADMIN_PIN = process.env.ADMIN_PIN || '';

function getInitialAdminPassword(): string {
  if (process.env.INITIAL_ADMIN_PASSWORD && process.env.INITIAL_ADMIN_PASSWORD.trim().length > 0) {
    return process.env.INITIAL_ADMIN_PASSWORD.trim();
  }
  const randomPass = crypto.randomBytes(12).toString('hex');
  console.warn('=================================================================');
  console.warn('🔑 [BOOTSTRAP DE SEGURANÇA] INITIAL_ADMIN_PASSWORD não configurada no .env.');
  console.warn(`🔑 Senha temporária única gerada para o Admin (Edinho): ${randomPass}`);
  console.warn('🔑 Altere sua senha imediatamente através do painel de administração!');
  console.warn('=================================================================');
  return randomPass;
}

function getInitialPlayerPassword(username: string): string {
  if (process.env.INITIAL_PLAYER_PASSWORD && process.env.INITIAL_PLAYER_PASSWORD.trim().length > 0) {
    return process.env.INITIAL_PLAYER_PASSWORD.trim();
  }
  const randomPass = crypto.randomBytes(8).toString('hex');
  console.log(`ℹ️ [BOOTSTRAP] Senha inicial gerada para jogador ${username}: ${randomPass}`);
  return randomPass;
}

// Standard CORS Headers
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  role: 'admin' | 'player';
  tag?: string; // e.g. '#0001', '#1001'
  createdAt: string;
  stats?: any;
}

interface InviteRecord {
  code: string; // e.g. "@K9W2"
  createdBy: string;
  createdAt: string;
  expiresAt: string; // ISO string or "never"
  maxUses: number;
  usedCount: number;
  usedBy: Array<{ username: string; usedAt: string }>;
  status: 'active' | 'expired' | 'revoked' | 'used';
}

const INITIAL_USERS: Array<{
  username: string;
  getPassword: () => string;
  displayName: string;
  avatar: string;
  role: 'admin' | 'player';
  tag: string;
}> = [
  { username: 'edinho', getPassword: () => getInitialAdminPassword(), displayName: 'Edinho', avatar: '👑', role: 'admin', tag: '#0001' },
  { username: 'will', getPassword: () => getInitialPlayerPassword('will'), displayName: 'Will', avatar: '🦸‍♂️', role: 'player', tag: '#1001' },
  { username: 'henry', getPassword: () => getInitialPlayerPassword('henry'), displayName: 'Henry', avatar: '⚡', role: 'player', tag: '#1002' },
  { username: 'grazy', getPassword: () => getInitialPlayerPassword('grazy'), displayName: 'Grazy', avatar: '🌸', role: 'player', tag: '#1003' },
  { username: 'milly', getPassword: () => getInitialPlayerPassword('milly'), displayName: 'Milly', avatar: '🦄', role: 'player', tag: '#1004' },
  { username: 'aline', getPassword: () => getInitialPlayerPassword('aline'), displayName: 'Aline', avatar: '🌺', role: 'player', tag: '#1005' },
  { username: 'guilherme', getPassword: () => getInitialPlayerPassword('guilherme'), displayName: 'Guilherme', avatar: '🦁', role: 'player', tag: '#1006' },
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Users Seeding
  let currentUsers: UserRecord[] = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      currentUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
      currentUsers = [];
    }
  }

  let usersUpdated = false;
  INITIAL_USERS.forEach((initUser) => {
    const exists = currentUsers.some((u) => u.username.toLowerCase() === initUser.username.toLowerCase());
    if (!exists) {
      currentUsers.push({
        id: `usr_${initUser.username}`,
        username: initUser.username,
        passwordHash: bcrypt.hashSync(initUser.getPassword(), 12),
        displayName: initUser.displayName,
        avatar: initUser.avatar,
        role: initUser.role,
        tag: initUser.tag,
        createdAt: new Date().toISOString(),
      });
      usersUpdated = true;
    }
  });

  if (usersUpdated || !fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2), 'utf-8');
  }

  // Invites Seeding
  if (!fs.existsSync(INVITES_FILE)) {
    const defaultInvite: InviteRecord = {
      code: '@KWH1',
      createdBy: 'Edinho (Sistema)',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 dias
      maxUses: 10,
      usedCount: 0,
      usedBy: [],
      status: 'active',
    };
    fs.writeFileSync(INVITES_FILE, JSON.stringify([defaultInvite], null, 2), 'utf-8');
  }
}

function getAllUsers(): UserRecord[] {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function saveUsers(users: UserRecord[]): void {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function getAllInvites(): InviteRecord[] {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(INVITES_FILE, 'utf-8');
    const invites: InviteRecord[] = JSON.parse(raw);
    const now = new Date();
    let updated = false;

    invites.forEach((inv) => {
      if (inv.status === 'active' && inv.expiresAt !== 'never' && new Date(inv.expiresAt) < now) {
        inv.status = 'expired';
        updated = true;
      }
    });

    if (updated) {
      fs.writeFileSync(INVITES_FILE, JSON.stringify(invites, null, 2), 'utf-8');
    }
    return invites;
  } catch {
    return [];
  }
}

function saveInvites(invites: InviteRecord[]): void {
  ensureDataDir();
  fs.writeFileSync(INVITES_FILE, JSON.stringify(invites, null, 2), 'utf-8');
}

function toPublicProfile(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    role: user.role,
    tag: user.tag || '#1000',
    createdAt: user.createdAt,
  };
}

function verifyAdminRequest(req: express.Request): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const users = getAllUsers();
    const user = users.find((u) => u.id === decoded.id);
    return !!(user && user.role === 'admin');
  } catch {
    return false;
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'kawihe-auth', timestamp: new Date().toISOString() });
});

// Validate Invite Code (Public)
app.get('/api/invites/validate/:code', (req, res) => {
  let code = req.params.code?.trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ valid: false, error: 'Código de convite não informado.' });
  }
  if (!code.startsWith('@')) {
    code = '@' + code;
  }

  const invites = getAllInvites();
  const invite = invites.find((i) => i.code.toUpperCase() === code);

  if (!invite) {
    return res.json({ valid: false, error: 'Código de convite não encontrado.' });
  }

  if (invite.status === 'revoked') {
    return res.json({ valid: false, error: 'Este convite foi cancelado pelo Administrador.' });
  }

  if (invite.status === 'expired' || (invite.expiresAt !== 'never' && new Date(invite.expiresAt) < new Date())) {
    return res.json({ valid: false, error: 'Este convite já expirou! Peça um novo convite ao Edinho.' });
  }

  if (invite.usedCount >= invite.maxUses || invite.status === 'used') {
    return res.json({ valid: false, error: 'Este convite já foi utilizado o número máximo de vezes.' });
  }

  return res.json({
    valid: true,
    code: invite.code,
    expiresAt: invite.expiresAt,
    remainingUses: invite.maxUses - invite.usedCount,
  });
});

// List Invites (Admin only)
app.get('/api/invites', (req, res) => {
  if (!verifyAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }
  const invites = getAllInvites();
  return res.json({ success: true, invites });
});

// Create New Invite (Admin only)
app.post('/api/invites', (req, res) => {
  if (!verifyAdminRequest(req)) {
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
    // Generate random 4 characters: e.g. @K9W2
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let rand = '';
    for (let i = 0; i < 4; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `@${rand}`;
  }

  const invites = getAllInvites();
  if (invites.some((i) => i.code === code && i.status === 'active')) {
    return res.status(400).json({ success: false, error: 'Este código de convite já existe e está ativo. Escolha outro!' });
  }

  let expiresAt = 'never';
  if (durationHours > 0) {
    expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
  }

  const newInvite: InviteRecord = {
    code,
    createdBy,
    createdAt: new Date().toISOString(),
    expiresAt,
    maxUses: Math.max(1, Number(maxUses) || 1),
    usedCount: 0,
    usedBy: [],
    status: 'active',
  };

  invites.unshift(newInvite);
  saveInvites(invites);

  return res.json({ success: true, invite: newInvite });
});

// Revoke Invite (Admin only)
app.delete('/api/invites/:code', (req, res) => {
  if (!verifyAdminRequest(req)) {
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

// Register (Requires Invite Code)
app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName, avatar, role, adminSecret, inviteCode } = req.body;

  if (!username || username.trim().length < 3) {
    return res.status(400).json({ success: false, error: 'O nome de usuário deve ter no mínimo 3 caracteres.' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ success: false, error: 'A senha deve ter no mínimo 4 caracteres.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const users = getAllUsers();

  if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
    return res.status(400).json({ success: false, error: 'Este nome de usuário já está cadastrado. Escolha outro!' });
  }

  const hasValidAdminPin = !!(adminSecret && ADMIN_PIN && adminSecret === ADMIN_PIN);

  let foundInvite: InviteRecord | undefined;
  if (!hasValidAdminPin) {
    // Validate Invite Code (MANDATORY for regular new users)
    if (!inviteCode || typeof inviteCode !== 'string') {
      return res.status(403).json({
        success: false,
        error: '🔒 O Uno KaWiHe é privado! É obrigatório inserir um Código de Convite (@XXXX) válido fornecido pelo Administrador Edinho.',
      });
    }

    let cleanInvite = inviteCode.trim().toUpperCase();
    if (!cleanInvite.startsWith('@')) {
      cleanInvite = '@' + cleanInvite;
    }

    const invites = getAllInvites();
    foundInvite = invites.find((i) => i.code.toUpperCase() === cleanInvite);

    if (!foundInvite) {
      return res.status(403).json({
        success: false,
        error: `❌ Código de convite ${cleanInvite} não existe! Verifique as letras ou peça um novo ao Edinho.`,
      });
    }

    if (foundInvite.status === 'revoked') {
      return res.status(403).json({
        success: false,
        error: '❌ Este convite foi cancelado pelo Administrador.',
      });
    }

    if (foundInvite.status === 'expired' || (foundInvite.expiresAt !== 'never' && new Date(foundInvite.expiresAt) < new Date())) {
      foundInvite.status = 'expired';
      saveInvites(invites);
      return res.status(403).json({
        success: false,
        error: '⏰ Este código de convite expirou! Peça um novo convite ao Administrador Edinho.',
      });
    }

    if (foundInvite.usedCount >= foundInvite.maxUses || foundInvite.status === 'used') {
      foundInvite.status = 'used';
      saveInvites(invites);
      return res.status(403).json({
        success: false,
        error: '⚠️ Este código de convite já foi utilizado o número máximo de vezes.',
      });
    }
  }

  // Determine role: Edinho or valid adminSecret matches ADMIN_PIN
  let assignedRole: 'admin' | 'player' = 'player';
  if ((role === 'admin' || hasValidAdminPin) && hasValidAdminPin) {
    assignedRole = 'admin';
  }

  // Generate unique player tag (e.g. #1042)
  const existingTags = new Set(users.map((u) => u.tag));
  let playerTag = `#${Math.floor(1000 + Math.random() * 9000)}`;
  while (existingTags.has(playerTag)) {
    playerTag = `#${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser: UserRecord = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username: cleanUsername,
    passwordHash,
    displayName: displayName?.trim() || cleanUsername,
    avatar: avatar || '🦸‍♂️',
    role: assignedRole,
    tag: playerTag,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);

  // Mark invite as used if provided
  if (foundInvite) {
    const invites = getAllInvites();
    const inv = invites.find((i) => i.code === foundInvite?.code);
    if (inv) {
      inv.usedCount += 1;
      inv.usedBy.push({ username: cleanUsername, usedAt: new Date().toISOString() });
      if (inv.usedCount >= inv.maxUses) {
        inv.status = 'used';
      }
      saveInvites(invites);
    }
  }

  const token = jwt.sign(
    { id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.json({
    success: true,
    token,
    user: toPublicProfile(newUser),
  });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Informe usuário e senha.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const users = getAllUsers();
  const user = users.find((u) => u.username.toLowerCase() === cleanUsername);

  if (!user) {
    return res.status(401).json({ success: false, error: 'Usuário não encontrado. Peça um convite para criar sua conta!' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ success: false, error: 'Senha incorreta!' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.json({
    success: true,
    token,
    user: toPublicProfile(user),
  });
});

// Me (Check session token)
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const users = getAllUsers();
    const user = users.find((u) => u.id === decoded.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    return res.json({
      success: true,
      user: toPublicProfile(user),
    });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Sessão expirada ou inválida.' });
  }
});

// Verify Admin PIN (Edinho PIN: )
app.post('/api/auth/verify-admin-pin', (req, res) => {
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ success: false, error: 'PIN não informado.' });
  }

  const cleanPin = pin.trim();
  const isValid = !!(cleanPin && ADMIN_PIN && cleanPin === ADMIN_PIN);
  if (isValid) {
    return res.json({ success: true, message: 'PIN verificado com sucesso!' });
  } else {
    return res.status(403).json({ success: false, error: 'PIN de Administrador incorreto!' });
  }
});

// User Stats persistence
app.get('/api/user/stats', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const users = getAllUsers();
    const user = users.find((u) => u.id === decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }
    return res.json({ success: true, stats: user.stats || null });
  } catch {
    return res.status(401).json({ success: false, error: 'Sessão inválida.' });
  }
});

app.post('/api/user/stats', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const users = getAllUsers();
    const user = users.find((u) => u.id === decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    user.stats = req.body.stats;
    saveUsers(users);
    return res.json({ success: true, message: 'Estatísticas salvas com sucesso!' });
  } catch {
    return res.status(401).json({ success: false, error: 'Sessão inválida.' });
  }
});

// Admin Request Helper
function isAuthAdminRequest(req: any): boolean {
  const pinHeader = req.headers['x-admin-pin'];
  if (ADMIN_PIN && pinHeader && pinHeader === ADMIN_PIN) {
    return true;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
      if (decoded && (decoded.role === 'admin' || decoded.username?.toLowerCase() === 'edinho')) {
        return true;
      }
    } catch {}
  }
  return false;
}

// Admin Users List
app.get('/api/admin/users', (req, res) => {
  if (!isAuthAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const allUsers = getAllUsers();
  const userList = allUsers.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatar,
    role: u.role,
    tag: u.tag,
    createdAt: u.createdAt,
    isOnline: false,
    currentRoomId: null,
    roomStatus: null,
  }));

  return res.json({ success: true, users: userList });
});

// Admin Create User Direct
app.post('/api/admin/users/create', async (req, res) => {
  if (!isAuthAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const { username, password, displayName, avatar, role = 'player' } = req.body;
  if (!username || username.trim().length < 3) {
    return res.status(400).json({ success: false, error: 'O nome de usuário deve ter no mínimo 3 caracteres.' });
  }
  if (!password || password.length < 3) {
    return res.status(400).json({ success: false, error: 'A senha deve ter no mínimo 3 caracteres.' });
  }

  const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '');
  const users = getAllUsers();
  if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
    return res.status(400).json({ success: false, error: `O usuário @${cleanUsername} já existe.` });
  }

  const existingTags = new Set(users.map((u) => u.tag));
  let playerTag = `#${Math.floor(1000 + Math.random() * 9000)}`;
  while (existingTags.has(playerTag)) {
    playerTag = `#${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser: UserRecord = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username: cleanUsername,
    passwordHash,
    displayName: displayName?.trim() || cleanUsername,
    avatar: avatar || '🦸‍♂️',
    role: role === 'admin' ? 'admin' : 'player',
    tag: playerTag,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);

  return res.json({ success: true, user: toPublicProfile(newUser) });
});

// Admin Reset Password
app.post('/api/admin/users/:id/reset-password', async (req, res) => {
  if (!isAuthAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 3) {
    return res.status(400).json({ success: false, error: 'A nova senha deve ter no mínimo 3 caracteres.' });
  }

  const users = getAllUsers();
  const user = users.find((u) => u.id === req.params.id || u.username.toLowerCase() === req.params.id.toLowerCase());
  if (!user) {
    return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  saveUsers(users);

  return res.json({ success: true, message: `Senha de @${user.username} redefinida com sucesso!` });
});

// Admin Delete User
app.delete('/api/admin/users/:id', (req, res) => {
  if (!isAuthAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const users = getAllUsers();
  const index = users.findIndex((u) => u.id === req.params.id || u.username.toLowerCase() === req.params.id.toLowerCase());
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
  }

  const user = users[index];
  if (user.username.toLowerCase() === 'edinho') {
    return res.status(400).json({ success: false, error: 'Não é permitido excluir o usuário principal Edinho.' });
  }

  users.splice(index, 1);
  saveUsers(users);

  return res.json({ success: true, message: `Usuário @${user.username} excluído com sucesso.` });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔐 KaWiHe Central Auth Service running on port ${PORT}`);
  ensureDataDir();
});
