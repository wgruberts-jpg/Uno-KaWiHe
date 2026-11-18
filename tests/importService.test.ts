import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { monitorEventLoopDelay } from 'perf_hooks';

const tempDataDir = vi.hoisted(() => {
  const dir = `${process.cwd()}/.tmp_imp_svc_${process.pid}_${Date.now()}`;
  process.env.DATA_DIR = dir;
  return dir;
});

import {
  adminCreateUser,
  adminResetPassword,
  getAllUsers,
  getUserFromToken,
  loginUser,
  saveUsers,
} from '../server/authService.js';
import { atomicWriteFileSync } from '../server/dataLock.js';
import {
  analyzeImportBatchUsersImpact,
  commitImportBatch,
  getImportBatchDetails,
  hashPasswordsInWorker,
  listImportBatches,
  loadImportBatches,
  manageImportBatchUsers,
  reconcileIncompleteImportBatches,
  validateImportBatch,
} from '../server/importService.js';
import { createTournament, Tournament } from '../server/tournamentEngine.js';

describe('Bulk User Importer Service Tests (Phases 1-4 + WAL + Benchmark)', () => {
  const tournamentsMap = new Map<string, Tournament>();
  let indivTournament: Tournament;
  let doublesTournament: Tournament;
  let closedTournament: Tournament;

  beforeAll(() => {
    getAllUsers();
    indivTournament = createTournament(
      {
        id: 'tourn_imp_indiv',
        name: 'Copa Individual Maio',
        modality: 'individual',
        gamesPerGroup: 3,
        advancePerGroup: 1,
        tieBreakerPolicy: 'extra_match',
        reconnectGraceMs: 30000,
        spectatorMode: 'table_only',
        turnDurationSeconds: 30,
      },
      'usr_edinho',
      Date.now()
    );
    doublesTournament = createTournament(
      {
        id: 'tourn_imp_doubles',
        name: 'Copa Duplas Maio',
        modality: 'doubles',
        bestOf: 3,
        tieBreakerPolicy: 'extra_match',
        reconnectGraceMs: 30000,
        spectatorMode: 'table_only',
        turnDurationSeconds: 30,
      },
      'usr_edinho',
      Date.now()
    );
    closedTournament = {
      ...indivTournament,
      config: { ...indivTournament.config, id: 'tourn_imp_closed', name: 'Copa Encerrada' },
      status: 'finished',
    };
    tournamentsMap.set(indivTournament.config.id, indivTournament);
    tournamentsMap.set(doublesTournament.config.id, doublesTournament);
    tournamentsMap.set(closedTournament.config.id, closedTournament);
  }, 20000);

  afterAll(() => {
    try {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    } catch {}
  });

  it('enforces standardized 4-char minimum password across adminCreateUser & adminResetPassword', async () => {
    const shortCreate = await adminCreateUser({ username: 'shortpwd', password: '123', displayName: 'Short Pwd' });
    expect(shortCreate.success).toBe(false);
    expect(shortCreate.error).toContain('4');

    const okCreate = await adminCreateUser({ username: 'okpwduser', password: '1234', displayName: 'Ok Pwd' });
    expect(okCreate.success).toBe(true);

    const shortReset = await adminResetPassword(okCreate.user!.id, 'abc');
    expect(shortReset.success).toBe(false);
    expect(shortReset.error).toContain('4');

    const okReset = await adminResetPassword(okCreate.user!.id, 'abcd');
    expect(okReset.success).toBe(true);

    // Garante que ADMIN_PIN não funciona como atalho de senha para login de admin
    const adminPinAsPass = await loginUser({
      username: 'edinho',
      password: process.env.ADMIN_PIN || '774007',
    });
    expect(adminPinAsPass.success).toBe(false);
  }, 15000);

  it('Fase 1: validates mandatory displayName, NFKC uniqueness, 4-char password, and commits Mode A without storing secrets', async () => {
    const csv = [
      'username;displayName;password',
      'alice.uno;Alice Silva;1234',
      'bob.uno;;1234', // missing displayName -> rejected
      'carol.uno;Carol Paz;123', // < 4 chars password -> rejected
      'alice.uno;Alice 2;1234', // duplicate username in file -> rejected
      'dave.uno;\u200BAlice\u200B  silva;1234', // NFKC + zero-width duplicate displayName -> rejected
      'eve.uno;Eve Santos;9876',
    ].join('\n');

    const val = validateImportBatch({
      rawText: csv,
      mode: 'create_only',
      tournamentsMap,
    });

    expect(val.success).toBe(true);
    expect(val.summary?.validCount).toBe(2);
    expect(val.summary?.invalidCount).toBe(4);
    expect(val.rows[0].status).toBe('valid');
    expect(val.rows[1].codes).toContain('MISSING_DISPLAY_NAME');
    expect(val.rows[2].codes).toContain('INVALID_PASSWORD');
    expect(val.rows[3].codes).toContain('DUPLICATE_USERNAME_IN_FILE');
    expect(val.rows[4].codes).toContain('DUPLICATE_DISPLAY_NAME_IN_FILE');

    const commitRes = await commitImportBatch({
      rawText: csv,
      mode: 'create_only',
      sourceType: 'text_paste',
      name: 'Lote Fase 1',
      importTag: 'FASE1_A',
      idempotencyKey: 'idem_fase1_a',
      actor: { id: 'usr_edinho', username: 'edinho' },
      tournamentsMap,
    });

    expect(commitRes.success).toBe(true);
    expect(commitRes.batch?.summary.totalCreated).toBe(2);
    expect(commitRes.batch?.summary.totalRejected).toBe(4);
    expect(commitRes.batch?.status).toBe('partial');

    // Idempotency replay must not duplicate users
    const replayRes = await commitImportBatch({
      rawText: csv,
      mode: 'create_only',
      sourceType: 'text_paste',
      name: 'Lote Fase 1',
      idempotencyKey: 'idem_fase1_a',
      actor: { id: 'usr_edinho', username: 'edinho' },
      tournamentsMap,
    });
    expect(replayRes.success).toBe(true);
    expect(replayRes.idempotentHit).toBe(true);
    expect(replayRes.batch?.importBatchId).toBe(commitRes.batch?.importBatchId);

    // Privacy check: zero plaintext passwords or bcrypt hashes in import_batches.json
    const rawBatchesJson = fs.readFileSync(path.join(tempDataDir, 'import_batches.json'), 'utf-8');
    expect(rawBatchesJson).not.toContain('9876');
    expect(rawBatchesJson).not.toContain('$2a$');
    expect(rawBatchesJson).not.toContain('$2b$');

    // Login works with imported credentials and role is strictly player
    const loginAlice = await loginUser({ username: 'alice.uno', password: '1234' });
    expect(loginAlice.success).toBe(true);
    expect(loginAlice.user?.role).toBe('player');
    expect(loginAlice.user?.displayName).toBe('Alice Silva');

    // Provenance metadata & WAL checkpoint verification
    expect(commitRes.batch?.stepsCompleted.usersSaved).toBe(true);
    const aliceItem = commitRes.batch?.items.find((i) => i.username === 'alice.uno');
    expect(aliceItem?.userOpStatus).toBe('persisted');
    expect(aliceItem?.userPersistedAt).toBeTruthy();

    const aliceRecord = getAllUsers().find((u) => u.username === 'alice.uno');
    expect(aliceRecord?.createdByImportBatchId).toBe(commitRes.batch?.importBatchId);
    expect(aliceRecord?.createdByImportOperationId).toBe(aliceItem?.operationId);
  });

  it('Fase 2: supports Mode B (create_and_enroll) and Mode C (enroll_existing) with doubles tournaments using consecutive pairs (1st & 2nd = team)', async () => {
    // Odd rows should mark only the trailing odd valid row as invalid for doubles
    const oddVal = validateImportBatch({
      rawText: 'username;displayName;password\njog1;Jogador Um;1234\njog2;Jogador Dois;1234\njog3;Jogador Tres;1234',
      mode: 'create_and_enroll',
      tournamentId: doublesTournament.config.id,
      tournamentsMap,
    });
    expect(oddVal.success).toBe(true);
    expect(oddVal.tournament?.compatible).toBe(true);
    expect(oddVal.summary?.validCount).toBe(2);
    expect(oddVal.summary?.invalidCount).toBe(1);
    expect(oddVal.rows[2].codes).toContain('ODD_ROW_COUNT_DOUBLES');

    // Even rows (2 rows = 1 team) should be valid and successfully commit in Mode B
    const modeBDoublesRes = await commitImportBatch({
      rawText: 'username;displayName;password\ndoubles1;Dupla A Um;1234\ndoubles2;Dupla A Dois;5678',
      mode: 'create_and_enroll',
      sourceType: 'csv_upload',
      tournamentId: doublesTournament.config.id,
      name: 'Lote Duplas 2v2',
      actor: { id: 'usr_admin', username: 'edinho' },
      tournamentsMap,
    });

    expect(modeBDoublesRes.success).toBe(true);
    const updatedDoublesAfterB = tournamentsMap.get(doublesTournament.config.id)!;
    expect(updatedDoublesAfterB.entries.length).toBe(1);
    expect(updatedDoublesAfterB.entries[0].kind).toBe('team');
    expect(updatedDoublesAfterB.entries[0].userIds.length).toBe(2);

    // Mode C: enroll_existing on doubles tournament pairs consecutive rows (will + henry = 2nd team)
    const modeCDoublesRes = await commitImportBatch({
      rawText: 'username\nwill\nhenry',
      mode: 'enroll_existing',
      sourceType: 'text_paste',
      tournamentId: doublesTournament.config.id,
      name: 'Lote Duplas Existentes',
      actor: { id: 'usr_admin', username: 'edinho' },
      tournamentsMap,
    });
    expect(modeCDoublesRes.success).toBe(true);
    const updatedDoublesAfterC = tournamentsMap.get(doublesTournament.config.id)!;
    expect(updatedDoublesAfterC.entries.length).toBe(2);
    expect(updatedDoublesAfterC.entries[1].kind).toBe('team');
    expect(updatedDoublesAfterC.entries[1].userIds.length).toBe(2);

    const closedVal = validateImportBatch({
      rawText: 'username\nwill',
      mode: 'enroll_existing',
      tournamentId: closedTournament.config.id,
      tournamentsMap,
    });
    expect(closedVal.success).toBe(false);

    // Mode B: create_and_enroll on individual tournament
    const modeBRes = await commitImportBatch({
      rawText: 'username;displayName;password\njoana.t;Joana Torneio;1234\nlucas.t;Lucas Torneio;5678',
      mode: 'create_and_enroll',
      sourceType: 'csv_upload',
      tournamentId: indivTournament.config.id,
      name: 'Lote Modo B',
      importTag: 'MODO_B',
      actor: { id: 'usr_edinho', username: 'edinho' },
      tournamentsMap,
    });
    expect(modeBRes.success).toBe(true);
    expect(modeBRes.batch?.summary.totalCreated).toBe(2);
    expect(modeBRes.batch?.summary.totalEnrolled).toBe(2);
    expect(modeBRes.batch?.items.every((i) => i.relationType === 'created_by_batch' && i.enrolledInTournament)).toBe(true);

    // Mode C: enroll_existing (will + already-enrolled joana.t + nonexistent)
    const modeCRes = await commitImportBatch({
      rawText: 'username\nwill\njoana.t\nnaoexiste',
      mode: 'enroll_existing',
      sourceType: 'text_paste',
      tournamentId: indivTournament.config.id,
      name: 'Lote Modo C',
      importTag: 'MODO_C',
      actor: { id: 'usr_edinho', username: 'edinho' },
      tournamentsMap,
    });
    expect(modeCRes.success).toBe(true);
    expect(modeCRes.batch?.summary.totalCreated).toBe(0);
    expect(modeCRes.batch?.summary.totalEnrolled).toBe(1);
    expect(modeCRes.batch?.summary.totalSkipped).toBe(1); // joana.t already enrolled
    expect(modeCRes.batch?.summary.totalRejected).toBe(1); // naoexiste
    const willItem = modeCRes.batch?.items.find((i) => i.username === 'will');
    expect(willItem?.relationType).toBe('existing_enrolled_only');
  });

  it('WAL Recovery: reconciles an interrupted in_progress batch after simulated crash without duplicating users', async () => {
    const crashUser = {
      id: 'usr_wal_crash_1',
      username: 'wal.crash',
      passwordHash: '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhashdu',
      displayName: 'WAL Crash',
      avatar: '🦸‍♂️',
      role: 'player' as const,
      tag: '#8899',
      createdAt: new Date().toISOString(),
      status: 'active' as const,
    };
    const users = getAllUsers();
    users.push(crashUser);
    saveUsers(users);

    const batches = loadImportBatches();
    batches.unshift({
      importBatchId: 'imp_crashed_wal_test',
      name: 'Lote Interrompido WAL',
      importTag: 'WAL_TEST',
      mode: 'create_and_enroll',
      sourceType: 'text_paste',
      delimiterUsed: ';',
      tournamentId: indivTournament.config.id,
      tournamentName: indivTournament.config.name,
      idempotencyKey: 'idem_wal_test',
      createdAt: new Date().toISOString(),
      createdByUserId: 'usr_edinho',
      createdByUsername: 'edinho',
      status: 'in_progress',
      stepsCompleted: { usersSaved: false, tournamentSaved: false, batchFinalized: false },
      summary: {
        totalReceived: 2,
        totalValid: 2,
        totalCreated: 0,
        totalEnrolled: 0,
        totalSkipped: 0,
        totalRejected: 0,
        totalFailed: 0,
      },
      items: [
        {
          operationId: 'op_wal_1',
          lineNumber: 2,
          username: 'wal.crash',
          displayName: 'WAL Crash',
          userId: 'usr_wal_crash_1',
          userTag: '#8899',
          relationType: 'created_by_batch',
          userOpStatus: 'persisted',
          enrollOpStatus: 'pending',
          outcome: 'created_and_enrolled',
          enrolledInTournament: false,
        },
        {
          operationId: 'op_wal_2',
          lineNumber: 3,
          username: 'wal.missing',
          displayName: 'WAL Missing',
          userId: 'usr_wal_missing_999',
          relationType: 'created_by_batch',
          userOpStatus: 'persisted',
          enrollOpStatus: 'pending',
          outcome: 'created_and_enrolled',
          enrolledInTournament: false,
        },
      ],
      auditTrail: [
        {
          at: new Date().toISOString(),
          actorUserId: 'usr_edinho',
          actorUsername: 'edinho',
          action: 'batch_started',
          details: 'Simulação de queda.',
        },
      ],
    });
    atomicWriteFileSync(path.join(tempDataDir, 'import_batches.json'), JSON.stringify(batches, null, 2));

    const rec = await reconcileIncompleteImportBatches(tournamentsMap);
    expect(rec.reconciledCount).toBe(1);
    expect(rec.batchIds).toContain('imp_crashed_wal_test');

    const detail = getImportBatchDetails('imp_crashed_wal_test', tournamentsMap);
    expect(detail?.batch.status).toBe('partial');
    expect(detail?.batch.stepsCompleted.usersSaved).toBe(true);
    expect(detail?.batch.stepsCompleted.batchFinalized).toBe(true);
    expect(detail?.batch.summary.totalCreated).toBe(1);
    expect(detail?.batch.summary.totalEnrolled).toBe(1);
    expect(detail?.batch.summary.totalFailed).toBe(1);
    expect(detail?.batch.auditTrail.some((a) => a.action === 'batch_reconciled')).toBe(true);
    // Must not duplicate wal.crash in users.json
    expect(getAllUsers().filter((u) => u.username === 'wal.crash')).toHaveLength(1);
  });

  it('WAL Recovery (Multi-Item): preserves sequential enrollments across multiple persisted users without overwriting', async () => {
    const crashUserA = {
      id: 'usr_wal_multi_a',
      username: 'wal.multi.a',
      passwordHash: '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhashdu',
      displayName: 'WAL Multi A',
      avatar: '🦊',
      role: 'player' as const,
      tag: '#8901',
      createdAt: new Date().toISOString(),
      status: 'active' as const,
    };
    const crashUserB = {
      id: 'usr_wal_multi_b',
      username: 'wal.multi.b',
      passwordHash: '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhashdu',
      displayName: 'WAL Multi B',
      avatar: '🐯',
      role: 'player' as const,
      tag: '#8902',
      createdAt: new Date().toISOString(),
      status: 'active' as const,
    };
    const users = getAllUsers();
    users.push(crashUserA, crashUserB);
    saveUsers(users);

    const batches = loadImportBatches();
    batches.unshift({
      importBatchId: 'imp_crashed_wal_multi',
      name: 'Lote Multi WAL',
      importTag: 'WAL_MULTI',
      mode: 'create_and_enroll',
      sourceType: 'text_paste',
      delimiterUsed: ';',
      tournamentId: indivTournament.config.id,
      tournamentName: indivTournament.config.name,
      idempotencyKey: 'idem_wal_multi_test',
      createdAt: new Date().toISOString(),
      createdByUserId: 'usr_edinho',
      createdByUsername: 'edinho',
      status: 'running',
      stepsCompleted: { usersSaved: true, tournamentSaved: false, batchFinalized: false },
      summary: {
        totalReceived: 2,
        totalValid: 2,
        totalCreated: 2,
        totalEnrolled: 0,
        totalSkipped: 0,
        totalRejected: 0,
        totalFailed: 0,
      },
      items: [
        {
          operationId: 'op_wal_multi_a',
          lineNumber: 2,
          username: 'wal.multi.a',
          displayName: 'WAL Multi A',
          userId: 'usr_wal_multi_a',
          userTag: '#8901',
          relationType: 'created_by_batch',
          userOpStatus: 'persisted',
          enrollOpStatus: 'pending',
          outcome: 'created_and_enrolled',
          enrolledInTournament: false,
        },
        {
          operationId: 'op_wal_multi_b',
          lineNumber: 3,
          username: 'wal.multi.b',
          displayName: 'WAL Multi B',
          userId: 'usr_wal_multi_b',
          userTag: '#8902',
          relationType: 'created_by_batch',
          userOpStatus: 'persisted',
          enrollOpStatus: 'pending',
          outcome: 'created_and_enrolled',
          enrolledInTournament: false,
        },
      ],
      auditTrail: [
        {
          at: new Date().toISOString(),
          actorUserId: 'usr_edinho',
          actorUsername: 'edinho',
          action: 'batch_started',
          details: 'Queda após persistência de 2 usuários antes de salvar torneio.',
        },
      ],
    });
    atomicWriteFileSync(path.join(tempDataDir, 'import_batches.json'), JSON.stringify(batches, null, 2));

    const rec = await reconcileIncompleteImportBatches(tournamentsMap);
    expect(rec.reconciledCount).toBe(1);
    expect(rec.batchIds).toContain('imp_crashed_wal_multi');

    const detail = getImportBatchDetails('imp_crashed_wal_multi', tournamentsMap);
    expect(detail?.batch.status).toBe('completed');
    expect(detail?.batch.summary.totalEnrolled).toBe(2);
    expect(detail?.batch.items.every((i) => i.enrollOpStatus === 'persisted' && i.enrolledAt)).toBe(true);

    const updatedTournament = tournamentsMap.get(indivTournament.config.id)!;
    expect(updatedTournament.entries.some((e) => e.userIds.includes('usr_wal_multi_a'))).toBe(true);
    expect(updatedTournament.entries.some((e) => e.userIds.includes('usr_wal_multi_b'))).toBe(true);
  });

  it('Fase 3 & 4: filters history, enforces dependency-safe deletion, blocks disabled/archived login & token, and protects pre-existing users', async () => {
    const listAll = listImportBatches();
    expect(listAll.length).toBeGreaterThanOrEqual(3);

    const filtered = listImportBatches({ search: 'MODO_C' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Lote Modo C');

    // Pre-existing user 'will' enrolled in MODO_C must be protected against management/deletion
    const willUser = getAllUsers().find((u) => u.username === 'will')!;
    const modeCBatch = filtered[0];
    const willImpact = analyzeImportBatchUsersImpact({
      batchId: modeCBatch.importBatchId,
      userIds: [willUser.id],
      requestedAction: 'delete',
      tournamentsMap,
      roomsMap: new Map(),
      statsMap: {},
    });
    expect(willImpact?.users[0].canManageInBatch).toBe(false);
    expect(willImpact?.users[0].recommendedAction).toBe('protected_preexisting');

    const managePreExisting = await manageImportBatchUsers({
      batchId: modeCBatch.importBatchId,
      userIds: [willUser.id],
      action: 'delete',
      actor: { id: 'usr_edinho', username: 'edinho' },
      tournamentsMap,
      roomsMap: new Map(),
      statsMap: {},
    });
    expect(managePreExisting.success).toBe(false);
    expect(getAllUsers().some((u) => u.id === willUser.id)).toBe(true);

    // User 'joana.t' created by MODO_B IS enrolled in indivTournament -> cannot delete, must disable/archive
    const modeBBatch = listImportBatches({ search: 'MODO_B' })[0];
    const joanaUser = getAllUsers().find((u) => u.username === 'joana.t')!;
    const joanaImpact = analyzeImportBatchUsersImpact({
      batchId: modeBBatch.importBatchId,
      userIds: [joanaUser.id],
      requestedAction: 'delete',
      tournamentsMap,
      roomsMap: new Map(),
      statsMap: {},
    });
    expect(joanaImpact?.users[0].canManageInBatch).toBe(true);
    expect(joanaImpact?.users[0].canDelete).toBe(false);
    expect(joanaImpact?.users[0].recommendedAction).toBe('disable_or_archive');

    // Disable joana.t -> login & getUserFromToken must immediately fail
    const joanaLoginBefore = await loginUser({ username: 'joana.t', password: '1234' });
    expect(joanaLoginBefore.success).toBe(true);
    const joanaToken = joanaLoginBefore.token!;
    expect(getUserFromToken(joanaToken)).not.toBeNull();

    const disableRes = await manageImportBatchUsers({
      batchId: modeBBatch.importBatchId,
      userIds: [joanaUser.id],
      action: 'disable',
      reason: 'Teste de bloqueio',
      actor: { id: 'usr_edinho', username: 'edinho' },
      tournamentsMap,
      roomsMap: new Map(),
      statsMap: {},
    });
    expect(disableRes.success).toBe(true);
    expect(disableRes.affectedUserIds).toEqual([joanaUser.id]);

    const joanaLoginDisabled = await loginUser({ username: 'joana.t', password: '1234' });
    expect(joanaLoginDisabled.success).toBe(false);
    expect(getUserFromToken(joanaToken)).toBeNull();

    // Reactivate restores login & token validity
    await manageImportBatchUsers({
      batchId: modeBBatch.importBatchId,
      userIds: [joanaUser.id],
      action: 'reactivate',
      actor: { id: 'usr_edinho', username: 'edinho' },
      tournamentsMap,
      roomsMap: new Map(),
      statsMap: {},
    });
    expect(getUserFromToken(joanaToken)).not.toBeNull();

    // User 'eve.uno' from FASE1_A has zero dependencies -> delete succeeds
    const fase1Batch = listImportBatches({ search: 'FASE1_A' })[0];
    const eveUser = getAllUsers().find((u) => u.username === 'eve.uno')!;
    const delEveRes = await manageImportBatchUsers({
      batchId: fase1Batch.importBatchId,
      userIds: [eveUser.id],
      action: 'delete',
      actor: { id: 'usr_edinho', username: 'edinho' },
      tournamentsMap,
      roomsMap: new Map(),
      statsMap: {},
    });
    expect(delEveRes.success).toBe(true);
    expect(delEveRes.affectedUserIds).toEqual([eveUser.id]);
    expect(getAllUsers().some((u) => u.id === eveUser.id)).toBe(false);
  });

  it('Performance Benchmark: hashes 200 passwords in Worker Thread with low main-thread event loop lag', async () => {
    const passwords = Array.from({ length: 200 }, (_, i) => `pass_${i}`);
    const h = monitorEventLoopDelay({ resolution: 10 });
    h.enable();
    const start = Date.now();
    const hashes = await hashPasswordsInWorker(passwords, 10);
    const elapsedMs = Date.now() - start;
    h.disable();

    const meanLagMs = Number((h.mean / 1e6).toFixed(2));
    const maxLagMs = Number((h.max / 1e6).toFixed(2));
    console.log(
      `[BENCHMARK 200 bcrypt rounds=10 in Worker] elapsedMs=${elapsedMs}ms, meanLagMs=${meanLagMs}ms, maxLagMs=${maxLagMs}ms`
    );

    expect(hashes).toHaveLength(200);
    expect(hashes[0].startsWith('$2')).toBe(true);
    // Main thread event-loop mean lag stays minimal even while hashing 200 accounts
    expect(meanLagMs).toBeLessThan(35);
  }, 60000);
});
