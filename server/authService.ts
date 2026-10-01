import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserProfile, UserRole, AuthResponse } from '../src/types/uno.js';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  role: UserRole;
  createdAt: string;
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'kawihe_jwt_super_secret_key_2026';
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    // Seed default admin account
    const defaultAdminHash = bcrypt.hashSync('admin123', 10);
    const initialUsers: UserRecord[] = [
      {
        id: 'usr_admin_master',
        username: 'admin',
        passwordHash: defaultAdminHash,
        displayName: 'Administrador KaWiHe',
        avatar: '👑',
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), 'utf-8');
  }
}

export function getAllUsers(): UserRecord[] {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading users file:', err);
    return [];
  }
}

export function saveUsers(users: UserRecord[]): void {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
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
    createdAt: user.createdAt,
  };
}

export async function registerUser(params: {
  username: string;
  password: string;
  displayName: string;
  avatar: string;
  role?: UserRole;
  adminSecret?: string;
}): Promise<AuthResponse> {
  const { username, password, displayName, avatar, role, adminSecret } = params;

  if (!username || username.trim().length < 3) {
    return { success: false, error: 'O nome de usuário deve ter no mínimo 3 caracteres.' };
  }
  if (!password || password.length < 4) {
    return { success: false, error: 'A senha deve ter no mínimo 4 caracteres.' };
  }

  const cleanUsername = username.trim().toLowerCase();
  const users = getAllUsers();

  if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
    return { success: false, error: 'Este nome de usuário já está cadastrado. Escolha outro!' };
  }

  // Determine role: if adminSecret matches ADMIN_PIN or first user, grant admin
  let assignedRole: UserRole = 'player';
  if (role === 'admin' && adminSecret === ADMIN_PIN) {
    assignedRole = 'admin';
  } else if (users.length === 0) {
    assignedRole = 'admin';
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const newUser: UserRecord = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username: cleanUsername,
    passwordHash,
    displayName: displayName.trim() || cleanUsername,
    avatar: avatar || '🦸‍♂️',
    role: assignedRole,
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

export async function loginUser(params: {
  username: string;
  password: string;
}): Promise<AuthResponse> {
  const { username, password } = params;

  if (!username || !password) {
    return { success: false, error: 'Informe usuário e senha.' };
  }

  const cleanUsername = username.trim().toLowerCase();
  const users = getAllUsers();
  const user = users.find((u) => u.username.toLowerCase() === cleanUsername);

  if (!user) {
    return { success: false, error: 'Usuário não encontrado.' };
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return { success: false, error: 'Senha incorreta.' };
  }

  const token = generateToken(user);
  return {
    success: true,
    token,
    user: toPublicProfile(user),
  };
}

export function getUserFromToken(token: string): UserProfile | null {
  const decoded = verifyToken(token);
  if (!decoded) return null;

  const users = getAllUsers();
  const user = users.find((u) => u.id === decoded.id);
  return user ? toPublicProfile(user) : null;
}

export function verifyAdminPin(pin: string): boolean {
  if (!pin) return false;
  return pin.trim() === ADMIN_PIN.trim();
}
