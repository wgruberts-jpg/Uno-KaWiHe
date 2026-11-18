import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserProfile, UserRole, AuthResponse, InviteCode, UserAccountStatus, UserAccountOriginType } from '../src/types/uno.js';
import { atomicWriteFileSync, ensureDirExists, getDataDir, withDataLock } from './dataLock.js';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  role: UserRole;
  tag?: string;
  createdAt: string;
  status?: UserAccountStatus;
  statusUpdatedAt?: string;
  statusReason?: string;
  accountOriginType?: UserAccountOriginType;
  isTemporary?: boolean;
  temporaryTournamentId?: string;
  createdByImportBatchId?: string;
  createdByImportOperationId?: string;
}

export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 32;
export const MIN_PASSWORD_LENGTH = 4;
export const MAX_PASSWORD_LENGTH = 128;
export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 18;

const JWT_SECRET = process.env.JWT_SECRET || 'kawihe_jwt_super_secret_key_2026';

export function getUsersFile(): string {
  return path.join(getDataDir(), 'users.json');
}

function getInvitesFile(): string {
  return path.join(getDataDir(), 'invites.json');
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

export function normalizeDisplayName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFKC')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeUsername(raw: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u0000-\u001F\u007F]/g, '')
    .toLowerCase();
}

export function validateUsername(raw: string): {
  valid: boolean;
  clean: string;
  code?: string;
  error?: string;
} {
  const clean = normalizeUsername(raw);
  if (!clean) {
    return { valid: false, clean, code: 'MISSING_USERNAME', error: 'Nome de usuário é obrigatório.' };
  }
  if (/\s/.test(clean)) {
    return {
      valid: false,
      clean,
      code: 'INVALID_USERNAME_FORMAT',
      error: 'O nome de usuário não pode conter espaços.',
    };
  }
  if (clean.length < MIN_USERNAME_LENGTH || clean.length > MAX_USERNAME_LENGTH) {
    return {
      valid: false,
      clean,
      code: 'INVALID_USERNAME_LENGTH',
      error: `O nome de usuário deve ter entre ${MIN_USERNAME_LENGTH} e ${MAX_USERNAME_LENGTH} caracteres.`,
    };
  }
  if (!/^[a-z0-9._-]+$/.test(clean)) {
    return {
      valid: false,
      clean,
      code: 'INVALID_USERNAME_FORMAT',
      error: 'Use apenas letras, números, ponto (.), hífen (-) ou sublinhado (_) no nome de usuário.',
    };
  }
  return { valid: true, clean };
}

export function validateDisplayName(raw: string): {
  valid: boolean;
  clean: string;
  code?: string;
  error?: string;
} {
  const clean = normalizeDisplayName(raw);
  if (!clean) {
    return {
      valid: false,
      clean,
      code: 'MISSING_DISPLAY_NAME',
      error: 'O nome de exibição (displayName) é obrigatório.',
    };
  }
  if (clean.length < MIN_DISPLAY_NAME_LENGTH || clean.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      valid: false,
      clean,
      code: 'INVALID_DISPLAY_NAME_LENGTH',
      error: `O nome de exibição deve ter entre ${MIN_DISPLAY_NAME_LENGTH} e ${MAX_DISPLAY_NAME_LENGTH} caracteres.`,
    };
  }
  return { valid: true, clean };
}

export function validatePassword(raw: string): {
  valid: boolean;
  code?: string;
  error?: string;
} {
  if (typeof raw !== 'string' || raw.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      code: 'INVALID_PASSWORD',
      error: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }
  if (raw.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      code: 'INVALID_PASSWORD',
      error: `A senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`,
    };
  }
  return { valid: true };
}

export function getEffectiveUserStatus(user: Pick<UserRecord, 'status'>): UserAccountStatus {
  if (user.status === 'disabled' || user.status === 'archived') {
    return user.status;
  }
  return 'active';
}

export function isUserAccountActive(user: Pick<UserRecord, 'status'>): boolean {
  return getEffectiveUserStatus(user) === 'active';
}

export function isUserTemporaryForTournament(
  user: Pick<UserRecord, 'role' | 'username' | 'isTemporary' | 'accountOriginType' | 'temporaryTournamentId'>,
  tournamentId: string
): boolean {
  if (!tournamentId || !tournamentId.trim()) return false;
  if (user.role === 'admin' || user.username.toLowerCase() === 'edinho') return false;
  return (
    user.isTemporary === true &&
    user.accountOriginType === 'tournament_temporary' &&
    user.temporaryTournamentId === tournamentId
  );
}

export function generateUniqueTag(existingTags: Set<string | undefined>): string {
  for (let attempts = 0; attempts < 5000; attempts++) {
    const candidate = `#${crypto.randomInt(1000, 10000)}`;
    if (!existingTags.has(candidate)) {
      existingTags.add(candidate);
      return candidate;
    }
  }
  // Fallback beyond 4 digits if 9000 tags are exhausted
  let ext = 10000;
  while (existingTags.has(`#${ext}`)) ext++;
  const fallback = `#${ext}`;
  existingTags.add(fallback);
  return fallback;
}

export function buildUserRecord(params: {
  username: string;
  passwordHash: string;
  displayName: string;
  avatar?: string;
  role?: UserRole;
  existingTags: Set<string | undefined>;
  createdAt?: string;
  accountOriginType?: UserAccountOriginType;
  isTemporary?: boolean;
  temporaryTournamentId?: string;
  createdByImportBatchId?: string;
  createdByImportOperationId?: string;
}): UserRecord {
  const tag = generateUniqueTag(params.existingTags);
  const safeRole: UserRole = params.role === 'admin' ? 'admin' : 'player';
  const markTemp =
    safeRole !== 'admin' &&
    params.isTemporary === true &&
    Boolean(params.temporaryTournamentId && params.temporaryTournamentId.trim());
  return {
    id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    username: params.username,
    passwordHash: params.passwordHash,
    displayName: params.displayName,
    avatar: params.avatar || '🦸‍♂️',
    role: safeRole,
    tag,
    createdAt: params.createdAt || new Date().toISOString(),
    status: 'active',
    accountOriginType: markTemp ? 'tournament_temporary' : 'permanent',
    isTemporary: markTemp,
    temporaryTournamentId: markTemp ? params.temporaryTournamentId!.trim() : undefined,
    createdByImportBatchId: params.createdByImportBatchId,
    createdByImportOperationId: params.createdByImportOperationId,
  };
}

let initializedDataDir: string | null = null;

function ensureDataDir() {
  const dataDir = getDataDir();
  const usersFile = getUsersFile();
  const invitesFile = getInvitesFile();
  if (initializedDataDir === dataDir && fs.existsSync(usersFile) && fs.existsSync(invitesFile)) {
    return;
  }
  initializedDataDir = dataDir;

  ensureDirExists(dataDir);

  // Seed Users
  let users: UserRecord[] = [];
  if (fs.existsSync(usersFile)) {
    try {
      users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
      if (!Array.isArray(users)) users = [];
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
        status: 'active',
      });
      updated = true;
    }
  });

  if (updated || !fs.existsSync(usersFile)) {
    atomicWriteFileSync(usersFile, JSON.stringify(users, null, 2));
  }

  // Seed Invites
  if (!fs.existsSync(invitesFile)) {
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
    atomicWriteFileSync(invitesFile, JSON.stringify([defaultInvite], null, 2));
  }
}

export function getAllUsers(): UserRecord[] {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(getUsersFile(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUsers(users: UserRecord[]): void {
  ensureDataDir();
  atomicWriteFileSync(getUsersFile(), JSON.stringify(users, null, 2));
}

export function getAllInvites(): InviteCode[] {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(getInvitesFile(), 'utf-8');
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
      atomicWriteFileSync(getInvitesFile(), JSON.stringify(invites, null, 2));
    }
    return invites;
  } catch {
    return [];
  }
}

export function saveInvites(invites: InviteCode[]): void {
  ensureDataDir();
  atomicWriteFileSync(getInvitesFile(), JSON.stringify(invites, null, 2));
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
  const isTemp =
    user.role !== 'admin' &&
    user.username.toLowerCase() !== 'edinho' &&
    user.isTemporary === true &&
    user.accountOriginType === 'tournament_temporary' &&
    Boolean(user.temporaryTournamentId);
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
    accountOriginType: isTemp ? 'tournament_temporary' : 'permanent',
    isTemporary: isTemp,
    temporaryTournamentId: isTemp ? user.temporaryTournamentId : undefined,
  };
}

export function verifyAdminPin(pin?: string): boolean {
  if (!pin) return false;
  if (!process.env.ADMIN_PIN) return false;
  const cleanPin = pin.trim();
  return cleanPin === process.env.ADMIN_PIN.trim();
}

export function getUserRecordById(id: string): UserRecord | null {
  const users = getAllUsers();
  return users.find((u) => u.id === id) || null;
}

export function getUserFromToken(token: string): UserProfile | null {
  const decoded = verifyToken(token);
  if (!decoded) return null;
  const users = getAllUsers();
  const user = users.find((u) => u.id === decoded.id);
  if (!user) return null;
  if (!isUserAccountActive(user)) return null;
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

  const uCheck = validateUsername(username);
  if (!uCheck.valid) {
    return { success: false, error: uCheck.error };
  }
  const pCheck = validatePassword(password);
  if (!pCheck.valid) {
    return { success: false, error: pCheck.error };
  }

  const rawDisplay = (displayName && displayName.trim()) ? displayName : uCheck.clean;
  const dCheck = validateDisplayName(rawDisplay);
  if (!dCheck.valid) {
    return { success: false, error: dCheck.error };
  }

  const cleanUsername = uCheck.clean;
  const cleanDisplayName = dCheck.clean;
  const hasValidAdminPin = verifyAdminPin(adminSecret);

  if (!hasValidAdminPin && (!inviteCode || typeof inviteCode !== 'string')) {
    return {
      success: false,
      error: '🔒 O Uno KaWiHe é privado! É obrigatório inserir um Código de Convite (@XXXX) válido fornecido pelo Administrador Edinho.',
    };
  }

  // Hash password BEFORE acquiring the persistence lock so we never block other writers
  const passwordHash = await bcrypt.hash(password, 10);

  return withDataLock(() => {
    const users = getAllUsers();

    if (users.some((u) => normalizeUsername(u.username) === cleanUsername)) {
      return { success: false, error: 'Este nome de usuário já está cadastrado. Escolha outro!' };
    }

    if (users.some((u) => normalizeDisplayName(u.displayName).toLowerCase() === cleanDisplayName.toLowerCase())) {
      return {
        success: false,
        error: `O nome de jogador "${cleanDisplayName}" já foi escolhido por outro usuário! Quem escolheu primeiro escolheu. Escolha outro nome.`,
      };
    }

    if (!hasValidAdminPin) {
      let cleanInvite = (inviteCode || '').trim().toUpperCase();
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
    const newUser = buildUserRecord({
      username: cleanUsername,
      passwordHash,
      displayName: cleanDisplayName,
      avatar: avatar || '🦸‍♂️',
      role: assignedRole,
      existingTags,
    });

    users.push(newUser);
    saveUsers(users);

    const token = generateToken(newUser);
    return {
      success: true,
      token,
      user: toPublicProfile(newUser),
    };
  });
}

export async function loginUser(params: { username: string; password: string }): Promise<AuthResponse> {
  const { username, password } = params;

  if (!username || !password) {
    return { success: false, error: 'Informe usuário e senha.' };
  }

  const cleanUsername = normalizeUsername(username);
  const users = getAllUsers();
  const user = users.find((u) => normalizeUsername(u.username) === cleanUsername);

  if (!user) {
    return { success: false, error: 'Usuário não encontrado. Peça um convite para criar sua conta!' };
  }

  const status = getEffectiveUserStatus(user);
  if (status === 'disabled') {
    return {
      success: false,
      accountBlocked: true,
      error: 'Esta conta foi desativada pelo administrador e não pode acessar o sistema.',
    };
  }
  if (status === 'archived') {
    return {
      success: false,
      accountBlocked: true,
      error: 'Esta conta foi arquivada pelo administrador e está bloqueada para login.',
    };
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

export async function updateUserProfile(id: string, displayName: string, avatar: string): Promise<UserProfile | null> {
  const dCheck = validateDisplayName(displayName);
  if (!dCheck.valid) return null;

  return withDataLock(() => {
    const users = getAllUsers();
    const user = users.find((u) => u.id === id);
    if (!user || !isUserAccountActive(user)) return null;

    const collision = users.some(
      (u) => u.id !== id && normalizeDisplayName(u.displayName).toLowerCase() === dCheck.clean.toLowerCase()
    );
    if (collision) return null;

    user.displayName = dCheck.clean;
    user.avatar = avatar || user.avatar;
    saveUsers(users);
    return toPublicProfile(user);
  });
}

export async function adminCreateUser(params: {
  username: string;
  password: string;
  displayName?: string;
  avatar?: string;
  role?: UserRole;
  isTemporary?: boolean;
  temporaryTournamentId?: string;
}): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const { username, password, displayName, avatar, role = 'player', isTemporary, temporaryTournamentId } = params;

  if (isTemporary && role === 'admin') {
    return { success: false, error: 'Contas de administrador jamais podem ser criadas como temporárias.' };
  }
  if (isTemporary && (!temporaryTournamentId || !temporaryTournamentId.trim())) {
    return { success: false, error: 'Informe o torneio de destino ao criar um usuário temporário.' };
  }

  const uCheck = validateUsername(username);
  if (!uCheck.valid) {
    return { success: false, error: uCheck.error };
  }
  const pCheck = validatePassword(password);
  if (!pCheck.valid) {
    return { success: false, error: pCheck.error };
  }

  const rawDisplay = displayName && displayName.trim() ? displayName : uCheck.clean;
  const dCheck = validateDisplayName(rawDisplay);
  if (!dCheck.valid) {
    return { success: false, error: dCheck.error };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  return withDataLock(() => {
    const users = getAllUsers();

    if (users.some((u) => normalizeUsername(u.username) === uCheck.clean)) {
      return { success: false, error: `O usuário @${uCheck.clean} já existe no sistema.` };
    }
    if (users.some((u) => normalizeDisplayName(u.displayName).toLowerCase() === dCheck.clean.toLowerCase())) {
      return { success: false, error: `O nome de exibição "${dCheck.clean}" já está em uso por outra conta.` };
    }

    const existingTags = new Set(users.map((u) => u.tag));
    const newUser = buildUserRecord({
      username: uCheck.clean,
      passwordHash,
      displayName: dCheck.clean,
      avatar: avatar || '🦸‍♂️',
      role: role === 'admin' ? 'admin' : 'player',
      existingTags,
      accountOriginType: isTemporary ? 'tournament_temporary' : 'permanent',
      isTemporary: Boolean(isTemporary),
      temporaryTournamentId: isTemporary ? temporaryTournamentId!.trim() : undefined,
    });

    users.push(newUser);
    saveUsers(users);

    return {
      success: true,
      user: toPublicProfile(newUser),
    };
  });
}

export async function adminResetPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const pCheck = validatePassword(newPassword);
  if (!pCheck.valid) {
    return { success: false, error: pCheck.error };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  return withDataLock(() => {
    const users = getAllUsers();
    const user = users.find((u) => u.id === userId || u.username.toLowerCase() === userId.toLowerCase());

    if (!user) {
      return { success: false, error: 'Usuário não encontrado.' };
    }

    user.passwordHash = passwordHash;
    saveUsers(users);

    return { success: true, message: `Senha do usuário @${user.username} redefinida com sucesso!` };
  });
}

export async function adminDeleteUser(userId: string): Promise<{ success: boolean; message?: string; error?: string; deletedUserId?: string }> {
  return withDataLock(() => {
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

    return { success: true, message: `Usuário @${user.username} removido com sucesso.`, deletedUserId: user.id };
  });
}

export async function setUsersStatus(
  userIds: string[],
  nextStatus: UserAccountStatus,
  reason?: string
): Promise<{ updatedIds: string[]; skippedIds: string[] }> {
  const idSet = new Set(userIds);
  return withDataLock(() => {
    const users = getAllUsers();
    const now = new Date().toISOString();
    const updatedIds: string[] = [];
    const skippedIds: string[] = [];

    for (const user of users) {
      if (!idSet.has(user.id)) continue;
      if (user.username.toLowerCase() === 'edinho' || user.role === 'admin') {
        skippedIds.push(user.id);
        continue;
      }
      user.status = nextStatus;
      user.statusUpdatedAt = now;
      if (reason && reason.trim()) {
        user.statusReason = reason.trim();
      } else if (nextStatus === 'active') {
        delete user.statusReason;
      }
      updatedIds.push(user.id);
    }

    if (updatedIds.length > 0) {
      saveUsers(users);
    }
    return { updatedIds, skippedIds };
  });
}

export async function removeUsersByIds(userIds: string[]): Promise<{ deletedIds: string[]; skippedIds: string[] }> {
  const idSet = new Set(userIds);
  return withDataLock(() => {
    const users = getAllUsers();
    const deletedIds: string[] = [];
    const skippedIds: string[] = [];
    const remaining: UserRecord[] = [];

    for (const user of users) {
      if (!idSet.has(user.id)) {
        remaining.push(user);
        continue;
      }
      if (user.username.toLowerCase() === 'edinho' || user.role === 'admin') {
        skippedIds.push(user.id);
        remaining.push(user);
        continue;
      }
      deletedIds.push(user.id);
    }

    if (deletedIds.length > 0) {
      saveUsers(remaining);
    }
    return { deletedIds, skippedIds };
  });
}
