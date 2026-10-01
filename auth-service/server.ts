import express from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'kawihe_jwt_super_secret_key_2026';
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

// Standard CORS Headers (Zero external dependencies)
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
  createdAt: string;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
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

function toPublicProfile(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'kawihe-auth', timestamp: new Date().toISOString() });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName, avatar, role, adminSecret } = req.body;

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

  let assignedRole: 'admin' | 'player' = 'player';
  if (role === 'admin' && adminSecret === ADMIN_PIN) {
    assignedRole = 'admin';
  } else if (users.length === 0) {
    assignedRole = 'admin';
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser: UserRecord = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username: cleanUsername,
    passwordHash,
    displayName: displayName?.trim() || cleanUsername,
    avatar: avatar || '🦸‍♂️',
    role: assignedRole,
    createdAt: new Date().toISOString(),
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
    return res.status(401).json({ success: false, error: 'Usuário não encontrado.' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ success: false, error: 'Senha incorreta.' });
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

// Verify Admin PIN (for unlocking cheat options)
app.post('/api/auth/verify-admin-pin', (req, res) => {
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ success: false, error: 'PIN não informado.' });
  }

  const isValid = pin.trim() === ADMIN_PIN.trim();
  if (isValid) {
    return res.json({ success: true, message: 'PIN verificado com sucesso!' });
  } else {
    return res.status(403).json({ success: false, error: 'PIN de Administrador incorreto!' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔐 KaWiHe Central Auth Service running on port ${PORT}`);
});
