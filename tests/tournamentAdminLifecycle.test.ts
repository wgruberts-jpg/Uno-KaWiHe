import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import { WebSocket } from 'ws';

const tempDataDir = vi.hoisted(() => {
  const dir = `${process.cwd()}/.tmp_tourn_admin_test_${process.pid}_${Date.now()}`;
  process.env.DATA_DIR = dir;
  process.env.DISABLE_AUTO_START = 'true';
  return dir;
});

import {
  server,
  rooms,
  tournaments,
  saveTournamentsStrict,
  getAllStats,
  saveStatsStrict,
} from '../server.js';
import {
  adminCreateUser,
  generateToken,
  getAllUsers,
  getUsersFile,
  saveUsers,
} from '../server/authService.js';
import {
  _forceExpireChallengeForTest,
  _resetChallengesForTest,
  executeTournamentTempUsersCleanup,
  loadTournamentAuditLogs,
} from '../server/tournamentCleanupService.js';

interface TestWsClient {
  ws: WebSocket;
  messages: any[];
  waitFor: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
  send: (payload: Record<string, unknown>) => void;
  close: () => Promise<void>;
}

async function connectWsClient(port: number, token?: string): Promise<TestWsClient> {
  const url = token
    ? `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`
    : `ws://127.0.0.1:${port}/ws`;
  const ws = new WebSocket(url);
  const messages: any[] = [];
  const listeners: Array<(msg: any) => void> = [];

  ws.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString());
      messages.push(parsed);
      for (const fn of [...listeners]) fn(parsed);
    } catch {
      // ignore
    }
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), 4000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const waitFor = (predicate: (msg: any) => boolean, timeoutMs = 4000): Promise<any> => {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = listeners.indexOf(onMsg);
        if (idx >= 0) listeners.splice(idx, 1);
        reject(new Error(`Timeout waiting for WS message. Got: ${messages.map((m) => m.type).join(', ')}`));
      }, timeoutMs);
      const onMsg = (msg: any) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          const idx = listeners.indexOf(onMsg);
          if (idx >= 0) listeners.splice(idx, 1);
          resolve(msg);
        }
      };
      listeners.push(onMsg);
    });
  };

  const send = (payload: Record<string, unknown>) => {
    ws.send(JSON.stringify({ protocolVersion: 2, ...payload }));
  };

  const close = async () => {
    if (ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 1000);
      ws.once('close', () => {
        clearTimeout(t);
        resolve();
      });
      ws.close();
    });
  };

  return { ws, messages, waitFor, send, close };
}

async function apiJson(port: number, route: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await res.json();
  return { status: res.status, data };
}

function solveAdditionQuestion(question: string): number {
  const match = question.match(/(\d+)\s*\+\s*(\d+)/);
  if (!match) throw new Error(`Invalid math question format: ${question}`);
  return Number(match[1]) + Number(match[2]);
}

describe('Administração de Torneios: Encerramento, Reagendamento e Limpeza Segura de Usuários Temporários', () => {
  let port = 0;
  let adminToken = '';
  let adminId = '';
  let secondAdminToken = '';
  let willToken = '';
  let henryToken = '';
  let grazyToken = '';
  const openClients: TestWsClient[] = [];

  beforeAll(async () => {
    const users = getAllUsers();
    const admin = users.find((u) => u.username === 'edinho')!;
    const will = users.find((u) => u.username === 'will')!;
    const henry = users.find((u) => u.username === 'henry')!;
    const grazy = users.find((u) => u.username === 'grazy')!;

    adminId = admin.id;
    adminToken = generateToken(admin);
    willToken = generateToken(will);
    henryToken = generateToken(henry);
    grazyToken = generateToken(grazy);

    const secondAdminRes = await adminCreateUser({
      username: 'admin_sec',
      password: 'password123',
      displayName: 'Admin Secundário',
      role: 'admin',
    });
    expect(secondAdminRes.success).toBe(true);
    const secondAdminUser = getAllUsers().find((u) => u.username === 'admin_sec')!;
    secondAdminToken = generateToken(secondAdminUser);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    _resetChallengesForTest();
    while (openClients.length > 0) {
      const c = openClients.pop()!;
      await c.close();
    }
    for (const room of rooms.values()) {
      if (room.turnTimerInterval) clearInterval(room.turnTimerInterval);
      if (room.botTimerTimeout) clearTimeout(room.botTimerTimeout);
      if (room.stagedCardTimeout) clearTimeout(room.stagedCardTimeout);
      if (room.emptyRoomTimeout) clearTimeout(room.emptyRoomTimeout);
    }
    rooms.clear();
    tournaments.clear();
    saveTournamentsStrict();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('1 e 2. Encerrar torneio preserva usuários/resultados, bloqueia partidas ao vivo na mesa e impede novas inscrições/partidas após encerrado', async () => {
    const createRes = await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: {
        id: 'tourn_close_test',
        name: 'Torneio Teste Encerramento',
        modality: 'individual',
        gamesPerGroup: 1,
        advancePerGroup: 1,
        playAnimationDelaySeconds: 0,
      },
    });
    expect(createRes.status).toBe(201);

    // Importa 1 usuário permanente e 1 usuário temporário no torneio
    const impTemp = await apiJson(port, '/api/admin/import/commit', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Lote Temp Close',
        mode: 'create_and_enroll',
        sourceType: 'text_paste',
        tournamentId: 'tourn_close_test',
        createAsTemporary: true,
        rawText: 'username;displayName;password\ntmp_close_1;Temp Close Um;1234',
      },
    });
    expect(impTemp.status).toBe(201);

    // Inscreve usuário permanente existente
    expect((await apiJson(port, '/api/tournaments/tourn_close_test/register', { method: 'POST', token: willToken })).status).toBe(200);
    expect((await apiJson(port, '/api/tournaments/tourn_close_test/register', { method: 'POST', token: henryToken })).status).toBe(200);

    // Inicia torneio (cria sala em waiting)
    const startRes = await apiJson(port, '/api/tournaments/tourn_close_test/start', {
      method: 'POST',
      token: adminToken,
    });
    expect(startRes.status).toBe(200);
    const roomId = startRes.data.createdRoomIds[0] as string;
    const gameId = startRes.data.tournament.rounds[0].groups[0].games[0].id as string;

    // Simula partida realmente em andamento na mesa (playing) -> encerramento DEVE bloquear com 409
    const room = rooms.get(roomId)!;
    room.status = 'playing';
    const blockedClose = await apiJson(port, '/api/tournaments/tourn_close_test/close', {
      method: 'POST',
      token: adminToken,
      body: { reason: 'Tentativa durante jogo ao vivo' },
    });
    expect(blockedClose.status).toBe(409);
    expect(blockedClose.data.code).toBe('ACTIVE_MATCHES_IN_PROGRESS');
    expect(tournaments.get('tourn_close_test')?.status).toBe('running');

    // Retorna sala para waiting (não iniciada) e encerra o torneio
    room.status = 'waiting';
    const usersCountBeforeClose = getAllUsers().length;
    const closeRes = await apiJson(port, '/api/tournaments/tourn_close_test/close', {
      method: 'POST',
      token: adminToken,
      body: { reason: 'Fim do teste' },
    });
    expect(closeRes.status).toBe(200);
    expect(closeRes.data.tournament.status).toBe('closed');
    expect(closeRes.data.tournament.closedByUserId).toBe(adminId);
    expect(closeRes.data.tournament.closeReason).toBe('Fim do teste');

    // Nenhum usuário foi excluído ao encerrar!
    expect(getAllUsers().length).toBe(usersCountBeforeClose);
    expect(getAllUsers().some((u) => u.username === 'tmp_close_1')).toBe(true);
    // Jogo pendente não iniciado foi marcado como void por encerramento sem vencedor artificial
    const closedGame = closeRes.data.tournament.rounds[0].groups[0].games[0];
    expect(closedGame.status).toBe('void');
    expect(closedGame.resultReason).toBe('tournament_closed');
    expect(closedGame.winnerEntryId).toBeUndefined();

    // Bloqueia novas inscrições, edição, reagendamento, início e partida após encerramento
    expect((await apiJson(port, '/api/tournaments/tourn_close_test/register', { method: 'POST', token: grazyToken })).status).toBe(400);
    expect((await apiJson(port, '/api/tournaments/tourn_close_test/start', { method: 'POST', token: adminToken })).status).toBe(400);
    expect((await apiJson(port, `/api/tournaments/tourn_close_test/games/${gameId}/start`, { method: 'POST', token: adminToken })).status).toBe(400);
    expect((await apiJson(port, '/api/tournaments/tourn_close_test', { method: 'PUT', token: adminToken, body: { name: 'Novo Nome' } })).status).toBe(400);
    expect(
      (await apiJson(port, '/api/tournaments/tourn_close_test/reschedule', {
        method: 'POST',
        token: adminToken,
        body: { scheduledAt: Date.now() + 86_400_000 },
      })).status
    ).toBe(400);
  });

  it('3. Reagendar torneio preserva estado aberto (rescheduled), permite inscrições individuais/em lote e início posterior', async () => {
    await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: {
        id: 'tourn_resched_1',
        name: 'Torneio Reagendável',
        modality: 'individual',
        gamesPerGroup: 1,
        advancePerGroup: 1,
        scheduledAt: Date.now() + 3_600_000,
      },
    });

    // Data no passado deve ser recusada
    const pastRes = await apiJson(port, '/api/tournaments/tourn_resched_1/reschedule', {
      method: 'POST',
      token: adminToken,
      body: { scheduledAt: Date.now() - 60_000 },
    });
    expect(pastRes.status).toBe(400);

    // Reagendamento válido para data futura
    const newDate = Date.now() + 72 * 3_600_000;
    const reschedRes = await apiJson(port, '/api/tournaments/tourn_resched_1/reschedule', {
      method: 'POST',
      token: adminToken,
      body: { scheduledAt: newDate, reason: 'Mudança de fim de semana' },
    });
    expect(reschedRes.status).toBe(200);
    expect(reschedRes.data.tournament.status).toBe('rescheduled');
    expect(reschedRes.data.tournament.scheduledAt).toBe(newDate);
    expect(reschedRes.data.tournament.rescheduleHistory).toHaveLength(1);

    // Inscrição normal e via importação em massa continuam funcionando em torneio reagendado
    expect((await apiJson(port, '/api/tournaments/tourn_resched_1/register', { method: 'POST', token: willToken })).status).toBe(200);

    const impRes = await apiJson(port, '/api/admin/import/commit', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Lote Reagendado',
        mode: 'create_and_enroll',
        sourceType: 'text_paste',
        tournamentId: 'tourn_resched_1',
        createAsTemporary: false,
        rawText: 'username;displayName;password\nperm_resch;Perm Reagendado;1234',
      },
    });
    expect(impRes.status).toBe(201);

    // Admin ainda consegue iniciar normalmente
    const startRes = await apiJson(port, '/api/tournaments/tourn_resched_1/start', {
      method: 'POST',
      token: adminToken,
    });
    expect(startRes.status).toBe(200);
    expect(startRes.data.tournament.status).toBe('running');
  });

  it('4, 5 e 6. Exclui SOMENTE temporários do torneio alvo e preserva permanentes (mesmo criados na mesma janela) e temporários de outros torneios', async () => {
    // Cria dois torneios A e B
    await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: { id: 'tourn_A', name: 'Torneio Alfa', modality: 'individual' },
    });
    await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: { id: 'tourn_B', name: 'Torneio Beta', modality: 'individual' },
    });

    // Cria usuário permanente COM nome parecido com temporário ("temp_falso_permanente") via create_and_enroll SEM createAsTemporary
    const permImport = await apiJson(port, '/api/admin/import/commit', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Lote Permanentes Alfa',
        mode: 'create_and_enroll',
        sourceType: 'text_paste',
        tournamentId: 'tourn_A',
        createAsTemporary: false,
        rawText: 'username;displayName;password\ntemp_falso_perm;Temp Falso Perm;1234',
      },
    });
    expect(permImport.status).toBe(201);

    // Cria usuário permanente direto durante a preparação do torneio A
    const permDirect = await apiJson(port, '/api/admin/users/create', {
      method: 'POST',
      token: adminToken,
      body: {
        username: 'criado_na_hora_perm',
        password: '1234',
        displayName: 'Criado Permanente',
        role: 'player',
        isTemporary: false,
      },
    });
    expect(permDirect.status).toBe(200);
    expect(permDirect.data.user.isTemporary).toBe(false);
    expect(permDirect.data.user.accountOriginType).toBe('permanent');

    // Cria 2 temporários para Torneio A (1 via import, 1 via criação direta)
    const tempAImport = await apiJson(port, '/api/admin/import/commit', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Lote Temporários Alfa',
        mode: 'create_and_enroll',
        sourceType: 'text_paste',
        tournamentId: 'tourn_A',
        createAsTemporary: true,
        rawText: 'username;displayName;password\ntmp_alfa_1;Temp Alfa Um;1234',
      },
    });
    expect(tempAImport.status).toBe(201);

    const tempADirect = await apiJson(port, '/api/admin/users/create', {
      method: 'POST',
      token: adminToken,
      body: {
        username: 'tmp_alfa_2',
        password: '1234',
        displayName: 'Temp Alfa Dois',
        role: 'player',
        isTemporary: true,
        temporaryTournamentId: 'tourn_A',
      },
    });
    expect(tempADirect.status).toBe(200);
    expect(tempADirect.data.user.isTemporary).toBe(true);
    expect(tempADirect.data.user.temporaryTournamentId).toBe('tourn_A');

    // Cria 1 temporário exclusivo do Torneio B
    const tempBImport = await apiJson(port, '/api/admin/import/commit', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Lote Temporários Beta',
        mode: 'create_and_enroll',
        sourceType: 'text_paste',
        tournamentId: 'tourn_B',
        createAsTemporary: true,
        rawText: 'username;displayName;password\ntmp_beta_1;Temp Beta Um;1234',
      },
    });
    expect(tempBImport.status).toBe(201);

    // Encerra Torneio A (não exclui usuários automaticamente)
    const closeA = await apiJson(port, '/api/tournaments/tourn_A/close', {
      method: 'POST',
      token: adminToken,
      body: { reason: 'Teste finalizado' },
    });
    expect(closeA.status).toBe(200);
    expect(getAllUsers().some((u) => u.username === 'tmp_alfa_1')).toBe(true);

    // Conecta WS com tmp_alfa_1 para validar desconexão ao excluir
    const loginTmp1 = await apiJson(port, '/api/auth/login', {
      method: 'POST',
      body: { username: 'tmp_alfa_1', password: '1234' },
    });
    expect(loginTmp1.status).toBe(200);
    const wsTmp1 = await connectWsClient(port, loginTmp1.data.token);
    openClients.push(wsTmp1);
    const closedPromise = new Promise<number>((resolve) => wsTmp1.ws.once('close', (code) => resolve(code)));

    // Solicita desafio matemático para Torneio A
    const challengeRes = await apiJson(port, '/api/tournaments/tourn_A/temporary-users/challenge', {
      method: 'POST',
      token: adminToken,
    });
    expect(challengeRes.status).toBe(200);
    expect(challengeRes.data.canExecute).toBe(true);
    expect(challengeRes.data.temporaryUsersCount).toBe(2);
    expect(challengeRes.data.temporaryUsers.map((u: any) => u.username).sort()).toEqual(['tmp_alfa_1', 'tmp_alfa_2']);
    expect(challengeRes.data.permanentUsersPreservedCount).toBe(1); // temp_falso_permanente

    const expectedSum = solveAdditionQuestion(challengeRes.data.challenge.question);

    // Executa exclusão
    const delRes = await apiJson(port, '/api/tournaments/tourn_A/temporary-users/delete', {
      method: 'POST',
      token: adminToken,
      body: {
        challengeId: challengeRes.data.challenge.challengeId,
        answer: expectedSum,
        reason: 'Limpeza de teste Alfa',
      },
    });
    expect(delRes.status).toBe(200);
    expect(delRes.data.deletedCount).toBe(2);
    expect(await closedPromise).toBe(4003);

    const remainingUsernames = new Set(getAllUsers().map((u) => u.username));
    // Temporários do Torneio A foram excluídos
    expect(remainingUsernames.has('tmp_alfa_1')).toBe(false);
    expect(remainingUsernames.has('tmp_alfa_2')).toBe(false);
    // Permanentes e temporários de outros torneios foram PRESERVADOS
    expect(remainingUsernames.has('temp_falso_perm')).toBe(true);
    expect(remainingUsernames.has('criado_na_hora_perm')).toBe(true);
    expect(remainingUsernames.has('will')).toBe(true);
    expect(remainingUsernames.has('edinho')).toBe(true);
    expect(remainingUsernames.has('tmp_beta_1')).toBe(true);
  });

  it('7, 8 e 9. Segurança do desafio matemático: RBAC, resposta errada/limite 3 tentativas, expiração, reutilização e mismatch', async () => {
    await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: { id: 'tourn_sec_1', name: 'Torneio Segurança 1', modality: 'individual' },
    });
    await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: { id: 'tourn_sec_2', name: 'Torneio Segurança 2', modality: 'individual' },
    });
    await apiJson(port, '/api/admin/users/create', {
      method: 'POST',
      token: adminToken,
      body: {
        username: 'tmp_sec_1',
        password: '1234',
        displayName: 'Temp Segurança',
        isTemporary: true,
        temporaryTournamentId: 'tourn_sec_1',
      },
    });
    await apiJson(port, '/api/tournaments/tourn_sec_1/close', { method: 'POST', token: adminToken });

    // 7a. Usuário não-admin e sem auth bloqueados
    expect((await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/challenge', { method: 'POST' })).status).toBe(403);
    expect((await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/challenge', { method: 'POST', token: willToken })).status).toBe(403);
    expect((await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/delete', { method: 'POST', token: willToken, body: { challengeId: 'x', answer: 10 } })).status).toBe(403);

    // Gera desafio para admin1
    const c1 = await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/challenge', {
      method: 'POST',
      token: adminToken,
    });
    const challengeId1 = c1.data.challenge.challengeId as string;
    const answer1 = solveAdditionQuestion(c1.data.challenge.question);

    // 7b. Outro admin NÃO pode usar o challengeId de admin1
    const otherActorRes = await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/delete', {
      method: 'POST',
      token: secondAdminToken,
      body: { challengeId: challengeId1, answer: answer1 },
    });
    expect(otherActorRes.status).toBe(403);
    expect(otherActorRes.data.code).toBe('CHALLENGE_ACTOR_MISMATCH');

    // 9a. Mesmo challengeId não pode ser usado em outro torneio
    const mismatchRes = await apiJson(port, '/api/tournaments/tourn_sec_2/temporary-users/delete', {
      method: 'POST',
      token: adminToken,
      body: { challengeId: challengeId1, answer: answer1 },
    });
    expect(mismatchRes.status).toBe(400);
    expect(mismatchRes.data.code).toBe('CHALLENGE_TOURNAMENT_MISMATCH');

    // 8. Resposta errada é rejeitada e 3 erros invalidam o desafio mesmo se acertar depois
    for (let i = 0; i < 2; i++) {
      const wrong = await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/delete', {
        method: 'POST',
        token: adminToken,
        body: { challengeId: challengeId1, answer: answer1 + 1 },
      });
      expect(wrong.status).toBe(400);
      expect(wrong.data.code).toBe('CHALLENGE_WRONG_ANSWER');
    }
    const thirdWrong = await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/delete', {
      method: 'POST',
      token: adminToken,
      body: { challengeId: challengeId1, answer: answer1 + 2 },
    });
    expect(thirdWrong.status).toBe(400);
    expect(thirdWrong.data.code).toBe('CHALLENGE_INVALIDATED');

    // Mesmo com resposta certa agora, desafio invalidado é recusado
    const afterInvalidated = await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/delete', {
      method: 'POST',
      token: adminToken,
      body: { challengeId: challengeId1, answer: answer1 },
    });
    expect(afterInvalidated.status).toBe(400);
    expect(afterInvalidated.data.code).toBe('CHALLENGE_ALREADY_USED');
    expect(getAllUsers().some((u) => u.username === 'tmp_sec_1')).toBe(true);

    // 9b. Expiração do desafio
    const c2 = await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/challenge', {
      method: 'POST',
      token: adminToken,
    });
    const challengeId2 = c2.data.challenge.challengeId as string;
    const answer2 = solveAdditionQuestion(c2.data.challenge.question);
    _forceExpireChallengeForTest(challengeId2);

    const expiredRes = await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/delete', {
      method: 'POST',
      token: adminToken,
      body: { challengeId: challengeId2, answer: answer2 },
    });
    expect(expiredRes.status).toBe(400);
    expect(expiredRes.data.code).toBe('CHALLENGE_EXPIRED');

    // 9c. Uso válido consome desafio e impede reutilização
    const c3 = await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/challenge', {
      method: 'POST',
      token: adminToken,
    });
    const challengeId3 = c3.data.challenge.challengeId as string;
    const answer3 = solveAdditionQuestion(c3.data.challenge.question);

    const okDel = await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/delete', {
      method: 'POST',
      token: adminToken,
      body: { challengeId: challengeId3, answer: answer3 },
    });
    expect(okDel.status).toBe(200);

    const reuseRes = await apiJson(port, '/api/tournaments/tourn_sec_1/temporary-users/delete', {
      method: 'POST',
      token: adminToken,
      body: { challengeId: challengeId3, answer: answer3 },
    });
    expect(reuseRes.status).toBe(400);
    expect(reuseRes.data.code).toBe('CHALLENGE_ALREADY_USED');
  });

  it('10, 11 e 12. Bloqueia por dependência em sala ativa, registra auditoria e executa rollback completo em caso de falha', async () => {
    await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: { id: 'tourn_tx', name: 'Torneio Transacional', modality: 'individual' },
    });
    const createdTemp = await apiJson(port, '/api/admin/users/create', {
      method: 'POST',
      token: adminToken,
      body: {
        username: 'tmp_tx_1',
        password: '1234',
        displayName: 'Temp TX',
        isTemporary: true,
        temporaryTournamentId: 'tourn_tx',
      },
    });
    const tempUserId = createdTemp.data.user.id as string;
    await apiJson(port, '/api/tournaments/tourn_tx/close', { method: 'POST', token: adminToken });

    // 10. Se o usuário temporário estiver em sala casual ativa, o desafio sinaliza bloqueio e não permite execução parcial
    const loginTmpTx = await apiJson(port, '/api/auth/login', {
      method: 'POST',
      body: { username: 'tmp_tx_1', password: '1234' },
    });
    expect(loginTmpTx.status).toBe(200);
    const casualClient = await connectWsClient(port, loginTmpTx.data.token);
    openClients.push(casualClient);
    casualClient.send({ type: 'create_room', playerName: 'Temp TX', avatar: '🦊' });
    const casualJoined = await casualClient.waitFor((m) => m.type === 'room_joined');

    const blockedChallenge = await apiJson(port, '/api/tournaments/tourn_tx/temporary-users/challenge', {
      method: 'POST',
      token: adminToken,
    });
    expect(blockedChallenge.status).toBe(200);
    expect(blockedChallenge.data.canExecute).toBe(false);
    expect(blockedChallenge.data.blockingReasons.some((r: string) => r.includes('sala casual'))).toBe(true);
    rooms.delete(casualJoined.roomId);
    await casualClient.close();

    // 12. Simula falha no meio da transação ao salvar torneios -> rollback completo de users.json, stats.json, tournamentsMap e audit
    const statsBefore = getAllStats();
    statsBefore[tempUserId] = {
      gamesPlayed: 2,
      gamesWon: 1,
      gamesLost: 1,
      currentStreak: 1,
      bestStreak: 1,
      totalPoints: 50,
      fastestWinSeconds: 30,
      fewestTurnsWin: 5,
      highestRoundPoints: 50,
      cardsPlayed: 10,
      plusFoursPlayed: 0,
      plusTwosPlayed: 0,
      skipsPlayed: 0,
      reversesPlayed: 0,
      colorChangesPlayed: 0,
      unoCallsSuccess: 1,
      caughtOpponentsUno: 0,
      cardsDrawnTotal: 2,
      colorDistribution: { red: 3, blue: 3, green: 2, yellow: 2 },
      achievements: [],
    };
    saveStatsStrict(statsBefore);

    const cFail = await apiJson(port, '/api/tournaments/tourn_tx/temporary-users/challenge', {
      method: 'POST',
      token: adminToken,
    });
    expect(cFail.data.canExecute).toBe(true);

    const rollbackResult = await executeTournamentTempUsersCleanup({
      tournamentId: 'tourn_tx',
      challengeId: cFail.data.challenge.challengeId,
      answer: solveAdditionQuestion(cFail.data.challenge.question),
      actor: { id: adminId, username: 'edinho', role: 'admin' },
      tournamentsMap: tournaments,
      roomsMap: rooms,
      deps: {
        saveTournamentsFn: () => {
          throw new Error('Simulated disk I/O error');
        },
        getAllStatsFn: getAllStats,
        saveStatsFn: saveStatsStrict,
      },
    });
    expect(rollbackResult.success).toBe(false);
    expect(rollbackResult.code).toBe('TRANSACTION_ROLLBACK');

    // Usuário e stats devem ter sido restaurados integralmente!
    expect(getAllUsers().some((u) => u.id === tempUserId)).toBe(true);
    expect(getAllStats()[tempUserId]).toBeDefined();
    expect(tournaments.get('tourn_tx')?.auditTrail?.some((a) => a.action === 'temp_users_deleted')).toBe(false);

    // 11. Execução real com sucesso grava auditoria no torneio e em tournament_audit.json
    const cOk = await apiJson(port, '/api/tournaments/tourn_tx/temporary-users/challenge', {
      method: 'POST',
      token: adminToken,
    });
    const delOk = await apiJson(port, '/api/tournaments/tourn_tx/temporary-users/delete', {
      method: 'POST',
      token: adminToken,
      body: {
        challengeId: cOk.data.challenge.challengeId,
        answer: solveAdditionQuestion(cOk.data.challenge.question),
        reason: 'Auditoria final',
      },
    });
    expect(delOk.status).toBe(200);
    expect(getAllUsers().some((u) => u.id === tempUserId)).toBe(false);
    expect(getAllStats()[tempUserId]).toBeUndefined();

    const auditRes = await apiJson(port, '/api/tournaments/tourn_tx/audit', { token: adminToken });
    expect(auditRes.status).toBe(200);
    expect(auditRes.data.tournamentAuditTrail.some((e: any) => e.action === 'tournament_closed')).toBe(true);
    expect(auditRes.data.tournamentAuditTrail.some((e: any) => e.action === 'temp_users_deleted')).toBe(true);
    const centralLogs = loadTournamentAuditLogs();
    expect(
      centralLogs.some(
        (l) => l.tournamentId === 'tourn_tx' && l.action === 'temp_users_deleted' && l.deletedCount === 1
      )
    ).toBe(true);
  });

  it('13. Torneio COM partidas jogadas e resultados: mantém 100% do histórico/classificação/campeão ao excluir temporários', async () => {
    await apiJson(port, '/api/tournaments', {
      method: 'POST',
      token: adminToken,
      body: {
        id: 'tourn_played_hist',
        name: 'Copa Com Histórico',
        modality: 'individual',
        gamesPerGroup: 1,
        advancePerGroup: 1,
        playAnimationDelaySeconds: 0,
        seed: 7,
      },
    });

    // Inscreve 1 permanente (will) + 1 temporário (tmp_hist_1)
    expect((await apiJson(port, '/api/tournaments/tourn_played_hist/register', { method: 'POST', token: willToken })).status).toBe(200);
    const impTemp = await apiJson(port, '/api/admin/import/commit', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Lote Hist Temp',
        mode: 'create_and_enroll',
        sourceType: 'text_paste',
        tournamentId: 'tourn_played_hist',
        createAsTemporary: true,
        rawText: 'username;displayName;password\ntmp_hist_1;Temp Histórico Um;1234',
      },
    });
    expect(impTemp.status).toBe(201);
    const tempUserId = impTemp.data.batch.items[0].userId as string;

    const tempLogin = await apiJson(port, '/api/auth/login', {
      method: 'POST',
      body: { username: 'tmp_hist_1', password: '1234' },
    });
    const tempToken = tempLogin.data.token as string;

    // Inicia torneio -> abre sala
    const startRes = await apiJson(port, '/api/tournaments/tourn_played_hist/start', {
      method: 'POST',
      token: adminToken,
    });
    expect(startRes.status).toBe(200);
    const roomId = startRes.data.createdRoomIds[0] as string;
    const gameId = startRes.data.tournament.rounds[0].groups[0].games[0].id as string;

    const cWill = await connectWsClient(port, willToken);
    const cTemp = await connectWsClient(port, tempToken);
    openClients.push(cWill, cTemp);
    cWill.send({ type: 'join_room', roomId, playerName: 'Will' });
    cTemp.send({ type: 'join_room', roomId, playerName: 'Temp Histórico Um' });
    await Promise.all([
      cWill.waitFor((m) => m.type === 'room_joined'),
      cTemp.waitFor((m) => m.type === 'room_joined'),
    ]);

    expect((await apiJson(port, `/api/tournaments/tourn_played_hist/games/${gameId}/start`, { method: 'POST', token: adminToken })).status).toBe(200);

    // Enquanto torneio está running, exclusão de temporários DEVE ser bloqueada!
    const whileRunning = await apiJson(port, '/api/tournaments/tourn_played_hist/temporary-users/challenge', {
      method: 'POST',
      token: adminToken,
    });
    expect(whileRunning.data.canExecute).toBe(false);

    // Finaliza a partida com vitória do usuário temporário (para provar que até campeão temporário mantém registro histórico!)
    const room = rooms.get(roomId)!;
    const tempIdx = room.players.findIndex((p) => p.userId === tempUserId);
    const tempSeat = room.players[tempIdx];
    room.currentTurnIndex = tempIdx;
    const winCard = { id: 'win-hist-temp', color: room.currentColor, value: '6' as const, score: 6 };
    tempSeat.hand = [winCard];
    cTemp.send({ type: 'play_card', playerId: tempSeat.id, cardId: winCard.id });
    await cTemp.waitFor((m) => m.type === 'game_state' && m.state.status === 'ended');

    // Verifica torneio finalizado com campeão
    let tournDetail = (await apiJson(port, '/api/tournaments/tourn_played_hist', { token: adminToken })).data;
    expect(tournDetail.tournament.status).toBe('finished');
    expect(tournDetail.tournament.championEntryId).toBe(`entry_${tempUserId}`);

    // Agora exclui o usuário temporário após o torneio finalizado
    const chal = await apiJson(port, '/api/tournaments/tourn_played_hist/temporary-users/challenge', {
      method: 'POST',
      token: adminToken,
    });
    expect(chal.data.canExecute).toBe(true);
    expect(chal.data.temporaryUsersCount).toBe(1);
    expect(chal.data.permanentUsersPreservedCount).toBe(1);

    const del = await apiJson(port, '/api/tournaments/tourn_played_hist/temporary-users/delete', {
      method: 'POST',
      token: adminToken,
      body: {
        challengeId: chal.data.challenge.challengeId,
        answer: solveAdditionQuestion(chal.data.challenge.question),
      },
    });
    expect(del.status).toBe(200);
    expect(del.data.deletedCount).toBe(1);

    // Conta temporária foi apagada, mas Will permanece intacto
    expect(getAllUsers().some((u) => u.id === tempUserId)).toBe(false);
    expect(getAllUsers().some((u) => u.username === 'will')).toBe(true);

    // Integridade referencial: histórico do torneio, entries, standings e campeão permanecem preservados!
    tournDetail = (await apiJson(port, '/api/tournaments/tourn_played_hist', { token: adminToken })).data;
    expect(tournDetail.tournament.status).toBe('finished');
    expect(tournDetail.tournament.championEntryId).toBe(`entry_${tempUserId}`);
    expect(tournDetail.tournament.entries).toHaveLength(2);
    const cleanedEntry = tournDetail.tournament.entries.find((e: any) => e.id === `entry_${tempUserId}`);
    expect(cleanedEntry.name).toBe('Temp Histórico Um');
    expect(cleanedEntry.deletedTemporaryUserIds).toEqual([tempUserId]);
    expect(tournDetail.tournament.rounds[0].groups[0].games[0].winnerEntryId).toBe(`entry_${tempUserId}`);
    const gId = tournDetail.tournament.rounds[0].groups[0].id;
    expect(tournDetail.standingsByGroup[gId].standings[0].entryId).toBe(`entry_${tempUserId}`);
    expect(tournDetail.standingsByGroup[gId].standings[0].wins).toBe(1);
  });
});
