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
const LOCK_FILE = path.join(DATA_DIR, '.kawihe.lock');
const JWT_SECRET = process.env.JWT_SECRET || 'kawihe_jwt_super_secret_key_2026';
const ADMIN_PIN = process.env.ADMIN_PIN || '';

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 128;
const MIN_DISPLAY_NAME_LENGTH = 2;
const MAX_DISPLAY_NAME_LENGTH = 18;

// Shared concurrency lock matching server/dataLock.ts
let inProcessQueue: Promise<void> = Promise.resolve();
const STALE_LOCK_MS = 15_000;
const LOCK_RETRY_DELAY_MS = 15;
const LOCK_MAX_WAIT_MS = 10_000;

function ensureDirExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function atomicWriteFileSync(filePath: string, data: string): void {
  ensureDirExists(path.dirname(filePath));
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const fd = fs.openSync(tempPath, 'w');
  try {
    fs.writeSync(fd, data, 0, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
}

async function acquireAdvisoryFileLock(): Promise<() => void> {
  ensureDirExists(DATA_DIR);
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  while (true) {
    try {
      const fd = fs.openSync(LOCK_FILE, 'wx');
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }), 0, 'utf-8');
      } finally {
        fs.closeSync(fd);
      }
      return () => {
        try {
          if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
        } catch {}
      };
    } catch (err: any) {
      if (err?.code !== 'EEXIST') throw err;
      try {
        const stat = fs.statSync(LOCK_FILE);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          fs.unlinkSync(LOCK_FILE);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error('Timeout aguardando lock de persistência.');
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
    }
  }
}

async function withDataLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const prev = inProcessQueue;
  let releaseInProcess!: () => void;
  inProcessQueue = new Promise<void>((resolve) => {
    releaseInProcess = resolve;
  });
  await prev;

  let releaseFileLock: (() => void) | null = null;
  try {
    releaseFileLock = await acquireAdvisoryFileLock();
    return await fn();
  } finally {
    if (releaseFileLock) releaseFileLock();
    releaseInProcess();
  }
}

function normalizeDisplayName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFKC')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeUsername(raw: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u0000-\u001F\u007F]/g, '')
    .toLowerCase();
}

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

type UserAccountStatus = 'active' | 'disabled' | 'archived';

interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  role: 'admin' | 'player';
  tag?: string;
  createdAt: string;
  status?: UserAccountStatus;
  statusUpdatedAt?: string;
  statusReason?: string;
  stats?: any;
}

interface InviteRecord {
  code: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
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

function getEffectiveUserStatus(user: Pick<UserRecord, 'status'>): UserAccountStatus {
  return user.status === 'disabled' || user.status === 'archived' ? user.status : 'active';
}

function isUserActive(user: Pick<UserRecord, 'status'>): boolean {
  return getEffectiveUserStatus(user) === 'active';
}

function generateUniqueTag(existingTags: Set<string | undefined>): string {
  for (let i = 0; i < 5000; i++) {
    const candidate = `#${crypto.randomInt(1000, 10000)}`;
    if (!existingTags.has(candidate)) {
      existingTags.add(candidate);
      return candidate;
    }
  }
  let ext = 10000;
  while (existingTags.has(`#${ext}`)) ext++;
  return `#${ext}`;
}

function ensureDataDir() {
  ensureDirExists(DATA_DIR);

  let currentUsers: UserRecord[] = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      currentUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      if (!Array.isArray(currentUsers)) currentUsers = [];
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
        status: 'active',
      });
      usersUpdated = true;
    }
  });

  if (usersUpdated || !fs.existsSync(USERS_FILE)) {
    atomicWriteFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2));
  }

  if (!fs.existsSync(INVITES_FILE)) {
    const defaultInvite: InviteRecord = {
      code: '@KWH1',
      createdBy: 'Edinho (Sistema)',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      maxUses: 10,
      usedCount: 0,
      usedBy: [],
      status: 'active',
    };
    atomicWriteFileSync(INVITES_FILE, JSON.stringify([defaultInvite], null, 2));
  }
}

function getAllUsers(): UserRecord[] {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsers(users: UserRecord[]): void {
  ensureDataDir();
  atomicWriteFileSync(USERS_FILE, JSON.stringify(users, null, 2));
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
      atomicWriteFileSync(INVITES_FILE, JSON.stringify(invites, null, 2));
    }
    return invites;
  } catch {
    return [];
  }
}

function saveInvites(invites: InviteRecord[]): void {
  ensureDataDir();
  atomicWriteFileSync(INVITES_FILE, JSON.stringify(invites, null, 2));
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
    status: getEffectiveUserStatus(user),
    statusUpdatedAt: user.statusUpdatedAt,
    statusReason: user.statusReason,
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
    return !!(user && user.role === 'admin' && isUserActive(user));
  } catch {
    return false;
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'kawihe-auth', timestamp: new Date().toISOString() });
});

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

app.get('/api/invites', (req, res) => {
  if (!verifyAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }
  const invites = getAllInvites();
  return res.json({ success: true, invites });
});

app.post('/api/invites', async (req, res) => {
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
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let rand = '';
    for (let i = 0; i < 4; i++) {
      rand += chars.charAt(crypto.randomInt(0, chars.length));
    }
    code = `@${rand}`;
  }

  return withDataLock(() => {
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
});

app.delete('/api/invites/:code', async (req, res) => {
  if (!verifyAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  let code = req.params.code?.trim().toUpperCase();
  if (!code.startsWith('@')) code = '@' + code;

  return withDataLock(() => {
    const invites = getAllInvites();
    const invite = invites.find((i) => i.code.toUpperCase() === code);

    if (!invite) {
      return res.status(404).json({ success: false, error: 'Convite não encontrado.' });
    }

    invite.status = 'revoked';
    saveInvites(invites);

    return res.json({ success: true, message: 'Convite revogado com sucesso.' });
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName, avatar, role, adminSecret, inviteCode } = req.body;

  const cleanUsername = normalizeUsername(username || '');
  if (!cleanUsername || /\s/.test(cleanUsername) || cleanUsername.length < MIN_USERNAME_LENGTH || cleanUsername.length > MAX_USERNAME_LENGTH || !/^[a-z0-9._-]+$/.test(cleanUsername)) {
    return res.status(400).json({ success: false, error: 'O nome de usuário deve ter entre 3 e 32 caracteres válidos (letras, números, ., -, _).' });
  }
  if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ success: false, error: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.` });
  }
  const cleanDisplayName = normalizeDisplayName(displayName || cleanUsername);
  if (cleanDisplayName.length < MIN_DISPLAY_NAME_LENGTH || cleanDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return res.status(400).json({ success: false, error: `O nome de exibição deve ter entre ${MIN_DISPLAY_NAME_LENGTH} e ${MAX_DISPLAY_NAME_LENGTH} caracteres.` });
  }

  const hasValidAdminPin = !!(adminSecret && ADMIN_PIN && adminSecret === ADMIN_PIN);
  if (!hasValidAdminPin && (!inviteCode || typeof inviteCode !== 'string')) {
    return res.status(403).json({
      success: false,
      error: '🔒 O Uno KaWiHe é privado! É obrigatório inserir um Código de Convite (@XXXX) válido fornecido pelo Administrador Edinho.',
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  return withDataLock(() => {
    const users = getAllUsers();

    if (users.some((u) => normalizeUsername(u.username) === cleanUsername)) {
      return res.status(400).json({ success: false, error: 'Este nome de usuário já está cadastrado. Escolha outro!' });
    }
    if (users.some((u) => normalizeDisplayName(u.displayName).toLowerCase() === cleanDisplayName.toLowerCase())) {
      return res.status(400).json({ success: false, error: `O nome de jogador "${cleanDisplayName}" já foi escolhido por outro usuário!` });
    }

    if (!hasValidAdminPin) {
      let cleanInvite = (inviteCode || '').trim().toUpperCase();
      if (!cleanInvite.startsWith('@')) cleanInvite = '@' + cleanInvite;

      const invites = getAllInvites();
      const foundInvite = invites.find((i) => i.code.toUpperCase() === cleanInvite);

      if (!foundInvite) {
        return res.status(403).json({
          success: false,
          error: `❌ Código de convite ${cleanInvite} não existe! Verifique as letras ou peça um novo ao Edinho.`,
        });
      }
      if (foundInvite.status === 'revoked') {
        return res.status(403).json({ success: false, error: '❌ Este convite foi cancelado pelo Administrador.' });
      }
      if (foundInvite.status === 'expired' || (foundInvite.expiresAt !== 'never' && new Date(foundInvite.expiresAt) < new Date())) {
        foundInvite.status = 'expired';
        saveInvites(invites);
        return res.status(403).json({ success: false, error: '⏰ Este código de convite expirou! Peça um novo convite ao Administrador Edinho.' });
      }
      if (foundInvite.usedCount >= foundInvite.maxUses || foundInvite.status === 'used') {
        foundInvite.status = 'used';
        saveInvites(invites);
        return res.status(403).json({ success: false, error: '⚠️ Este código de convite já foi utilizado o número máximo de vezes.' });
      }

      foundInvite.usedCount += 1;
      foundInvite.usedBy.push({ username: cleanUsername, usedAt: new Date().toISOString() });
      if (foundInvite.usedCount >= foundInvite.maxUses) {
        foundInvite.status = 'used';
      }
      saveInvites(invites);
    }

    let assignedRole: 'admin' | 'player' = 'player';
    if ((role === 'admin' || hasValidAdminPin) && hasValidAdminPin) {
      assignedRole = 'admin';
    }

    const existingTags = new Set(users.map((u) => u.tag));
    const playerTag = generateUniqueTag(existingTags);

    const newUser: UserRecord = {
      id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      username: cleanUsername,
      passwordHash,
      displayName: cleanDisplayName,
      avatar: avatar || '🦸‍♂️',
      role: assignedRole,
      tag: playerTag,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    users.push(newUser);
    saveUsers(users);

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
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Informe usuário e senha.' });
  }

  const cleanUsername = normalizeUsername(username);
  const users = getAllUsers();
  const user = users.find((u) => normalizeUsername(u.username) === cleanUsername);

  if (!user) {
    return res.status(401).json({ success: false, error: 'Usuário não encontrado. Peça um convite para criar sua conta!' });
  }

  const status = getEffectiveUserStatus(user);
  if (status === 'disabled') {
    return res.status(403).json({ success: false, error: 'Esta conta foi desativada pelo administrador e não pode acessar o sistema.' });
  }
  if (status === 'archived') {
    return res.status(403).json({ success: false, error: 'Esta conta foi arquivada pelo administrador e está bloqueada para login.' });
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
    if (!isUserActive(user)) {
      return res.status(403).json({ success: false, error: 'Conta desativada ou arquivada.' });
    }

    return res.json({
      success: true,
      user: toPublicProfile(user),
    });
  } catch {
    return res.status(401).json({ success: false, error: 'Sessão expirada ou inválida.' });
  }
});

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
    if (!user || !isUserActive(user)) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado ou inativo.' });
    }
    return res.json({ success: true, stats: user.stats || null });
  } catch {
    return res.status(401).json({ success: false, error: 'Sessão inválida.' });
  }
});

app.post('/api/user/stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return await withDataLock(() => {
      const users = getAllUsers();
      const user = users.find((u) => u.id === decoded.id);
      if (!user || !isUserActive(user)) {
        return res.status(404).json({ success: false, error: 'Usuário não encontrado ou inativo.' });
      }
      user.stats = req.body.stats;
      saveUsers(users);
      return res.json({ success: true, message: 'Estatísticas salvas com sucesso!' });
    });
  } catch {
    return res.status(401).json({ success: false, error: 'Sessão inválida.' });
  }
});

function isAuthAdminRequest(req: any): boolean {
  const pinHeader = req.headers['x-admin-pin'];
  if (ADMIN_PIN && pinHeader && pinHeader === ADMIN_PIN) {
    return true;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
      const users = getAllUsers();
      const user = users.find((u) => u.id === decoded.id);
      if (user && user.role === 'admin' && isUserActive(user)) {
        return true;
      }
    } catch {}
  }
  return false;
}

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
    status: getEffectiveUserStatus(u),
    statusUpdatedAt: u.statusUpdatedAt,
    isOnline: false,
    currentRoomId: null,
    roomStatus: null,
  }));

  return res.json({ success: true, users: userList });
});

app.post('/api/admin/users/create', async (req, res) => {
  if (!isAuthAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const { username, password, displayName, avatar, role = 'player' } = req.body;
  const cleanUsername = normalizeUsername(username || '');
  if (!cleanUsername || /\s/.test(cleanUsername) || cleanUsername.length < MIN_USERNAME_LENGTH || cleanUsername.length > MAX_USERNAME_LENGTH || !/^[a-z0-9._-]+$/.test(cleanUsername)) {
    return res.status(400).json({ success: false, error: 'O nome de usuário deve ter entre 3 e 32 caracteres válidos.' });
  }
  if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ success: false, error: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.` });
  }
  const cleanDisplayName = normalizeDisplayName(displayName || cleanUsername);
  if (cleanDisplayName.length < MIN_DISPLAY_NAME_LENGTH || cleanDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return res.status(400).json({ success: false, error: `O nome de exibição deve ter entre ${MIN_DISPLAY_NAME_LENGTH} e ${MAX_DISPLAY_NAME_LENGTH} caracteres.` });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  return withDataLock(() => {
    const users = getAllUsers();
    if (users.some((u) => normalizeUsername(u.username) === cleanUsername)) {
      return res.status(400).json({ success: false, error: `O usuário @${cleanUsername} já existe.` });
    }
    if (users.some((u) => normalizeDisplayName(u.displayName).toLowerCase() === cleanDisplayName.toLowerCase())) {
      return res.status(400).json({ success: false, error: `O nome de exibição "${cleanDisplayName}" já está em uso.` });
    }

    const existingTags = new Set(users.map((u) => u.tag));
    const playerTag = generateUniqueTag(existingTags);

    const newUser: UserRecord = {
      id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      username: cleanUsername,
      passwordHash,
      displayName: cleanDisplayName,
      avatar: avatar || '🦸‍♂️',
      role: role === 'admin' ? 'admin' : 'player',
      tag: playerTag,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    users.push(newUser);
    saveUsers(users);

    return res.json({ success: true, user: toPublicProfile(newUser) });
  });
});

app.post('/api/admin/users/:id/reset-password', async (req, res) => {
  if (!isAuthAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ success: false, error: `A nova senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.` });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  return withDataLock(() => {
    const users = getAllUsers();
    const user = users.find((u) => u.id === req.params.id || u.username.toLowerCase() === req.params.id.toLowerCase());
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    user.passwordHash = passwordHash;
    saveUsers(users);

    return res.json({ success: true, message: `Senha de @${user.username} redefinida com sucesso!` });
  });
});

app.delete('/api/admin/users/:id', async (req, res) => {
  if (!isAuthAdminRequest(req)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
  }

  return withDataLock(() => {
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
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔐 KaWiHe Central Auth Service running on port ${PORT}`);
  ensureDataDir();
});
