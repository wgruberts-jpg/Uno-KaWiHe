import React, { useState, useEffect } from 'react';
import { PlayerReportData, OnlinePlayerSummary, UserProfile } from '../types/uno.js';
import { auth } from '../services/auth.js';
import {
  Shield,
  User,
  Clock,
  Calendar,
  Gamepad2,
  Crown,
  Activity,
  Wifi,
  Smartphone,
  Monitor,
  Eye,
  UserX,
  LogOut,
  Key,
  Copy,
  Check,
  AlertCircle,
  MessageSquare,
  RefreshCw,
  X,
  Send,
  Trophy,
  Sparkles
} from 'lucide-react';

interface PlayerReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPlayer: OnlinePlayerSummary | { id: string; name: string; avatar?: string; username?: string } | null;
  currentUser: UserProfile | null;
  onJoinRoomAsAdmin?: (roomId: string) => void;
  onWatchRoom?: (roomId: string, revealCards?: boolean) => void;
}

export const PlayerReportModal: React.FC<PlayerReportModalProps> = ({
  isOpen,
  onClose,
  targetPlayer,
  currentUser,
  onJoinRoomAsAdmin,
  onWatchRoom
}) => {
  const [report, setReport] = useState<PlayerReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals / Prompts for quick admin actions
  const [isAlertPromptOpen, setIsAlertPromptOpen] = useState(false);
  const [alertText, setAlertText] = useState('');
  const [isResetPassOpen, setIsResetPassOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !targetPlayer) {
      setReport(null);
      setErrorMessage(null);
      setActionSuccess(null);
      setActionError(null);
      return;
    }

    fetchPlayerReport();
  }, [isOpen, targetPlayer]);

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    const token = auth.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const pin = sessionStorage.getItem('admin_pin') || localStorage.getItem('admin_pin');
    if (pin) {
      headers['x-admin-pin'] = pin;
    }
    return headers;
  };

  const fetchPlayerReport = async () => {
    if (!targetPlayer) return;
    setIsLoading(true);
    setErrorMessage(null);

    const queryKey = (targetPlayer as any).userId || (targetPlayer as any).username || targetPlayer.id || targetPlayer.name;

    try {
      const res = await fetch(`/api/admin/player-report/${encodeURIComponent(queryKey)}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
      } else {
        setErrorMessage(data.error || 'Não foi possível carregar o relatório deste jogador.');
      }
    } catch (e: any) {
      setErrorMessage('Falha ao conectar ao servidor para obter o relatório.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectPlayer = async () => {
    if (!report) return;
    const confirmed = window.confirm(`Deseja realmente desconectar a sessão de ${report.user.displayName}?`);
    if (!confirmed) return;

    setActionSuccess(null);
    setActionError(null);

    try {
      const res = await fetch('/api/admin/player-action/disconnect', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          targetId: report.user.id || report.user.username,
          reason: 'Sua sessão foi encerrada pelo Administrador.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message);
        fetchPlayerReport();
      } else {
        setActionError(data.error || 'Erro ao desconectar jogador.');
      }
    } catch {
      setActionError('Erro de conexão ao tentar desconectar jogador.');
    }
  };

  const handleKickFromRoom = async () => {
    if (!report || !report.location.roomId) return;
    const confirmed = window.confirm(`Expulsar ${report.user.displayName} da Sala #${report.location.roomId}?`);
    if (!confirmed) return;

    setActionSuccess(null);
    setActionError(null);

    try {
      const res = await fetch('/api/admin/player-action/kick-room', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          targetId: report.user.id || report.user.username,
          roomId: report.location.roomId,
          reason: 'Você foi retirado da partida pelo Administrador.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message);
        fetchPlayerReport();
      } else {
        setActionError(data.error || 'Erro ao expulsar jogador da sala.');
      }
    } catch {
      setActionError('Erro de conexão ao tentar expulsar jogador.');
    }
  };

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report || !alertText.trim()) return;

    setActionSuccess(null);
    setActionError(null);

    try {
      const res = await fetch('/api/admin/player-action/alert', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          targetId: report.user.id || report.user.username,
          message: alertText.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message);
        setAlertText('');
        setIsAlertPromptOpen(false);
      } else {
        setActionError(data.error || 'Erro ao enviar alerta.');
      }
    } catch {
      setActionError('Erro de conexão ao enviar alerta.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report || !newPassword.trim()) return;

    setActionSuccess(null);
    setActionError(null);

    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(report.user.id)}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          newPassword: newPassword.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message || 'Senha redefinida com sucesso!');
        setNewPassword('');
        setIsResetPassOpen(false);
      } else {
        setActionError(data.error || 'Erro ao redefinir senha.');
      }
    } catch {
      setActionError('Erro de conexão ao tentar redefinir senha.');
    }
  };

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return 'N/A';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Data não registrada';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString).getTime();
      const diffMs = Date.now() - d;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'hoje';
      if (diffDays === 1) return 'há 1 dia';
      if (diffDays < 30) return `há ${diffDays} dias`;
      const months = Math.floor(diffDays / 30);
      if (months === 1) return 'há 1 mês';
      return `há ${months} meses`;
    } catch {
      return '';
    }
  };

  const handleCopyReport = () => {
    if (!report) return;

    const text = `📋 [RELATÓRIO DO JOGADOR - UNO KAWIHE]
👤 Nome: ${report.user.displayName} (@${report.user.username} ${report.user.tag})
🛡️ Cargo: ${report.user.role.toUpperCase()}
🟢 Status: ${report.presence.isOnline ? 'Online' : 'Offline'}
⏱️ Logado há: ${formatDuration(report.presence.connectedDurationSeconds)}
📍 Localização: ${report.location.inRoom ? `Jogando na Sala #${report.location.roomId} (${report.location.isPrivate ? 'Privada' : 'Pública'})` : 'No Lobby Principal'}
${report.location.inRoom ? `👥 Membros na mesa: ${report.location.members.map(m => m.name).join(', ')}` : ''}
📅 Membro desde: ${formatDate(report.user.createdAt)} (${formatRelativeTime(report.user.createdAt)})
📊 Partidas: ${report.stats?.gamesPlayed || 0} | Vitórias: ${report.stats?.gamesWon || 0} (${report.stats?.winRate || 0}%)
🌐 IP / Dispositivo: ${report.presence.ip} | ${report.presence.device} (${report.presence.browser})
🔑 ID Interno: ${report.user.id}
`;

    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  if (!isOpen) return null;

  const displayName = report?.user.displayName || targetPlayer?.name || 'Jogador';
  const avatar = report?.user.avatar || (targetPlayer as any)?.avatar || '👤';
  const role = report?.user.role || (targetPlayer as any)?.role || 'player';
  const tag = report?.user.tag || (targetPlayer as any)?.tag || '#0000';
  const inRoom = report ? report.location.inRoom : !!(targetPlayer as any)?.roomId;
  const roomId = report ? report.location.roomId : (targetPlayer as any)?.roomId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white border-2 border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header Bar */}
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-indigo-950 text-white px-5 py-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide text-white">Relatório do Jogador</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-bold border border-amber-400/40 uppercase tracking-wider">
                  Admin
                </span>
              </div>
              <p className="text-xs text-sky-200/70 font-medium">
                Inspeção ao vivo de status, localização, histórico e sessão
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchPlayerReport}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action feedback banners */}
        {actionSuccess && (
          <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between animate-in slide-in-from-top-1">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {actionError && (
          <div className="px-5 py-2.5 bg-red-50 border-b border-red-200 text-red-800 text-xs font-bold flex items-center justify-between animate-in slide-in-from-top-1">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="text-red-600 hover:text-red-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-slate-800">
          {/* 1. Identity & Profile Header */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-white border-2 border-slate-200 shadow-md flex items-center justify-center text-3xl">
                  {avatar}
                </div>
                <span
                  className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                    report?.presence.isOnline !== false ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                  title={report?.presence.isOnline !== false ? 'Conectado agora' : 'Desconectado'}
                />
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-slate-900">{displayName}</h3>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                    {tag}
                  </span>
                  {role === 'admin' ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <Crown className="w-3 h-3 text-amber-600" />
                      Administrador
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1">
                      <User className="w-3 h-3 text-sky-600" />
                      Jogador
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-3 flex-wrap">
                  <span>@{report?.user.username || (targetPlayer as any)?.userId || 'usuario'}</span>
                  <span>•</span>
                  <span>ID: <code className="font-mono text-slate-600">{report?.user.id || targetPlayer?.id}</code></span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
              <button
                type="button"
                onClick={handleCopyReport}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                title="Copiar relatório em texto formatado"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                {isCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* 2. Real-Time Location Card (No Lobby / Na Sala tal) */}
          <div className={`p-4 rounded-2xl border transition-all ${
            inRoom
              ? 'bg-gradient-to-br from-blue-50/80 via-indigo-50/60 to-purple-50/40 border-blue-200 shadow-xs'
              : 'bg-emerald-50/70 border-emerald-200'
          }`}>
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/60">
              <div className="flex items-center gap-2">
                <Gamepad2 className={`w-4 h-4 ${inRoom ? 'text-blue-600' : 'text-emerald-600'}`} />
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Localização Atual em Tempo Real
                </span>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                inRoom ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
              }`}>
                {inRoom ? 'EM PARTIDA' : 'NO LOBBY'}
              </span>
            </div>

            {inRoom ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-blue-950">
                        {report?.location.roomName || `Sala #${roomId}`}
                      </span>
                      {report?.location.isPrivate && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-bold border border-purple-200">
                          🔒 Privada
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-blue-800 font-medium mt-0.5">
                      Papel:{' '}
                      <strong className="text-blue-900">
                        {report?.location.isHost ? '👑 Criador da Sala (Host)' : report?.location.isSpectator ? '👁️ Espectador' : 'Jogador'}
                      </strong>{' '}
                      • Estado:{' '}
                      <span className="capitalize">
                        {report?.location.gameStatus === 'playing'
                          ? '🃏 Partida em andamento'
                          : report?.location.gameStatus === 'waiting'
                          ? '⏳ Aguardando jogadores'
                          : report?.location.gameStatus === 'paused'
                          ? '⏸️ Pausada'
                          : 'Finalizada'}
                      </span>
                    </div>
                  </div>

                  {/* Actions for room */}
                  <div className="flex items-center gap-2">
                    {onWatchRoom && roomId && (
                      <button
                        type="button"
                        onClick={() => onWatchRoom(roomId, true)}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                        title="Assistir partida da sala em modo espectador"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Assistir / Espiar
                      </button>
                    )}
                    {onJoinRoomAsAdmin && roomId && (
                      <button
                        type="button"
                        onClick={() => onJoinRoomAsAdmin(roomId)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                        title="Entrar na sala como participante"
                      >
                        <Gamepad2 className="w-3.5 h-3.5" />
                        Entrar na Sala
                      </button>
                    )}
                  </div>
                </div>

                {/* Other members in room */}
                {report?.location.members && report.location.members.length > 0 && (
                  <div className="pt-2 border-t border-blue-200/70">
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                      Membros presentes nesta mesa ({report.location.members.length}):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {report.location.members.map((m) => {
                        const isTarget = m.id === report.user.id || m.name === report.user.displayName;
                        return (
                          <div
                            key={m.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all ${
                              isTarget
                                ? 'bg-blue-200/70 border-blue-400 text-blue-950 font-black'
                                : 'bg-white border-slate-200 text-slate-800'
                            }`}
                          >
                            <span>{m.avatar}</span>
                            <span>{m.name}</span>
                            {m.isHost && <Crown className="w-3 h-3 text-amber-500" />}
                            {m.isBot && <span className="text-[10px] text-slate-400">🤖</span>}
                            {m.cardsCount !== undefined && (
                              <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                                {m.cardsCount} cartas
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-emerald-900 font-medium">
                O jogador está livre no <strong>Lobby Principal</strong>, navegando ou esperando ser convidado para partidas.
              </div>
            )}
          </div>

          {/* 3. Session & Registration Timings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Membro Desde */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-purple-100 text-purple-700 shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Membro Desde
                </span>
                <div className="text-sm font-black text-slate-900 mt-0.5">
                  {report?.user.createdAt ? formatDate(report.user.createdAt) : 'Registrado no sistema'}
                </div>
                {report?.user.createdAt && (
                  <div className="text-xs text-purple-700 font-bold mt-0.5">
                    {formatRelativeTime(report.user.createdAt)}
                  </div>
                )}
              </div>
            </div>

            {/* Logado Há Quanto Tempo */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-sky-100 text-sky-700 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Logado Nesta Sessão
                </span>
                <div className="text-sm font-black text-slate-900 mt-0.5">
                  {report?.presence.isOnline
                    ? formatDuration(report.presence.connectedDurationSeconds)
                    : 'Desconectado'}
                </div>
                <div className="text-xs text-sky-700 font-bold mt-0.5">
                  {report?.presence.connectedAt
                    ? `Conexão: ${new Date(report.presence.connectedAt).toLocaleTimeString('pt-BR')}`
                    : 'Sessão ativa'}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Statistics & Career Performance */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Desempenho & Estatísticas de Jogo
                </span>
              </div>
              <span className="text-xs font-bold text-slate-500">
                Taxa de Vitória: <strong>{report?.stats?.winRate || 0}%</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Partidas</span>
                <span className="text-base font-black text-slate-900">{report?.stats?.gamesPlayed || 0}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Vitórias</span>
                <span className="text-base font-black text-emerald-600">{report?.stats?.gamesWon || 0}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block">Derrotas</span>
                <span className="text-base font-black text-slate-700">{report?.stats?.gamesLost || 0}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block">Pontos</span>
                <span className="text-base font-black text-indigo-600">{report?.stats?.totalPoints || 0}</span>
              </div>
            </div>
          </div>

          {/* 5. Diagnostic / Network / Device Info (O que o admin quer ver) */}
          <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-inner">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Diagnóstico Técnico & Rede
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                WebSocket Conectado
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase">
                  <Wifi className="w-3 h-3 text-sky-400" />
                  Endereço IP
                </div>
                <div className="font-mono font-bold text-slate-100 mt-1">
                  {report?.presence.ip || '127.0.0.1'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase">
                  {report?.presence.device === 'mobile' ? (
                    <Smartphone className="w-3 h-3 text-amber-400" />
                  ) : (
                    <Monitor className="w-3 h-3 text-indigo-400" />
                  )}
                  Dispositivo / Tela
                </div>
                <div className="font-bold text-slate-100 mt-1 capitalize">
                  {report?.presence.device === 'mobile'
                    ? 'Celular (Mobile)'
                    : report?.presence.device === 'tablet'
                    ? 'Tablet'
                    : 'Computador (Desktop)'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
                <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  Navegador
                </div>
                <div className="font-bold text-slate-100 mt-1 truncate" title={report?.presence.browser}>
                  {report?.presence.browser || 'Web'}
                </div>
              </div>
            </div>
          </div>

          {/* 6. Admin Actions Panel */}
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200">
            <div className="flex items-center gap-2 pb-2 mb-3 border-b border-amber-200/80">
              <Crown className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-black uppercase tracking-wider text-amber-950">
                Ações Administrativas Diretas
              </span>
            </div>

            {/* Prompt for Alert */}
            {isAlertPromptOpen && (
              <form onSubmit={handleSendAlert} className="mb-3 p-3 bg-white rounded-xl border border-amber-300 space-y-2 animate-in fade-in">
                <label className="text-xs font-bold text-slate-800 block">
                  Enviar Mensagem Direta na Tela de {displayName}:
                </label>
                <input
                  type="text"
                  value={alertText}
                  onChange={(e) => setAlertText(e.target.value)}
                  placeholder="Ex: Atenção ao tempo de jogada!"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAlertPromptOpen(false)}
                    className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    Enviar Alerta
                  </button>
                </div>
              </form>
            )}

            {/* Prompt for Reset Password */}
            {isResetPassOpen && (
              <form onSubmit={handleResetPassword} className="mb-3 p-3 bg-white rounded-xl border border-amber-300 space-y-2 animate-in fade-in">
                <label className="text-xs font-bold text-slate-800 block">
                  Redefinir Senha de {displayName}:
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nova senha (mínimo 3 caracteres)"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsResetPassOpen(false)}
                    className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Key className="w-3 h-3" />
                    Salvar Nova Senha
                  </button>
                </div>
              </form>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsAlertPromptOpen(prev => !prev)}
                className="px-3 py-2 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                Enviar Mensagem
              </button>

              {inRoom && (
                <button
                  type="button"
                  onClick={handleKickFromRoom}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-red-50 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <UserX className="w-3.5 h-3.5 text-red-600" />
                  Expulsar da Sala
                </button>
              )}

              <button
                type="button"
                onClick={handleDisconnectPlayer}
                className="px-3 py-2 rounded-xl bg-white hover:bg-red-50 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-red-600" />
                Desconectar Sessão
              </button>

              {report?.user.isRegistered && (
                <button
                  type="button"
                  onClick={() => setIsResetPassOpen(prev => !prev)}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-blue-50 border border-blue-300 text-blue-900 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5 text-blue-600" />
                  Redefinir Senha
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 font-medium">
            Uno KaWiHe • Painel de Controle e Auditoria em Tempo Real
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            Fechar Relatório
          </button>
        </div>
      </div>
    </div>
  );
};
