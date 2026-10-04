import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserProfile, UserRole, AuthResponse, InviteCode } from '../src/types/uno.js';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  role: UserRole;
  tag?: string;
  createdAt: string;
}

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

const INITIAL_USERS: Array<{
  username: string;
  getPassword: () => string;
  displayName: string;
  avatar: string;
  role: UserRole;
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


function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Seed Users
  let users: UserRecord[] = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
      users = [];
    }
  }

  let updated = false;
  INITIAL_USERS.forEach((init) => {
    const exists = users.some((u) => u.username.toLowerCase() === init.username.toLowerCase());
    if (!exists) {
      users.push({
        id: `usr_${init.username}`,
        username: init.username,
        passwordHash: bcrypt.hashSync(init.getPassword(), 12),
        displayName: init.displayName,
        avatar: init.avatar,
        role: init.role,
        tag: init.tag,
        createdAt: new Date().toISOString(),
      });
      updated = true;
    }
  });

  if (updated || !fs.existsSync(USERS_FILE)) {
    atomicWriteFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  }

  // Seed Invites
  if (!fs.existsSync(INVITES_FILE)) {
    const defaultInvite: InviteCode = {
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

export function normalizeDisplayName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFKC')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '')
    .replace(/\s+/g, ' ');
}

export function getAllUsers(): UserRecord[] {

  ensureDataDir();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

export function saveUsers(users: UserRecord[]): void {
  ensureDataDir();
  atomicWriteFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export function getAllInvites(): InviteCode[] {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(INVITES_FILE, 'utf-8');
    const invites: InviteCode[] = JSON.parse(raw);
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

export function saveInvites(invites: InviteCode[]): void {
  ensureDataDir();
  atomicWriteFileSync(INVITES_FILE, JSON.stringify(invites, null, 2));
}


export function generateToken(user: UserRecord): string {
  const payload = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { id: string; username: string; role: UserRole } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return decoded;
  } catch {
    return null;
  }
}

export function toPublicProfile(user: UserRecord): UserProfile {
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

export function verifyAdminPin(pin?: string): boolean {
  if (!pin) return false;
  if (!process.env.ADMIN_PIN) return false; // Disabled if no ADMIN_PIN set in environment
  const cleanPin = pin.trim();
  return cleanPin === process.env.ADMIN_PIN.trim();
}

export function getUserFromToken(token: string): UserProfile | null {
  const decoded = verifyToken(token);
  if (!decoded) return null;
  const users = getAllUsers();
  const user = users.find((u) => u.id === decoded.id);
  if (!user) return null;
  return toPublicProfile(user);
}

export async function registerUser(params: {
  username: string;
  password: string;
  displayName: string;
  avatar: string;
  role?: UserRole;
  adminSecret?: string;
  inviteCode?: string;
}): Promise<AuthResponse> {
  const { username, password, displayName, avatar, role, adminSecret, inviteCode } = params;

  if (!username || username.trim().length < 3) {
    return { success: false, error: 'O nome de usuário deve ter no mínimo 3 caracteres.' };
  }
  if (!password || password.length < 4) {
    return { success: false, error: 'A senha deve ter no mínimo 4 caracteres.' };
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanDisplayName = (displayName || username).trim();
  const users = getAllUsers();

  if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
    return { success: false, error: 'Este nome de usuário já está cadastrado. Escolha outro!' };
  }

  if (users.some((u) => u.displayName.trim().toLowerCase() === cleanDisplayName.toLowerCase())) {
    return { success: false, error: `O nome de jogador "${cleanDisplayName}" já foi escolhido por outro usuário! Quem escolheu primeiro escolheu. Escolha outro nome.` };
  }

  const hasValidAdminPin = verifyAdminPin(adminSecret);

  // Validate Invite Code (MANDATORY for regular players without Admin PIN)
  if (!hasValidAdminPin) {
    if (!inviteCode || typeof inviteCode !== 'string') {
      return {
        success: false,
        error: '🔒 O Uno KaWiHe é privado! É obrigatório inserir um Código de Convite (@XXXX) válido fornecido pelo Administrador Edinho.',
      };
    }

    let cleanInvite = inviteCode.trim().toUpperCase();
    if (!cleanInvite.startsWith('@')) {
      cleanInvite = '@' + cleanInvite;
    }

    const invites = getAllInvites();
    const foundInvite = invites.find((i) => i.code.toUpperCase() === cleanInvite);

    if (!foundInvite) {
      return {
        success: false,
        error: `❌ Código de convite ${cleanInvite} não existe! Verifique as letras ou peça um novo ao Edinho.`,
      };
    }

    if (foundInvite.status === 'revoked') {
      return { success: false, error: '❌ Este convite foi cancelado pelo Administrador.' };
    }

    if (foundInvite.status === 'expired' || (foundInvite.expiresAt !== 'never' && new Date(foundInvite.expiresAt) < new Date())) {
      foundInvite.status = 'expired';
      saveInvites(invites);
      return { success: false, error: '⏰ Este código de convite expirou! Peça um novo convite ao Administrador Edinho.' };
    }

    if (foundInvite.usedCount >= foundInvite.maxUses || foundInvite.status === 'used') {
      foundInvite.status = 'used';
      saveInvites(invites);
      return { success: false, error: '⚠️ Este código de convite já foi utilizado o número máximo de vezes.' };
    }

    // Mark invite used
    foundInvite.usedCount += 1;
    foundInvite.usedBy.push({ username: cleanUsername, usedAt: new Date().toISOString() });
    if (foundInvite.usedCount >= foundInvite.maxUses) {
      foundInvite.status = 'used';
    }
    saveInvites(invites);
  }

  let assignedRole: UserRole = 'player';
  if ((role === 'admin' || hasValidAdminPin) && hasValidAdminPin) {
    assignedRole = 'admin';
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
    role: assignedRole,
    tag: playerTag,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);

  const token = generateToken(newUser);
  return {
    success: true,
    token,
    user: toPublicProfile(newUser),
  };
}

export async function loginUser(params: { username: string; password: string }): Promise<AuthResponse> {
  const { username, password } = params;

  if (!username || !password) {
    return { success: false, error: 'Informe usuário e senha.' };
  }

  const cleanUsername = username.trim().toLowerCase();
  const users = getAllUsers();
  const user = users.find((u) => u.username.toLowerCase() === cleanUsername);

  if (!user) {
    return { success: false, error: 'Usuário não encontrado. Peça um convite para criar sua conta!' };
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return { success: false, error: 'Senha incorreta!' };
  }

  const token = generateToken(user);
  return {
    success: true,
    token,
    user: toPublicProfile(user),
  };
}

export function updateUserProfile(id: string, displayName: string, avatar: string): UserProfile | null {
  const users = getAllUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  user.displayName = displayName.trim();
  user.avatar = avatar;
  saveUsers(users);
  return toPublicProfile(user);
}

export async function adminCreateUser(params: {
  username: string;
  password: string;
  displayName?: string;
  avatar?: string;
  role?: UserRole;
}): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const { username, password, displayName, avatar, role = 'player' } = params;

  if (!username || username.trim().length < 3) {
    return { success: false, error: 'O nome de usuário deve ter no mínimo 3 caracteres.' };
  }
  if (!password || password.length < 3) {
    return { success: false, error: 'A senha deve ter no mínimo 3 caracteres.' };
  }

  const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '');
  const users = getAllUsers();

  if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
    return { success: false, error: `O usuário @${cleanUsername} já existe no sistema.` };
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

  return {
    success: true,
    user: toPublicProfile(newUser),
  };
}

export async function adminResetPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!newPassword || newPassword.length < 3) {
    return { success: false, error: 'A nova senha deve ter no mínimo 3 caracteres.' };
  }

  const users = getAllUsers();
  const user = users.find((u) => u.id === userId || u.username.toLowerCase() === userId.toLowerCase());

  if (!user) {
    return { success: false, error: 'Usuário não encontrado.' };
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  saveUsers(users);

  return { success: true, message: `Senha do usuário @${user.username} redefinida com sucesso!` };
}

export function adminDeleteUser(userId: string): { success: boolean; message?: string; error?: string } {
  const users = getAllUsers();
  const index = users.findIndex((u) => u.id === userId || u.username.toLowerCase() === userId.toLowerCase());

  if (index === -1) {
    return { success: false, error: 'Usuário não encontrado.' };
  }

  const user = users[index];
  if (user.username.toLowerCase() === 'edinho') {
    return { success: false, error: 'Não é permitido excluir o usuário principal Edinho.' };
  }

  users.splice(index, 1);
  saveUsers(users);

  return { success: true, message: `Usuário @${user.username} removido com sucesso.` };
}
