import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import { WebSocket } from 'ws';

const tempDataDir = vi.hoisted(() => {
  const dir = `${process.cwd()}/.tmp_imp_int_${process.pid}_${Date.now()}`;
  process.env.DATA_DIR = dir;
  process.env.DISABLE_AUTO_START = 'true';
  process.env.ADMIN_PIN = '9999';
  return dir;
});

import { server, tournaments } from '../server.js';
import { generateToken, getAllUsers } from '../server/authService.js';

describe('Bulk User Importer HTTP & WebSocket Integration Tests', () => {
  let baseUrl = '';
  let wsPort = 0;
  let adminToken = '';
  let playerToken = '';
  let indivTournamentId = '';
  let doublesTournamentId = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          wsPort = addr.port;
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });

    const users = getAllUsers();
    const admin = users.find((u) => u.username === 'edinho')!;
    const player = users.find((u) => u.username === 'will')!;
    adminToken = generateToken(admin);
    playerToken = generateToken(player);

    // Create individual and doubles tournaments
    const resIndiv = await fetch(`${baseUrl}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Torneio Integração Indiv', modality: 'individual' }),
    });
    const dataIndiv = await resIndiv.json();
    indivTournamentId = dataIndiv.tournament.config.id;

    const resDoubles = await fetch(`${baseUrl}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Torneio Integração Duplas', modality: 'doubles', bestOf: 3 }),
    });
    const dataDoubles = await resDoubles.json();
    doublesTournamentId = dataDoubles.tournament.config.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    } catch {}
  });

  it('rejects unauthenticated, non-admin JWT, and x-admin-pin-only requests on /api/admin/import/*', async () => {
    const resAnon = await fetch(`${baseUrl}/api/admin/import/batches`);
    expect(resAnon.status).toBe(403);

    const resPlayer = await fetch(`${baseUrl}/api/admin/import/batches`, {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    expect(resPlayer.status).toBe(403);

    // x-admin-pin without admin JWT must be rejected on bulk importer endpoints for audit traceability
    const resPinOnly = await fetch(`${baseUrl}/api/admin/import/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': '9999' },
      body: JSON.stringify({ rawText: 'username;displayName;password\nteste;Teste;1234', mode: 'create_only' }),
    });
    expect(resPinOnly.status).toBe(403);
  });

  it('accepts payloads larger than 100 KB (up to 512 KB) via dedicated 1mb JSON parser', async () => {
    // 180 lines with long descriptions/quotes (~120 KB total JSON body)
    const rows = ['username;displayName;password'];
    for (let i = 1; i <= 180; i++) {
      rows.push(`bulk.p${i};Player ${i};pass1234`);
    }
    const padding = ' '.repeat(120 * 1024);
    const res = await fetch(`${baseUrl}/api/admin/import/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ rawText: rows.join('\n') + '\n' + padding, mode: 'create_only' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.summary.totalLines).toBe(180);
  });

  it('runs complete Phase 1 -> 2 -> 3 -> 4 workflow including WebSocket live disconnection and login lock', async () => {
    // 1. Doubles tournament supported with pairs of rows
    const dblRes = await fetch(`${baseUrl}/api/admin/import/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        rawText: 'username;displayName;password\njog_dbl1;Jog Duplas 1;1234\njog_dbl2;Jog Duplas 2;1234',
        mode: 'create_and_enroll',
        tournamentId: doublesTournamentId,
      }),
    });
    expect(dblRes.status).toBe(200);
    const dblData = await dblRes.json();
    expect(dblData.success).toBe(true);
    expect(dblData.tournament.compatible).toBe(true);
    expect(dblData.summary.eligibleEnrollCount).toBe(2);

    const commitDbl = await fetch(`${baseUrl}/api/admin/import/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: 'Lote Duplas Integração',
        importTag: 'INT_DUPLAS',
        mode: 'create_and_enroll',
        sourceType: 'text_paste',
        tournamentId: doublesTournamentId,
        rawText: 'username;displayName;password\njog_dbl1;Jog Duplas 1;1234\njog_dbl2;Jog Duplas 2;1234',
      }),
    });
    expect(commitDbl.status).toBe(201);
    const commitDblData = await commitDbl.json();
    expect(commitDblData.success).toBe(true);
    expect(commitDblData.batch.summary.totalEnrolled).toBe(2);

    const tournRes = await fetch(`${baseUrl}/api/tournaments/${doublesTournamentId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const tournData = await tournRes.json();
    expect(tournData.tournament.entries).toHaveLength(1);
    expect(tournData.tournament.entries[0].kind).toBe('team');
    expect(tournData.tournament.entries[0].userIds).toHaveLength(2);

    // 2. Commit Mode B (create_and_enroll) + Mode A user for clean delete test
    const commitB = await fetch(`${baseUrl}/api/admin/import/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: 'Lote Copa Integração',
        importTag: 'INT_COPA',
        mode: 'create_and_enroll',
        sourceType: 'csv_upload',
        tournamentId: indivTournamentId,
        rawText: 'username;displayName;password\nint.user1;Integrado Um;1234\nint.user2;Integrado Dois;5678',
      }),
    });
    expect(commitB.status).toBe(201);
    const commitBData = await commitB.json();
    expect(commitBData.success).toBe(true);
    const batchId = commitBData.batch.importBatchId;
    const user1Id = commitBData.batch.items[0].userId;

    // 3. List batches & inspect detail (no passwords/hashes returned)
    const listRes = await fetch(`${baseUrl}/api/admin/import/batches?search=INT_COPA`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listData = await listRes.json();
    expect(listData.batches).toHaveLength(1);

    const detailRes = await fetch(`${baseUrl}/api/admin/import/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const detailData = await detailRes.json();
    expect(detailData.users).toHaveLength(2);
    expect(JSON.stringify(detailData)).not.toContain('1234');
    expect(JSON.stringify(detailData)).not.toContain('passwordHash');

    // 4. Login as int.user1 and connect WebSocket
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'int.user1', password: '1234' }),
    });
    const loginData = await loginRes.json();
    expect(loginData.success).toBe(true);
    const user1Token = loginData.token;

    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws?token=${encodeURIComponent(user1Token)}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    const closedPromise = new Promise<number>((resolve) => {
      ws.once('close', (code) => resolve(code));
    });

    // 5. Impact preview confirms deletion is blocked due to tournament participation
    const impactRes = await fetch(`${baseUrl}/api/admin/import/batches/${batchId}/users/impact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ userIds: [user1Id], action: 'delete' }),
    });
    const impactData = await impactRes.json();
    expect(impactData.impact.users[0].canDelete).toBe(false);

    // 6. Disable int.user1 -> active WS must be immediately disconnected with code 4003
    const disableRes = await fetch(`${baseUrl}/api/admin/import/batches/${batchId}/users/manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ userIds: [user1Id], action: 'disable', reason: 'Teste integração' }),
    });
    expect(disableRes.status).toBe(200);
    const closeCode = await closedPromise;
    expect(closeCode).toBe(4003);

    // 7. Disabled user rejected on /api/auth/login, /api/auth/me, and new WS handshake
    const loginAfter = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'int.user1', password: '1234' }),
    });
    expect(loginAfter.status).toBe(403);

    const meAfter = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(meAfter.status).toBe(401);

    const wsBlocked = new WebSocket(`ws://127.0.0.1:${wsPort}/ws?token=${encodeURIComponent(user1Token)}`);
    const wsBlockedClose = await new Promise<number>((resolve) => {
      wsBlocked.once('close', (code) => resolve(code));
    });
    expect(wsBlockedClose).toBe(4003);

    // 8. Reactivate int.user1 restores /api/auth/me and login
    const reactivateRes = await fetch(`${baseUrl}/api/admin/import/batches/${batchId}/users/manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ userIds: [user1Id], action: 'reactivate' }),
    });
    expect(reactivateRes.status).toBe(200);
    const meRestored = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(meRestored.status).toBe(200);

    // 9. Mode A clean user without dependencies CAN be deleted safely
    const commitA = await fetch(`${baseUrl}/api/admin/import/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: 'Lote Limpeza Segura',
        importTag: 'SAFE_DEL',
        mode: 'create_only',
        sourceType: 'text_paste',
        rawText: 'username;displayName;password\ntemp.del;Temp Delete;1234',
      }),
    });
    const commitAData = await commitA.json();
    const delBatchId = commitAData.batch.importBatchId;
    const tempUserId = commitAData.batch.items[0].userId;

    const delRes = await fetch(`${baseUrl}/api/admin/import/batches/${delBatchId}/users/manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ userIds: [tempUserId], action: 'delete' }),
    });
    expect(delRes.status).toBe(200);
    const delData = await delRes.json();
    expect(delData.affectedUserIds).toEqual([tempUserId]);
    expect(tournaments.get(indivTournamentId)?.entries.length).toBe(2);
  });
});
