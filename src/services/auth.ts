import {
  AuthResponse,
  UserProfile,
  UserRole,
  InviteCode,
  ImportBatch,
  ImportBatchDetailUser,
  ImportDelimiter,
  ImportImpactReport,
  ImportOperationMode,
  ImportSourceType,
  ImportUserManageAction,
  ImportValidationResponse,
} from '../types/uno.js';

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

  public async updateProfile(displayName: string, avatar: string): Promise<boolean> {
    if (!this.token) return false;
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ displayName, avatar }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.user = data.user;
        localStorage.setItem('uno_nickname', data.user.displayName);
        localStorage.setItem('uno_avatar', data.user.avatar);
        this.notify();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update profile:', err);
      return false;
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

  public async adminCreateUser(params: {
    username: string;
    password: string;
    displayName?: string;
    avatar?: string;
    role?: UserRole;
  }): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(params),
      });
      return await res.json();
    } catch {
      return { success: false, error: 'Erro ao conectar com o servidor.' };
    }
  }

  public async adminResetPassword(
    userId: string,
    newPassword: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ newPassword }),
      });
      return await res.json();
    } catch {
      return { success: false, error: 'Erro ao conectar com o servidor.' };
    }
  }

  public async adminDeleteUser(
    userId: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });
      return await res.json();
    } catch {
      return { success: false, error: 'Erro ao conectar com o servidor.' };
    }
  }

  public async validateBulkImport(params: {
    rawText: string;
    mode: ImportOperationMode;
    delimiter?: ImportDelimiter | 'auto';
    tournamentId?: string;
    ignoreExistingUsers?: boolean;
  }): Promise<ImportValidationResponse> {
    if (!this.token) {
      return { success: false, mode: params.mode, rows: [], error: 'Não autenticado como administrador.' };
    }
    try {
      const res = await fetch('/api/admin/import/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(params),
      });
      return await res.json();
    } catch {
      return { success: false, mode: params.mode, rows: [], error: 'Erro ao validar importação no servidor.' };
    }
  }

  public async commitBulkImport(params: {
    rawText: string;
    mode: ImportOperationMode;
    sourceType: ImportSourceType;
    delimiter?: ImportDelimiter | 'auto';
    tournamentId?: string;
    ignoreExistingUsers?: boolean;
    name: string;
    importTag?: string;
    description?: string;
    idempotencyKey?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    batch?: ImportBatch;
    validation?: ImportValidationResponse;
    idempotentHit?: boolean;
  }> {
    if (!this.token) {
      return { success: false, error: 'Não autenticado como administrador.' };
    }
    try {
      const res = await fetch('/api/admin/import/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(params),
      });
      return await res.json();
    } catch {
      return { success: false, error: 'Erro de conexão ao gravar importação em massa.' };
    }
  }

  public async downloadImportTemplate(mode: ImportOperationMode): Promise<void> {
    if (!this.token) return;
    try {
      const res = await fetch(`/api/admin/import/template?mode=${encodeURIComponent(mode)}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `modelo_importacao_${mode}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  }

  public async listImportBatches(filters?: {
    search?: string;
    mode?: ImportOperationMode | 'all';
    status?: string;
  }): Promise<{ success: boolean; batches: ImportBatch[]; error?: string }> {
    if (!this.token) return { success: false, batches: [], error: 'Não autenticado.' };
    try {
      const qs = new URLSearchParams();
      if (filters?.search) qs.set('search', filters.search);
      if (filters?.mode && filters.mode !== 'all') qs.set('mode', filters.mode);
      if (filters?.status && filters.status !== 'all') qs.set('status', filters.status);
      const res = await fetch(`/api/admin/import/batches?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return await res.json();
    } catch {
      return { success: false, batches: [], error: 'Erro ao carregar histórico de lotes.' };
    }
  }

  public async getImportBatchDetail(batchId: string): Promise<{
    success: boolean;
    batch?: ImportBatch;
    users?: ImportBatchDetailUser[];
    error?: string;
  }> {
    if (!this.token) return { success: false, error: 'Não autenticado.' };
    try {
      const res = await fetch(`/api/admin/import/batches/${encodeURIComponent(batchId)}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return await res.json();
    } catch {
      return { success: false, error: 'Erro ao carregar detalhes do lote.' };
    }
  }

  public async analyzeImportUsersImpact(
    batchId: string,
    userIds: string[],
    action: ImportUserManageAction
  ): Promise<{ success: boolean; impact?: ImportImpactReport; error?: string }> {
    if (!this.token) return { success: false, error: 'Não autenticado.' };
    try {
      const res = await fetch(`/api/admin/import/batches/${encodeURIComponent(batchId)}/users/impact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ userIds, action }),
      });
      return await res.json();
    } catch {
      return { success: false, error: 'Erro ao analisar impacto nos usuários.' };
    }
  }

  public async manageImportBatchUsers(params: {
    batchId: string;
    userIds: string[];
    action: ImportUserManageAction;
    reason?: string;
  }): Promise<{
    success: boolean;
    affectedUserIds?: string[];
    skipped?: Array<{ userId: string; username: string; reason: string }>;
    error?: string;
  }> {
    if (!this.token) return { success: false, error: 'Não autenticado.' };
    try {
      const res = await fetch(`/api/admin/import/batches/${encodeURIComponent(params.batchId)}/users/manage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          userIds: params.userIds,
          action: params.action,
          reason: params.reason,
        }),
      });
      return await res.json();
    } catch {
      return { success: false, error: 'Erro ao executar gestão dos usuários do lote.' };
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
