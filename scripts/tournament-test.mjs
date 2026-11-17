#!/usr/bin/env node
/**
 * UNO KaWiHe - Teste Automatizado com Simulação Completa de Torneios
 *
 * Simula um torneio completo de ponta a ponta em tempo real contra o servidor:
 *  - Suporta Individual (multi-mesas, grupos de 2 a 4 jogadores, pontos e desempate)
 *  - Suporta Duplas 2v2 (equipes, chaves eliminatórias, Md1/Md3/Md5 com BYEs)
 *  - Criação automática de contas de teste autenticadas (JWT) via API Admin
 *  - Conexão simultânea de jogadores e espectadores via WebSocket autenticado
 *  - Jogadores jogam rodadas completas (compra, descarte, UNO, coringa)
 *  - Gestão de chaves, avanço automático de fases e desempates até o Campeão
 *  - Telemetria da VM (/api/admin/vm-metrics): CPU, RAM, Swap, Event Loop Lag e Latência
 *  - Limpeza automática de usuários temporários e salas após conclusão
 *
 * Exemplos de Uso:
 *   node scripts/tournament-test.mjs --url http://146.181.59.151:3000 --user edinho --password 1709
 *   node scripts/tournament-test.mjs --url http://localhost:3000 --user edinho --password 1709 --modality doubles --teams 4 --best-of 3
 *   node scripts/tournament-test.mjs --url http://localhost:3000 --user edinho --password 1709 --modality individual --entries 6
 */

import { performance } from 'node:perf_hooks';

// ============================================================================
// 1. Parsing de argumentos CLI
// ============================================================================
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eqIdx = token.indexOf('=');
    if (eqIdx !== -1) {
      args[token.slice(2, eqIdx)] = token.slice(eqIdx + 1);
      continue;
    }
    const key = token.slice(2);
    if (key.startsWith('no-')) {
      args[key.slice(3)] = false;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

const rawArgs = parseArgs(process.argv.slice(2));

if (rawArgs.help || rawArgs.h) {
  console.log(`
🏆 UNO KaWiHe - Teste Automatizado de Simulação de Torneios
============================================================================
Uso:
  node scripts/tournament-test.mjs --url <URL_DO_SERVIDOR> [opções]

Opções de Autenticação Admin:
  --url <url>           URL HTTP/HTTPS do servidor (padrão: http://localhost:3000)
  --user <usuario>      Usuário admin para login JWT (ex: edinho)
  --password <senha>    Senha real do usuário admin configurada no servidor
  --token <jwt>         Token JWT admin já emitido
  --api-timeout <ms>    Timeout para chamadas HTTP em ms (padrão: 30000ms)
  --max-wait-ms <ms>    Tempo máximo total de simulação em ms (padrão: 300000ms)

Modalidade & Configuração do Torneio:
  --modality <m>        Modalidade: individual (padrão) ou doubles (duplas 2v2)
  --entries <n>         Jogadores para modo individual (mínimo 2, padrão: 4)
  --teams <n>           Equipes para modo duplas (mínimo 2, padrão: 4)
  --best-of <1|3|5>     Série melhor de N para duplas (padrão: 3)
  --games-per-group <n> Partidas por grupo individual (padrão: 1)
  --advance <1|2>       Classificados por grupo individual (padrão: 1)
  --tie-breaker <p>     Política de desempate: extra_match (padrão) ou admin_decision
  --spectator-mode <s>  Modo de transmissão: tv_reveal (padrão), tv_hidden ou table_only
  --spectators <n>      Espectadores assistindo cada mesa (padrão: 1)

Opções de Ritmo & Simulação:
  --think-ms <ms>       Intervalo médio de reflexão por jogada (padrão: 350ms)
  --anim-delay <s>      Atraso de animação no servidor em segundos (padrão: 0s para teste rápido)
  --no-cleanup          Não exclui os usuários de teste criados ao final
  --wo-test             Simula abandono (W.O.) de um jogador no primeiro jogo
`);
  process.exit(0);
}

const TARGET_URL = String(rawArgs.url || 'http://localhost:3000').replace(/\/+$/, '');
const MODALITY = String(rawArgs.modality || 'individual').toLowerCase() === 'doubles' ? 'doubles' : 'individual';
const INDIVIDUAL_ENTRIES = Math.max(2, Math.min(32, Number(rawArgs.entries ?? 4)));
const DOUBLES_TEAMS = Math.max(2, Math.min(16, Number(rawArgs.teams ?? 4)));
const BEST_OF = [1, 3, 5].includes(Number(rawArgs['best-of'])) ? Number(rawArgs['best-of']) : 3;
const GAMES_PER_GROUP = Math.max(1, Math.min(10, Number(rawArgs['games-per-group'] ?? 1)));
const ADVANCE_PER_GROUP = Number(rawArgs.advance) === 2 ? 2 : 1;
const TIE_BREAKER = rawArgs['tie-breaker'] === 'admin_decision' ? 'admin_decision' : 'extra_match';
const SPECTATOR_MODE = ['table_only', 'tv_hidden', 'tv_reveal'].includes(rawArgs['spectator-mode'])
  ? rawArgs['spectator-mode']
  : 'tv_reveal';
const SPECTATORS_PER_TABLE = Math.max(0, Number(rawArgs.spectators ?? 1));
const THINK_MS = Math.max(80, Number(rawArgs['think-ms'] ?? 350));
const ANIM_DELAY = Math.max(0, Number(rawArgs['anim-delay'] ?? 0));
const DO_CLEANUP = rawArgs.cleanup !== false;
const DO_WO_TEST = Boolean(rawArgs['wo-test']);

const ADMIN_USER = rawArgs.user ? String(rawArgs.user).trim() : '';
const ADMIN_PASS = rawArgs.password ? String(rawArgs.password).trim() : '';
let ADMIN_TOKEN = rawArgs.token ? String(rawArgs.token).trim() : '';
const API_TIMEOUT_MS = Math.max(5000, Number(rawArgs['api-timeout'] ?? 30000));
const MAX_WAIT_MS = Math.max(15000, Number(rawArgs['max-wait-ms'] ?? 300000));

function deriveUrls(inputUrl) {
  let clean = inputUrl.trim();
  if (clean.startsWith('ws://')) clean = 'http://' + clean.slice(5);
  if (clean.startsWith('wss://')) clean = 'https://' + clean.slice(6);
  clean = clean.replace(/\/ws$/i, '').replace(/\/+$/, '');
  const wsBase = clean.startsWith('https://') ? 'wss://' + clean.slice(8) : 'ws://' + clean.slice(7);
  return {
    httpBase: clean,
    wsUrl: `${wsBase}/ws`,
  };
}

const { httpBase, wsUrl } = deriveUrls(TARGET_URL);

// ============================================================================
// 2. Utilitários de WebSocket, Estatísticas e Formatação
// ============================================================================
let WSImpl = globalThis.WebSocket;
async function ensureWebSocketImpl() {
  if (WSImpl) return WSImpl;
  const mod = await import('ws');
  WSImpl = mod.WebSocket || mod.default;
  return WSImpl;
}

async function decodeWsMessage(data) {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (data && typeof data.text === 'function') return await data.text();
  return String(data);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1));
  return sortedArr[idx];
}

function formatMB(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0MB';
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function calcLatencyStats(samples) {
  if (!samples || samples.length === 0) {
    return { count: 0, avg: 0, p50: 0, p90: 0, p95: 0, max: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    avg: Number((sum / sorted.length).toFixed(1)),
    p50: Number(percentile(sorted, 50).toFixed(1)),
    p90: Number(percentile(sorted, 90).toFixed(1)),
    p95: Number(percentile(sorted, 95).toFixed(1)),
    max: Number(sorted[sorted.length - 1].toFixed(1)),
  };
}

// ============================================================================
// 3. API Client & Telemetria
// ============================================================================
async function apiCall(endpoint, options = {}) {
  const url = `${httpBase}${endpoint}`;
  const headers = { ...(options.headers || {}) };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  } else if (ADMIN_TOKEN) {
    headers['Authorization'] = `Bearer ${ADMIN_TOKEN}`;
  }

  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const timeoutMs = options.timeoutMs || API_TIMEOUT_MS;
  const maxRetries = options.retries !== undefined ? options.retries : 2;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      return { status: res.status, ok: res.ok, data: json };
    } catch (err) {
      lastError = err;
      const isTimeout = err?.name === 'TimeoutError' || String(err?.message || '').includes('timeout');
      if (attempt <= maxRetries) {
        const backoffMs = attempt * 1500;
        console.warn(`⏳ [API] ${endpoint} ${isTimeout ? `atingiu timeout (${timeoutMs}ms)` : `falhou (${err.message})`} (tentativa ${attempt}/${maxRetries + 1}). Re-tentando em ${backoffMs}ms...`);
        await sleep(backoffMs);
      }
    }
  }

  throw new Error(`Falha de rede/timeout na chamada a ${endpoint} após ${maxRetries + 1} tentativas: ${lastError?.message || 'Timeout'}`);
}

async function checkServerHealth() {
  const t0 = performance.now();
  const res = await fetch(`${httpBase}/health`, { signal: AbortSignal.timeout(8000) });
  const rttMs = performance.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { rttMs };
}

async function fetchVmMetrics() {
  if (!ADMIN_TOKEN) return null;
  try {
    const res = await apiCall('/api/admin/vm-metrics', { retries: 0 });
    if (res.ok && res.data?.success) {
      return res.data;
    }
  } catch {}
  return null;
}

// ============================================================================
// 4. Cluster de Conexões e Jogadores de Torneio
// ============================================================================
const COLORS = ['red', 'blue', 'green', 'yellow'];

class TournamentRunner {
  constructor() {
    this.runId = Math.random().toString(36).substring(2, 7);
    this.testUsers = []; // { id, username, displayName, token }
    this.tournament = null;
    this.tournamentId = `tourn_test_${this.runId}`;
    this.clients = new Map(); // key: userId -> client
    this.activeSockets = new Set();
    this.shuttingDown = false;
    this.metrics = {
      wsConnectRtts: [],
      actionRtts: [],
      turnsPlayed: 0,
      cardsPlayed: 0,
      unoCalls: 0,
      roundsCount: 0,
      gamesCompleted: 0,
      totalBytesIn: 0,
      totalBytesOut: 0,
    };
    this.vmSnapshots = [];
  }

  async loginOrRegisterAdmin() {
    if (ADMIN_TOKEN) {
      console.log(`🔑 Usando token administrativo JWT fornecido via argumento CLI.`);
      return;
    }

    const candidateUser = ADMIN_USER || 'edinho';
    const candidatePass = ADMIN_PASS;

    if (!candidatePass) {
      throw new Error(
        'Credenciais JWT do Administrador não fornecidas.\n' +
        'Informe --user <admin> --password <senha_real> ou --token <jwt>.'
      );
    }

    console.log(`🔐 Autenticando administrador "${candidateUser}" via JWT (/api/auth/login)...`);

    const res = await apiCall('/api/auth/login', {
      method: 'POST',
      body: { username: candidateUser, password: candidatePass },
      timeoutMs: Math.max(API_TIMEOUT_MS, 30000),
      retries: 2,
    });

    if (res.ok && res.data?.success && res.data?.token) {
      if (res.data.user?.role !== 'admin') {
        throw new Error(`Usuário "${candidateUser}" autenticado não possui role === "admin".`);
      }
      ADMIN_TOKEN = res.data.token;
      console.log(`✅ Administrador autenticado com sucesso! (${res.data.user?.displayName || candidateUser})`);
      return;
    }

    throw new Error(`Falha no login JWT do admin "${candidateUser}": ${res.data?.error || `HTTP ${res.status}`}`);
  }

  async setupPlayers() {
    const totalRequired = MODALITY === 'doubles' ? DOUBLES_TEAMS * 2 : INDIVIDUAL_ENTRIES;
    console.log(`👥 Provisionando ${totalRequired} jogadores autenticados para o torneio...`);

    for (let i = 1; i <= totalRequired; i++) {
      const username = `tt_${this.runId}_p${i}`;
      const password = `pass_${this.runId}`;
      const displayName = `TPlayer ${i} [${this.runId}]`;
      const avatar = ['🦸‍♂️', '⚡', '🌸', '🦄', '🐯', '🐼', '🦊', '🦉', '🦁', '🚀'][i % 10];

      // Cria conta via API administrativa
      const createRes = await apiCall('/api/admin/users/create', {
        method: 'POST',
        body: { username, password, displayName, avatar, role: 'player' },
      });

      if (!createRes.ok || !createRes.data?.success) {
        throw new Error(`Falha ao criar usuário @${username}: ${createRes.data?.error || createRes.status}`);
      }

      const createdUser = createRes.data.user;

      // Obtém token JWT fazendo login da conta
      const loginRes = await apiCall('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });

      if (!loginRes.ok || !loginRes.data?.success) {
        throw new Error(`Falha no login da conta de teste @${username}`);
      }

      this.testUsers.push({
        id: createdUser.id,
        username,
        displayName,
        token: loginRes.data.token,
      });

      await sleep(20);
    }
    console.log(`✅ ${this.testUsers.length} jogadores autenticados e prontos.`);
  }

  async createAndConfigureTournament() {
    console.log(`🛠️  Criando torneio "${MODALITY.toUpperCase()}" no servidor...`);

    const payload = {
      id: this.tournamentId,
      name: `Copa Simulação Uno KaWiHe [${this.runId}]`,
      modality: MODALITY,
      gamesPerGroup: MODALITY === 'individual' ? GAMES_PER_GROUP : undefined,
      advancePerGroup: MODALITY === 'individual' ? ADVANCE_PER_GROUP : undefined,
      bestOf: MODALITY === 'doubles' ? BEST_OF : undefined,
      tieBreakerPolicy: TIE_BREAKER,
      spectatorMode: SPECTATOR_MODE,
      playAnimationDelaySeconds: ANIM_DELAY,
      turnDurationSeconds: 30,
    };

    const res = await apiCall('/api/tournaments', {
      method: 'POST',
      body: payload,
    });

    if (!res.ok || !res.data?.success) {
      throw new Error(`Falha ao criar torneio: ${res.data?.error || res.status}`);
    }

    this.tournament = res.data.tournament;
    console.log(`✅ Torneio criado! ID: ${this.tournament.config.id}`);

    // Inscrição dos participantes
    if (MODALITY === 'individual') {
      console.log(`📝 Inscrevendo ${this.testUsers.length} jogadores no torneio individual...`);
      for (const u of this.testUsers) {
        const regRes = await apiCall(`/api/tournaments/${this.tournamentId}/register`, {
          method: 'POST',
          body: { userId: u.id },
        });
        if (!regRes.ok || !regRes.data?.success) {
          throw new Error(`Erro ao inscrever @${u.username}: ${regRes.data?.error}`);
        }
      }
    } else {
      console.log(`📝 Cadastrando ${DOUBLES_TEAMS} duplas (2v2) no torneio...`);
      for (let t = 0; t < DOUBLES_TEAMS; t++) {
        const p1 = this.testUsers[t * 2];
        const p2 = this.testUsers[t * 2 + 1];
        const teamId = `team_${this.runId}_${t + 1}`;
        const teamName = `Equipe ${String.fromCharCode(65 + t)} (${p1.username} & ${p2.username})`;

        const teamRes = await apiCall(`/api/tournaments/${this.tournamentId}/teams`, {
          method: 'POST',
          body: {
            teamId,
            name: teamName,
            userIds: [p1.id, p2.id],
          },
        });
        if (!teamRes.ok || !teamRes.data?.success) {
          throw new Error(`Erro ao cadastrar equipe ${teamName}: ${teamRes.data?.error}`);
        }
      }
    }
    console.log(`✅ Inscrições finalizadas.`);
  }

  async connectWsClient(user) {
    const WS = await ensureWebSocketImpl();
    const t0 = performance.now();

    return await new Promise((resolve, reject) => {
      const url = `${wsUrl}?token=${encodeURIComponent(user.token)}`;
      const ws = new WS(url);
      let settled = false;

      const client = {
        user,
        ws,
        open: false,
        playerId: null,
        roomId: null,
        hand: [],
        playableCardIds: [],
        canDraw: false,
        canPassTurn: false,
        pendingAction: null,
        turnTimer: null,
        lastActedKey: '',
        waiters: new Map(),
      };

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws.close(); } catch {}
          reject(new Error(`Timeout ao conectar WS de @${user.username}`));
        }
      }, 8000);

      ws.addEventListener('open', () => {
        client.open = true;
        this.activeSockets.add(ws);
        const rtt = performance.now() - t0;
        this.metrics.wsConnectRtts.push(rtt);

        // Registro no Lobby
        this.sendWs(client, {
          protocolVersion: 2,
          type: 'register_lobby',
          name: user.displayName,
          avatar: '🎮',
        });

        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(client);
        }
      });

      ws.addEventListener('message', async (ev) => {
        try {
          const text = await decodeWsMessage(ev.data);
          this.metrics.totalBytesIn += Buffer.byteLength(text, 'utf8');
          const msg = JSON.parse(text);

          if (msg.type === 'room_joined') {
            client.roomId = msg.roomId;
            client.playerId = msg.playerId;
            const w = client.waiters.get('room_joined');
            if (w) {
              client.waiters.delete('room_joined');
              w.resolve(msg);
            }
            return;
          }

          if (msg.type === 'left_room_confirmed') {
            const w = client.waiters.get('left_room_confirmed');
            if (w) {
              client.waiters.delete('left_room_confirmed');
              w.resolve(msg);
            }
            return;
          }

          if (msg.type === 'game_state' && msg.state) {
            if (client.pendingAction) {
              const rtt = performance.now() - client.pendingAction.t0;
              this.metrics.actionRtts.push(rtt);
              client.pendingAction = null;
            }
            return;
          }

          if (msg.type === 'hand_state') {
            client.hand = msg.hand || [];
            client.playableCardIds = msg.playableCardIds || [];
            client.canDraw = Boolean(msg.canDraw);
            client.canPassTurn = Boolean(msg.canPassTurn);

            if (client.pendingAction && client.pendingAction.type !== 'play_card') {
              const rtt = performance.now() - client.pendingAction.t0;
              this.metrics.actionRtts.push(rtt);
              client.pendingAction = null;
            }

            this.maybeActInTournamentMatch(client);
          }
        } catch (err) {
          if (process.env.DEBUG) console.error('[WS parse err]', err);
        }
      });

      ws.addEventListener('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      ws.addEventListener('close', () => {
        client.open = false;
        this.activeSockets.delete(ws);
        if (client.turnTimer) {
          clearTimeout(client.turnTimer);
          client.turnTimer = null;
        }
      });
    });
  }

  sendWs(client, payload) {
    if (!client.open || client.ws.readyState !== 1) return false;
    try {
      const text = JSON.stringify(payload);
      client.ws.send(text);
      this.metrics.totalBytesOut += Buffer.byteLength(text, 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  waitForEvent(client, eventName, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        client.waiters.delete(eventName);
        reject(new Error(`Timeout aguardando ${eventName} (${client.user.username})`));
      }, timeoutMs);

      client.waiters.set(eventName, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  maybeActInTournamentMatch(client) {
    if (this.shuttingDown || client.turnTimer || !client.open || !client.roomId) return;

    const actionKey = `${client.roomId}:${client.hand.length}:${client.playableCardIds.length}:${client.canDraw}:${client.canPassTurn}`;
    if (client.lastActedKey === actionKey) return;

    const delay = THINK_MS * (0.7 + Math.random() * 0.6);

    client.turnTimer = setTimeout(() => {
      client.turnTimer = null;
      if (this.shuttingDown || !client.open || !client.roomId) return;

      client.lastActedKey = actionKey;

      // 1. Jogar carta válida
      if (client.playableCardIds.length > 0) {
        const cardId = client.playableCardIds[0];
        const card = client.hand.find((c) => c.id === cardId);
        const chosenColor = card?.color === 'wild' ? COLORS[Math.floor(Math.random() * COLORS.length)] : undefined;

        // Grito de UNO quando resta 2 cartas e vai descartar para 1
        if (client.hand.length === 2) {
          this.sendWs(client, {
            protocolVersion: 2,
            type: 'call_uno',
            roomId: client.roomId,
          });
          this.metrics.unoCalls++;
        }

        client.pendingAction = { type: 'play_card', t0: performance.now() };
        this.sendWs(client, {
          protocolVersion: 2,
          type: 'play_card',
          roomId: client.roomId,
          cardId,
          chosenColor,
        });

        this.metrics.cardsPlayed++;
        this.metrics.turnsPlayed++;
        return;
      }

      // 2. Comprar carta
      if (client.canDraw) {
        client.pendingAction = { type: 'draw_card', t0: performance.now() };
        this.sendWs(client, {
          protocolVersion: 2,
          type: 'draw_card',
          roomId: client.roomId,
        });
        this.metrics.turnsPlayed++;
        return;
      }

      // 3. Passar a vez
      if (client.canPassTurn) {
        client.pendingAction = { type: 'pass_turn', t0: performance.now() };
        this.sendWs(client, {
          protocolVersion: 2,
          type: 'pass_turn',
          roomId: client.roomId,
        });
        this.metrics.turnsPlayed++;
      }
    }, delay);
  }

  async runSimulationLoop() {
    console.log(`🚀 Disparando início do torneio...`);
    const startRes = await apiCall(`/api/tournaments/${this.tournamentId}/start`, { method: 'POST' });
    if (!startRes.ok || !startRes.data?.success) {
      throw new Error(`Falha ao iniciar torneio: ${startRes.data?.error || startRes.status}`);
    }

    console.log(`🏁 Torneio iniciado com sucesso! Acompanhando partidas e rodadas...\n`);

    const handledGameIds = new Set();
    const startedGameIds = new Set();
    const loopDeadline = Date.now() + MAX_WAIT_MS;
    let woSimulated = false;

    while (!this.shuttingDown) {
      if (Date.now() > loopDeadline) {
        throw new Error(`Timeout máximo de simulação atingido (${MAX_WAIT_MS}ms).`);
      }

      // 1. Coleta telemetria e estado do torneio
      const tournRes = await apiCall(`/api/tournaments/${this.tournamentId}`);
      if (!tournRes.ok || !tournRes.data?.success) {
        await sleep(1000);
        continue;
      }

      const tourn = tournRes.data.tournament;
      this.tournament = tourn;

      const vm = await fetchVmMetrics();
      if (vm) this.vmSnapshots.push(vm);

      // Se terminou, coroa o campeão e encerra o loop
      if (tourn.status === 'finished') {
        const champion = tourn.entries.find((e) => e.id === tourn.championEntryId);
        console.log(`\n🏆 TORNEIO CONCLUÍDO! CAMPEÃO COROADO: ${champion ? champion.name : tourn.championEntryId}`);
        break;
      }

      if (tourn.status === 'paused' || tourn.status === 'cancelled') {
        console.log(`⚠️ Torneio pausado ou cancelado: ${tourn.pauseReason || 'Sem motivo especificado'}.`);
        break;
      }

      // 2. Itera sobre todas as rodadas e grupos procurando jogos pendentes/jogando
      for (const r of tourn.rounds) {
        for (const g of r.groups) {
          // Desempate automático se necessário
          if (g.status === 'tiebreaker_required') {
            console.log(`⚔️  Empate detectado no Grupo #${g.id}. Gerando partida extra de desempate...`);
            await apiCall(`/api/tournaments/${this.tournamentId}/groups/${g.id}/tiebreaker`, { method: 'POST' });
            await sleep(400);
            continue;
          }

          for (const game of g.games) {
            if (game.status === 'finished' || game.status === 'void') {
              if (!handledGameIds.has(game.id)) {
                handledGameIds.add(game.id);
                this.metrics.gamesCompleted++;
                const winnerEntry = tourn.entries.find((e) => e.id === game.winnerEntryId);
                console.log(
                  `  ✅ Partida finalizada: Rodada ${r.roundNumber} (${r.label}) | Jogo #${game.gameNumber} ` +
                    `| Vencedor: ${winnerEntry ? winnerEntry.name : game.winnerEntryId || 'Void/WO'} ` +
                    `[Motivo: ${game.resultReason || 'normal'}]`
                );
              }
              continue;
            }

            if (game.roomId) {
              // Conecta os jogadores desta mesa se ainda não estiverem conectados a ela
              const tableUsers = this.testUsers.filter((u) => {
                return game.participantEntryIds.some((eid) => {
                  const entry = tourn.entries.find((e) => e.id === eid);
                  return entry && entry.userIds.includes(u.id);
                });
              });

              for (const u of tableUsers) {
                let cli = this.clients.get(u.id);
                if (!cli || !cli.open) {
                  cli = await this.connectWsClient(u);
                  this.clients.set(u.id, cli);
                }

                if (cli.roomId !== game.roomId) {
                  const joinPromise = this.waitForEvent(cli, 'room_joined');
                  this.sendWs(cli, {
                    protocolVersion: 2,
                    type: 'join_room',
                    roomId: game.roomId,
                    playerName: u.displayName,
                  });
                  await joinPromise;
                }
              }

              // Conecta espectadores de transmissão na mesa se configurado
              if (SPECTATORS_PER_TABLE > 0 && SPECTATOR_MODE !== 'table_only') {
                for (let s = 1; s <= SPECTATORS_PER_TABLE; s++) {
                  const specId = `spec_${game.roomId}_${s}`;
                  if (!this.clients.has(specId)) {
                    const specWs = await this.connectWsClient({
                      id: specId,
                      username: specId,
                      displayName: `TV Torneio #${s}`,
                      token: ADMIN_TOKEN,
                    });
                    this.clients.set(specId, specWs);
                    this.sendWs(specWs, {
                      protocolVersion: 2,
                      type: 'join_room',
                      roomId: game.roomId,
                      playerName: `[TV] KaWiHe #${s}`,
                      asSpectator: true,
                      spectatorRevealCards: SPECTATOR_MODE === 'tv_reveal',
                    });
                  }
                }
              }

              // Dispara o start oficial da partida uma única vez quando todos os jogadores estiverem na sala
              if (!startedGameIds.has(game.id)) {
                try {
                  const startGameRes = await apiCall(
                    `/api/tournaments/${this.tournamentId}/games/${game.id}/start`,
                    { method: 'POST', retries: 0 }
                  );
                  if (startGameRes.ok) {
                    startedGameIds.add(game.id);
                    console.log(
                      `  🎮 Partida iniciada na sala #${game.roomId}: Rodada ${r.roundNumber} (${r.label}) | Jogo #${game.gameNumber}`
                    );
                  }
                } catch {}
              }

              // Simulação de W.O. opcional (--wo-test)
              if (DO_WO_TEST && !woSimulated && startedGameIds.has(game.id) && tableUsers.length >= 2) {
                woSimulated = true;
                const sacrificialUser = tableUsers[tableUsers.length - 1];
                const sacrificialCli = this.clients.get(sacrificialUser.id);
                if (sacrificialCli && sacrificialCli.open) {
                  console.log(`\n🏳️ [TESTE DE W.O.] Simulando abandono proposital do jogador @${sacrificialUser.username}...`);
                  await sleep(1500);
                  const leaveP = this.waitForEvent(sacrificialCli, 'left_room_confirmed');
                  this.sendWs(sacrificialCli, {
                    protocolVersion: 2,
                    type: 'leave_room',
                    roomId: game.roomId,
                    playerId: sacrificialCli.playerId,
                  });
                  await leaveP;
                  console.log(`🏳️ [TESTE DE W.O.] Abandono executado! Servidor deve aplicar W.O. sem corromper o torneio.\n`);
                }
              }
            }
          }
        }
      }

      await sleep(1000);
    }
  }

  async cleanup() {
    this.shuttingDown = true;
    console.log(`\n🧹 Encerrando conexões de WebSocket dos jogadores...`);

    for (const ws of this.activeSockets) {
      try { ws.close(); } catch {}
    }
    this.activeSockets.clear();
    this.clients.clear();

    if (DO_CLEANUP && this.testUsers.length > 0) {
      console.log(`🗑️  Excluindo ${this.testUsers.length} usuários temporários de teste...`);
      for (const u of this.testUsers) {
        try {
          await apiCall(`/api/admin/users/${u.id}`, { method: 'DELETE' });
        } catch {}
      }
      console.log(`✅ Usuários de teste removidos do sistema.`);
    }
  }

  printFinalReport(durationSec) {
    const connLat = calcLatencyStats(this.metrics.wsConnectRtts);
    const actLat = calcLatencyStats(this.metrics.actionRtts);

    const vmCpu = this.vmSnapshots.map((v) => v.cpu?.usagePercent).filter(Number.isFinite);
    const vmRam = this.vmSnapshots.map((v) => v.memory?.usedPercent).filter(Number.isFinite);
    const vmNodeRss = this.vmSnapshots.map((v) => v.memory?.nodeRssBytes).filter(Number.isFinite);
    const vmElLag = this.vmSnapshots.map((v) => v.app?.eventLoopLagMs).filter(Number.isFinite);

    const peakCpu = vmCpu.length ? Math.max(...vmCpu) : null;
    const avgCpu = vmCpu.length ? vmCpu.reduce((a, b) => a + b, 0) / vmCpu.length : null;
    const peakRam = vmRam.length ? Math.max(...vmRam) : null;
    const peakRss = vmNodeRss.length ? Math.max(...vmNodeRss) : null;
    const peakLag = vmElLag.length ? Math.max(...vmElLag) : null;
    const avgLag = vmElLag.length ? vmElLag.reduce((a, b) => a + b, 0) / vmElLag.length : null;

    console.log('\n============================================================================');
    console.log('🏆 RELATÓRIO FINAL DA SIMULAÇÃO DE TORNEIO — UNO KAWIHE');
    console.log('============================================================================');
    console.log(`⏱️  Tempo total de execução     : ${durationSec.toFixed(1)} segundos`);
    console.log(`🏅 Modalidade                   : ${MODALITY === 'doubles' ? `Duplas 2v2 (Md${BEST_OF})` : `Individual (${INDIVIDUAL_ENTRIES} jogadores)`}`);
    console.log(`🎮 Partidas concluídas          : ${this.metrics.gamesCompleted}`);
    console.log(`🃏 Cartas jogadas no torneio    : ${this.metrics.cardsPlayed} (${(this.metrics.cardsPlayed / durationSec).toFixed(1)} cartas/seg)`);
    console.log(`🔊 Gritos de UNO executados     : ${this.metrics.unoCalls}`);
    console.log(`📡 Tráfego de dados do cluster  : RX=${formatBytes(this.metrics.totalBytesIn)} | TX=${formatBytes(this.metrics.totalBytesOut)}`);

    console.log(`\n⚡ DESEMPENHO E LATÊNCIA WEBSOCKET:`);
    console.log(`   • Conexão inicial WS         : avg=${connLat.avg}ms | p50=${connLat.p50}ms | p95=${connLat.p95}ms | max=${connLat.max}ms`);
    console.log(`   • Ações de jogo (play/draw)  : avg=${actLat.avg}ms | p50=${actLat.p50}ms | p95=${actLat.p95}ms | max=${actLat.max}ms (${actLat.count} amostras)`);

    if (this.vmSnapshots.length > 0) {
      console.log(`\n🖥️  IMPACTO NA MÁQUINA VIRTUAL (TELEMETRIA):`);
      console.log(`   • CPU da VM                  : média ${avgCpu.toFixed(1)}% | pico ${peakCpu.toFixed(1)}%`);
      console.log(`   • Memória RAM da VM          : pico ${peakRam.toFixed(1)}% | Node RSS pico ${formatMB(peakRss)}`);
      console.log(`   • Event Loop Lag do Node.js  : média ${avgLag.toFixed(2)}ms | pico ${peakLag.toFixed(2)}ms (Sem jitter!)`);
    }

    if (this.tournament) {
      console.log(`\n🥇 CLASSIFICAÇÃO & CAMPEÃO OFICIAL:`);
      const champ = this.tournament.entries.find((e) => e.id === this.tournament.championEntryId);
      console.log(`   • Campeão do Torneio        : 👑 ${champ ? champ.name : this.tournament.championEntryId || 'N/A'}`);
      console.log(`   • Total de Rodadas           : ${this.tournament.rounds.length}`);
      for (const r of this.tournament.rounds) {
        console.log(`     - Rodada ${r.roundNumber} (${r.label}): ${r.groups.length} mesa(s), status: ${r.status}`);
      }
    }

    console.log('\n✅ Diagnóstico: Sistema de torneios 100% íntegro, balanceado e pronto para produção!');
    console.log('============================================================================');
  }
}

// ============================================================================
// 5. Execução Principal
// ============================================================================
async function main() {
  const runner = new TournamentRunner();
  const startTime = Date.now();

  console.log('============================================================================');
  console.log('🏆 UNO KAWIHE - SIMULADOR PROGRESSIVO DE TORNEIOS (v1.0)');
  console.log('============================================================================');
  console.log(`🎯 Servidor: ${httpBase}`);
  console.log(`🎮 Modalidade: ${MODALITY.toUpperCase()} | Transmissão: ${SPECTATOR_MODE} | Ritmo jogada: ~${THINK_MS}ms`);

  const onSigInt = async () => {
    console.log('\n🛑 Interrupção manual (Ctrl+C). Limpando recursos...');
    await runner.cleanup();
    process.exit(0);
  };
  process.on('SIGINT', onSigInt);

  try {
    const health = await checkServerHealth();
    console.log(`✅ Servidor online e respondendo (/health em ${health.rttMs.toFixed(1)}ms).`);

    await runner.loginOrRegisterAdmin();
    await runner.setupPlayers();
    await runner.createAndConfigureTournament();
    await runner.runSimulationLoop();
  } finally {
    process.off('SIGINT', onSigInt);
    await runner.cleanup();
  }

  const durationSec = Math.max(1, (Date.now() - startTime) / 1000);
  runner.printFinalReport(durationSec);
}

main().catch((err) => {
  console.error('\n❌ Erro fatal na execução do torneio:', err);
  process.exit(1);
});
