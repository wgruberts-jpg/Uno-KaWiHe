import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  InviteCode,
  TournamentTempUserSummary,
  TournamentTempUsersChallengeResponse,
} from '../src/types/uno.js';
import {
  getAllInvites,
  getAllUsers,
  getUsersFile,
  isUserTemporaryForTournament,
  normalizeDisplayName,
  saveUsers,
  UserRecord,
} from './authService.js';
import { atomicWriteFileSync, ensureDirExists, getDataDir, withDataLock } from './dataLock.js';
import {
  isTournamentOpenForRegistration,
  Tournament,
} from './tournamentEngine.js';
import { RoomData } from './unoEngine.js';

export interface MathChallengeRecord {
  challengeId: string;
  tournamentId: string;
  adminUserId: string;
  action: 'delete_tournament_temporary_users';
  operandA: number;
  operandB: number;
  expectedAnswer: number;
  question: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  failedAttempts: number;
}

export interface TournamentAuditLogEntry {
  id: string;
  at: string;
  timestampMs: number;
  action: 'tournament_closed' | 'tournament_rescheduled' | 'tournament_edited' | 'temp_users_deleted' | 'temp_users_cleanup_blocked';
  actorUserId: string;
  actorUsername: string;
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: string;
  deletedCount?: number;
  deletedUsers?: Array<{ id: string; username: string; displayName: string; tag?: string }>;
  preservedPermanentUsersCount?: number;
  details: string;
}

export interface TempUsersCleanupAnalysis {
  tournamentExists: boolean;
  canExecute: boolean;
  blockingReasons: string[];
  temporaryUsers: UserRecord[];
  permanentUsersPreservedCount: number;
}

const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_ATTEMPTS = 3;
const challengeStore = new Map<string, MathChallengeRecord>();

function pruneExpiredChallenges(nowMs: number): void {
  for (const [id, rec] of challengeStore.entries()) {
    if (nowMs - rec.createdAt > 30 * 60 * 1000 || (rec.used && nowMs > rec.expiresAt)) {
      challengeStore.delete(id);
    }
  }
}

export function _resetChallengesForTest(): void {
  challengeStore.clear();
}

export function _forceExpireChallengeForTest(challengeId: string): void {
  const rec = challengeStore.get(challengeId);
  if (rec) {
    rec.expiresAt = Date.now() - 1000;
  }
}

export function getTournamentAuditFile(): string {
  return path.join(getDataDir(), 'tournament_audit.json');
}

export function loadTournamentAuditLogs(): TournamentAuditLogEntry[] {
  const file = getTournamentAuditFile();
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTournamentAuditLogsStrict(logs: TournamentAuditLogEntry[]): void {
  ensureDirExists(getDataDir());
  atomicWriteFileSync(getTournamentAuditFile(), JSON.stringify(logs, null, 2));
}

export function appendTournamentAuditLogStrict(entry: TournamentAuditLogEntry): void {
  const logs = loadTournamentAuditLogs();
  logs.unshift(entry);
  saveTournamentAuditLogsStrict(logs);
}

export function analyzeTournamentTempUsersCleanup(params: {
  tournamentId: string;
  tournamentsMap: Map<string, Tournament>;
  users: readonly UserRecord[];
  roomsMap: Map<string, RoomData>;
  invites: readonly InviteCode[];
}): TempUsersCleanupAnalysis {
  const { tournamentId, tournamentsMap, users, roomsMap, invites } = params;
  const tournament = tournamentsMap.get(tournamentId);
  if (!tournament) {
    return {
      tournamentExists: false,
      canExecute: false,
      blockingReasons: ['Torneio não encontrado.'],
      temporaryUsers: [],
      permanentUsersPreservedCount: 0,
    };
  }

  // Strictly identify temporary users via explicit metadata ONLY (zero heuristics!)
  const temporaryUsers = users.filter((u) => isUserTemporaryForTournament(u, tournamentId));
  const tempIdSet = new Set(temporaryUsers.map((u) => u.id));

  // Count permanent users linked to this tournament for transparent reporting
  const permanentIds = new Set<string>();
  for (const entry of tournament.entries) {
    for (const uid of entry.userIds) {
      if (!tempIdSet.has(uid)) {
        permanentIds.add(uid);
      }
    }
  }

  const blockingReasons: string[] = [];

  if (tournament.status === 'running' || tournament.status === 'paused') {
    blockingReasons.push(
      `O torneio "${tournament.config.name}" está com status "${tournament.status}". Encerre ou finalize o torneio antes de excluir seus usuários temporários.`
    );
  }

  if (temporaryUsers.length === 0) {
    blockingReasons.push(
      'Nenhum usuário temporário exclusivo deste torneio foi encontrado para exclusão. Usuários permanentes são sempre preservados.'
    );
  }

  // Check every candidate temporary user for dependencies across other tournaments, active rooms, or invites
  for (const tempUser of temporaryUsers) {
    // 1. Defensive guard: never allow admin or permanent user in this list
    if (tempUser.role === 'admin' || tempUser.username.toLowerCase() === 'edinho') {
      blockingReasons.push(`Conta administrativa protegida detectada (@${tempUser.username}). Operação abortada.`);
      continue;
    }

    // 2. Other tournaments dependency check
    for (const otherT of tournamentsMap.values()) {
      if (otherT.config.id === tournamentId) continue;
      const inEntries = otherT.entries.some((e) => e.userIds.includes(tempUser.id));
      const isCreator = otherT.createdByUserId === tempUser.id;
      const inRounds = otherT.rounds.some((r) =>
        r.groups.some((g) =>
          g.entryIds.some((eid) => otherT.entries.find((e) => e.id === eid)?.userIds.includes(tempUser.id))
        )
      );
      if (inEntries || isCreator || inRounds) {
        blockingReasons.push(
          `Usuário temporário @${tempUser.username} possui vínculo com outro torneio ("${otherT.config.name}").`
        );
      }
    }

    // 3. Active rooms dependency check
    const unameLower = tempUser.username.toLowerCase();
    const displayLower = normalizeDisplayName(tempUser.displayName).toLowerCase();
    for (const room of roomsMap.values()) {
      const seated = room.players.some(
        (p) =>
          !p.isBot &&
          (p.userId === tempUser.id ||
            p.name.toLowerCase() === unameLower ||
            p.name.toLowerCase() === displayLower)
      );
      const spectating = (room.spectators || []).some(
        (s) => s.id === `spectator-${tempUser.id}` || s.name.toLowerCase().includes(unameLower)
      );

      if (!seated && !spectating) continue;

      if (!room.tournamentId) {
        blockingReasons.push(
          `Usuário temporário @${tempUser.username} está presente em uma sala casual ativa (#${room.id}).`
        );
      } else if (room.tournamentId !== tournamentId) {
        blockingReasons.push(
          `Usuário temporário @${tempUser.username} está alocado na sala #${room.id} de outro torneio.`
        );
      } else if (room.status === 'playing' || room.status === 'paused') {
        blockingReasons.push(
          `Usuário temporário @${tempUser.username} está em uma partida em andamento na sala #${room.id}.`
        );
      }
    }

    // 4. Invite history check
    const usedInvite = invites.some((inv) =>
      inv.usedBy.some((u) => u.username.toLowerCase() === unameLower)
    );
    if (usedInvite) {
      blockingReasons.push(
        `Usuário temporário @${tempUser.username} possui registro de uso de convite.`
      );
    }
  }

  return {
    tournamentExists: true,
    canExecute: blockingReasons.length === 0 && temporaryUsers.length > 0,
    blockingReasons,
    temporaryUsers,
    permanentUsersPreservedCount: permanentIds.size,
  };
}

export function createTournamentTempUsersChallenge(params: {
  tournamentId: string;
  actor: { id: string; username: string; role: string };
  tournamentsMap: Map<string, Tournament>;
  roomsMap: Map<string, RoomData>;
  ttlMs?: number;
}): TournamentTempUsersChallengeResponse {
  const { tournamentId, actor, tournamentsMap, roomsMap, ttlMs = DEFAULT_CHALLENGE_TTL_MS } = params;
  const nowMs = Date.now();
  pruneExpiredChallenges(nowMs);

  const tournament = tournamentsMap.get(tournamentId);
  if (!tournament) {
    return {
      success: false,
      error: 'Torneio não encontrado.',
      canExecute: false,
      blockingReasons: ['Torneio não encontrado.'],
      tournament: { id: tournamentId, name: '', status: 'unknown' },
      temporaryUsersCount: 0,
      temporaryUsers: [],
      permanentUsersPreservedCount: 0,
    };
  }

  const users = getAllUsers();
  const invites = getAllInvites();
  const analysis = analyzeTournamentTempUsersCleanup({
    tournamentId,
    tournamentsMap,
    users,
    roomsMap,
    invites,
  });

  const summaries: TournamentTempUserSummary[] = analysis.temporaryUsers.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    tag: u.tag,
    createdAt: u.createdAt,
  }));

  let challenge: TournamentTempUsersChallengeResponse['challenge'];
  if (analysis.canExecute && summaries.length > 0) {
    const operandA = crypto.randomInt(10, 50);
    const operandB = crypto.randomInt(10, 50);
    const challengeId = crypto.randomUUID();
    const record: MathChallengeRecord = {
      challengeId,
      tournamentId,
      adminUserId: actor.id,
      action: 'delete_tournament_temporary_users',
      operandA,
      operandB,
      expectedAnswer: operandA + operandB,
      question: `${operandA} + ${operandB} = ?`,
      createdAt: nowMs,
      expiresAt: nowMs + ttlMs,
      used: false,
      failedAttempts: 0,
    };
    challengeStore.set(challengeId, record);
    challenge = {
      challengeId,
      question: record.question,
      expiresAt: record.expiresAt,
    };
  }

  return {
    success: true,
    canExecute: analysis.canExecute,
    blockingReasons: analysis.blockingReasons,
    tournament: {
      id: tournament.config.id,
      name: tournament.config.name,
      status: tournament.status,
    },
    temporaryUsersCount: summaries.length,
    temporaryUsers: summaries,
    permanentUsersPreservedCount: analysis.permanentUsersPreservedCount,
    challenge,
  };
}

export function validateAndConsumeMathChallenge(params: {
  challengeId: string;
  answer: unknown;
  tournamentId: string;
  adminUserId: string;
  nowMs?: number;
}): { valid: true; challenge: MathChallengeRecord } | { valid: false; code: string; status: number; error: string } {
  const nowMs = params.nowMs ?? Date.now();
  const cleanId = String(params.challengeId || '').trim();
  if (!cleanId) {
    return {
      valid: false,
      code: 'CHALLENGE_REQUIRED',
      status: 400,
      error: 'Confirmação matemática obrigatória. Solicite um desafio antes de confirmar.',
    };
  }

  const record = challengeStore.get(cleanId);
  if (!record) {
    return {
      valid: false,
      code: 'CHALLENGE_NOT_FOUND',
      status: 400,
      error: 'Desafio matemático inválido ou inexistente. Solicite um novo desafio.',
    };
  }

  if (record.tournamentId !== params.tournamentId) {
    return {
      valid: false,
      code: 'CHALLENGE_TOURNAMENT_MISMATCH',
      status: 400,
      error: 'Este desafio matemático pertence a outro torneio e não pode ser reutilizado aqui.',
    };
  }

  if (record.adminUserId !== params.adminUserId) {
    return {
      valid: false,
      code: 'CHALLENGE_ACTOR_MISMATCH',
      status: 403,
      error: 'Este desafio matemático foi emitido para outro administrador.',
    };
  }

  if (record.used) {
    return {
      valid: false,
      code: 'CHALLENGE_ALREADY_USED',
      status: 400,
      error: 'Este desafio matemático já foi utilizado ou invalidado. Solicite um novo desafio.',
    };
  }

  if (nowMs > record.expiresAt) {
    record.used = true;
    return {
      valid: false,
      code: 'CHALLENGE_EXPIRED',
      status: 400,
      error: 'Desafio matemático expirado. Solicite um novo desafio para continuar.',
    };
  }

  const rawAnswer = typeof params.answer === 'string' ? params.answer.trim() : params.answer;
  if (rawAnswer === '' || rawAnswer === null || rawAnswer === undefined) {
    return {
      valid: false,
      code: 'CHALLENGE_EMPTY_ANSWER',
      status: 400,
      error: 'Informe o resultado da soma matemática para confirmar a exclusão.',
    };
  }

  const numericAnswer = Number(rawAnswer);
  if (!Number.isInteger(numericAnswer) || numericAnswer <= 0) {
    record.failedAttempts += 1;
    if (record.failedAttempts >= MAX_CHALLENGE_ATTEMPTS) {
      record.used = true;
      return {
        valid: false,
        code: 'CHALLENGE_INVALIDATED',
        status: 400,
        error: 'Número máximo de tentativas incorretas atingido. O desafio foi invalidado; solicite um novo.',
      };
    }
    return {
      valid: false,
      code: 'CHALLENGE_WRONG_ANSWER',
      status: 400,
      error: 'Resposta matemática incorreta. Verifique o cálculo e tente novamente.',
    };
  }

  if (numericAnswer !== record.expectedAnswer) {
    record.failedAttempts += 1;
    if (record.failedAttempts >= MAX_CHALLENGE_ATTEMPTS) {
      record.used = true;
      return {
        valid: false,
        code: 'CHALLENGE_INVALIDATED',
        status: 400,
        error: 'Resposta incorreta e limite de tentativas atingido. Desafio invalidado; solicite um novo.',
      };
    }
    return {
      valid: false,
      code: 'CHALLENGE_WRONG_ANSWER',
      status: 400,
      error: 'Resposta matemática incorreta. Nenhuma exclusão foi executada.',
    };
  }

  // Single-use atomic consumption
  record.used = true;
  return { valid: true, challenge: record };
}

export interface ExecuteTempUsersCleanupDeps {
  saveUsersFn?: (users: UserRecord[]) => void;
  saveTournamentsFn: (tournamentsMap: Map<string, Tournament>) => void;
  getAllStatsFn?: () => Record<string, any>;
  saveStatsFn?: (statsMap: Record<string, any>) => void;
  appendAuditFn?: (entry: TournamentAuditLogEntry) => void;
}

export async function executeTournamentTempUsersCleanup(params: {
  tournamentId: string;
  challengeId: string;
  answer: unknown;
  reason?: string;
  actor: { id: string; username: string; role: string };
  tournamentsMap: Map<string, Tournament>;
  roomsMap: Map<string, RoomData>;
  deps: ExecuteTempUsersCleanupDeps;
}): Promise<{
  success: boolean;
  status: number;
  error?: string;
  code?: string;
  blockingReasons?: string[];
  deletedCount?: number;
  deletedUserIds?: string[];
  deletedUsers?: Array<{ id: string; username: string; displayName: string; tag?: string }>;
  preservedPermanentUsersCount?: number;
  tournament?: Tournament;
  auditEntry?: TournamentAuditLogEntry;
}> {
  const { tournamentId, challengeId, answer, reason, actor, tournamentsMap, roomsMap, deps } = params;

  if (actor.role !== 'admin') {
    return {
      success: false,
      status: 403,
      code: 'FORBIDDEN',
      error: 'Apenas administradores autorizados podem excluir usuários temporários.',
    };
  }

  // Validate & consume challenge BEFORE acquiring file lock (prevents reuse & brute force)
  const challengeCheck = validateAndConsumeMathChallenge({
    challengeId,
    answer,
    tournamentId,
    adminUserId: actor.id,
  });

  if (!challengeCheck.valid) {
    return {
      success: false,
      status: challengeCheck.status,
      code: challengeCheck.code,
      error: challengeCheck.error,
    };
  }

  // Critical section: lock all JSON persistence files to prevent race conditions & enable atomic rollback
  return withDataLock(() => {
    const usersFile = getUsersFile();
    const tournamentsFile = path.join(getDataDir(), 'tournaments.json');
    const statsFile = path.join(getDataDir(), 'stats.json');
    const auditFile = getTournamentAuditFile();

    const readRawIfExists = (filePath: string): string | null =>
      fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;

    // Pre-mutation snapshots for rollback if any write step fails
    const usersRawSnapshot = readRawIfExists(usersFile);
    const tournamentsRawSnapshot = readRawIfExists(tournamentsFile);
    const statsRawSnapshot = readRawIfExists(statsFile);
    const auditRawSnapshot = readRawIfExists(auditFile);
    const tournamentsMapSnapshot = new Map<string, Tournament>(tournamentsMap);

    const latestUsers = getAllUsers();
    const latestInvites = getAllInvites();
    const tournament = tournamentsMap.get(tournamentId);

    if (!tournament) {
      return {
        success: false,
        status: 404,
        code: 'TOURNAMENT_NOT_FOUND',
        error: 'Torneio não encontrado.',
      };
    }

    // Revalidate classification and dependencies inside the lock immediately before mutating
    const analysis = analyzeTournamentTempUsersCleanup({
      tournamentId,
      tournamentsMap,
      users: latestUsers,
      roomsMap,
      invites: latestInvites,
    });

    if (!analysis.canExecute) {
      // Record blocked attempt in audit without modifying users
      const nowMs = Date.now();
      const blockedEntry: TournamentAuditLogEntry = {
        id: `taud_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
        at: new Date(nowMs).toISOString(),
        timestampMs: nowMs,
        action: 'temp_users_cleanup_blocked',
        actorUserId: actor.id,
        actorUsername: actor.username,
        tournamentId: tournament.config.id,
        tournamentName: tournament.config.name,
        tournamentStatus: tournament.status,
        deletedCount: 0,
        preservedPermanentUsersCount: analysis.permanentUsersPreservedCount,
        details: `Exclusão de usuários temporários bloqueada: ${analysis.blockingReasons.join(' | ')}`,
      };
      try {
        (deps.appendAuditFn || appendTournamentAuditLogStrict)(blockedEntry);
      } catch {
        // ignore secondary audit write failure on blocked response
      }

      return {
        success: false,
        status: 409,
        code: 'CLEANUP_BLOCKED',
        error: analysis.blockingReasons[0] || 'Exclusão bloqueada por dependências ativas.',
        blockingReasons: analysis.blockingReasons,
      };
    }

    const targetIdSet = new Set(analysis.temporaryUsers.map((u) => u.id));
    const targetUsernamesLower = new Set(analysis.temporaryUsers.map((u) => u.username.toLowerCase()));

    // Final safety assertion: NEVER remove permanent, admin, edinho, or other-tournament accounts
    const remainingUsers: UserRecord[] = [];
    const deletedUserRecords: UserRecord[] = [];
    for (const u of latestUsers) {
      if (targetIdSet.has(u.id)) {
        if (!isUserTemporaryForTournament(u, tournamentId)) {
          return {
            success: false,
            status: 409,
            code: 'SAFETY_GUARD_TRIGGERED',
            error: `Proteção acionada: @${u.username} não é um usuário temporário exclusivo deste torneio. Operação abortada.`,
          };
        }
        deletedUserRecords.push(u);
      } else {
        remainingUsers.push(u);
      }
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const deletedSummaries = deletedUserRecords.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      tag: u.tag,
    }));

    // Update tournament entries safely preserving referential integrity & historical results
    const hasRoundsOrHistory = tournament.rounds.length > 0 || !isTournamentOpenForRegistration(tournament);
    const updatedEntries = hasRoundsOrHistory
      ? tournament.entries.map((entry) => {
          const matchedDeleted = entry.userIds.filter((uid) => targetIdSet.has(uid));
          if (matchedDeleted.length === 0) return entry;
          return {
            ...entry,
            deletedTemporaryUserIds: Array.from(
              new Set([...(entry.deletedTemporaryUserIds || []), ...matchedDeleted])
            ),
            temporaryUsersDeletedAt: nowMs,
          };
        })
      : tournament.entries.filter((entry) => !entry.userIds.some((uid) => targetIdSet.has(uid)));

    const cleanReason = reason?.trim();
    const auditDetails = `Administrador @${actor.username} excluiu ${deletedSummaries.length} usuário(s) temporário(s) do torneio "${tournament.config.name}" (${analysis.permanentUsersPreservedCount} usuário(s) permanente(s) preservado(s)).${cleanReason ? ` Motivo: ${cleanReason}` : ''}`;

    const updatedTournament: Tournament = {
      ...tournament,
      entries: updatedEntries,
      auditTrail: [
        ...(tournament.auditTrail || []),
        {
          id: `aud_${nowMs}_tempdel`,
          at: nowMs,
          actorUserId: actor.id,
          actorUsername: actor.username,
          action: 'temp_users_deleted',
          details: auditDetails,
          metadata: {
            deletedCount: deletedSummaries.length,
            deletedUserIds: deletedSummaries.map((d) => d.id),
            deletedUsernames: deletedSummaries.map((d) => d.username),
            preservedPermanentUsersCount: analysis.permanentUsersPreservedCount,
          },
        },
      ],
    };

    const auditEntry: TournamentAuditLogEntry = {
      id: `taud_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
      at: nowIso,
      timestampMs: nowMs,
      action: 'temp_users_deleted',
      actorUserId: actor.id,
      actorUsername: actor.username,
      tournamentId: tournament.config.id,
      tournamentName: tournament.config.name,
      tournamentStatus: tournament.status,
      deletedCount: deletedSummaries.length,
      deletedUsers: deletedSummaries,
      preservedPermanentUsersCount: analysis.permanentUsersPreservedCount,
      details: auditDetails,
    };

    // Prepare stats cleanup only for deleted temporary users (permanent stats untouched)
    let nextStatsMap: Record<string, any> | null = null;
    if (deps.getAllStatsFn && deps.saveStatsFn) {
      const currentStats = deps.getAllStatsFn();
      nextStatsMap = { ...currentStats };
      let statsChanged = false;
      for (const id of targetIdSet) {
        if (id in nextStatsMap) {
          delete nextStatsMap[id];
          statsChanged = true;
        }
      }
      for (const uname of targetUsernamesLower) {
        if (uname in nextStatsMap) {
          delete nextStatsMap[uname];
          statsChanged = true;
        }
      }
      if (!statsChanged) {
        nextStatsMap = null;
      }
    }

    // Transactional commit with full rollback on any failure (no silent partial deletion!)
    try {
      (deps.saveUsersFn || saveUsers)(remainingUsers);
      tournamentsMap.set(tournamentId, updatedTournament);
      deps.saveTournamentsFn(tournamentsMap);
      if (nextStatsMap && deps.saveStatsFn) {
        deps.saveStatsFn(nextStatsMap);
      }
      (deps.appendAuditFn || appendTournamentAuditLogStrict)(auditEntry);
    } catch (err: any) {
      // Rollback in-memory map and all disk files to pre-mutation snapshots
      tournamentsMap.clear();
      for (const [k, v] of tournamentsMapSnapshot.entries()) {
        tournamentsMap.set(k, v);
      }
      const restoreFile = (filePath: string, raw: string | null) => {
        try {
          if (raw === null) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } else {
            atomicWriteFileSync(filePath, raw);
          }
        } catch {
          // best effort rollback
        }
      };
      restoreFile(usersFile, usersRawSnapshot);
      restoreFile(tournamentsFile, tournamentsRawSnapshot);
      restoreFile(statsFile, statsRawSnapshot);
      restoreFile(auditFile, auditRawSnapshot);

      return {
        success: false,
        status: 500,
        code: 'TRANSACTION_ROLLBACK',
        error: `Falha ao persistir exclusão (${err?.message || 'erro de gravação'}). Todas as alterações foram revertidas integralmente.`,
      };
    }

    return {
      success: true,
      status: 200,
      deletedCount: deletedSummaries.length,
      deletedUserIds: deletedSummaries.map((d) => d.id),
      deletedUsers: deletedSummaries,
      preservedPermanentUsersCount: analysis.permanentUsersPreservedCount,
      tournament: updatedTournament,
      auditEntry,
    };
  });
}
