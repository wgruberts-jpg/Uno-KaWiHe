import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Activity,
  Cpu,
  HardDrive,
  Network,
  RefreshCw,
  Pause,
  Play,
  Server,
  AlertTriangle,
  CheckCircle2,
  Users,
  Wifi,
  Clock,
  Box,
  ArrowDownToLine,
  ArrowUpFromLine
} from 'lucide-react';
import { parseJsonSafe } from '../utils/http.js';

interface VmMetricsResponse {
  success: boolean;
  timestamp: number;
  appVersion: string;
  host: {
    hostname: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
  };
  cpu: {
    usagePercent: number;
    processPercent: number;
    cores: number;
    model: string;
    loadAvg: number[];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
    swapTotalBytes: number;
    swapUsedBytes: number;
    swapFreeBytes: number;
    swapPercent: number;
    containerUsageBytes: number | null;
    containerLimitBytes: number | null;
    nodeRssBytes: number;
    nodeHeapUsedBytes: number;
    nodeHeapTotalBytes: number;
  };
  network: {
    rxBytesPerSec: number;
    txBytesPerSec: number;
    totalRxBytes: number;
    totalTxBytes: number;
    interfaces: Array<{ name: string; rxBytes: number; txBytes: number }>;
  };
  disk: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usedPercent: number;
  };
  app: {
    processUptimeSeconds: number;
    eventLoopLagMs: number;
    wsConnections: number;
    lobbyOnlineCount: number;
    activeRoomsCount: number;
    playingRoomsCount: number;
    humanPlayersOnline: number;
    botsActive: number;
    spectatorsCount: number;
    authServiceStatus: 'online' | 'offline' | 'embedded';
    authServiceUrl: string | null;
  };
  error?: string;
}

interface VmMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val >= 100 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return '0s';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function getBarColor(percent: number): string {
  if (percent >= 85) return 'bg-gradient-to-r from-rose-500 to-red-600';
  if (percent >= 65) return 'bg-gradient-to-r from-amber-400 to-orange-500';
  return 'bg-gradient-to-r from-emerald-400 to-teal-500';
}

function getBadgeStyle(percent: number): string {
  if (percent >= 85) return 'bg-rose-100 text-rose-800 border-rose-300';
  if (percent >= 65) return 'bg-amber-100 text-amber-900 border-amber-300';
  return 'bg-emerald-100 text-emerald-800 border-emerald-300';
}

export const VmMonitorModal: React.FC<VmMonitorModalProps> = ({ isOpen, onClose }) => {
  const [metrics, setMetrics] = useState<VmMetricsResponse | null>(null);
  const [history, setHistory] = useState<Array<{ cpu: number; ram: number; rx: number; tx: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const token = localStorage.getItem('kawihe_auth_token') || '';
      const res = await fetch('/api/admin/vm-metrics', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const parsed = await parseJsonSafe<VmMetricsResponse>(res);
      const data = parsed.data;
      if (!res.ok || !parsed.isJson || !data || !data.success) {
        setError(parsed.error || data?.error || 'Não foi possível ler as métricas da VM.');
        return;
      }
      setError(null);
      setMetrics(data);
      setHistory((prev) => [
        ...prev.slice(-19),
        {
          cpu: data.cpu.usagePercent,
          ram: data.memory.usedPercent,
          rx: data.network.rxBytesPerSec,
          tx: data.network.txBytesPerSec,
        },
      ]);
    } catch {
      setError('Erro de conexão ao consultar o servidor.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    fetchMetrics(false);
    if (isAutoRefresh) {
      timerRef.current = setInterval(() => {
        fetchMetrics(true);
      }, 3000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isAutoRefresh, fetchMetrics]);

  if (!isOpen) return null;

  const containerMemPercent =
    metrics?.memory.containerUsageBytes && metrics?.memory.containerLimitBytes
      ? Number(((metrics.memory.containerUsageBytes / metrics.memory.containerLimitBytes) * 100).toFixed(1))
      : null;

  const isHighLoad =
    (metrics?.memory.usedPercent || 0) >= 85 ||
    (metrics?.memory.swapPercent || 0) >= 50 ||
    (metrics?.cpu.usagePercent || 0) >= 85;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border-4 border-emerald-400 rounded-3xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl my-4 text-slate-800 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-slate-100 gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-emerald-700 shadow-sm shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2 flex-wrap">
                <span>Monitoramento da VM</span>
                {metrics && (
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                      isHighLoad
                        ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    {isHighLoad ? '⚠️ CARGA ELEVADA' : '🟢 SAUDÁVEL'}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold">
                {metrics
                  ? `${metrics.host.hostname} · ${metrics.host.arch} · App v${metrics.appVersion}`
                  : 'Coletando telemetria em tempo real...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsAutoRefresh((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black border flex items-center gap-1 cursor-pointer transition-all ${
                isAutoRefresh
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
              }`}
              title="Atualização automática a cada 3s"
            >
              {isAutoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isAutoRefresh ? 'Ao vivo (3s)' : 'Pausado'}</span>
            </button>

            <button
              type="button"
              onClick={() => fetchMetrics(false)}
              disabled={isLoading}
              className="p-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 cursor-pointer transition-all disabled:opacity-50"
              title="Atualizar agora"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto space-y-3.5 pr-1 flex-1">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {metrics && (
            <>
              {/* High Resource Alert */}
              {isHighLoad && (
                <div className="p-3 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-black">Alerta de Recursos na VM Micro:</strong>
                    <p className="text-[11px] text-amber-900 mt-0.5">
                      O uso de RAM, Swap ou CPU está alto. Evite rodar builds Docker pesados durante partidas ativas e considere manter apenas o essencial ativo.
                    </p>
                  </div>
                </div>
              )}

              {/* Primary 2x2 Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. RAM & Swap */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border-2 border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-black text-xs text-slate-900">
                      <Server className="w-4 h-4 text-indigo-600" />
                      <span>Memória RAM (VM)</span>
                    </div>
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${getBadgeStyle(metrics.memory.usedPercent)}`}>
                      {metrics.memory.usedPercent}%
                    </span>
                  </div>

                  <div>
                    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                      <div
                        className={`h-full transition-all duration-500 ${getBarColor(metrics.memory.usedPercent)}`}
                        style={{ width: `${Math.min(100, metrics.memory.usedPercent)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-600 font-bold mt-1">
                      <span>Usado: {formatBytes(metrics.memory.usedBytes)}</span>
                      <span>Total: {formatBytes(metrics.memory.totalBytes)}</span>
                    </div>
                    <div className="text-[10px] text-emerald-700 font-bold">
                      Disponível: {formatBytes(metrics.memory.availableBytes)}
                    </div>
                  </div>

                  {/* Swap bar */}
                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span>Memória Swap (Disco)</span>
                      <span>
                        {metrics.memory.swapTotalBytes > 0
                          ? `${formatBytes(metrics.memory.swapUsedBytes)} / ${formatBytes(metrics.memory.swapTotalBytes)} (${metrics.memory.swapPercent}%)`
                          : 'Desativada'}
                      </span>
                    </div>
                    {metrics.memory.swapTotalBytes > 0 && (
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${getBarColor(metrics.memory.swapPercent)}`}
                          style={{ width: `${Math.min(100, metrics.memory.swapPercent)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. CPU & Load */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border-2 border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-black text-xs text-slate-900">
                      <Cpu className="w-4 h-4 text-amber-600" />
                      <span>CPU & Processamento</span>
                    </div>
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${getBadgeStyle(metrics.cpu.usagePercent)}`}>
                      {metrics.cpu.usagePercent}%
                    </span>
                  </div>

                  <div>
                    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                      <div
                        className={`h-full transition-all duration-500 ${getBarColor(metrics.cpu.usagePercent)}`}
                        style={{ width: `${Math.min(100, metrics.cpu.usagePercent)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-600 font-bold mt-1">
                      <span>{metrics.cpu.cores} vCPU(s)</span>
                      <span>Processo Node: {metrics.cpu.processPercent}%</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold truncate" title={metrics.cpu.model}>
                      {metrics.cpu.model}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-white rounded-xl p-1.5 border border-slate-200">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Load 1m</div>
                      <div className="text-xs font-black text-slate-800">{metrics.cpu.loadAvg[0] ?? 0}</div>
                    </div>
                    <div className="bg-white rounded-xl p-1.5 border border-slate-200">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Load 5m</div>
                      <div className="text-xs font-black text-slate-800">{metrics.cpu.loadAvg[1] ?? 0}</div>
                    </div>
                    <div className="bg-white rounded-xl p-1.5 border border-slate-200">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Event Loop</div>
                      <div className="text-xs font-black text-emerald-700">{metrics.app.eventLoopLagMs} ms</div>
                    </div>
                  </div>
                </div>

                {/* 3. Network I/O */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border-2 border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-black text-xs text-slate-900">
                      <Network className="w-4 h-4 text-sky-600" />
                      <span>Rede (Tráfego ao Vivo)</span>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                      {metrics.network.interfaces.length > 0
                        ? metrics.network.interfaces.map((i) => i.name).join(', ')
                        : 'interface padrão'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 uppercase">
                        <ArrowDownToLine className="w-3.5 h-3.5" />
                        <span>Download (RX)</span>
                      </div>
                      <div className="text-sm font-black text-slate-900 mt-0.5">
                        {formatRate(metrics.network.rxBytesPerSec)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                        Total: {formatBytes(metrics.network.totalRxBytes)}
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-blue-700 uppercase">
                        <ArrowUpFromLine className="w-3.5 h-3.5" />
                        <span>Upload (TX)</span>
                      </div>
                      <div className="text-sm font-black text-slate-900 mt-0.5">
                        {formatRate(metrics.network.txBytesPerSec)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                        Total: {formatBytes(metrics.network.totalTxBytes)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Container & Disk */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border-2 border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-black text-xs text-slate-900">
                      <Box className="w-4 h-4 text-purple-600" />
                      <span>Container Node & Disco</span>
                    </div>
                    {containerMemPercent !== null && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${getBadgeStyle(containerMemPercent)}`}>
                        Container: {containerMemPercent}%
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-[11px] font-bold text-slate-700">
                    <div className="flex justify-between">
                      <span>Node RSS (Memória Real):</span>
                      <span className="text-slate-900">{formatBytes(metrics.memory.nodeRssBytes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>JS Heap Usado / Total:</span>
                      <span className="text-slate-900">
                        {formatBytes(metrics.memory.nodeHeapUsedBytes)} / {formatBytes(metrics.memory.nodeHeapTotalBytes)}
                      </span>
                    </div>
                    {metrics.memory.containerLimitBytes && metrics.memory.containerUsageBytes !== null && (
                      <div className="flex justify-between">
                        <span>Limite Docker (uno-game):</span>
                        <span className="text-purple-800">
                          {formatBytes(metrics.memory.containerUsageBytes)} / {formatBytes(metrics.memory.containerLimitBytes)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                        Disco
                      </span>
                      <span>
                        {formatBytes(metrics.disk.usedBytes)} / {formatBytes(metrics.disk.totalBytes)} ({metrics.disk.usedPercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${getBarColor(metrics.disk.usedPercent)}`}
                        style={{ width: `${Math.min(100, metrics.disk.usedPercent)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Trend Sparklines */}
              {history.length > 1 && (
                <div className="p-3.5 rounded-2xl bg-slate-900 text-white border-2 border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
                      Tendência Recente (últimas {history.length} leituras)
                    </span>
                    <div className="flex items-center gap-3 text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-amber-300">
                        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> CPU %
                      </span>
                      <span className="flex items-center gap-1 text-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> RAM %
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-12 flex items-end gap-1 bg-slate-950/70 rounded-xl p-1.5 border border-slate-800">
                      {history.map((pt, i) => (
                        <div
                          key={`cpu-${i}`}
                          className="flex-1 bg-amber-400 rounded-t-xs transition-all duration-300"
                          style={{ height: `${Math.max(8, Math.min(100, pt.cpu))}%` }}
                          title={`CPU: ${pt.cpu}%`}
                        />
                      ))}
                    </div>
                    <div className="h-12 flex items-end gap-1 bg-slate-950/70 rounded-xl p-1.5 border border-slate-800">
                      {history.map((pt, i) => (
                        <div
                          key={`ram-${i}`}
                          className="flex-1 bg-emerald-400 rounded-t-xs transition-all duration-300"
                          style={{ height: `${Math.max(8, Math.min(100, pt.ram))}%` }}
                          title={`RAM: ${pt.ram}%`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* App & Services Health */}
              <div className="p-3.5 rounded-2xl bg-sky-50 border-2 border-sky-200">
                <div className="text-xs font-black text-sky-950 mb-2 flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-1.5">
                    <Wifi className="w-4 h-4 text-sky-600" />
                    <span>Carga do Jogo & Serviços</span>
                  </span>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                      metrics.app.authServiceStatus === 'online'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : metrics.app.authServiceStatus === 'embedded'
                        ? 'bg-sky-100 text-sky-800 border-sky-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    kawihe-auth: {metrics.app.authServiceStatus.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-white rounded-xl p-2 border border-sky-200">
                    <div className="text-[10px] font-bold text-slate-500 flex items-center justify-center gap-1">
                      <Wifi className="w-3 h-3 text-sky-500" /> WebSockets
                    </div>
                    <div className="text-sm font-black text-slate-900">{metrics.app.wsConnections}</div>
                  </div>
                  <div className="bg-white rounded-xl p-2 border border-sky-200">
                    <div className="text-[10px] font-bold text-slate-500">Salas (Em Jogo)</div>
                    <div className="text-sm font-black text-slate-900">
                      {metrics.app.activeRoomsCount} ({metrics.app.playingRoomsCount})
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-2 border border-sky-200">
                    <div className="text-[10px] font-bold text-slate-500 flex items-center justify-center gap-1">
                      <Users className="w-3 h-3 text-emerald-600" /> Humanos / Bots
                    </div>
                    <div className="text-sm font-black text-slate-900">
                      {metrics.app.humanPlayersOnline} / {metrics.app.botsActive}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-2 border border-sky-200">
                    <div className="text-[10px] font-bold text-slate-500 flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" /> Uptime App / VM
                    </div>
                    <div className="text-xs font-black text-slate-900 mt-0.5">
                      {formatDuration(metrics.app.processUptimeSeconds)} / {formatDuration(metrics.host.uptimeSeconds)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 mt-3 border-t-2 border-slate-100 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 font-semibold">
            Telemetria nativa via <code className="bg-slate-100 px-1 py-0.5 rounded">/api/admin/vm-metrics</code> (sem custo externo).
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs cursor-pointer transition-colors shadow-sm"
          >
            Fechar Monitor
          </button>
        </div>
      </div>
    </div>
  );
};
