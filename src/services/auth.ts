import { AuthResponse, UserProfile, UserRole, InviteCode } from '../types/uno.js';

const TOKEN_KEY = 'kawihe_auth_token';

class AuthService {
  private user: UserProfile | null = null;
  private token: string | null = null;
  private isAdminUnlockedForSession: boolean = false;
  private listeners: ((user: UserProfile | null) => void)[] = [];

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  public getToken(): string | null {
    return this.token;
  }

  public getCurrentUser(): UserProfile | null {
    return this.user;
  }

  public isAdmin(): boolean {
    return this.user?.role === 'admin' || this.isAdminUnlockedForSession;
  }

  public setAdminUnlocked(unlocked: boolean) {
    this.isAdminUnlockedForSession = unlocked;
    this.notify();
  }

  public subscribe(listener: (user: UserProfile | null) => void): () => void {
    this.listeners.push(listener);
    listener(this.user);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.user));
  }

  public async initSession(): Promise<UserProfile | null> {
    if (!this.token) {
      this.user = null;
      this.notify();
      return null;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!res.ok) {
        this.logout();
        return null;
      }

      const data = await res.json();
      if (data.success && data.user) {
        this.user = data.user;
        if (data.user.role === 'admin') {
          this.isAdminUnlockedForSession = true;
        }
        this.notify();
        return this.user;
      } else {
        this.logout();
        return null;
      }
    } catch (err) {
      console.error('Failed to init auth session:', err);
      return null;
    }
  }

  public async login(username: string, password: string): Promise<AuthResponse> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data: AuthResponse = await res.json();
      if (data.success && data.token && data.user) {
        this.token = data.token;
        this.user = data.user;
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem('uno_nickname', data.user.displayName);
        localStorage.setItem('uno_avatar', data.user.avatar);
        if (data.user.role === 'admin') {
          this.isAdminUnlockedForSession = true;
        }
        this.notify();
      }
      return data;
    } catch (err) {
      return { success: false, error: 'Falha de conexão com o servidor de login.' };
    }
  }

  public async register(params: {
    username: string;
    password: string;
    displayName: string;
    avatar: string;
    role?: UserRole;
    adminSecret?: string;
    inviteCode?: string;
  }): Promise<AuthResponse> {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data: AuthResponse = await res.json();
      if (data.success && data.token && data.user) {
        this.token = data.token;
        this.user = data.user;
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem('uno_nickname', data.user.displayName);
        localStorage.setItem('uno_avatar', data.user.avatar);
        if (data.user.role === 'admin') {
          this.isAdminUnlockedForSession = true;
        }
        this.notify();
      }
      return data;
    } catch (err) {
      return { success: false, error: 'Falha de conexão com o servidor ao cadastrar.' };
    }
  }

  public async verifyAdminPin(pin: string): Promise<boolean> {
    try {
      const res = await fetch('/api/auth/verify-admin-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();
      if (data.success) {
        this.isAdminUnlockedForSession = true;
        this.notify();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async validateInvite(code: string): Promise<{ valid: boolean; code?: string; expiresAt?: string; remainingUses?: number; error?: string }> {
    try {
      let clean = code.trim().toUpperCase();
      if (!clean.startsWith('@')) clean = '@' + clean;
      const res = await fetch(`/api/invites/validate/${encodeURIComponent(clean)}`);
      return await res.json();
    } catch {
      return { valid: false, error: 'Erro de conexão ao validar convite.' };
    }
  }

  public async getInvites(): Promise<InviteCode[]> {
    if (!this.token) return [];
    try {
      const res = await fetch('/api/invites', {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return data.invites || [];
      }
      return [];
    } catch {
      return [];
    }
  }

  public async createInvite(params: {
    durationHours: number;
    maxUses: number;
    customCode?: string;
  }): Promise<{ success: boolean; invite?: InviteCode; error?: string }> {
    if (!this.token) return { success: false, error: 'Não autenticado como administrador.' };
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          ...params,
          createdBy: this.user?.displayName || 'Edinho',
        }),
      });
      return await res.json();
    } catch {
      return { success: false, error: 'Erro ao gerar convite no servidor.' };
    }
  }

  public async revokeInvite(code: string): Promise<boolean> {
    if (!this.token) return false;
    try {
      let clean = code.trim().toUpperCase();
      if (!clean.startsWith('@')) clean = '@' + clean;
      const res = await fetch(`/api/invites/${encodeURIComponent(clean)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public logout() {
    this.token = null;
    this.user = null;
    this.isAdminUnlockedForSession = false;
    localStorage.removeItem(TOKEN_KEY);
    this.notify();
  }
}

export const auth = new AuthService();
