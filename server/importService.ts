import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { Worker } from 'worker_threads';
import bcrypt from 'bcryptjs';
import {
  ImportAuditEvent,
  ImportBatch,
  ImportBatchDetailUser,
  ImportBatchItem,
  ImportDelimiter,
  ImportImpactReport,
  ImportOperationMode,
  ImportSourceType,
  ImportUserDependencyItem,
  ImportUserManageAction,
  ImportValidationResponse,
  ImportValidationRow,
  ImportValidationSummary,
  InviteCode,
  UserAccountStatus,
} from '../src/types/uno.js';
import {
  buildUserRecord,
  getAllInvites,
  getAllUsers,
  getEffectiveUserStatus,
  isUserAccountActive,
  normalizeDisplayName,
  normalizeUsername,
  removeUsersByIds,
  saveUsers,
  setUsersStatus,
  UserRecord,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from './authService.js';
import { atomicWriteFileSync, ensureDirExists, getDataDir, withDataLock } from './dataLock.js';
import { parseImportPayload, ParsedImportRow } from './importParser.js';
import { registerIndividualEntry, Tournament } from './tournamentEngine.js';
import { RoomData } from './unoEngine.js';

const BCRYPT_ROUNDS = 10;

function getImportBatchesFile(): string {
  return path.join(getDataDir(), 'import_batches.json');
}

export function loadImportBatches(): ImportBatch[] {
  const file = getImportBatchesFile();
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveImportBatches(batches: ImportBatch[]): void {
  ensureDirExists(getDataDir());
  atomicWriteFileSync(getImportBatchesFile(), JSON.stringify(batches, null, 2));
}

function normalizeTag(rawTag?: string): string {
  const cleaned = String(rawTag || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
  if (cleaned.length >= 2) {
    return cleaned.slice(0, 32);
  }
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `LOTE-${y}${m}${d}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function resolveBcryptJsPath(): string {
  const fallbackBase = path.join(process.cwd(), 'package.json');
  const req = createRequire(import.meta.url || fallbackBase);
  return req.resolve('bcryptjs');
}

/**
 * Executa hash bcrypt em Worker Thread nativa para não bloquear o Event Loop
 * nem causar jitter em partidas/WebSockets durante lotes de até 200 registros.
 */
export async function hashPasswordsInWorker(passwords: string[], rounds = BCRYPT_ROUNDS): Promise<string[]> {
  if (passwords.length === 0) return [];

  const workerScript = `
    const { parentPort, workerData } = require('worker_threads');
    const bcrypt = require(workerData.bcryptPath);
    const hashes = workerData.passwords.map((pwd) => bcrypt.hashSync(pwd, workerData.rounds));
    for (let i = 0; i < workerData.passwords.length; i++) {
      workerData.passwords[i] = '';
    }
    parentPort.postMessage(hashes);
  `;

  try {
    const bcryptPath = resolveBcryptJsPath();
    return await new Promise<string[]>((resolve, reject) => {
      const worker = new Worker(workerScript, {
        eval: true,
        workerData: { passwords: [...passwords], bcryptPath, rounds },
      });

      let settled = false;
      worker.once('message', (hashes: string[]) => {
        settled = true;
        resolve(hashes);
      });
      worker.once('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      worker.once('exit', (code) => {
        if (!settled && code !== 0) {
          settled = true;
          reject(new Error(`Worker bcrypt encerrou com código ${code}`));
        }
      });
    });
  } catch {
    // Fallback cooperativo caso worker_threads falhe em ambiente restrito
    const hashes: string[] = [];
    for (const pwd of passwords) {
      hashes.push(await bcrypt.hash(pwd, rounds));
      await new Promise((r) => setImmediate(r));
    }
    return hashes;
  } finally {
    for (let i = 0; i < passwords.length; i++) {
      passwords[i] = '';
    }
  }
}

export interface ValidateImportInput {
  rawText: string;
  mode: ImportOperationMode;
  delimiter?: ImportDelimiter | 'auto';
  tournamentId?: string;
  ignoreExistingUsers?: boolean;
  tournamentsMap: Map<string, Tournament>;
}

interface InternalValidationEvaluation {
  response: ImportValidationResponse;
  parsedRows: ParsedImportRow[];
  creatableRows: Array<{
    lineNumber: number;
    cleanUsername: string;
    cleanDisplayName: string;
    password: string;
  }>;
  enrollableExistingRows: Array<{
    lineNumber: number;
    user: UserRecord;
  }>;
}

function evaluateImportAgainstState(
  input: ValidateImportInput,
  existingUsers: UserRecord[]
): InternalValidationEvaluation {
  const { rawText, mode, delimiter = 'auto', tournamentId, ignoreExistingUsers = false, tournamentsMap } = input;

  const parsed = parseImportPayload({ rawText, mode, delimiter });
  if (!parsed.success) {
    return {
      response: {
        success: false,
        error: parsed.error,
        ambiguousDelimiter: parsed.ambiguousDelimiter,
        candidateDelimiters: parsed.candidateDelimiters,
        detectedDelimiter: parsed.detectedDelimiter,
        mode,
        rows: [],
      },
      parsedRows: [],
      creatableRows: [],
      enrollableExistingRows: [],
    };
  }

  // Evaluate Tournament Compatibility if mode requires tournament
  let tournamentInfo: ImportValidationResponse['tournament'] | undefined;
  let targetTournament: Tournament | undefined;

  if (mode === 'create_and_enroll' || mode === 'enroll_existing') {
    if (!tournamentId || !tournamentId.trim()) {
      return {
        success: false,
        response: {
          success: false,
          error: 'Selecione um torneio individual em inscrição para este modo de importação.',
          detectedDelimiter: parsed.detectedDelimiter,
          mode,
          rows: [],
        },
        parsedRows: parsed.rows,
        creatableRows: [],
        enrollableExistingRows: [],
      } as any;
    }

    targetTournament = tournamentsMap.get(tournamentId.trim());
    if (!targetTournament) {
      return {
        response: {
          success: false,
          error: 'Torneio selecionado não foi encontrado.',
          detectedDelimiter: parsed.detectedDelimiter,
          mode,
          rows: [],
        },
        parsedRows: parsed.rows,
        creatableRows: [],
        enrollableExistingRows: [],
      };
    }

    let compatible = true;
    let incompatibilityReason: string | undefined;

    if (targetTournament.config.modality === 'doubles') {
      compatible = false;
      incompatibilityReason =
        'Torneios de duplas (2v2) não aceitam inscrição individual em lote nesta versão. Forme as duplas manualmente ou aguarde a importação por equipes.';
    } else if (targetTournament.status !== 'registration') {
      compatible = false;
      incompatibilityReason = `O torneio "${targetTournament.config.name}" não está aberto para inscrições (status atual: ${targetTournament.status}).`;
    }

    tournamentInfo = {
      id: targetTournament.config.id,
      name: targetTournament.config.name,
      modality: targetTournament.config.modality,
      status: targetTournament.status,
      currentEntriesCount: targetTournament.entries.length,
      compatible,
      incompatibilityReason,
    };

    if (!compatible) {
      return {
        response: {
          success: false,
          error: incompatibilityReason,
          detectedDelimiter: parsed.detectedDelimiter,
          mode,
          tournament: tournamentInfo,
          rows: [],
        },
        parsedRows: parsed.rows,
        creatableRows: [],
        enrollableExistingRows: [],
      };
    }
  }

  const existingByUsername = new Map<string, UserRecord>();
  const existingByDisplayName = new Map<string, UserRecord>();
  for (const u of existingUsers) {
    existingByUsername.set(normalizeUsername(u.username), u);
    existingByDisplayName.set(normalizeDisplayName(u.displayName).toLowerCase(), u);
  }

  const enrolledUserIds = new Set<string>();
  if (targetTournament) {
    for (const entry of targetTournament.entries) {
      for (const uid of entry.userIds) {
        enrolledUserIds.add(uid);
      }
    }
  }

  const seenUsernamesInFile = new Set<string>();
  const seenDisplayNamesInFile = new Set<string>();

  const summary: ImportValidationSummary = {
    totalLines: parsed.rows.length,
    validCount: 0,
    invalidCount: 0,
    duplicateUsernameInFileCount: 0,
    existingUsernameCount: 0,
    duplicateDisplayNameInFileCount: 0,
    existingDisplayNameCount: 0,
    missingRequiredFieldsCount: 0,
    invalidPasswordCount: 0,
    readyToProcessCount: 0,
    ignoredCount: 0,
    alreadyEnrolledCount: 0,
    notFoundForEnrollCount: 0,
    eligibleEnrollCount: 0,
  };

  const rows: ImportValidationRow[] = [];
  const creatableRows: InternalValidationEvaluation['creatableRows'] = [];
  const enrollableExistingRows: InternalValidationEvaluation['enrollableExistingRows'] = [];

  for (const rawRow of parsed.rows) {
    const codes: string[] = [];
    const messages: string[] = [];

    if (rawRow.columnCountMismatch || rawRow.parseError) {
      codes.push('PARSE_ERROR');
      messages.push(rawRow.parseError || 'Erro estrutural na linha CSV.');
      summary.missingRequiredFieldsCount++;
      summary.invalidCount++;
      rows.push({
        lineNumber: rawRow.lineNumber,
        username: rawRow.username,
        displayName: rawRow.displayName,
        hasPassword: rawRow.password.length > 0,
        status: 'invalid',
        codes,
        messages,
        willCreateUser: false,
        willEnrollTournament: false,
      });
      continue;
    }

    const uCheck = validateUsername(rawRow.username);
    const cleanUsername = uCheck.clean;

    if (mode === 'enroll_existing') {
      if (!uCheck.valid) {
        codes.push(uCheck.code || 'INVALID_USERNAME');
        messages.push(uCheck.error || 'Username inválido.');
        if (uCheck.code === 'MISSING_USERNAME') summary.missingRequiredFieldsCount++;
        summary.invalidCount++;
        rows.push({
          lineNumber: rawRow.lineNumber,
          username: rawRow.username,
          displayName: rawRow.displayName,
          hasPassword: rawRow.password.length > 0,
          status: 'invalid',
          codes,
          messages,
          willCreateUser: false,
          willEnrollTournament: false,
        });
        continue;
      }

      if (seenUsernamesInFile.has(cleanUsername)) {
        codes.push('DUPLICATE_USERNAME_IN_FILE');
        messages.push(`Usuário "@${cleanUsername}" duplicado neste lote.`);
        summary.duplicateUsernameInFileCount++;
        summary.invalidCount++;
        rows.push({
          lineNumber: rawRow.lineNumber,
          username: cleanUsername,
          displayName: rawRow.displayName,
          hasPassword: false,
          status: 'invalid',
          codes,
          messages,
          willCreateUser: false,
          willEnrollTournament: false,
        });
        continue;
      }
      seenUsernamesInFile.add(cleanUsername);

      const existingUser = existingByUsername.get(cleanUsername);
      if (!existingUser) {
        codes.push('USER_NOT_FOUND');
        messages.push(`Usuário "@${cleanUsername}" não encontrado no sistema.`);
        summary.notFoundForEnrollCount++;
        summary.invalidCount++;
        rows.push({
          lineNumber: rawRow.lineNumber,
          username: cleanUsername,
          displayName: rawRow.displayName,
          hasPassword: false,
          status: 'invalid',
          codes,
          messages,
          willCreateUser: false,
          willEnrollTournament: false,
        });
        continue;
      }

      const accountStatus = getEffectiveUserStatus(existingUser);
      if (!isUserAccountActive(existingUser)) {
        codes.push('USER_NOT_ACTIVE');
        messages.push(`Conta "@${cleanUsername}" está ${accountStatus === 'archived' ? 'arquivada' : 'desativada'} e não pode ser inscrita.`);
        summary.invalidCount++;
        rows.push({
          lineNumber: rawRow.lineNumber,
          username: existingUser.username,
          displayName: existingUser.displayName,
          hasPassword: false,
          status: 'invalid',
          codes,
          messages,
          willCreateUser: false,
          willEnrollTournament: false,
          existingUserId: existingUser.id,
          existingUserStatus: accountStatus,
        });
        continue;
      }

      if (enrolledUserIds.has(existingUser.id)) {
        codes.push('ALREADY_ENROLLED_IN_TOURNAMENT');
        messages.push(`"@${existingUser.username}" já está inscrito neste torneio (será ignorado).`);
        summary.alreadyEnrolledCount++;
        summary.ignoredCount++;
        rows.push({
          lineNumber: rawRow.lineNumber,
          username: existingUser.username,
          displayName: existingUser.displayName,
          hasPassword: false,
          status: 'conflict_ignorable',
          codes,
          messages,
          willCreateUser: false,
          willEnrollTournament: false,
          existingUserId: existingUser.id,
          existingUserStatus: accountStatus,
        });
        continue;
      }

      summary.validCount++;
      summary.readyToProcessCount++;
      summary.eligibleEnrollCount++;
      enrollableExistingRows.push({ lineNumber: rawRow.lineNumber, user: existingUser });
      rows.push({
        lineNumber: rawRow.lineNumber,
        username: existingUser.username,
        displayName: existingUser.displayName,
        hasPassword: false,
        status: 'valid',
        codes: ['READY_TO_ENROLL'],
        messages: ['Pronto para inscrição no torneio.'],
        willCreateUser: false,
        willEnrollTournament: true,
        existingUserId: existingUser.id,
        existingUserStatus: accountStatus,
      });
      continue;
    }

    // Modes: create_only or create_and_enroll
    const dCheck = validateDisplayName(rawRow.displayName);
    const pCheck = validatePassword(rawRow.password);
    const cleanDisplayName = dCheck.clean;
    const cleanDisplayLower = cleanDisplayName.toLowerCase();

    if (!uCheck.valid) {
      codes.push(uCheck.code || 'INVALID_USERNAME');
      messages.push(uCheck.error || 'Nome de usuário inválido.');
      if (uCheck.code === 'MISSING_USERNAME') summary.missingRequiredFieldsCount++;
    }
    if (!dCheck.valid) {
      codes.push(dCheck.code || 'INVALID_DISPLAY_NAME');
      messages.push(dCheck.error || 'Nome de exibição inválido.');
      if (dCheck.code === 'MISSING_DISPLAY_NAME') summary.missingRequiredFieldsCount++;
    }
    if (!pCheck.valid) {
      codes.push(pCheck.code || 'INVALID_PASSWORD');
      messages.push(pCheck.error || 'Senha inválida.');
      summary.invalidPasswordCount++;
    }

    let ignorableConflict = false;
    let existingUserMatch: UserRecord | undefined;

    if (uCheck.valid) {
      if (seenUsernamesInFile.has(cleanUsername)) {
        codes.push('DUPLICATE_USERNAME_IN_FILE');
        messages.push(`Username "@${cleanUsername}" duplicado no próprio lote.`);
        summary.duplicateUsernameInFileCount++;
      } else {
        seenUsernamesInFile.add(cleanUsername);
      }

      existingUserMatch = existingByUsername.get(cleanUsername);
      if (existingUserMatch) {
        codes.push('EXISTING_USERNAME');
        messages.push(
          ignoreExistingUsers
            ? `Username "@${cleanUsername}" já existe no sistema (será ignorado).`
            : `Username "@${cleanUsername}" já cadastrado no sistema.`
        );
        summary.existingUsernameCount++;
        if (ignoreExistingUsers) {
          ignorableConflict = true;
        }
      }
    }

    if (dCheck.valid) {
      if (seenDisplayNamesInFile.has(cleanDisplayLower)) {
        codes.push('DUPLICATE_DISPLAY_NAME_IN_FILE');
        messages.push(`Nome de exibição "${cleanDisplayName}" duplicado no próprio lote.`);
        summary.duplicateDisplayNameInFileCount++;
      } else {
        seenDisplayNamesInFile.add(cleanDisplayLower);
      }

      const displayCollision = existingByDisplayName.get(cleanDisplayLower);
      if (displayCollision && !(ignoreExistingUsers && existingUserMatch && displayCollision.id === existingUserMatch.id)) {
        codes.push('EXISTING_DISPLAY_NAME');
        messages.push(`Nome de exibição "${cleanDisplayName}" já pertence a outra conta existente.`);
        summary.existingDisplayNameCount++;
        ignorableConflict = false;
      }
    }

    const hasHardError = codes.some((c) => c !== 'EXISTING_USERNAME');
    if (hasHardError || (codes.includes('EXISTING_USERNAME') && !ignorableConflict)) {
      summary.invalidCount++;
      rows.push({
        lineNumber: rawRow.lineNumber,
        username: cleanUsername || rawRow.username,
        displayName: cleanDisplayName || rawRow.displayName,
        hasPassword: rawRow.password.length > 0,
        status: 'invalid',
        codes,
        messages,
        willCreateUser: false,
        willEnrollTournament: false,
        existingUserId: existingUserMatch?.id,
        existingUserStatus: existingUserMatch ? getEffectiveUserStatus(existingUserMatch) : undefined,
      });
      continue;
    }

    if (ignorableConflict && existingUserMatch) {
      summary.ignoredCount++;
      rows.push({
        lineNumber: rawRow.lineNumber,
        username: cleanUsername,
        displayName: cleanDisplayName,
        hasPassword: rawRow.password.length > 0,
        status: 'conflict_ignorable',
        codes,
        messages,
        willCreateUser: false,
        willEnrollTournament: false,
        existingUserId: existingUserMatch.id,
        existingUserStatus: getEffectiveUserStatus(existingUserMatch),
      });
      continue;
    }

    // Valid new user!
    const willEnroll = mode === 'create_and_enroll';
    summary.validCount++;
    summary.readyToProcessCount++;
    if (willEnroll) summary.eligibleEnrollCount++;

    creatableRows.push({
      lineNumber: rawRow.lineNumber,
      cleanUsername,
      cleanDisplayName,
      password: rawRow.password,
    });

    rows.push({
      lineNumber: rawRow.lineNumber,
      username: cleanUsername,
      displayName: cleanDisplayName,
      hasPassword: true,
      status: 'valid',
      codes: [willEnroll ? 'READY_TO_CREATE_AND_ENROLL' : 'READY_TO_CREATE'],
      messages: [willEnroll ? 'Pronto para criar conta e inscrever no torneio.' : 'Pronto para criar conta.'],
      willCreateUser: true,
      willEnrollTournament: willEnroll,
    });
  }

  const previewHash = crypto
    .createHash('sha256')
    .update(`${mode}|${tournamentId || ''}|${parsed.detectedDelimiter}|${rows.map((r) => `${r.lineNumber}:${r.username}:${r.status}`).join(',')}`)
    .digest('hex');

  return {
    response: {
      success: true,
      detectedDelimiter: parsed.detectedDelimiter,
      mode,
      tournament: tournamentInfo,
      summary,
      rows,
      previewHash,
    },
    parsedRows: parsed.rows,
    creatableRows,
    enrollableExistingRows,
  };
}

export function validateImportBatch(input: ValidateImportInput): ImportValidationResponse {
  const existingUsers = getAllUsers();
  const evaluation = evaluateImportAgainstState(input, existingUsers);
  // Ensure plaintext passwords from parsedRows are never leaked
  evaluation.parsedRows.forEach((r) => {
    r.password = '';
  });
  return evaluation.response;
}

export interface CommitImportInput extends ValidateImportInput {
  name: string;
  importTag?: string;
  description?: string;
  sourceType: ImportSourceType;
  idempotencyKey?: string;
  actor: { id: string; username: string };
  saveTournamentsFn?: (tournamentsMap: Map<string, Tournament>) => void;
}

export async function commitImportBatch(input: CommitImportInput): Promise<{
  success: boolean;
  error?: string;
  batch?: ImportBatch;
  validation?: ImportValidationResponse;
  idempotentHit?: boolean;
}> {
  const batchName = String(input.name || '').trim();
  if (batchName.length < 2 || batchName.length > 80) {
    return { success: false, error: 'Informe um nome identificável para o lote (entre 2 e 80 caracteres).' };
  }

  const idempotencyKey =
    (input.idempotencyKey && input.idempotencyKey.trim()) ||
    crypto.randomBytes(12).toString('hex');

  // Check idempotency before doing expensive bcrypt work
  const preBatches = loadImportBatches();
  const existingIdem = preBatches.find((b) => b.idempotencyKey === idempotencyKey);
  if (existingIdem && existingIdem.status !== 'in_progress') {
    return { success: true, batch: existingIdem, idempotentHit: true };
  }

  // Initial evaluation outside the lock to extract passwords to hash in Worker Thread
  const initialUsers = getAllUsers();
  const initialEval = evaluateImportAgainstState(input, initialUsers);
  if (!initialEval.response.success) {
    initialEval.parsedRows.forEach((r) => {
      r.password = '';
    });
    return {
      success: false,
      error: initialEval.response.error || 'Falha na validação dos dados.',
      validation: initialEval.response,
    };
  }

  if (initialEval.creatableRows.length === 0 && initialEval.enrollableExistingRows.length === 0) {
    initialEval.parsedRows.forEach((r) => {
      r.password = '';
    });
    return {
      success: false,
      error: 'Nenhum registro válido elegível para processamento neste lote.',
      validation: initialEval.response,
    };
  }

  // Hash all passwords in a dedicated Worker Thread BEFORE acquiring persistence lock
  const passwordsToHash = initialEval.creatableRows.map((r) => r.password);
  const hashedPasswords = await hashPasswordsInWorker(passwordsToHash, BCRYPT_ROUNDS);
  const hashByLine = new Map<number, string>();
  initialEval.creatableRows.forEach((row, idx) => {
    hashByLine.set(row.lineNumber, hashedPasswords[idx]);
    row.password = '';
  });
  initialEval.parsedRows.forEach((r) => {
    r.password = '';
  });

  // Critical Section: re-validate against latest JSON state & execute WAL-protected cross-file commit
  return withDataLock(() => {
    const batches = loadImportBatches();
    const idemHit = batches.find((b) => b.idempotencyKey === idempotencyKey);
    if (idemHit) {
      return { success: true, batch: idemHit, idempotentHit: true };
    }

    const latestUsers = getAllUsers();
    const reEval = evaluateImportAgainstState(input, latestUsers);
    reEval.parsedRows.forEach((r) => {
      r.password = '';
    });

    if (!reEval.response.success) {
      return {
        success: false,
        error: reEval.response.error || 'Conflito detectado ao revalidar antes da gravação.',
        validation: reEval.response,
      };
    }

    const nowIso = new Date().toISOString();
    const importBatchId = `imp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const importTag = normalizeTag(input.importTag);
    const existingTags = new Set(latestUsers.map((u) => u.tag));

    const newUserRecords: UserRecord[] = [];
    const createdByLine = new Map<number, UserRecord>();

    for (const row of reEval.creatableRows) {
      const passwordHash = hashByLine.get(row.lineNumber);
      if (!passwordHash) continue;
      const newUser = buildUserRecord({
        username: row.cleanUsername,
        passwordHash,
        displayName: row.cleanDisplayName,
        avatar: '🦸‍♂️',
        role: 'player', // Always force standard player role in bulk import
        existingTags,
        createdAt: nowIso,
      });
      newUserRecords.push(newUser);
      createdByLine.set(row.lineNumber, newUser);
    }

    const targetTournament = input.tournamentId ? input.tournamentsMap.get(input.tournamentId) : undefined;
    const isTournamentMode = input.mode === 'create_and_enroll' || input.mode === 'enroll_existing';

    // Build initial planned items (no passwords or hashes!)
    const plannedItems: ImportBatchItem[] = reEval.response.rows.map((vRow) => {
      if (vRow.status === 'invalid') {
        return {
          lineNumber: vRow.lineNumber,
          username: vRow.username,
          displayName: vRow.displayName || undefined,
          relationType: 'none',
          outcome: 'rejected',
          enrolledInTournament: false,
          reasonCode: vRow.codes[0],
          reasonMessage: vRow.messages.join(' '),
        };
      }

      if (vRow.status === 'conflict_ignorable') {
        return {
          lineNumber: vRow.lineNumber,
          username: vRow.username,
          displayName: vRow.displayName || undefined,
          userId: vRow.existingUserId,
          relationType: 'none',
          outcome: 'skipped',
          enrolledInTournament: false,
          reasonCode: vRow.codes[0],
          reasonMessage: vRow.messages.join(' '),
        };
      }

      if (input.mode === 'enroll_existing') {
        const existingMatch = latestUsers.find((u) => u.id === vRow.existingUserId);
        return {
          lineNumber: vRow.lineNumber,
          username: vRow.username,
          displayName: existingMatch?.displayName || vRow.displayName,
          userId: existingMatch?.id,
          userTag: existingMatch?.tag,
          relationType: 'existing_enrolled_only',
          outcome: 'enrolled',
          enrolledInTournament: false,
        };
      }

      const created = createdByLine.get(vRow.lineNumber);
      return {
        lineNumber: vRow.lineNumber,
        username: vRow.username,
        displayName: created?.displayName || vRow.displayName,
        userId: created?.id,
        userTag: created?.tag,
        relationType: created ? 'created_by_batch' : 'none',
        outcome: created ? (isTournamentMode ? 'created_and_enrolled' : 'created') : 'failed',
        enrolledInTournament: false,
      };
    });

    // STEP 1 (WAL): Persist in-progress journal record BEFORE mutating users.json / tournaments.json
    const batchRecord: ImportBatch = {
      importBatchId,
      name: batchName,
      importTag,
      description: input.description?.trim() || undefined,
      mode: input.mode,
      sourceType: input.sourceType,
      delimiterUsed: reEval.response.detectedDelimiter || ';',
      tournamentId: targetTournament?.config.id,
      tournamentName: targetTournament?.config.name,
      idempotencyKey,
      createdAt: nowIso,
      createdByUserId: input.actor.id,
      createdByUsername: input.actor.username,
      status: 'in_progress',
      stepsCompleted: {
        usersSaved: false,
        tournamentSaved: false,
        batchFinalized: false,
      },
      summary: {
        totalReceived: reEval.response.rows.length,
        totalValid: reEval.response.summary?.validCount || 0,
        totalCreated: 0,
        totalEnrolled: 0,
        totalSkipped: plannedItems.filter((i) => i.outcome === 'skipped').length,
        totalRejected: plannedItems.filter((i) => i.outcome === 'rejected').length,
        totalFailed: 0,
      },
      items: plannedItems,
      auditTrail: [
        {
          at: nowIso,
          actorUserId: input.actor.id,
          actorUsername: input.actor.username,
          action: 'batch_started',
          details: `Iniciado lote "${batchName}" (${importTag}) no modo ${input.mode} com ${reEval.response.rows.length} linha(s).`,
        },
      ],
    };

    batches.unshift(batchRecord);
    saveImportBatches(batches);

    // STEP 2: Persist created users to users.json
    if (newUserRecords.length > 0) {
      const updatedUsers = [...latestUsers, ...newUserRecords];
      saveUsers(updatedUsers);
    }
    batchRecord.stepsCompleted.usersSaved = true;

    // STEP 3: Apply tournament enrollment if applicable
    let tournamentUpdated = false;
    if (isTournamentMode && targetTournament) {
      let currentTournament = targetTournament;
      for (const item of batchRecord.items) {
        if (!item.userId) continue;
        if (item.outcome !== 'created_and_enrolled' && item.outcome !== 'enrolled') continue;

        try {
          const enrolled = registerIndividualEntry(
            currentTournament,
            item.userId,
            item.displayName || item.username
          );
          currentTournament = enrolled.tournament;
          item.enrolledInTournament = true;
          tournamentUpdated = true;
        } catch (err: any) {
          item.enrolledInTournament = false;
          if (item.relationType === 'created_by_batch') {
            item.outcome = 'created';
          } else {
            item.outcome = 'failed';
          }
          item.reasonCode = 'TOURNAMENT_ENROLL_FAILED';
          item.reasonMessage = err?.message || 'Não foi possível inscrever no torneio.';
        }
      }

      if (tournamentUpdated) {
        input.tournamentsMap.set(currentTournament.config.id, currentTournament);
        if (input.saveTournamentsFn) {
          input.saveTournamentsFn(input.tournamentsMap);
        } else {
          atomicWriteFileSync(
            path.join(getDataDir(), 'tournaments.json'),
            JSON.stringify(Array.from(input.tournamentsMap.values()), null, 2)
          );
        }
      }
      batchRecord.stepsCompleted.tournamentSaved = true;
    }

    // STEP 4: Finalize summary and WAL status
    const totalCreated = batchRecord.items.filter(
      (i) => i.relationType === 'created_by_batch' && (i.outcome === 'created' || i.outcome === 'created_and_enrolled')
    ).length;
    const totalEnrolled = batchRecord.items.filter((i) => i.enrolledInTournament).length;
    const totalSkipped = batchRecord.items.filter((i) => i.outcome === 'skipped').length;
    const totalRejected = batchRecord.items.filter((i) => i.outcome === 'rejected').length;
    const totalFailed = batchRecord.items.filter((i) => i.outcome === 'failed').length;

    batchRecord.summary = {
      totalReceived: batchRecord.items.length,
      totalValid: reEval.response.summary?.validCount || 0,
      totalCreated,
      totalEnrolled,
      totalSkipped,
      totalRejected,
      totalFailed,
    };

    const hadSuccess = totalCreated > 0 || totalEnrolled > 0;
    const hadAnyProblem = totalRejected > 0 || totalFailed > 0 || totalSkipped > 0;

    if (!hadSuccess && (totalFailed > 0 || totalRejected > 0)) {
      batchRecord.status = 'failed';
    } else if (hadSuccess && hadAnyProblem) {
      batchRecord.status = 'partial_success';
    } else {
      batchRecord.status = 'completed';
    }

    batchRecord.stepsCompleted.batchFinalized = true;
    batchRecord.auditTrail.push({
      at: new Date().toISOString(),
      actorUserId: input.actor.id,
      actorUsername: input.actor.username,
      action: 'batch_completed',
      details: `Lote finalizado (${batchRecord.status}): ${totalCreated} criado(s), ${totalEnrolled} inscrito(s), ${totalSkipped} ignorado(s), ${totalRejected} rejeitado(s), ${totalFailed} falha(s).`,
    });

    saveImportBatches(batches);
    return { success: true, batch: batchRecord, validation: reEval.response };
  });
}

/**
 * Reconcilia lotes que ficaram em estado `in_progress` caso o servidor Node.js
 * tenha sofrido queda/reinício durante uma importação em andamento.
 */
export async function reconcileIncompleteImportBatches(
  tournamentsMap: Map<string, Tournament>,
  saveTournamentsFn?: (map: Map<string, Tournament>) => void
): Promise<{ reconciledCount: number; batchIds: string[] }> {
  return withDataLock(() => {
    const batches = loadImportBatches();
    const pending = batches.filter((b) => b.status === 'in_progress');
    if (pending.length === 0) {
      return { reconciledCount: 0, batchIds: [] };
    }

    const users = getAllUsers();
    const userIdsSet = new Set(users.map((u) => u.id));
    const reconciledIds: string[] = [];

    for (const batch of pending) {
      let createdPersistedCount = 0;
      let enrolledPersistedCount = 0;
      const targetTournament = batch.tournamentId ? tournamentsMap.get(batch.tournamentId) : undefined;
      const enrolledSet = new Set<string>();
      if (targetTournament) {
        for (const entry of targetTournament.entries) {
          for (const uid of entry.userIds) enrolledSet.add(uid);
        }
      }

      for (const item of batch.items) {
        if (item.relationType === 'created_by_batch' && item.userId) {
          if (userIdsSet.has(item.userId)) {
            createdPersistedCount++;
            if (batch.mode === 'create_and_enroll' && targetTournament) {
              if (enrolledSet.has(item.userId)) {
                item.enrolledInTournament = true;
                item.outcome = 'created_and_enrolled';
                enrolledPersistedCount++;
              } else {
                // Attempt idempotent enrollment recovery if tournament is still in registration
                if (targetTournament.status === 'registration' && targetTournament.config.modality === 'individual') {
                  try {
                    const res = registerIndividualEntry(
                      targetTournament,
                      item.userId,
                      item.displayName || item.username
                    );
                    tournamentsMap.set(res.tournament.config.id, res.tournament);
                    enrolledSet.add(item.userId);
                    item.enrolledInTournament = true;
                    item.outcome = 'created_and_enrolled';
                    enrolledPersistedCount++;
                  } catch {
                    item.enrolledInTournament = false;
                    item.outcome = 'created';
                    item.reasonCode = 'RECONCILED_NOT_ENROLLED';
                    item.reasonMessage = 'Conta criada antes do reinício; inscrição pendente.';
                  }
                } else {
                  item.enrolledInTournament = false;
                  item.outcome = 'created';
                  item.reasonCode = 'RECONCILED_NOT_ENROLLED';
                  item.reasonMessage = 'Conta criada antes do reinício; torneio não estava mais em inscrição.';
                }
              }
            } else {
              item.outcome = 'created';
            }
          } else {
            item.outcome = 'failed';
            item.relationType = 'none';
            item.reasonCode = 'INTERRUPTED_BEFORE_USER_SAVE';
            item.reasonMessage = 'Processo interrompido antes da gravação desta conta.';
          }
        } else if (item.relationType === 'existing_enrolled_only' && item.userId) {
          if (enrolledSet.has(item.userId)) {
            item.enrolledInTournament = true;
            item.outcome = 'enrolled';
            enrolledPersistedCount++;
          } else {
            item.enrolledInTournament = false;
            item.outcome = 'failed';
            item.reasonCode = 'INTERRUPTED_BEFORE_ENROLL';
            item.reasonMessage = 'Processo interrompido antes da inscrição no torneio.';
          }
        }
      }

      if (targetTournament && saveTournamentsFn) {
        saveTournamentsFn(tournamentsMap);
      }

      batch.stepsCompleted = {
        usersSaved: createdPersistedCount > 0 || batch.mode === 'enroll_existing',
        tournamentSaved: enrolledPersistedCount > 0 || !batch.tournamentId,
        batchFinalized: true,
      };

      const totalSkipped = batch.items.filter((i) => i.outcome === 'skipped').length;
      const totalRejected = batch.items.filter((i) => i.outcome === 'rejected').length;
      const totalFailed = batch.items.filter((i) => i.outcome === 'failed').length;

      batch.summary = {
        totalReceived: batch.items.length,
        totalValid: batch.summary.totalValid,
        totalCreated: createdPersistedCount,
        totalEnrolled: enrolledPersistedCount,
        totalSkipped,
        totalRejected,
        totalFailed,
      };

      if (createdPersistedCount === 0 && enrolledPersistedCount === 0) {
        batch.status = 'failed';
      } else if (totalFailed > 0 || totalRejected > 0 || totalSkipped > 0) {
        batch.status = 'reconciled_partial';
      } else {
        batch.status = 'completed';
      }

      batch.auditTrail.push({
        at: new Date().toISOString(),
        actorUserId: 'system',
        actorUsername: 'system',
        action: 'batch_reconciled',
        details: `Reconciliação automática pós-reinício concluída (${batch.status}): ${createdPersistedCount} conta(s) confirmada(s), ${enrolledPersistedCount} inscrição(ões) confirmada(s).`,
      });
      reconciledIds.push(batch.importBatchId);
    }

    saveImportBatches(batches);
    return { reconciledCount: reconciledIds.length, batchIds: reconciledIds };
  });
}

export function listImportBatches(filters?: {
  search?: string;
  mode?: ImportOperationMode | 'all';
  status?: string;
}): ImportBatch[] {
  const batches = loadImportBatches();
  const q = (filters?.search || '').trim().toLowerCase();

  return batches.filter((b) => {
    if (filters?.mode && filters.mode !== 'all' && b.mode !== filters.mode) return false;
    if (filters?.status && filters.status !== 'all' && b.status !== filters.status) return false;
    if (q) {
      const hit =
        b.name.toLowerCase().includes(q) ||
        b.importTag.toLowerCase().includes(q) ||
        b.importBatchId.toLowerCase().includes(q) ||
        (b.tournamentName && b.tournamentName.toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });
}

export function getImportBatchDetails(
  batchId: string,
  tournamentsMap: Map<string, Tournament>
): { batch: ImportBatch; users: ImportBatchDetailUser[] } | null {
  const batches = loadImportBatches();
  const batch = batches.find((b) => b.importBatchId === batchId);
  if (!batch) return null;

  const allUsers = getAllUsers();
  const usersById = new Map<string, UserRecord>();
  for (const u of allUsers) usersById.set(u.id, u);

  const tournament = batch.tournamentId ? tournamentsMap.get(batch.tournamentId) : undefined;
  const tournamentEnrolledIds = new Set<string>();
  if (tournament) {
    for (const e of tournament.entries) {
      for (const uid of e.userIds) tournamentEnrolledIds.add(uid);
    }
  }

  const users: ImportBatchDetailUser[] = batch.items.map((item) => {
    const liveUser = item.userId ? usersById.get(item.userId) : undefined;
    let accountStatus: UserAccountStatus | 'deleted' | 'not_created';
    if (!item.userId) {
      accountStatus = 'not_created';
    } else if (!liveUser) {
      accountStatus = 'deleted';
    } else {
      accountStatus = getEffectiveUserStatus(liveUser);
    }

    return {
      lineNumber: item.lineNumber,
      username: liveUser?.username || item.username,
      displayName: liveUser?.displayName || item.displayName || item.username,
      userId: item.userId,
      userTag: liveUser?.tag || item.userTag,
      relationType: item.relationType,
      outcome: item.outcome,
      enrolledInTournament: item.enrolledInTournament,
      accountStatus,
      createdAt: liveUser?.createdAt,
      isCurrentlyInTournament: item.userId ? tournamentEnrolledIds.has(item.userId) : false,
      reasonCode: item.reasonCode,
      reasonMessage: item.reasonMessage,
    };
  });

  return { batch, users };
}

function collectUserDependencies(params: {
  user: UserRecord;
  tournamentsMap: Map<string, Tournament>;
  roomsMap: Map<string, RoomData>;
  statsMap: Record<string, any>;
  invites: InviteCode[];
}): string[] {
  const { user, tournamentsMap, roomsMap, statsMap, invites } = params;
  const deps: string[] = [];
  const unameLower = user.username.toLowerCase();
  const displayLower = normalizeDisplayName(user.displayName).toLowerCase();

  // 1. Career stats
  const userStats = statsMap[user.id] || statsMap[unameLower];
  if (userStats && ((userStats.gamesPlayed || 0) > 0 || (userStats.totalPoints || 0) > 0)) {
    deps.push(`Histórico de partidas (${userStats.gamesPlayed || 0} jogo(s), ${userStats.totalPoints || 0} pts)`);
  }

  // 2. Tournaments
  const touchedTournaments: string[] = [];
  for (const t of tournamentsMap.values()) {
    const inEntries = t.entries.some((e) => e.userIds.includes(user.id));
    const isCreator = t.createdByUserId === user.id;
    const inRounds = t.rounds.some((r) =>
      r.groups.some((g) => g.entryIds.some((eid) => t.entries.find((e) => e.id === eid)?.userIds.includes(user.id)))
    );
    if (inEntries || isCreator || inRounds) {
      touchedTournaments.push(t.config.name);
    }
  }
  if (touchedTournaments.length > 0) {
    deps.push(`Vínculo em torneio(s): ${touchedTournaments.slice(0, 3).join(', ')}`);
  }

  // 3. Active rooms
  for (const room of roomsMap.values()) {
    const inRoom = room.players.some(
      (p) =>
        !p.isBot &&
        (p.userId === user.id || p.name.toLowerCase() === displayLower || p.name.toLowerCase() === unameLower)
    );
    if (inRoom) {
      deps.push(`Presente na sala #${room.id} (${room.status})`);
      break;
    }
  }

  // 4. Invites
  const usedInvite = invites.some((inv) =>
    inv.usedBy.some((u) => u.username.toLowerCase() === unameLower)
  );
  if (usedInvite) {
    deps.push('Registro de utilização de convite');
  }

  return deps;
}

export function analyzeImportBatchUsersImpact(params: {
  batchId: string;
  userIds: string[];
  requestedAction: ImportUserManageAction;
  tournamentsMap: Map<string, Tournament>;
  roomsMap: Map<string, RoomData>;
  statsMap: Record<string, any>;
}): ImportImpactReport | null {
  const batches = loadImportBatches();
  const batch = batches.find((b) => b.importBatchId === params.batchId);
  if (!batch) return null;

  const allUsers = getAllUsers();
  const usersById = new Map<string, UserRecord>();
  for (const u of allUsers) usersById.set(u.id, u);

  const invites = getAllInvites();
  const requestedSet = new Set(params.userIds);
  const reportUsers: ImportUserDependencyItem[] = [];

  for (const item of batch.items) {
    if (!item.userId || !requestedSet.has(item.userId)) continue;
    const liveUser = usersById.get(item.userId);
    const isCreatedByBatch = item.relationType === 'created_by_batch';

    if (!liveUser) {
      reportUsers.push({
        userId: item.userId,
        username: item.username,
        displayName: item.displayName || item.username,
        userTag: item.userTag,
        relationType: item.relationType,
        accountStatus: 'deleted',
        canManageInBatch: false,
        canDelete: false,
        dependencies: ['Conta já removida anteriormente.'],
        recommendedAction: 'protected_preexisting',
      });
      continue;
    }

    if (!isCreatedByBatch) {
      reportUsers.push({
        userId: liveUser.id,
        username: liveUser.username,
        displayName: liveUser.displayName,
        userTag: liveUser.tag,
        relationType: item.relationType,
        accountStatus: getEffectiveUserStatus(liveUser),
        canManageInBatch: false,
        canDelete: false,
        dependencies: ['Conta pré-existente apenas inscrita por este lote (protegida contra gestão/exclusão pelo lote).'],
        recommendedAction: 'protected_preexisting',
      });
      continue;
    }

    if (liveUser.username.toLowerCase() === 'edinho' || liveUser.role === 'admin') {
      reportUsers.push({
        userId: liveUser.id,
        username: liveUser.username,
        displayName: liveUser.displayName,
        userTag: liveUser.tag,
        relationType: item.relationType,
        accountStatus: getEffectiveUserStatus(liveUser),
        canManageInBatch: false,
        canDelete: false,
        dependencies: ['Conta administrativa protegida.'],
        recommendedAction: 'protected_preexisting',
      });
      continue;
    }

    const dependencies = collectUserDependencies({
      user: liveUser,
      tournamentsMap: params.tournamentsMap,
      roomsMap: params.roomsMap,
      statsMap: params.statsMap,
      invites,
    });

    const canDelete = dependencies.length === 0;
    reportUsers.push({
      userId: liveUser.id,
      username: liveUser.username,
      displayName: liveUser.displayName,
      userTag: liveUser.tag,
      relationType: item.relationType,
      accountStatus: getEffectiveUserStatus(liveUser),
      canManageInBatch: true,
      canDelete,
      dependencies,
      recommendedAction: canDelete ? 'delete_allowed' : 'disable_or_archive',
    });
  }

  return {
    batchId: batch.importBatchId,
    requestedAction: params.requestedAction,
    users: reportUsers,
  };
}

export async function manageImportBatchUsers(params: {
  batchId: string;
  userIds: string[];
  action: ImportUserManageAction;
  reason?: string;
  actor: { id: string; username: string };
  tournamentsMap: Map<string, Tournament>;
  roomsMap: Map<string, RoomData>;
  statsMap: Record<string, any>;
}): Promise<{
  success: boolean;
  error?: string;
  affectedUserIds: string[];
  skipped: Array<{ userId: string; username: string; reason: string }>;
  impactReport?: ImportImpactReport;
}> {
  const impact = analyzeImportBatchUsersImpact({
    batchId: params.batchId,
    userIds: params.userIds,
    requestedAction: params.action,
    tournamentsMap: params.tournamentsMap,
    roomsMap: params.roomsMap,
    statsMap: params.statsMap,
  });

  if (!impact) {
    return {
      success: false,
      error: 'Lote de importação não encontrado.',
      affectedUserIds: [],
      skipped: [],
    };
  }

  const eligibleIds: string[] = [];
  const skipped: Array<{ userId: string; username: string; reason: string }> = [];

  for (const u of impact.users) {
    if (!u.canManageInBatch) {
      skipped.push({
        userId: u.userId,
        username: u.username,
        reason: u.dependencies[0] || 'Usuário não pertence à criação deste lote.',
      });
      continue;
    }

    if (params.action === 'delete' && !u.canDelete) {
      skipped.push({
        userId: u.userId,
        username: u.username,
        reason: `Possui dependências históricas/ativas (${u.dependencies.join('; ')}). Desative ou arquive em vez de excluir.`,
      });
      continue;
    }

    eligibleIds.push(u.userId);
  }

  if (eligibleIds.length === 0) {
    return {
      success: false,
      error:
        skipped[0]?.reason ||
        'Nenhum dos usuários selecionados é elegível para esta ação.',
      affectedUserIds: [],
      skipped,
      impactReport: impact,
    };
  }

  let affectedUserIds: string[] = [];
  if (params.action === 'delete') {
    const res = await removeUsersByIds(eligibleIds);
    affectedUserIds = res.deletedIds;
  } else {
    const targetStatus: UserAccountStatus =
      params.action === 'disable'
        ? 'disabled'
        : params.action === 'archive'
          ? 'archived'
          : 'active';
    const res = await setUsersStatus(eligibleIds, targetStatus, params.reason);
    affectedUserIds = res.updatedIds;
  }

  // Record audit event on the batch
  if (affectedUserIds.length > 0) {
    await withDataLock(() => {
      const batches = loadImportBatches();
      const batch = batches.find((b) => b.importBatchId === params.batchId);
      if (batch) {
        const actionMap: Record<ImportUserManageAction, ImportAuditEvent['action']> = {
          disable: 'user_disabled',
          archive: 'user_archived',
          reactivate: 'user_reactivated',
          delete: 'user_deleted',
        };
        batch.auditTrail.push({
          at: new Date().toISOString(),
          actorUserId: params.actor.id,
          actorUsername: params.actor.username,
          action: actionMap[params.action],
          targetUserIds: affectedUserIds,
          details: `Ação "${params.action}" aplicada em ${affectedUserIds.length} usuário(s) criado(s) pelo lote.${params.reason ? ` Motivo: ${params.reason}` : ''}`,
        });
        saveImportBatches(batches);
      }
    });
  }

  return {
    success: true,
    affectedUserIds,
    skipped,
    impactReport: impact,
  };
}
