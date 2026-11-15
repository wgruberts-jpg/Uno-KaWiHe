#!/usr/bin/env node
/**
 * UNO KaWiHe - Teste de Stress e Estimativa de Capacidade (100% gratuito / Node.js nativo)
 *
 * Simula mesas reais (criação, entrada de jogadores, bots opcionais, espectadores com/sem cartas abertas,
 * início de partida, jogadas contínuas de cartas, compras e reinício de rodadas) para estimar quantos
 * jogos, mesas, jogadores e visualizações assistidas o servidor suporta antes de degradar.
 *
 * Exemplos de uso:
 *   node scripts/stress-test.mjs --url http://IP_DA_VM:3000
 *   node scripts/stress-test.mjs --url https://seu-dominio.com --mode ramp --players 4 --spectators 2
 *   node scripts/stress-test.mjs --url http://IP_DA_VM:3000 --mode fixed --rooms 8 --players 4 --spectators 2 --duration 45
 *   node scripts/stress-test.mjs --url http://IP_DA_VM:3000 --user edinho --password SUA_SENHA
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
🎴 UNO KaWiHe - Teste de Stress e Estimativa de Capacidade
============================================================================
Uso:
  node scripts/stress-test.mjs --url <URL_DO_SERVIDOR> [opções]

Modos:
  --mode ramp           (Padrão) Aumenta mesas progressivamente até encontrar o limite seguro
  --mode fixed          Mantém carga fixa por --duration segundos

Opções de Carga:
  --url <url>           URL HTTP/HTTPS ou WS/WSS do servidor (padrão: http://localhost:3000)
  --players <n>         Jogadores humanos por mesa (1 a 4, padrão: 4)
  --bots <n>            Robôs por mesa (0 a 3, padrão: 0)
  --spectators <n>      Visualizações assistidas (espectadores) por mesa (padrão: 2)
  --reveal-cards        Permite espectadores verem as mãos dos jogadores (pior caso de banda)
  --no-lobby            Não registra presença no lobby global (isola carga só das mesas)
  --think-ms <ms>       Intervalo médio entre jogadas de um jogador (padrão: 900)
  --anim-delay <s>      Atraso de animação da carta no servidor em segundos (padrão: 0.5)

Opções do modo RAMP:
  --start-rooms <n>     Mesas iniciais (padrão: 2)
  --step-rooms <n>      Mesas adicionadas por degrau (padrão: 2)
  --max-rooms <n>       Teto máximo de mesas a testar (padrão: 30)
  --step-seconds <s>    Duração de cada degrau em segundos (padrão: 12)
  --max-p95-ms <ms>     Latência p95 máxima aceitável antes de parar (padrão: 250)
  --max-err-pct <pct>   Percentual máximo de falhas WS antes de parar (padrão: 3)

Opções do modo FIXED:
  --rooms <n>           Quantidade fixa de mesas simultâneas (padrão: 5)
  --duration <s>        Duração sustentada do teste em segundos (padrão: 30)

Correlação opcional com Monitor da VM (/api/admin/vm-metrics):
  --pin <PIN>           PIN administrativo (se ADMIN_PIN estiver definido no servidor)
  --user <usuario>      Usuário admin (ex: edinho) para login automático via /api/auth/login
  --password <senha>    Senha do usuário admin
  --token <jwt>         Token JWT de administrador já emitido

Exemplos:
  # 1. Descobrir capacidade máxima da VM (4 jogadores + 2 espectadores por mesa):
  node scripts/stress-test.mjs --url http://IP_DA_VM:3000 --user edinho --password SUA_SENHA

  # 2. Simular pico específico (10 mesas = 40 jogadores + 20 espectadores = 60 WS):
  node scripts/stress-test.mjs --url http://IP_DA_VM:3000 --mode fixed --rooms 10 --players 4 --spectators 2 --duration 45
`);
  process.exit(0);
}

const MODE = String(rawArgs.mode || 'ramp').toLowerCase() === 'fixed' ? 'fixed' : 'ramp';
const TARGET_URL = String(rawArgs.url || 'http://localhost:3000').replace(/\/+$/, '');
const PLAYERS_PER_ROOM = Math.max(1, Math.min(4, Number(rawArgs.players ?? 4)));
const BOTS_PER_ROOM = Math.max(0, Math.min(4 - PLAYERS_PER_ROOM, Number(rawArgs.bots ?? 0)));
const SPECTATORS_PER_ROOM = Math.max(0, Number(rawArgs.spectators ?? 2));
const REVEAL_CARDS = rawArgs['reveal-cards'] !== undefined ? Boolean(rawArgs['reveal-cards']) : true;
const WITH_LOBBY = rawArgs.lobby !== false;
const THINK_MS = Math.max(150, Number(rawArgs['think-ms'] ?? 900));
const ANIM_DELAY = Math.max(0, Number(rawArgs['anim-delay'] ?? 0.5));

const START_ROOMS = Math.max(1, Number(rawArgs['start-rooms'] ?? 2));
const STEP_ROOMS = Math.max(1, Number(rawArgs['step-rooms'] ?? 2));
const MAX_ROOMS = Math.max(START_ROOMS, Number(rawArgs['max-rooms'] ?? 30));
const STEP_SECONDS = Math.max(5, Number(rawArgs['step-seconds'] ?? 12));
const FIXED_ROOMS = Math.max(1, Number(rawArgs.rooms ?? 5));
const FIXED_DURATION = Math.max(5, Number(rawArgs.duration ?? 30));

const MAX_P95_MS = Math.max(50, Number(rawArgs['max-p95-ms'] ?? 250));
const MAX_ERR_PCT = Math.max(0.5, Number(rawArgs['max-err-pct'] ?? 3));

const ADMIN_PIN = rawArgs.pin ? String(rawArgs.pin) : '';
const ADMIN_USER = rawArgs.user ? String(rawArgs.user) : '';
const ADMIN_PASS = rawArgs.password ? String(rawArgs.password) : '';
let ADMIN_TOKEN = rawArgs.token ? String(rawArgs.token) : '';

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

function formatKBps(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
}

function calcLatencyStats(samples) {
  if (!samples || samples.length === 0) {
    return { count: 0, avg: 0, p50: 0, p95: 0, max: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    avg: Number((sum / sorted.length).toFixed(1)),
    p50: Number(percentile(sorted, 50).toFixed(1)),
    p95: Number(percentile(sorted, 95).toFixed(1)),
    max: Number(sorted[sorted.length - 1].toFixed(1)),
  };
}

// ============================================================================
// 3. Autenticação opcional & Leitura de Métricas da VM
// ============================================================================
async function initAdminAuth() {
  if (!ADMIN_TOKEN && ADMIN_USER && ADMIN_PASS) {
    try {
      const res = await fetch(`${httpBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      if (data?.success && data?.token) {
        ADMIN_TOKEN = data.token;
        console.log(`🔐 Login admin realizado (${ADMIN_USER}) — telemetria da VM ativada!`);
      } else {
        console.warn(`⚠️ Falha no login admin (${data?.error || res.status}). Rodando sem telemetria interna da VM.`);
      }
    } catch (err) {
      console.warn(`⚠️ Não foi possível autenticar para métricas da VM: ${err.message}`);
    }
  }
}

async function fetchVmMetrics() {
  if (!ADMIN_TOKEN && !ADMIN_PIN) return null;
  const headers = {};
  if (ADMIN_TOKEN) headers['Authorization'] = `Bearer ${ADMIN_TOKEN}`;
  if (ADMIN_PIN) headers['x-admin-pin'] = ADMIN_PIN;
  try {
    const t0 = performance.now();
    const res = await fetch(`${httpBase}/api/admin/vm-metrics`, {
      headers,
      signal: AbortSignal.timeout(4000),
    });
    const httpMs = performance.now() - t0;
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success) return null;
    return { ...data, httpMs };
  } catch {
    return null;
  }
}

async function checkServerHealth() {
  const t0 = performance.now();
  const res = await fetch(`${httpBase}/health`, { signal: AbortSignal.timeout(4000) });
  const rttMs = performance.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { rttMs };
}

// ============================================================================
// 4. Motor de Simulação de Mesas, Jogadores e Espectadores
// ============================================================================
const COLORS = ['red', 'blue', 'green', 'yellow'];

class StressCluster {
  constructor() {
    this.rooms = [];
    this.shuttingDown = false;
    this.windowMetrics = this.createEmptyMetrics();
    this.totalMetrics = this.createEmptyMetrics();
  }

  createEmptyMetrics() {
    return {
      wsOpened: 0,
      wsErrors: 0,
      wsClosedUnexpected: 0,
      messagesIn: 0,
      bytesIn: 0,
      messagesOut: 0,
      actionsAttempted: 0,
      actionsRejected: 0,
      roundsCompleted: 0,
      connectLatenciesMs: [],
      actionRttsMs: [],
    };
  }

  resetWindowMetrics() {
    this.windowMetrics = this.createEmptyMetrics();
  }

  record(fn) {
    fn(this.windowMetrics);
    fn(this.totalMetrics);
  }

  async connectClient({ name, avatar, isSpectator, roomRef }) {
    const WS = await ensureWebSocketImpl();
    const tStart = performance.now();

    return await new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WS(wsUrl);

      const client = {
        ws,
        name,
        avatar,
        isSpectator,
        playerId: null,
        roomId: null,
        open: false,
        intentionalClose: false,
        pendingAction: null,
        lastActedStateKey: '',
        turnTimer: null,
        hand: [],
        playableCardIds: [],
        canDraw: false,
        canPassTurn: false,
        waiters: new Map(),
      };

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.record((m) => { m.wsErrors++; });
          try { ws.close(); } catch {}
          reject(new Error(`Timeout conectando ${name}`));
        }
      }, 8000);

      ws.addEventListener('open', () => {
        client.open = true;
        const connectMs = performance.now() - tStart;
        this.record((m) => {
          m.wsOpened++;
          m.connectLatenciesMs.push(connectMs);
        });

        if (WITH_LOBBY) {
          this.sendJson(client, {
            protocolVersion: 2,
            type: 'register_lobby',
            name,
            avatar,
          });
        }

        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(client);
        }
      });

      ws.addEventListener('message', async (ev) => {
        try {
          const text = await decodeWsMessage(ev.data);
          const byteLen = Buffer.byteLength(text, 'utf8');
          this.record((m) => {
            m.messagesIn++;
            m.bytesIn += byteLen;
          });

          const msg = JSON.parse(text);

          if (msg.type === 'room_joined') {
            client.roomId = msg.roomId;
            client.playerId = msg.playerId;
            const waiter = client.waiters.get('room_joined');
            if (waiter) {
              client.waiters.delete('room_joined');
              waiter.resolve(msg);
            }
            return;
          }

          if (msg.type === 'action_rejected') {
            this.record((m) => { m.actionsRejected++; });
            client.pendingAction = null;
            return;
          }

          if (msg.type === 'error') {
            this.record((m) => { m.wsErrors++; });
            const waiter = client.waiters.get('room_joined');
            if (waiter) {
              client.waiters.delete('room_joined');
              waiter.reject(new Error(msg.message || 'Erro WebSocket'));
            }
            return;
          }

          if (msg.type === 'game_state' && msg.state) {
            const st = msg.state;
            const prevStatus = roomRef.status;
            roomRef.status = st.status;
            roomRef.currentTurnPlayerId = st.currentTurnPlayerId;
            roomRef.stagedCardPlay = st.stagedCardPlay;
            roomRef.currentColor = st.currentColor;
            roomRef.discardTopId = st.discardPileTop?.id || 'none';

            if (client.pendingAction) {
              const rtt = performance.now() - client.pendingAction.sentAt;
              this.record((m) => { m.actionRttsMs.push(rtt); });
              client.pendingAction = null;
            }

            if (prevStatus === 'playing' && st.status === 'ended' && client === roomRef.host) {
              this.record((m) => { m.roundsCompleted++; });
              if (!this.shuttingDown && !roomRef.restartScheduled) {
                roomRef.restartScheduled = true;
                setTimeout(() => {
                  roomRef.restartScheduled = false;
                  if (!this.shuttingDown && roomRef.host?.open && roomRef.status === 'ended') {
                    this.sendJson(roomRef.host, {
                      protocolVersion: 2,
                      type: 'restart_game',
                      roomId: roomRef.roomId,
                    });
                  }
                }, 900);
              }
            }

            if (!client.isSpectator && st.status === 'playing' && !st.stagedCardPlay && st.currentTurnPlayerId === client.playerId) {
              this.maybeScheduleTurn(roomRef, client);
            }
            return;
          }

          if (msg.type === 'hand_state') {
            client.hand = msg.hand || [];
            client.playableCardIds = msg.playableCardIds || [];
            client.canDraw = Boolean(msg.canDraw);
            client.canPassTurn = Boolean(msg.canPassTurn);

            if (client.pendingAction && client.pendingAction.type !== 'play_card') {
              const rtt = performance.now() - client.pendingAction.sentAt;
              this.record((m) => { m.actionRttsMs.push(rtt); });
              client.pendingAction = null;
            }

            if (
              !client.isSpectator &&
              roomRef.status === 'playing' &&
              !roomRef.stagedCardPlay &&
              roomRef.currentTurnPlayerId === client.playerId
            ) {
              this.maybeScheduleTurn(roomRef, client);
            }
          }
        } catch (err) {
          if (process.env.DEBUG) console.error('[WS message err]', err);
        }
      });

      ws.addEventListener('error', (err) => {
        if (process.env.DEBUG) console.error('[WS error]', name, err?.message || err);
        this.record((m) => { m.wsErrors++; });
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`Erro de conexão WebSocket para ${name}`));
        }
      });

      ws.addEventListener('close', (ev) => {
        if (process.env.DEBUG) console.error('[WS close]', name, ev?.code, ev?.reason);
        client.open = false;
        if (client.turnTimer) {
          clearTimeout(client.turnTimer);
          client.turnTimer = null;
        }
        if (!client.intentionalClose && !this.shuttingDown) {
          this.record((m) => { m.wsClosedUnexpected++; });
        }
      });
    });
  }

  sendJson(client, payload) {
    if (!client.open || client.ws.readyState !== 1) {
      if (process.env.DEBUG) console.error('[sendJson skipped]', client.name, 'open=', client.open, 'readyState=', client.ws.readyState, payload.type);
      return false;
    }
    try {
      client.ws.send(JSON.stringify(payload));
      this.record((m) => { m.messagesOut++; });
      return true;
    } catch (err) {
      if (process.env.DEBUG) console.error('[sendJson err]', client.name, err);
      this.record((m) => { m.wsErrors++; });
      return false;
    }
  }

  waitForEvent(client, eventName, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        client.waiters.delete(eventName);
        reject(new Error(`Timeout aguardando ${eventName} (${client.name})`));
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

  maybeScheduleTurn(roomRef, client) {
    if (this.shuttingDown || client.turnTimer || !client.open) return;

    const stateKey = `${roomRef.discardTopId}:${roomRef.currentColor}:${client.hand.length}:${client.canDraw}:${client.canPassTurn}:${client.playableCardIds.length}`;
    if (client.lastActedStateKey === stateKey) return;

    const jitter = THINK_MS * (0.65 + Math.random() * 0.7);
    client.turnTimer = setTimeout(() => {
      client.turnTimer = null;
      if (this.shuttingDown || !client.open) return;
      if (roomRef.status !== 'playing' || roomRef.stagedCardPlay || roomRef.currentTurnPlayerId !== client.playerId) {
        return;
      }

      const currentStateKey = `${roomRef.discardTopId}:${roomRef.currentColor}:${client.hand.length}:${client.canDraw}:${client.canPassTurn}:${client.playableCardIds.length}`;
      if (client.lastActedStateKey === currentStateKey) return;

      if (client.playableCardIds.length > 0) {
        const chosen = client.hand.find((c) => client.playableCardIds.includes(c.id)) || client.hand.find((c) => c.id === client.playableCardIds[0]);
        if (!chosen) return;

        if (client.hand.length === 2) {
          this.sendJson(client, { protocolVersion: 2, type: 'call_uno', roomId: roomRef.roomId });
        }

        const chosenColor = chosen.color === 'wild' ? COLORS[Math.floor(Math.random() * COLORS.length)] : undefined;
        client.lastActedStateKey = currentStateKey;
        client.pendingAction = { type: 'play_card', sentAt: performance.now() };
        this.record((m) => { m.actionsAttempted++; });
        this.sendJson(client, {
          protocolVersion: 2,
          type: 'play_card',
          roomId: roomRef.roomId,
          cardId: chosen.id,
          chosenColor,
        });
        return;
      }

      if (client.canDraw) {
        client.lastActedStateKey = currentStateKey;
        client.pendingAction = { type: 'draw_card', sentAt: performance.now() };
        this.record((m) => { m.actionsAttempted++; });
        this.sendJson(client, {
          protocolVersion: 2,
          type: 'draw_card',
          roomId: roomRef.roomId,
        });
        return;
      }

      if (client.canPassTurn) {
        client.lastActedStateKey = currentStateKey;
        client.pendingAction = { type: 'pass_turn', sentAt: performance.now() };
        this.record((m) => { m.actionsAttempted++; });
        this.sendJson(client, {
          protocolVersion: 2,
          type: 'pass_turn',
          roomId: roomRef.roomId,
        });
      }
    }, jitter);
  }

  async createRoomAndStart(roomIndex) {
    const roomRef = {
      index: roomIndex,
      roomId: null,
      status: 'waiting',
      currentTurnPlayerId: null,
      stagedCardPlay: null,
      currentColor: 'red',
      discardTopId: 'none',
      restartScheduled: false,
      host: null,
      players: [],
      spectators: [],
    };

    const host = await this.connectClient({
      name: `StP1_M${roomIndex}`,
      avatar: '🧪',
      isSpectator: false,
      roomRef,
    });
    roomRef.host = host;
    roomRef.players.push(host);

    const hostJoinedPromise = this.waitForEvent(host, 'room_joined');
    this.sendJson(host, {
      protocolVersion: 2,
      type: 'create_room',
      playerName: host.name,
      avatar: host.avatar,
      settings: {
        maxPlayers: Math.max(2, Math.min(4, PLAYERS_PER_ROOM + BOTS_PER_ROOM)),
        turnDuration: 45,
        challengeUnoRule: false,
        showBotCards: false,
        botSpeedMs: 1100,
        autoUnoProtection: true,
        highlightHints: true,
        spectatorPermission: REVEAL_CARDS ? 'reveal_cards' : 'hidden_cards',
        isPrivate: false,
        playAnimationDelay: ANIM_DELAY,
      },
    });
    const hostJoined = await hostJoinedPromise;
    roomRef.roomId = hostJoined.roomId;

    // Adiciona bots se configurados
    for (let b = 0; b < BOTS_PER_ROOM; b++) {
      this.sendJson(host, {
        protocolVersion: 2,
        type: 'add_bot',
        roomId: roomRef.roomId,
      });
    }

    // Conecta demais jogadores humanos
    for (let p = 2; p <= PLAYERS_PER_ROOM; p++) {
      await sleep(20);
      const client = await this.connectClient({
        name: `StP${p}_M${roomIndex}`,
        avatar: '🎮',
        isSpectator: false,
        roomRef,
      });
      roomRef.players.push(client);

      const joinPromise = this.waitForEvent(client, 'room_joined');
      this.sendJson(client, {
        protocolVersion: 2,
        type: 'join_room',
        roomId: roomRef.roomId,
        playerName: client.name,
        avatar: client.avatar,
      });
      await joinPromise;
    }

    // Conecta espectadores (visualizações assistidas)
    for (let s = 1; s <= SPECTATORS_PER_ROOM; s++) {
      await sleep(20);
      const spec = await this.connectClient({
        name: `StTV${s}_M${roomIndex}`,
        avatar: '📺',
        isSpectator: true,
        roomRef,
      });
      roomRef.spectators.push(spec);

      const specPromise = this.waitForEvent(spec, 'room_joined');
      this.sendJson(spec, {
        protocolVersion: 2,
        type: 'join_room',
        roomId: roomRef.roomId,
        playerName: spec.name,
        avatar: spec.avatar,
        asSpectator: true,
        spectatorRevealCards: REVEAL_CARDS,
      });
      await specPromise;
    }

    // Inicia partida
    this.sendJson(host, {
      protocolVersion: 2,
      type: 'start_game',
      roomId: roomRef.roomId,
    });

    this.rooms.push(roomRef);
    return roomRef;
  }

  async scaleToRooms(targetRooms) {
    while (this.rooms.length < targetRooms && !this.shuttingDown) {
      const nextIdx = this.rooms.length + 1;
      await this.createRoomAndStart(nextIdx);
      await sleep(120);
    }
  }

  getSummaryCounts() {
    const roomsCount = this.rooms.length;
    const playingCount = this.rooms.filter((r) => r.status === 'playing').length;
    const activePlayers = this.rooms.reduce((acc, r) => acc + r.players.filter((p) => p.open).length, 0);
    const activeBots = roomsCount * (PLAYERS_PER_ROOM === 1 && BOTS_PER_ROOM === 0 ? 1 : BOTS_PER_ROOM);
    const activeSpectators = this.rooms.reduce((acc, r) => acc + r.spectators.filter((s) => s.open).length, 0);
    return {
      roomsCount,
      playingCount,
      activePlayers,
      activeBots,
      activeSpectators,
      totalConnections: activePlayers + activeSpectators,
    };
  }

  async shutdownAll() {
    this.shuttingDown = true;

    // 1. Devolve salas para lobby para limpeza imediata sem gerar bots fantasmas
    for (const room of this.rooms) {
      if (room.host?.open && room.roomId) {
        this.sendJson(room.host, {
          protocolVersion: 2,
          type: 'return_to_lobby',
          roomId: room.roomId,
        });
      }
    }
    await sleep(150);

    // 2. Cada jogador envia leave_room e fecha o socket limpo
    for (const room of this.rooms) {
      for (const p of room.players) {
        if (p.turnTimer) clearTimeout(p.turnTimer);
        if (p.open && p.roomId && p.playerId) {
          this.sendJson(p, {
            protocolVersion: 2,
            type: 'leave_room',
            roomId: p.roomId,
            playerId: p.playerId,
          });
        }
      }
    }
    await sleep(150);

    for (const room of this.rooms) {
      for (const client of [...room.players, ...room.spectators]) {
        client.intentionalClose = true;
        if (client.turnTimer) clearTimeout(client.turnTimer);
        try {
          client.ws.close();
        } catch {}
      }
    }
    this.rooms = [];
  }
}

// ============================================================================
// 5. Execução & Relatório de Capacidade
// ============================================================================
function evaluateStepHealth({ latStats, errorPct, healthRttMs, vm, baselineSwapBytes }) {
  const reasons = [];

  if (latStats.count > 0 && latStats.p95 > MAX_P95_MS) {
    reasons.push(`Latência p95 alta (${latStats.p95}ms > ${MAX_P95_MS}ms)`);
  }
  if (errorPct > MAX_ERR_PCT) {
    reasons.push(`Taxa de erro WS alta (${errorPct.toFixed(1)}% > ${MAX_ERR_PCT}%)`);
  }
  if (healthRttMs > 450) {
    reasons.push(`HTTP /health lento (${healthRttMs.toFixed(0)}ms)`);
  }

  if (vm) {
    const elLag = vm.app?.eventLoopLagMs ?? 0;
    const cpu = vm.cpu?.usagePercent ?? 0;
    const ramPct = vm.memory?.usedPercent ?? 0;
    const cUsage = vm.memory?.containerUsageBytes ?? 0;
    const cLimit = vm.memory?.containerLimitBytes ?? 0;
    const containerPct = cLimit > 0 ? (cUsage / cLimit) * 100 : 0;
    const swapDeltaMB = ((vm.memory?.swapUsedBytes ?? 0) - baselineSwapBytes) / (1024 * 1024);

    if (elLag > 80) reasons.push(`Event Loop Lag alto (${elLag.toFixed(1)}ms > 80ms)`);
    if (cpu >= 92) reasons.push(`CPU saturada (${cpu.toFixed(1)}%)`);
    if (containerPct > 85) reasons.push(`RAM do container quase no limite (${containerPct.toFixed(0)}%)`);
    if (ramPct > 88) reasons.push(`RAM da VM crítica (${ramPct.toFixed(1)}%)`);
    if (swapDeltaMB > 45) reasons.push(`Uso de Swap subindo (+${swapDeltaMB.toFixed(0)}MB)`);
  }

  return {
    healthy: reasons.length === 0,
    reasons,
  };
}

function printStepLine(stepLabel, counts, latStats, errorPct, bytesPerSec, healthRttMs, vm, statusText) {
  const vmPart = vm
    ? ` | CPU ${vm.cpu.usagePercent.toFixed(0)}% | RAM ${formatMB(vm.memory.nodeRssBytes)} (VM ${vm.memory.usedPercent.toFixed(0)}%) | EL ${vm.app.eventLoopLagMs.toFixed(1)}ms | TX ${formatKBps(vm.network.txBytesPerSec)}`
    : '';
  console.log(
    `[${stepLabel}] Mesas=${counts.roomsCount} (Jogando=${counts.playingCount}) | Jog=${counts.activePlayers}${counts.activeBots ? `+${counts.activeBots}bot` : ''} | Espect=${counts.activeSpectators} | WS=${counts.totalConnections}` +
      ` | p95=${latStats.p95}ms (avg=${latStats.avg}ms) | /health=${healthRttMs.toFixed(0)}ms | Err=${errorPct.toFixed(1)}% | RX=${formatKBps(bytesPerSec)}${vmPart} => ${statusText}`
  );
}

async function run() {
  console.log('============================================================================');
  console.log('🎴 UNO KAWIHE - TESTE DE STRESS E CAPACIDADE DO SERVIDOR');
  console.log('============================================================================');
  console.log(`🎯 Alvo: ${httpBase} (WS: ${wsUrl})`);
  console.log(
    `⚙️  Perfil por mesa: ${PLAYERS_PER_ROOM} jogador(es)${BOTS_PER_ROOM ? ` + ${BOTS_PER_ROOM} bot(s)` : ''} + ${SPECTATORS_PER_ROOM} espectador(es) (${REVEAL_CARDS ? 'cartas abertas' : 'mesa oculta'})`
  );
  console.log(`📊 Modo: ${MODE.toUpperCase()} | Lobby global: ${WITH_LOBBY ? 'Sim' : 'Não'} | Ritmo jogada: ~${THINK_MS}ms`);

  try {
    const h = await checkServerHealth();
    console.log(`✅ Servidor acessível! /health respondeu em ${h.rttMs.toFixed(1)}ms`);
  } catch (err) {
    console.error(`❌ Servidor indisponível em ${httpBase}/health: ${err.message}`);
    process.exit(1);
  }

  await initAdminAuth();
  const baselineVm = await fetchVmMetrics();
  const baselineSwapBytes = baselineVm?.memory?.swapUsedBytes ?? 0;

  if (baselineVm) {
    console.log(
      `🖥️  VM baseline: CPU=${baselineVm.cpu.usagePercent.toFixed(1)}% (${baselineVm.cpu.cores} cores) | ` +
        `RAM=${formatMB(baselineVm.memory.usedBytes)}/${formatMB(baselineVm.memory.totalBytes)} (${baselineVm.memory.usedPercent.toFixed(1)}%) | ` +
        `Swap=${formatMB(baselineVm.memory.swapUsedBytes)} | Node RSS=${formatMB(baselineVm.memory.nodeRssBytes)}` +
        (baselineVm.memory.containerLimitBytes > 0 ? ` | Limite Container=${formatMB(baselineVm.memory.containerLimitBytes)}` : '')
    );
  } else {
    console.log('ℹ️  Rodando sem métricas internas da VM (dica: passe --pin ou --user/--password para incluir CPU, RAM e Event Loop Lag).');
  }
  console.log('----------------------------------------------------------------------------');

  const cluster = new StressCluster();
  let interrupted = false;
  const onSigInt = async () => {
    if (interrupted) process.exit(1);
    interrupted = true;
    console.log('\n🛑 Interrupção recebida. Encerrando salas de teste de forma limpa...');
    await cluster.shutdownAll();
    process.exit(0);
  };
  process.on('SIGINT', onSigInt);

  const stepSnapshots = [];
  let lastHealthySnapshot = null;
  let saturationSnapshot = null;

  try {
    if (MODE === 'fixed') {
      console.log(`🚀 Subindo ${FIXED_ROOMS} mesas simultâneas...`);
      await cluster.scaleToRooms(FIXED_ROOMS);

      const rounds = Math.max(1, Math.round(FIXED_DURATION / 10));
      const sliceSec = FIXED_DURATION / rounds;

      for (let i = 1; i <= rounds; i++) {
        cluster.resetWindowMetrics();
        await sleep(sliceSec * 1000);

        const counts = cluster.getSummaryCounts();
        const w = cluster.windowMetrics;
        const latStats = calcLatencyStats(w.actionRttsMs);
        const totalOps = Math.max(1, w.actionsAttempted + w.wsOpened);
        const errorPct = ((w.wsErrors + w.wsClosedUnexpected) / totalOps) * 100;
        const bytesPerSec = w.bytesIn / sliceSec;
        const h = await checkServerHealth().catch(() => ({ rttMs: 9999 }));
        const vm = await fetchVmMetrics();
        const healthEval = evaluateStepHealth({ latStats, errorPct, healthRttMs: h.rttMs, vm, baselineSwapBytes });

        const snap = { counts, latStats, errorPct, bytesPerSec, healthRttMs: h.rttMs, vm, healthEval };
        stepSnapshots.push(snap);
        if (healthEval.healthy) lastHealthySnapshot = snap;
        else if (!saturationSnapshot) saturationSnapshot = snap;

        printStepLine(
          `Ciclo ${i}/${rounds}`,
          counts,
          latStats,
          errorPct,
          bytesPerSec,
          h.rttMs,
          vm,
          healthEval.healthy ? 'SAUDÁVEL' : `SATURADO (${healthEval.reasons.join('; ')})`
        );
      }
    } else {
      // Modo RAMP progressivo
      let stepNum = 0;
      for (let targetRooms = START_ROOMS; targetRooms <= MAX_ROOMS; targetRooms += STEP_ROOMS) {
        stepNum++;
        try {
          await cluster.scaleToRooms(targetRooms);
        } catch (err) {
          console.log(`❌ Falha ao abrir mesa #${targetRooms}: ${err.message}`);
          saturationSnapshot = {
            counts: cluster.getSummaryCounts(),
            latStats: calcLatencyStats(cluster.windowMetrics.actionRttsMs),
            errorPct: 100,
            bytesPerSec: 0,
            healthRttMs: 9999,
            vm: await fetchVmMetrics(),
            healthEval: { healthy: false, reasons: [err.message] },
          };
          break;
        }

        // Pequeno aquecimento de 2s para partidas começarem a trocar turnos
        await sleep(2000);
        cluster.resetWindowMetrics();
        await sleep(STEP_SECONDS * 1000);

        const counts = cluster.getSummaryCounts();
        const w = cluster.windowMetrics;
        const latStats = calcLatencyStats(w.actionRttsMs);
        const totalOps = Math.max(1, w.actionsAttempted + counts.totalConnections);
        const errorPct = ((w.wsErrors + w.wsClosedUnexpected) / totalOps) * 100;
        const bytesPerSec = w.bytesIn / STEP_SECONDS;
        const h = await checkServerHealth().catch(() => ({ rttMs: 9999 }));
        const vm = await fetchVmMetrics();
        const healthEval = evaluateStepHealth({ latStats, errorPct, healthRttMs: h.rttMs, vm, baselineSwapBytes });

        const snap = { counts, latStats, errorPct, bytesPerSec, healthRttMs: h.rttMs, vm, healthEval };
        stepSnapshots.push(snap);

        printStepLine(
          `Degrau ${stepNum}`,
          counts,
          latStats,
          errorPct,
          bytesPerSec,
          h.rttMs,
          vm,
          healthEval.healthy ? 'SAUDÁVEL' : `SATURAÇÃO (${healthEval.reasons.join('; ')})`
        );

        if (healthEval.healthy) {
          lastHealthySnapshot = snap;
        } else {
          saturationSnapshot = snap;
          console.log(`🛑 Limite atingido em ${counts.roomsCount} mesas. Encerrando rampa para preservar o servidor.`);
          break;
        }
      }
    }
  } finally {
    process.off('SIGINT', onSigInt);
    console.log('\n🧹 Fechando mesas de teste e liberando conexões...');
    await cluster.shutdownAll();
  }

  // ==========================================================================
  // 6. Relatório Final de Capacidade Estimada
  // ==========================================================================
  const totalLat = calcLatencyStats(cluster.totalMetrics.actionRttsMs);
  const connLat = calcLatencyStats(cluster.totalMetrics.connectLatenciesMs);

  console.log('\n============================================================================');
  console.log('📈 RELATÓRIO DE CAPACIDADE ESTIMADA — UNO KAWIHE');
  console.log('============================================================================');
  console.log(`• Total de jogadas simuladas: ${cluster.totalMetrics.actionsAttempted} | Rodadas concluídas: ${cluster.totalMetrics.roundsCompleted}`);
  console.log(`• Latência conexão WS: p50=${connLat.p50}ms | p95=${connLat.p95}ms`);
  console.log(`• Latência jogada (RTT): avg=${totalLat.avg}ms | p50=${totalLat.p50}ms | p95=${totalLat.p95}ms | max=${totalLat.max}ms`);
  console.log(`• Erros WS: ${cluster.totalMetrics.wsErrors} | Desconexões inesperadas: ${cluster.totalMetrics.wsClosedUnexpected} | Ações rejeitadas: ${cluster.totalMetrics.actionsRejected}`);

  if (lastHealthySnapshot) {
    const c = lastHealthySnapshot.counts;
    const safeFactor = saturationSnapshot ? 0.75 : 1.0;
    const safeRooms = Math.max(1, Math.floor(c.roomsCount * safeFactor));
    const safePlayers = Math.max(1, Math.floor(c.activePlayers * safeFactor));
    const safeSpecs = Math.floor(c.activeSpectators * safeFactor);
    const safeConns = safePlayers + safeSpecs;

    console.log('\n✅ CAPACIDADE RECOMENDADA (com margem de folga para picos):');
    console.log(`   • Mesas / Jogos simultâneos : até ~${safeRooms} mesas ativas`);
    console.log(`   • Jogadores humanos         : até ~${safePlayers} jogadores simultâneos`);
    console.log(`   • Visualizações assistidas  : até ~${safeSpecs} espectadores simultâneos`);
    console.log(`   • Total de conexões WebSocket: ~${safeConns} conexões simultâneas`);
    console.log(`   • Banda média observada no pico saudável: ${formatKBps(lastHealthySnapshot.bytesPerSec)}`);

    if (!saturationSnapshot && MODE === 'ramp') {
      console.log(`\nℹ️  O servidor continuou SAUDÁVEL até o teto configurado de ${c.roomsCount} mesas (${c.totalConnections} conexões).`);
      console.log(`   Se quiser descobrir o limite real de quebra, rode novamente aumentando --max-rooms (ex: --max-rooms ${c.roomsCount * 2}).`);
    }
  } else {
    console.log('\n⚠️  O servidor já apresentou sinais de saturação logo no primeiro degrau.');
  }

  if (saturationSnapshot) {
    const s = saturationSnapshot.counts;
    console.log(`\n🔥 PONTO DE SATURAÇÃO DETECTADO em ${s.roomsCount} mesas (${s.activePlayers} jogadores + ${s.activeSpectators} espectadores = ${s.totalConnections} WS):`);
    console.log(`   • Motivo(s): ${saturationSnapshot.healthEval.reasons.join(' | ')}`);
  }
  console.log('============================================================================');
}

run().catch((err) => {
  console.error('❌ Erro fatal no teste de stress:', err);
  process.exit(1);
});
