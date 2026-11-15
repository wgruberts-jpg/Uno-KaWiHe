#!/usr/bin/env node
/**
 * UNO KaWiHe - Teste Progressivo de Capacidade Real (v2)
 * Preserva scripts/stress-test.mjs intacto e adiciona:
 *  - Correção da corrida de reinício de rodada (100% das mesas permanecem jogando)
 *  - Janela de confirmação anti-pico antes de abortar por CPU/Lag/Latência/Swap
 *  - Regra inteligente de Swap (só acusa saturação com pressão real de RAM ou salto crítico)
 *  - Separação entre latência em jogo estável vs rajada de entrada/lobby
 *  - Relatório final completo com tabela por degrau, picos da VM, banda e diagnóstico de gargalo
 *
 * Exemplos:
 *   node scripts/capacity-test.mjs --url http://146.181.59.151:3000 --user edinho --password 1709
 *   node scripts/capacity-test.mjs --url http://146.181.59.151:3000 --user edinho --password 1709 --max-rooms 40
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
🎴 UNO KaWiHe - Teste Progressivo de Capacidade Real (v2)
============================================================================
Uso:
  node scripts/capacity-test.mjs --url <URL_DO_SERVIDOR> [opções]

Modos:
  --mode ramp           (Padrão) Sobe mesas progressivamente com confirmação anti-pico
  --mode fixed          Mantém carga fixa por --duration segundos

Opções de Carga:
  --url <url>           URL HTTP/HTTPS ou WS/WSS do servidor (padrão: http://localhost:3000)
  --players <n>         Jogadores humanos por mesa (1 a 4, padrão: 4)
  --bots <n>            Robôs por mesa (0 a 3, padrão: 0)
  --spectators <n>      Visualizações assistidas (espectadores) por mesa (padrão: 2)
  --reveal-cards        Permite espectadores verem cartas abertas (padrão: ativado)
  --no-reveal-cards     Espectadores veem apenas a mesa (cartas ocultas)
  --no-lobby            Desativa registro no lobby global (isola carga só das mesas)
  --think-ms <ms>       Intervalo médio entre jogadas por jogador (padrão: 900)
  --anim-delay <s>      Atraso da animação de carta no servidor em s (padrão: 0.5)

Opções do modo RAMP & Anti-Pico:
  --start-rooms <n>     Mesas iniciais (padrão: 2)
  --step-rooms <n>      Mesas adicionadas por degrau (padrão: 2)
  --max-rooms <n>       Teto máximo de mesas a testar (padrão: 40)
  --step-seconds <s>    Duração de medição estável de cada degrau (padrão: 12)
  --confirm-seconds <s> Janela extra de confirmação se houver pico momentâneo (padrão: 10)
  --max-p95-ms <ms>     Latência p95 máxima em jogo estável antes de alertar (padrão: 300)
  --max-err-pct <pct>   Percentual máximo de falhas WS antes de alertar (padrão: 3)

Opções do modo FIXED:
  --rooms <n>           Quantidade fixa de mesas simultâneas (padrão: 8)
  --duration <s>        Duração total do teste em segundos (padrão: 45)

Telemetria da VM (/api/admin/vm-metrics):
  --pin <PIN>           PIN administrativo (se ADMIN_PIN estiver definido no servidor)
  --user <usuario>      Usuário admin (ex: edinho) para login via /api/auth/login
  --password <senha>    Senha do usuário admin
  --token <jwt>         Token JWT admin já emitido
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
const MAX_ROOMS = Math.max(START_ROOMS, Number(rawArgs['max-rooms'] ?? 40));
const STEP_SECONDS = Math.max(5, Number(rawArgs['step-seconds'] ?? 12));
const CONFIRM_SECONDS = Math.max(4, Number(rawArgs['confirm-seconds'] ?? 10));
const FIXED_ROOMS = Math.max(1, Number(rawArgs.rooms ?? 8));
const FIXED_DURATION = Math.max(5, Number(rawArgs.duration ?? 45));

const MAX_P95_MS = Math.max(50, Number(rawArgs['max-p95-ms'] ?? 300));
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

function formatBytesTotal(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatKBps(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
}

function formatMbps(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0.00 Mbps';
  return `${((bytesPerSec * 8) / (1000 * 1000)).toFixed(2)} Mbps`;
}

function calcLatencyStats(samples) {
  if (!samples || samples.length === 0) {
    return { count: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    avg: Number((sum / sorted.length).toFixed(1)),
    p50: Number(percentile(sorted, 50).toFixed(1)),
    p90: Number(percentile(sorted, 90).toFixed(1)),
    p95: Number(percentile(sorted, 95).toFixed(1)),
    p99: Number(percentile(sorted, 99).toFixed(1)),
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
      signal: AbortSignal.timeout(4500),
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
  const res = await fetch(`${httpBase}/health`, { signal: AbortSignal.timeout(4500) });
  const rttMs = performance.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { rttMs };
}

// ============================================================================
// 4. Motor de Simulação de Mesas, Jogadores e Espectadores
// ============================================================================
const COLORS = ['red', 'blue', 'green', 'yellow'];

class CapacityCluster {
  constructor() {
    this.rooms = [];
    this.shuttingDown = false;
    this.phase = 'ramp_burst'; // 'ramp_burst' | 'steady'
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
      bytesOut: 0,
      actionsAttempted: 0,
      actionsRejected: 0,
      roundsCompleted: 0,
      connectLatenciesMs: [],
      steadyActionRttsMs: [],
      burstActionRttsMs: [],
      allActionRttsMs: [],
    };
  }

  resetWindowMetrics() {
    this.windowMetrics = this.createEmptyMetrics();
  }

  record(fn) {
    fn(this.windowMetrics);
    fn(this.totalMetrics);
  }

  recordActionRtt(rttMs) {
    this.record((m) => {
      m.allActionRttsMs.push(rttMs);
      if (this.phase === 'steady') {
        m.steadyActionRttsMs.push(rttMs);
      } else {
        m.burstActionRttsMs.push(rttMs);
      }
    });
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
      }, 9000);

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
            client.pendingAction = null;
            const waiter = client.waiters.get('room_joined');
            if (waiter) {
              client.waiters.delete('room_joined');
              waiter.reject(new Error(msg.message || 'Erro WebSocket'));
            }
            return;
          }

          if (msg.type === 'game_state' && msg.state) {
            const st = msg.state;
            roomRef.status = st.status;
            roomRef.currentTurnPlayerId = st.currentTurnPlayerId;
            roomRef.stagedCardPlay = st.stagedCardPlay;
            roomRef.currentColor = st.currentColor;
            roomRef.discardTopId = st.discardPileTop?.id || 'none';

            if (st.status === 'playing') {
              roomRef.roundEndedHandled = false;
            }

            if (client.pendingAction) {
              const rtt = performance.now() - client.pendingAction.sentAt;
              this.recordActionRtt(rtt);
              client.pendingAction = null;
            }

            // Corrige corrida onde outro cliente recebia 'ended' antes do host
            if (st.status === 'ended' && !roomRef.roundEndedHandled) {
              roomRef.roundEndedHandled = true;
              this.record((m) => { m.roundsCompleted++; });
              if (!this.shuttingDown && !roomRef.restartScheduled && roomRef.host?.open) {
                roomRef.restartScheduled = true;
                setTimeout(() => {
                  roomRef.restartScheduled = false;
                  if (!this.shuttingDown && roomRef.host?.open && roomRef.status === 'ended') {
                    // Limpa chaves de turno para a nova rodada começar limpa
                    for (const p of roomRef.players) {
                      p.lastActedStateKey = '';
                      p.pendingAction = null;
                    }
                    this.sendJson(roomRef.host, {
                      protocolVersion: 2,
                      type: 'restart_game',
                      roomId: roomRef.roomId,
                    });
                  }
                }, 800);
              }
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
              this.recordActionRtt(rtt);
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
    if (!client.open || client.ws.readyState !== 1) return false;
    try {
      const encoded = JSON.stringify(payload);
      client.ws.send(encoded);
      this.record((m) => {
        m.messagesOut++;
        m.bytesOut += Buffer.byteLength(encoded, 'utf8');
      });
      return true;
    } catch {
      this.record((m) => { m.wsErrors++; });
      return false;
    }
  }

  waitForEvent(client, eventName, timeoutMs = 8000) {
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
      roundEndedHandled: false,
      host: null,
      players: [],
      spectators: [],
    };

    const host = await this.connectClient({
      name: `CapP1_M${roomIndex}`,
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

    for (let b = 0; b < BOTS_PER_ROOM; b++) {
      this.sendJson(host, {
        protocolVersion: 2,
        type: 'add_bot',
        roomId: roomRef.roomId,
      });
    }

    for (let p = 2; p <= PLAYERS_PER_ROOM; p++) {
      await sleep(20);
      const client = await this.connectClient({
        name: `CapP${p}_M${roomIndex}`,
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

    for (let s = 1; s <= SPECTATORS_PER_ROOM; s++) {
      await sleep(20);
      const spec = await this.connectClient({
        name: `CapTV${s}_M${roomIndex}`,
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

    this.sendJson(host, {
      protocolVersion: 2,
      type: 'start_game',
      roomId: roomRef.roomId,
    });

    this.rooms.push(roomRef);
    return roomRef;
  }

  async scaleToRooms(targetRooms) {
    this.phase = 'ramp_burst';
    while (this.rooms.length < targetRooms && !this.shuttingDown) {
      const nextIdx = this.rooms.length + 1;
      await this.createRoomAndStart(nextIdx);
      await sleep(140);
    }
  }

  ensureStuckRoomsPlaying() {
    for (const room of this.rooms) {
      if (room.status === 'ended' && !room.restartScheduled && room.host?.open && room.roomId) {
        room.restartScheduled = true;
        setTimeout(() => {
          room.restartScheduled = false;
          if (!this.shuttingDown && room.host?.open && room.status === 'ended') {
            for (const p of room.players) {
              p.lastActedStateKey = '';
              p.pendingAction = null;
            }
            this.sendJson(room.host, {
              protocolVersion: 2,
              type: 'restart_game',
              roomId: room.roomId,
            });
          }
        }, 300);
      }
    }
  }

  getSummaryCounts() {
    const roomsCount = this.rooms.length;
    const playingCount = this.rooms.filter((r) => r.status === 'playing').length;
    const endedCount = this.rooms.filter((r) => r.status === 'ended').length;
    const activePlayers = this.rooms.reduce((acc, r) => acc + r.players.filter((p) => p.open).length, 0);
    const activeBots = roomsCount * (PLAYERS_PER_ROOM === 1 && BOTS_PER_ROOM === 0 ? 1 : BOTS_PER_ROOM);
    const activeSpectators = this.rooms.reduce((acc, r) => acc + r.spectators.filter((s) => s.open).length, 0);
    return {
      roomsCount,
      playingCount,
      endedCount,
      activePlayers,
      activeBots,
      activeSpectators,
      totalConnections: activePlayers + activeSpectators,
    };
  }

  async shutdownAll() {
    this.shuttingDown = true;

    for (const room of this.rooms) {
      if (room.host?.open && room.roomId) {
        this.sendJson(room.host, {
          protocolVersion: 2,
          type: 'return_to_lobby',
          roomId: room.roomId,
        });
      }
    }
    await sleep(180);

    // Jogadores não-host saem primeiro; host sai por último para apagar a sala sem transferência
    for (const room of this.rooms) {
      const reversedPlayers = [...room.players].reverse();
      for (const p of reversedPlayers) {
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
    await sleep(220);

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
// 5. Avaliação Inteligente de Saúde & Anti-Pico
// ============================================================================
function evaluateStepHealth({ latStats, errorPct, healthRttMs, vm, baselineSwapBytes }) {
  const warnings = [];
  const critical = [];

  if (latStats.count > 0 && latStats.p95 > MAX_P95_MS) {
    warnings.push(`Latência p95 alta (${latStats.p95}ms > ${MAX_P95_MS}ms)`);
  }
  if (errorPct > 25) {
    critical.push(`Taxa crítica de falhas WS (${errorPct.toFixed(1)}%)`);
  } else if (errorPct > MAX_ERR_PCT) {
    warnings.push(`Taxa de erro WS elevada (${errorPct.toFixed(1)}% > ${MAX_ERR_PCT}%)`);
  }
  if (healthRttMs >= 9000) {
    critical.push('Servidor não respondeu ao /health');
  } else if (healthRttMs > 500) {
    warnings.push(`HTTP /health lento (${healthRttMs.toFixed(0)}ms)`);
  }

  if (vm) {
    const elLag = vm.app?.eventLoopLagMs ?? 0;
    const cpu = vm.cpu?.usagePercent ?? 0;
    const ramPct = vm.memory?.usedPercent ?? 0;
    const cUsage = vm.memory?.containerUsageBytes ?? 0;
    const cLimit = vm.memory?.containerLimitBytes ?? 0;
    const containerPct = cLimit > 0 ? (cUsage / cLimit) * 100 : 0;
    const swapDeltaMB = ((vm.memory?.swapUsedBytes ?? 0) - baselineSwapBytes) / (1024 * 1024);

    if (elLag > 80) warnings.push(`Event Loop Lag alto (${elLag.toFixed(1)}ms > 80ms)`);
    if (cpu >= 92) warnings.push(`CPU saturada (${cpu.toFixed(1)}%)`);
    if (containerPct > 85) warnings.push(`RAM do container quase no limite (${containerPct.toFixed(0)}%)`);
    if (ramPct > 88) warnings.push(`RAM da VM crítica (${ramPct.toFixed(1)}%)`);

    // Só acusa saturação de Swap se houver pressão real de RAM ou salto crítico (> 150MB)
    const realMemoryPressure = ramPct >= 75 || containerPct >= 75;
    if ((swapDeltaMB > 45 && realMemoryPressure) || swapDeltaMB > 150) {
      warnings.push(`Swap sob pressão de memória (+${swapDeltaMB.toFixed(0)}MB, VM RAM ${ramPct.toFixed(0)}%)`);
    }
  }

  return {
    healthy: warnings.length === 0 && critical.length === 0,
    criticalOnly: critical.length > 0,
    reasons: [...critical, ...warnings],
    warnings,
  };
}

function formatVmPart(vm, baselineSwapBytes) {
  if (!vm) return '';
  const swapDeltaMB = ((vm.memory?.swapUsedBytes ?? 0) - baselineSwapBytes) / (1024 * 1024);
  const swapStr = swapDeltaMB >= 0 ? `+${swapDeltaMB.toFixed(0)}MB` : `${swapDeltaMB.toFixed(0)}MB`;
  const cLimit = vm.memory?.containerLimitBytes ?? 0;
  const cPct = cLimit > 0 ? `/${((vm.memory.containerUsageBytes / cLimit) * 100).toFixed(0)}%ctr` : '';
  return ` | CPU ${vm.cpu.usagePercent.toFixed(0)}% (Proc ${vm.cpu.processPercent.toFixed(0)}%) | Node ${formatMB(vm.memory.nodeRssBytes)} (VM ${vm.memory.usedPercent.toFixed(0)}%${cPct}, Swap ${swapStr}) | EL ${vm.app.eventLoopLagMs.toFixed(1)}ms | TX ${formatKBps(vm.network.txBytesPerSec)}`;
}

function printStepLine(stepLabel, counts, latStats, errorPct, bytesPerSec, healthRttMs, vm, baselineSwapBytes, statusText) {
  console.log(
    `[${stepLabel}] Mesas=${counts.roomsCount} (Jogando=${counts.playingCount}) | Jog=${counts.activePlayers}${counts.activeBots ? `+${counts.activeBots}bot` : ''} | Espect=${counts.activeSpectators} | WS=${counts.totalConnections}` +
      ` | p95=${latStats.p95}ms (avg=${latStats.avg}ms) | /health=${healthRttMs.toFixed(0)}ms | Err=${errorPct.toFixed(1)}% | RX=${formatKBps(bytesPerSec)}${formatVmPart(vm, baselineSwapBytes)} => ${statusText}`
  );
}

// ============================================================================
// 6. Execução & Relatório Completo Final
// ============================================================================
async function measureWindow(cluster, seconds, baselineSwapBytes) {
  cluster.phase = 'steady';
  cluster.resetWindowMetrics();
  cluster.ensureStuckRoomsPlaying();
  await sleep(seconds * 1000);

  const counts = cluster.getSummaryCounts();
  const w = cluster.windowMetrics;
  const latStats = calcLatencyStats(w.steadyActionRttsMs);
  const totalOps = Math.max(1, w.actionsAttempted + counts.totalConnections);
  const errorPct = ((w.wsErrors + w.wsClosedUnexpected) / totalOps) * 100;
  const bytesPerSec = w.bytesIn / seconds;
  const msgsPerSec = w.messagesIn / seconds;
  const h = await checkServerHealth().catch(() => ({ rttMs: 9999 }));
  const vm = await fetchVmMetrics();
  const healthEval = evaluateStepHealth({ latStats, errorPct, healthRttMs: h.rttMs, vm, baselineSwapBytes });

  return {
    counts,
    latStats,
    errorPct,
    bytesPerSec,
    msgsPerSec,
    actionsInWindow: w.actionsAttempted,
    healthRttMs: h.rttMs,
    vm,
    healthEval,
  };
}

async function run() {
  const testStartTime = Date.now();

  console.log('============================================================================');
  console.log('🎴 UNO KAWIHE - TESTE PROGRESSIVO DE CAPACIDADE REAL (v2)');
  console.log('============================================================================');
  console.log(`🎯 Alvo: ${httpBase} (WS: ${wsUrl})`);
  console.log(
    `⚙️  Perfil por mesa: ${PLAYERS_PER_ROOM} jogador(es)${BOTS_PER_ROOM ? ` + ${BOTS_PER_ROOM} bot(s)` : ''} + ${SPECTATORS_PER_ROOM} espectador(es) (${REVEAL_CARDS ? 'cartas abertas' : 'mesa oculta'})`
  );
  console.log(
    `📊 Modo: ${MODE.toUpperCase()} | Lobby global: ${WITH_LOBBY ? 'Sim' : 'Não'} | Ritmo jogada: ~${THINK_MS}ms | Anti-pico: ${CONFIRM_SECONDS}s`
  );

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
      `🖥️  VM baseline: Versão=${baselineVm.appVersion || '?'} | CPU=${baselineVm.cpu.usagePercent.toFixed(1)}% (${baselineVm.cpu.cores} cores) | ` +
        `RAM=${formatMB(baselineVm.memory.usedBytes)}/${formatMB(baselineVm.memory.totalBytes)} (${baselineVm.memory.usedPercent.toFixed(1)}%) | ` +
        `Swap=${formatMB(baselineVm.memory.swapUsedBytes)} | Node RSS=${formatMB(baselineVm.memory.nodeRssBytes)}` +
        (baselineVm.memory.containerLimitBytes > 0 ? ` | Limite Container=${formatMB(baselineVm.memory.containerLimitBytes)}` : '')
    );
  } else {
    console.log('ℹ️  Rodando sem métricas internas da VM (passe --user/--password ou --pin para ver CPU, RAM, Swap e Event Loop).');
  }
  console.log('----------------------------------------------------------------------------');

  const cluster = new CapacityCluster();
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
  const healthRtts = [];
  let lastHealthySnapshot = null;
  let saturationSnapshot = null;
  let recoveredSpikesCount = 0;

  try {
    if (MODE === 'fixed') {
      console.log(`🚀 Subindo ${FIXED_ROOMS} mesas simultâneas...`);
      await cluster.scaleToRooms(FIXED_ROOMS);
      await sleep(2000);

      const rounds = Math.max(1, Math.round(FIXED_DURATION / 10));
      const sliceSec = FIXED_DURATION / rounds;

      for (let i = 1; i <= rounds; i++) {
        const snap = await measureWindow(cluster, sliceSec, baselineSwapBytes);
        snap.label = `Ciclo ${i}/${rounds}`;
        stepSnapshots.push(snap);
        if (snap.healthRttMs < 9000) healthRtts.push(snap.healthRttMs);
        if (snap.healthEval.healthy) lastHealthySnapshot = snap;
        else if (!saturationSnapshot) saturationSnapshot = snap;

        printStepLine(
          snap.label,
          snap.counts,
          snap.latStats,
          snap.errorPct,
          snap.bytesPerSec,
          snap.healthRttMs,
          snap.vm,
          baselineSwapBytes,
          snap.healthEval.healthy ? 'SAUDÁVEL' : `ALERTA (${snap.healthEval.reasons.join('; ')})`
        );
      }
    } else {
      let stepNum = 0;
      for (let targetRooms = START_ROOMS; targetRooms <= MAX_ROOMS; targetRooms += STEP_ROOMS) {
        stepNum++;
        try {
          await cluster.scaleToRooms(targetRooms);
        } catch (err) {
          console.log(`❌ Falha ao abrir mesa #${targetRooms}: ${err.message}`);
          saturationSnapshot = {
            label: `Degrau ${stepNum}`,
            counts: cluster.getSummaryCounts(),
            latStats: calcLatencyStats(cluster.windowMetrics.steadyActionRttsMs),
            errorPct: 100,
            bytesPerSec: 0,
            msgsPerSec: 0,
            healthRttMs: 9999,
            vm: await fetchVmMetrics(),
            healthEval: { healthy: false, criticalOnly: true, reasons: [err.message] },
          };
          break;
        }

        await sleep(2000);
        let snap = await measureWindow(cluster, STEP_SECONDS, baselineSwapBytes);
        snap.label = `Degrau ${stepNum}`;
        if (snap.healthRttMs < 9000) healthRtts.push(snap.healthRttMs);

        if (snap.healthEval.healthy) {
          stepSnapshots.push(snap);
          lastHealthySnapshot = snap;
          printStepLine(
            snap.label,
            snap.counts,
            snap.latStats,
            snap.errorPct,
            snap.bytesPerSec,
            snap.healthRttMs,
            snap.vm,
            baselineSwapBytes,
            'SAUDÁVEL'
          );
        } else if (snap.healthEval.criticalOnly) {
          stepSnapshots.push(snap);
          saturationSnapshot = snap;
          printStepLine(
            snap.label,
            snap.counts,
            snap.latStats,
            snap.errorPct,
            snap.bytesPerSec,
            snap.healthRttMs,
            snap.vm,
            baselineSwapBytes,
            `SATURAÇÃO CRÍTICA (${snap.healthEval.reasons.join('; ')})`
          );
          break;
        } else {
          // Janela de confirmação anti-pico momentâneo
          printStepLine(
            snap.label,
            snap.counts,
            snap.latStats,
            snap.errorPct,
            snap.bytesPerSec,
            snap.healthRttMs,
            snap.vm,
            baselineSwapBytes,
            `⚠️ PICO (${snap.healthEval.reasons.join('; ')}) -> reconfirmando em ${CONFIRM_SECONDS}s...`
          );

          const confirmSnap = await measureWindow(cluster, CONFIRM_SECONDS, baselineSwapBytes);
          confirmSnap.label = `Degrau ${stepNum} (Conf)`;
          if (confirmSnap.healthRttMs < 9000) healthRtts.push(confirmSnap.healthRttMs);

          if (confirmSnap.healthEval.healthy) {
            recoveredSpikesCount++;
            stepSnapshots.push(confirmSnap);
            lastHealthySnapshot = confirmSnap;
            printStepLine(
              confirmSnap.label,
              confirmSnap.counts,
              confirmSnap.latStats,
              confirmSnap.errorPct,
              confirmSnap.bytesPerSec,
              confirmSnap.healthRttMs,
              confirmSnap.vm,
              baselineSwapBytes,
              'RECUPERADO (pico momentâneo) => SAUDÁVEL'
            );
          } else {
            stepSnapshots.push(confirmSnap);
            saturationSnapshot = confirmSnap;
            printStepLine(
              confirmSnap.label,
              confirmSnap.counts,
              confirmSnap.latStats,
              confirmSnap.errorPct,
              confirmSnap.bytesPerSec,
              confirmSnap.healthRttMs,
              confirmSnap.vm,
              baselineSwapBytes,
              `SATURAÇÃO CONFIRMADA (${confirmSnap.healthEval.reasons.join('; ')})`
            );
            console.log(`🛑 Saturação confirmada em ${confirmSnap.counts.roomsCount} mesas. Encerrando rampa para preservar o servidor.`);
            break;
          }
        }
      }
    }
  } finally {
    process.off('SIGINT', onSigInt);
    console.log('\n🧹 Fechando mesas de teste e liberando conexões...');
    await cluster.shutdownAll();
  }

  // Verifica se o servidor ficou limpo após o teardown
  await sleep(400);
  const postTestVm = await fetchVmMetrics();
  const openRoomsCheck = await fetch(`${httpBase}/api/rooms/open`, { signal: AbortSignal.timeout(4000) })
    .then((r) => r.json())
    .catch(() => null);

  // ==========================================================================
  // 7. Relatório Final Completo
  // ==========================================================================
  const elapsedSec = Math.max(1, (Date.now() - testStartTime) / 1000);
  const tm = cluster.totalMetrics;
  const steadyLat = calcLatencyStats(tm.steadyActionRttsMs);
  const burstLat = calcLatencyStats(tm.burstActionRttsMs);
  const allLat = calcLatencyStats(tm.allActionRttsMs);
  const connLat = calcLatencyStats(tm.connectLatenciesMs);

  const vmSteps = stepSnapshots.map((s) => s.vm).filter(Boolean);
  const peakCpu = vmSteps.length ? Math.max(...vmSteps.map((v) => v.cpu.usagePercent)) : null;
  const avgCpu = vmSteps.length ? vmSteps.reduce((a, v) => a + v.cpu.usagePercent, 0) / vmSteps.length : null;
  const peakProcCpu = vmSteps.length ? Math.max(...vmSteps.map((v) => v.cpu.processPercent)) : null;
  const peakElLag = vmSteps.length ? Math.max(...vmSteps.map((v) => v.app.eventLoopLagMs)) : null;
  const avgElLag = vmSteps.length ? vmSteps.reduce((a, v) => a + v.app.eventLoopLagMs, 0) / vmSteps.length : null;
  const peakNodeRss = vmSteps.length ? Math.max(...vmSteps.map((v) => v.memory.nodeRssBytes)) : null;
  const peakVmRamPct = vmSteps.length ? Math.max(...vmSteps.map((v) => v.memory.usedPercent)) : null;
  const peakSwapDeltaMB = vmSteps.length
    ? Math.max(...vmSteps.map((v) => (v.memory.swapUsedBytes - baselineSwapBytes) / (1024 * 1024)))
    : null;
  const peakTxBps = vmSteps.length ? Math.max(...vmSteps.map((v) => v.network.txBytesPerSec)) : null;
  const peakRxClientBps = stepSnapshots.length ? Math.max(...stepSnapshots.map((s) => s.bytesPerSec)) : 0;

  console.log('\n============================================================================');
  console.log('📈 RELATÓRIO COMPLETO DE CAPACIDADE — UNO KAWIHE');
  console.log('============================================================================');
  console.log(`⏱️  Duração total do teste      : ${elapsedSec.toFixed(1)}s | Picos recuperados: ${recoveredSpikesCount}`);
  console.log(
    `🎮 Atividade simulada         : ${tm.actionsAttempted} jogadas | ${tm.roundsCompleted} rodadas concluídas | ${tm.actionsRejected} ações rejeitadas`
  );
  console.log(
    `🔌 Conexões & Erros           : ${tm.wsOpened} abertas | ${tm.wsErrors} erros WS | ${tm.wsClosedUnexpected} quedas inesperadas`
  );
  console.log(
    `📡 Tráfego total (cliente)    : Recebido=${formatBytesTotal(tm.bytesIn)} (${tm.messagesIn} msgs, média ${(tm.messagesIn / elapsedSec).toFixed(0)} msg/s) | Enviado=${formatBytesTotal(tm.bytesOut)} (${tm.messagesOut} msgs)`
  );
  console.log(
    `⚡ Latência conexão WS        : p50=${connLat.p50}ms | p95=${connLat.p95}ms | max=${connLat.max}ms`
  );
  console.log(
    `🎯 Latência JOGO ESTÁVEL      : avg=${steadyLat.avg}ms | p50=${steadyLat.p50}ms | p90=${steadyLat.p90}ms | p95=${steadyLat.p95}ms | p99=${steadyLat.p99}ms | max=${steadyLat.max}ms (${steadyLat.count} amostras)`
  );
  if (burstLat.count > 0) {
    console.log(
      `🚪 Latência RAJADA ENTRADA    : avg=${burstLat.avg}ms | p50=${burstLat.p50}ms | p95=${burstLat.p95}ms | max=${burstLat.max}ms (${burstLat.count} amostras durante abertura/lobby)`
    );
  }
  console.log(
    `📊 Latência GERAL combinada   : avg=${allLat.avg}ms | p50=${allLat.p50}ms | p95=${allLat.p95}ms | max=${allLat.max}ms`
  );
  if (healthRtts.length > 0) {
    const hAvg = healthRtts.reduce((a, b) => a + b, 0) / healthRtts.length;
    console.log(
      `🩺 Latência HTTP /health      : min=${Math.min(...healthRtts).toFixed(0)}ms | avg=${hAvg.toFixed(0)}ms | max=${Math.max(...healthRtts).toFixed(0)}ms`
    );
  }

  if (vmSteps.length > 0) {
    const lastVm = vmSteps[vmSteps.length - 1];
    console.log('\n🖥️  TELEMETRIA DA VM DURANTE O TESTE:');
    console.log(
      `   • CPU da VM       : média ${avgCpu.toFixed(1)}% | pico ${peakCpu.toFixed(1)}% (Node pico ${peakProcCpu.toFixed(1)}%) | LoadAvg final: [${lastVm.cpu.loadAvg.join(', ')}]`
    );
    console.log(
      `   • Memória RAM     : Node RSS pico ${formatMB(peakNodeRss)} | VM RAM pico ${peakVmRamPct.toFixed(1)}% | Swap variação máx ${peakSwapDeltaMB >= 0 ? '+' : ''}${peakSwapDeltaMB.toFixed(0)}MB`
    );
    console.log(
      `   • Event Loop Lag  : média ${avgElLag.toFixed(2)}ms | pico ${peakElLag.toFixed(2)}ms`
    );
    console.log(
      `   • Banda saída VM  : pico TX=${formatKBps(peakTxBps)} (${formatMbps(peakTxBps)}) | pico RX cliente=${formatKBps(peakRxClientBps)} (${formatMbps(peakRxClientBps)})`
    );
  }

  if (stepSnapshots.length > 0) {
    console.log('\n📋 RESUMO POR DEGRAU:');
    for (const s of stepSnapshots) {
      const vmShort = s.vm
        ? ` | CPU ${s.vm.cpu.usagePercent.toFixed(0)}% | Node ${formatMB(s.vm.memory.nodeRssBytes)} | VM ${s.vm.memory.usedPercent.toFixed(0)}% | EL ${s.vm.app.eventLoopLagMs.toFixed(1)}ms | TX ${formatKBps(s.vm.network.txBytesPerSec)}`
        : '';
      console.log(
        `   • ${s.label.padEnd(16)} -> ${String(s.counts.roomsCount).padStart(2)} mesas (${String(s.counts.playingCount).padStart(2)} jogando) | ${String(s.counts.totalConnections).padStart(3)} WS | p95=${String(s.latStats.p95).padStart(5)}ms${vmShort} | ${s.healthEval.healthy ? 'OK' : 'SATURADO'}`
      );
    }
  }

  if (lastHealthySnapshot) {
    const c = lastHealthySnapshot.counts;
    const safeFactor = saturationSnapshot ? 0.75 : 0.9;
    const safeRooms = Math.max(1, Math.floor(c.roomsCount * safeFactor));
    const safePlayers = Math.max(1, Math.floor(c.activePlayers * safeFactor));
    const safeSpecs = Math.floor(c.activeSpectators * safeFactor);
    const safeConns = safePlayers + safeSpecs;

    console.log('\n✅ CAPACIDADE RECOMENDADA (com margem de segurança):');
    console.log(`   • Mesas / Jogos simultâneos  : até ~${safeRooms} mesas ativas (máximo saudável observado: ${c.roomsCount} mesas)`);
    console.log(`   • Jogadores humanos          : até ~${safePlayers} simultâneos (observado saudável: ${c.activePlayers})`);
    console.log(`   • Visualizações assistidas   : até ~${safeSpecs} espectadores simultâneos (observado saudável: ${c.activeSpectators})`);
    console.log(`   • Total de conexões WebSocket: ~${safeConns} simultâneas (observado saudável: ${c.totalConnections})`);
    console.log(
      `   • Banda no pico saudável     : ${formatKBps(lastHealthySnapshot.bytesPerSec)} (${formatMbps(lastHealthySnapshot.bytesPerSec)})`
    );

    // Diagnóstico automático
    const diag = [];
    if (burstLat.count > 0 && steadyLat.p95 > 0 && burstLat.p95 > steadyLat.p95 * 2.5) {
      diag.push('Rajadas de entrada no Lobby global elevaram a latência durante abertura de salas (broadcastOnlinePlayers O(N²)); em jogo estável a latência ficou baixa.');
    }
    if (peakVmRamPct !== null && peakVmRamPct < 65 && peakElLag !== null && peakElLag < 10 && !saturationSnapshot) {
      diag.push(`RAM da VM (${peakVmRamPct.toFixed(0)}%) e Event Loop (${peakElLag.toFixed(1)}ms) ainda tinham folga no teto de ${c.roomsCount} mesas. Para achar o teto real, suba --max-rooms (ex: --max-rooms ${c.roomsCount + 20}).`);
    }
    if (peakTxBps !== null && peakTxBps > 500 * 1024) {
      diag.push(`Tráfego de saída atingiu ${formatMbps(peakTxBps)}; espectadores com cartas abertas + lobby global são os principais consumidores de banda.`);
    }
    if (diag.length > 0) {
      console.log('\n🔍 DIAGNÓSTICO TÉCNICO:');
      for (const line of diag) console.log(`   • ${line}`);
    }
  } else {
    console.log('\n⚠️  O servidor apresentou sinais de alerta já no primeiro degrau.');
  }

  if (saturationSnapshot) {
    const s = saturationSnapshot.counts;
    console.log(`\n🔥 PONTO DE SATURAÇÃO CONFIRMADO em ${s.roomsCount} mesas (${s.activePlayers} jogadores + ${s.activeSpectators} espectadores = ${s.totalConnections} WS):`);
    console.log(`   • Motivo(s): ${saturationSnapshot.healthEval.reasons.join(' | ')}`);
  }

  if (openRoomsCheck?.success) {
    const leftover = openRoomsCheck.rooms?.length ?? 0;
    console.log(`\n🧹 Limpeza pós-teste: ${leftover === 0 ? '0 salas remanescentes (100% limpo)' : `${leftover} sala(s) ainda aberta(s)`}${postTestVm ? ` | Node RSS pós-limpeza=${formatMB(postTestVm.memory.nodeRssBytes)}` : ''}`);
  }
  console.log('============================================================================');
}

run().catch((err) => {
  console.error('❌ Erro fatal no teste de capacidade:', err);
  process.exit(1);
});
