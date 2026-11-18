import React, { useState, useEffect } from 'react';
import { UserProfile, TournamentTempUsersChallengeResponse } from '../types/uno.js';
import { parseJsonSafe } from '../utils/http.js';
import {
  Trophy,
  Swords,
  Users,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Calendar,
  Edit3,
  ShieldAlert,
  Ban,
  History,
  Lock,
} from 'lucide-react';

interface TournamentModalProps {
  currentUser: UserProfile | null;
  token?: string;
  onClose: () => void;
  onJoinTournamentRoom: (roomId: string) => void;
}

const STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  registration: {
    label: 'Inscrições Abertas',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  rescheduled: {
    label: 'Reagendado (Aberto)',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  running: {
    label: 'Em Andamento',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  paused: {
    label: 'Pausado',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  },
  finished: {
    label: 'Finalizado',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  closed: {
    label: 'Encerrado',
    badgeClass: 'bg-slate-600/30 text-slate-200 border-slate-500/50',
  },
  cancelled: {
    label: 'Cancelado',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
};

function getStatusMeta(status: string) {
  return (
    STATUS_META[status] || {
      label: status,
      badgeClass: 'bg-slate-700 text-slate-300 border-slate-600',
    }
  );
}

function isOpenForRegistration(status: string): boolean {
  return status === 'registration' || status === 'rescheduled';
}

function isEndedStatus(status: string): boolean {
  return status === 'finished' || status === 'closed' || status === 'cancelled';
}

function formatDateTimePtBr(ms?: number | null): string {
  if (!ms || !Number.isFinite(ms)) return 'Não agendado';
  try {
    return new Date(ms).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

function toDateTimeLocalInput(ms?: number | null): string {
  if (!ms || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const TournamentModal: React.FC<TournamentModalProps> = ({
  currentUser,
  token,
  onClose,
  onJoinTournamentRoom,
}) => {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<any | null>(null);
  const [standings, setStandings] = useState<any>(null);
  const [seriesSummary, setSeriesSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New Tournament Form (Admin)
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModality, setNewModality] = useState<'individual' | 'doubles'>('individual');
  const [newBestOf, setNewBestOf] = useState<number>(3);
  const [newGamesPerGroup, setNewGamesPerGroup] = useState<number>(3);
  const [newAdvancePerGroup, setNewAdvancePerGroup] = useState<number>(1);
  const [newSpectatorMode, setNewSpectatorMode] = useState<'table_only' | 'tv_hidden' | 'tv_reveal'>('tv_hidden');
  const [newScheduledAt, setNewScheduledAt] = useState<string>('');

  // Team Registration Form (Doubles)
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [player1Ident, setPlayer1Ident] = useState('');
  const [player2Ident, setPlayer2Ident] = useState('');

  // Edit Tournament Modal (Admin)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSpectatorMode, setEditSpectatorMode] = useState<'table_only' | 'tv_hidden' | 'tv_reveal'>('tv_hidden');
  const [editTurnDuration, setEditTurnDuration] = useState<number>(30);
  const [editBestOf, setEditBestOf] = useState<number>(3);
  const [editGamesPerGroup, setEditGamesPerGroup] = useState<number>(3);
  const [editAdvancePerGroup, setEditAdvancePerGroup] = useState<number>(1);
  const [editScheduledAt, setEditScheduledAt] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Reschedule Tournament Modal (Admin)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleDateInput, setRescheduleDateInput] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Close Tournament Confirmation Modal (Admin — strictly independent of user deletion)
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [isClosingTournament, setIsClosingTournament] = useState(false);

  // Delete Temporary Users Modal with Server Math Challenge (Admin — strictly independent)
  const [showTempUsersModal, setShowTempUsersModal] = useState(false);
  const [tempUsersChallengeLoading, setTempUsersChallengeLoading] = useState(false);
  const [tempUsersChallengeData, setTempUsersChallengeData] = useState<TournamentTempUsersChallengeResponse | null>(null);
  const [mathAnswerInput, setMathAnswerInput] = useState('');
  const [tempCleanupReason, setTempCleanupReason] = useState('');
  const [tempCleanupError, setTempCleanupError] = useState<string | null>(null);
  const [isDeletingTempUsers, setIsDeletingTempUsers] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const fetchTournaments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tournaments', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const parsed = await parseJsonSafe<{ success?: boolean; tournaments?: any[]; error?: string }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success && Array.isArray(parsed.data.tournaments)) {
        setTournaments(parsed.data.tournaments);
      } else {
        setError(parsed.error || 'Erro ao carregar torneios.');
      }
    } catch {
      setError('Falha de conexão ao carregar torneios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
    const interval = setInterval(fetchTournaments, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadTournamentDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/tournaments/${id}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const parsed = await parseJsonSafe<{
        success?: boolean;
        tournament?: any;
        standingsByGroup?: any;
        seriesSummaryByGroup?: any;
      }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success) {
        setSelectedTournament(parsed.data.tournament);
        setStandings(parsed.data.standingsByGroup || {});
        setSeriesSummary(parsed.data.seriesSummaryByGroup || {});
      }
    } catch {}
  };

  useEffect(() => {
    if (selectedTournament) {
      const timer = setInterval(() => {
        loadTournamentDetails(selectedTournament.config.id);
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [selectedTournament?.config?.id]);

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    setSuccessMsg(null);
    try {
      const scheduledAtMs = newScheduledAt ? Date.parse(newScheduledAt) : undefined;
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: newName.trim(),
          modality: newModality,
          bestOf: newModality === 'doubles' ? newBestOf : undefined,
          gamesPerGroup: newModality === 'individual' ? newGamesPerGroup : undefined,
          advancePerGroup: newModality === 'individual' ? newAdvancePerGroup : undefined,
          spectatorMode: newSpectatorMode,
          scheduledAt: scheduledAtMs,
        }),
      });
      const parsed = await parseJsonSafe<{ success?: boolean; tournament?: any; error?: string }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success) {
        setSuccessMsg('Torneio criado com sucesso!');
        setShowCreate(false);
        setNewName('');
        setNewScheduledAt('');
        fetchTournaments();
        if (parsed.data.tournament?.config?.id) {
          loadTournamentDetails(parsed.data.tournament.config.id);
        }
      } else {
        setError(parsed.error || 'Erro ao criar torneio.');
      }
    } catch {
      setError('Erro de conexão ao criar torneio.');
    }
  };

  const handleRegisterSelf = async (tournId: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${tournId}/register`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const parsed = await parseJsonSafe<{ success?: boolean; error?: string }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success) {
        setSuccessMsg('Inscrição realizada com sucesso!');
        loadTournamentDetails(tournId);
        fetchTournaments();
      } else {
        setError(parsed.error || 'Erro ao se inscrever.');
      }
    } catch {
      setError('Erro de conexão na inscrição.');
    }
  };

  const handleRegisterTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament || !player1Ident.trim() || !player2Ident.trim()) return;
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${selectedTournament.config.id}/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: teamName.trim() || undefined,
          userIds: [player1Ident.trim(), player2Ident.trim()],
        }),
      });
      const parsed = await parseJsonSafe<{ success?: boolean; error?: string }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success) {
        setSuccessMsg('Equipe cadastrada com sucesso!');
        setShowTeamModal(false);
        setTeamName('');
        setPlayer1Ident('');
        setPlayer2Ident('');
        loadTournamentDetails(selectedTournament.config.id);
      } else {
        setError(parsed.error || 'Erro ao cadastrar equipe.');
      }
    } catch {
      setError('Erro de conexão ao cadastrar equipe.');
    }
  };

  const handleStartTournament = async (tournId: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${tournId}/start`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const parsed = await parseJsonSafe<{ success?: boolean; error?: string }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success) {
        setSuccessMsg('Torneio iniciado com sucesso!');
        loadTournamentDetails(tournId);
        fetchTournaments();
      } else {
        setError(parsed.error || 'Erro ao iniciar torneio.');
      }
    } catch {
      setError('Erro ao iniciar torneio.');
    }
  };

  const handleStartGame = async (tournId: string, gameId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournId}/games/${gameId}/start`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const parsed = await parseJsonSafe<{ success?: boolean; roomId?: string; error?: string }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success && parsed.data.roomId) {
        onClose();
        onJoinTournamentRoom(parsed.data.roomId);
      } else {
        setError(parsed.error || 'Erro ao iniciar partida da mesa.');
      }
    } catch {
      setError('Erro de conexão ao iniciar partida.');
    }
  };

  const openEditModal = () => {
    if (!selectedTournament) return;
    setEditName(selectedTournament.config.name || '');
    setEditSpectatorMode(selectedTournament.config.spectatorMode || 'tv_hidden');
    setEditTurnDuration(selectedTournament.config.turnDurationSeconds ?? 30);
    setEditBestOf(selectedTournament.config.bestOf ?? 3);
    setEditGamesPerGroup(selectedTournament.config.gamesPerGroup ?? 3);
    setEditAdvancePerGroup(selectedTournament.config.advancePerGroup ?? 1);
    setEditScheduledAt(toDateTimeLocalInput(selectedTournament.scheduledAt));
    setShowEditModal(true);
  };

  const handleSaveEditTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament) return;
    setError(null);
    setSuccessMsg(null);
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/tournaments/${selectedTournament.config.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: editName.trim(),
          spectatorMode: editSpectatorMode,
          turnDurationSeconds: editTurnDuration,
          scheduledAt: editScheduledAt ? Date.parse(editScheduledAt) : null,
          ...(isOpenForRegistration(selectedTournament.status)
            ? selectedTournament.config.modality === 'doubles'
              ? { bestOf: editBestOf }
              : { gamesPerGroup: editGamesPerGroup, advancePerGroup: editAdvancePerGroup }
            : {}),
        }),
      });
      const parsed = await parseJsonSafe<{ success?: boolean; tournament?: any; error?: string }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success) {
        setSuccessMsg('Configurações do torneio atualizadas.');
        setShowEditModal(false);
        if (parsed.data.tournament) setSelectedTournament(parsed.data.tournament);
        fetchTournaments();
      } else {
        setError(parsed.error || 'Não foi possível editar o torneio.');
      }
    } catch {
      setError('Erro de conexão ao editar torneio.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openRescheduleModal = () => {
    if (!selectedTournament) return;
    const defaultMs = selectedTournament.scheduledAt || Date.now() + 24 * 60 * 60 * 1000;
    setRescheduleDateInput(toDateTimeLocalInput(defaultMs));
    setRescheduleReason('');
    setShowRescheduleModal(true);
  };

  const handleRescheduleTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament || !rescheduleDateInput) return;
    setError(null);
    setSuccessMsg(null);
    setIsRescheduling(true);
    try {
      const scheduledAtMs = Date.parse(rescheduleDateInput);
      const res = await fetch(`/api/tournaments/${selectedTournament.config.id}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          scheduledAt: scheduledAtMs,
          reason: rescheduleReason.trim() || undefined,
        }),
      });
      const parsed = await parseJsonSafe<{ success?: boolean; tournament?: any; error?: string }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success) {
        setSuccessMsg('Torneio reagendado com sucesso! Inscrições e participações continuam liberadas.');
        setShowRescheduleModal(false);
        if (parsed.data.tournament) setSelectedTournament(parsed.data.tournament);
        fetchTournaments();
      } else {
        setError(parsed.error || 'Erro ao reagendar torneio.');
      }
    } catch {
      setError('Erro de conexão ao reagendar torneio.');
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleCloseTournament = async () => {
    if (!selectedTournament) return;
    setError(null);
    setSuccessMsg(null);
    setIsClosingTournament(true);
    try {
      const res = await fetch(`/api/tournaments/${selectedTournament.config.id}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          reason: closeReason.trim() || undefined,
        }),
      });
      const parsed = await parseJsonSafe<{ success?: boolean; tournament?: any; message?: string; error?: string }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success) {
        setSuccessMsg(
          parsed.data.message ||
            'Torneio encerrado com sucesso. Resultados, histórico, estatísticas e usuários foram preservados.'
        );
        setShowCloseModal(false);
        setCloseReason('');
        if (parsed.data.tournament) setSelectedTournament(parsed.data.tournament);
        fetchTournaments();
      } else {
        setError(parsed.error || 'Não foi possível encerrar o torneio.');
        setShowCloseModal(false);
      }
    } catch {
      setError('Erro de conexão ao encerrar torneio.');
    } finally {
      setIsClosingTournament(false);
    }
  };

  const requestTempUsersChallenge = async (tournId: string) => {
    setTempUsersChallengeLoading(true);
    setTempCleanupError(null);
    setMathAnswerInput('');
    try {
      const res = await fetch(`/api/tournaments/${tournId}/temporary-users/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const parsed = await parseJsonSafe<TournamentTempUsersChallengeResponse>(res);
      if (parsed.ok && parsed.isJson && parsed.data) {
        setTempUsersChallengeData(parsed.data);
        if (!parsed.data.success && parsed.data.error) {
          setTempCleanupError(parsed.data.error);
        }
      } else {
        setTempCleanupError(parsed.error || 'Erro ao gerar desafio de confirmação no servidor.');
      }
    } catch {
      setTempCleanupError('Erro de conexão ao consultar usuários temporários do torneio.');
    } finally {
      setTempUsersChallengeLoading(false);
    }
  };

  const openTempUsersCleanupModal = () => {
    if (!selectedTournament) return;
    setTempUsersChallengeData(null);
    setTempCleanupReason('');
    setMathAnswerInput('');
    setTempCleanupError(null);
    setShowTempUsersModal(true);
    requestTempUsersChallenge(selectedTournament.config.id);
  };

  const handleConfirmDeleteTempUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament || !tempUsersChallengeData?.challenge) return;
    setTempCleanupError(null);
    setIsDeletingTempUsers(true);
    try {
      const res = await fetch(`/api/tournaments/${selectedTournament.config.id}/temporary-users/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          challengeId: tempUsersChallengeData.challenge.challengeId,
          answer: mathAnswerInput.trim(),
          reason: tempCleanupReason.trim() || undefined,
        }),
      });
      const parsed = await parseJsonSafe<{
        success?: boolean;
        error?: string;
        code?: string;
        deletedCount?: number;
        preservedPermanentUsersCount?: number;
        tournament?: any;
      }>(res);

      if (parsed.ok && parsed.isJson && parsed.data?.success) {
        setShowTempUsersModal(false);
        setSuccessMsg(
          `${parsed.data.deletedCount || 0} usuário(s) temporário(s) excluído(s) com segurança. ${parsed.data.preservedPermanentUsersCount || 0} usuário(s) permanente(s) preservado(s).`
        );
        if (parsed.data.tournament) {
          setSelectedTournament(parsed.data.tournament);
        } else {
          loadTournamentDetails(selectedTournament.config.id);
        }
        fetchTournaments();
      } else {
        const msg = parsed.data?.error || parsed.error || 'Falha na validação da exclusão.';
        setTempCleanupError(msg);
        if (
          parsed.data?.code === 'CHALLENGE_INVALIDATED' ||
          parsed.data?.code === 'CHALLENGE_ALREADY_USED' ||
          parsed.data?.code === 'CHALLENGE_EXPIRED'
        ) {
          // Request a fresh math challenge automatically when previous one was invalidated
          requestTempUsersChallenge(selectedTournament.config.id);
        }
      }
    } catch {
      setTempCleanupError('Erro de conexão ao executar exclusão dos usuários temporários.');
    } finally {
      setIsDeletingTempUsers(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-slate-700 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg">
              <Swords className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Sistema de Torneios Oficial</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase font-black">
                  KaWiHe Pro
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Competições Individuais (Ponto a Ponto) e Duplas 2v2 (Eliminatórias Md3/Md5)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchTournaments}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center font-bold transition-all cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {selectedTournament ? (
            // Tournament Detail & Bracket View
            <div className="space-y-6">
              <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700 space-y-4">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTournament(null);
                        setError(null);
                        setSuccessMsg(null);
                      }}
                      className="text-xs text-rose-400 font-black hover:underline mb-1 inline-flex items-center gap-1 cursor-pointer"
                    >
                      ← Voltar à lista de torneios
                    </button>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-xl font-black text-white">{selectedTournament.config.name}</h3>
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase border ${getStatusMeta(selectedTournament.status).badgeClass}`}
                      >
                        {getStatusMeta(selectedTournament.status).label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400 font-medium">
                      <span>Modalidade: {selectedTournament.config.modality === 'doubles' ? 'Duplas 2v2' : 'Individual'}</span>
                      <span>•</span>
                      <span>Inscritos: <strong className="text-white">{selectedTournament.entries?.length || 0}</strong></span>
                      {selectedTournament.scheduledAt && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 text-sky-300 font-semibold">
                            <Calendar className="w-3.5 h-3.5" />
                            Data: {formatDateTimePtBr(selectedTournament.scheduledAt)}
                          </span>
                        </>
                      )}
                      {selectedTournament.closedAt && (
                        <>
                          <span>•</span>
                          <span className="text-slate-300">
                            Encerrado em {formatDateTimePtBr(selectedTournament.closedAt)}
                          </span>
                        </>
                      )}
                    </div>
                    {selectedTournament.closeReason && (
                      <div className="mt-1.5 text-[11px] text-slate-300 bg-slate-900/70 px-2.5 py-1 rounded-lg border border-slate-700 inline-block">
                        Motivo do encerramento: {selectedTournament.closeReason}
                      </div>
                    )}
                  </div>

                  {/* Player Registration Actions */}
                  {isOpenForRegistration(selectedTournament.status) && currentUser && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {selectedTournament.config.modality === 'individual' ? (
                        <button
                          type="button"
                          onClick={() => handleRegisterSelf(selectedTournament.config.id)}
                          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xs shadow-lg cursor-pointer flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Inscrever-se</span>
                        </button>
                      ) : (
                        isAdmin && (
                          <button
                            type="button"
                            onClick={() => setShowTeamModal(true)}
                            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black text-xs shadow-lg cursor-pointer flex items-center gap-2"
                          >
                            <Users className="w-4 h-4" />
                            <span>Cadastrar Dupla 2v2</span>
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Separated Admin Toolbar: Common Operations vs Independent Critical Operations */}
                {isAdmin && (
                  <div className="pt-3 border-t border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Common Admin Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      {!isEndedStatus(selectedTournament.status) && (
                        <>
                          <button
                            type="button"
                            onClick={openEditModal}
                            className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold text-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                            <span>Editar Torneio</span>
                          </button>
                          <button
                            type="button"
                            onClick={openRescheduleModal}
                            className="px-3 py-2 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-200 font-bold text-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Reagendar Data</span>
                          </button>
                        </>
                      )}

                      {isOpenForRegistration(selectedTournament.status) && (
                        <button
                          type="button"
                          onClick={() => handleStartTournament(selectedTournament.config.id)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-md cursor-pointer flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Iniciar Torneio</span>
                        </button>
                      )}
                    </div>

                    {/* Critical / Destructive Admin Actions — Visually Distinct & Strictly Independent */}
                    <div className="flex flex-wrap items-center gap-2 sm:pl-3 sm:border-l border-slate-700/80">
                      {!isEndedStatus(selectedTournament.status) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCloseReason('');
                            setShowCloseModal(true);
                          }}
                          className="px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/35 border border-amber-500/50 text-amber-300 font-black text-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Encerrar Torneio</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={openTempUsersCleanupModal}
                        className="px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/50 text-rose-300 font-black text-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir Usuários Temporários</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Entries list (visible in registration/rescheduled AND preserved for historical visibility) */}
              {(isOpenForRegistration(selectedTournament.status) || (selectedTournament.entries?.length || 0) > 0) && (
                <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700">
                  <h4 className="text-sm font-black text-slate-300 uppercase tracking-wider mb-3">
                    Participantes / Equipes Inscritas ({selectedTournament.entries?.length || 0})
                  </h4>
                  {selectedTournament.entries?.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Nenhum competidor inscrito ainda.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {selectedTournament.entries.map((ent: any) => (
                        <div key={ent.id} className="p-3 rounded-xl bg-slate-900 border border-slate-700 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-black text-xs shrink-0">
                            {ent.kind === 'team' ? '👥' : '👤'}
                          </div>
                          <div className="overflow-hidden min-w-0">
                            <div className="font-bold text-xs text-white truncate">{ent.name}</div>
                            {ent.deletedTemporaryUserIds?.length > 0 && (
                              <span className="inline-block text-[9px] font-black text-amber-300 bg-amber-950/60 border border-amber-500/40 px-1.5 py-0.2 rounded mt-0.5">
                                conta temporária removida
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Rounds & Bracket */}
              {!isOpenForRegistration(selectedTournament.status) && selectedTournament.rounds?.length > 0 && (
                <div className="space-y-6">
                  {selectedTournament.rounds.map((round: any) => (
                    <div key={round.roundNumber} className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          <span>{round.label} (Rodada {round.roundNumber})</span>
                        </h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-bold uppercase">
                          {round.status}
                        </span>
                      </div>

                      <div className="space-y-4">
                        {round.groups?.map((group: any) => {
                          const groupStandings = standings?.[group.id]?.standings || [];
                          const groupSeries = seriesSummary?.[group.id];

                          return (
                            <div key={group.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
                                <span>Mesa / Chave #{group.matchOrder}</span>
                                <span className="text-amber-400">Status: {group.status}</span>
                              </div>

                              {/* Standings for Individual or Series for Doubles */}
                              {group.rule?.type === 'points' ? (
                                <div className="space-y-1.5">
                                  {groupStandings.map((row: any) => {
                                    const entry = selectedTournament.entries.find((e: any) => e.id === row.entryId);
                                    return (
                                      <div key={row.entryId} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-800/60">
                                        <div className="flex items-center gap-2">
                                          <span className="w-5 font-black text-amber-400">#{row.rank}</span>
                                          <span className="font-bold text-white">{entry?.name || row.entryId}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-slate-400 font-medium">
                                          <span>Vitórias: <strong className="text-white">{row.wins}</strong></span>
                                          <span>Jogadas: {row.gamesPlayed}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-xs text-slate-300 font-medium">
                                  Confronto de Duplas (Série Melhor de {groupSeries?.bestOf || 3}) — Vitórias necessárias: {groupSeries?.winsNeeded || 2}
                                </div>
                              )}

                              {/* Games list in group */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                                {group.games?.map((gm: any) => {
                                  const winnerEntry = gm.winnerEntryId
                                    ? selectedTournament.entries.find((e: any) => e.id === gm.winnerEntryId)
                                    : null;
                                  return (
                                    <div key={gm.id} className="p-3 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between">
                                      <div>
                                        <div className="font-black text-xs text-white">Partida #{gm.gameNumber}</div>
                                        <div className="text-[10px] text-slate-400">
                                          {gm.status === 'finished'
                                            ? `Vencedor: ${winnerEntry?.name || gm.winnerEntryId}`
                                            : gm.status === 'void'
                                              ? gm.resultReason === 'tournament_closed'
                                                ? 'Anulada (Torneio encerrado)'
                                                : 'Anulada (W.O.)'
                                              : 'Pendente / Em Andamento'}
                                        </div>
                                      </div>

                                      {isAdmin &&
                                        gm.status === 'playing' &&
                                        gm.roomId &&
                                        !isEndedStatus(selectedTournament.status) && (
                                          <button
                                            type="button"
                                            onClick={() => handleStartGame(selectedTournament.config.id, gm.id)}
                                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md cursor-pointer flex items-center gap-1.5"
                                          >
                                            <Play className="w-3 h-3" />
                                            <span>Entrar na Mesa</span>
                                          </button>
                                        )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Admin Audit Trail & Reschedule History */}
              {isAdmin &&
                ((selectedTournament.rescheduleHistory?.length || 0) > 0 ||
                  (selectedTournament.auditTrail?.length || 0) > 0) && (
                  <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700 space-y-2">
                    <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-amber-400" /> Histórico Administrativo e Auditoria
                    </h4>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 text-[11px]">
                      {[...(selectedTournament.auditTrail || [])].reverse().map((ev: any) => (
                        <div
                          key={ev.id}
                          className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                        >
                          <span className="text-slate-200">{ev.details}</span>
                          <span className="text-slate-500 font-mono shrink-0">{formatDateTimePtBr(ev.at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          ) : (
            // Tournaments List & Creation
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-white">Campeonatos</h3>
                  <p className="text-xs text-slate-400">Escolha um torneio para ver o chaveamento, administrar ou inscrever-se</p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white font-black text-xs shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar Novo Torneio</span>
                  </button>
                )}
              </div>

              {/* Create Tournament Form */}
              {showCreate && isAdmin && (
                <form onSubmit={handleCreateTournament} className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-4 animate-in fade-in duration-200">
                  <h4 className="text-sm font-black text-amber-400 uppercase tracking-wider">Novo Campeonato KaWiHe</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Nome do Torneio</label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Ex: Copa Oficial KaWiHe 2026"
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Modalidade</label>
                      <select
                        value={newModality}
                        onChange={(e) => setNewModality(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                      >
                        <option value="individual">Individual (Mesas de 2 a 4)</option>
                        <option value="doubles">Duplas 2v2 (Mata-mata Md3/Md5)</option>
                      </select>
                    </div>

                    {newModality === 'doubles' ? (
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">Série (Best Of)</label>
                        <select
                          value={newBestOf}
                          onChange={(e) => setNewBestOf(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                        >
                          <option value={1}>Melhor de 1 (Md1)</option>
                          <option value={3}>Melhor de 3 (Md3)</option>
                          <option value={5}>Melhor de 5 (Md5)</option>
                        </select>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-slate-300 mb-1">Partidas por Mesa (Games)</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={newGamesPerGroup}
                            onChange={(e) => setNewGamesPerGroup(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-300 mb-1">Avançam por Mesa</label>
                          <select
                            value={newAdvancePerGroup}
                            onChange={(e) => setNewAdvancePerGroup(Number(e.target.value) as any)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                          >
                            <option value={1}>1 classificado</option>
                            <option value={2}>2 classificados</option>
                          </select>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Política de Espectadores</label>
                      <select
                        value={newSpectatorMode}
                        onChange={(e) => setNewSpectatorMode(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                      >
                        <option value="table_only">Apenas Jogadores (Sem Espectadores)</option>
                        <option value="tv_hidden">TV Oculta (Espectadores sem ver cartas)</option>
                        <option value="tv_reveal">TV Revelada (Espectadores com cartas abertas)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Data/Hora Agendada (Opcional)</label>
                      <input
                        type="datetime-local"
                        value={newScheduledAt}
                        onChange={(e) => setNewScheduledAt(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreate(false)}
                      className="px-4 py-2 rounded-xl bg-slate-700 text-slate-300 hover:text-white font-bold text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xs shadow-lg cursor-pointer"
                    >
                      Salvar e Criar
                    </button>
                  </div>
                </form>
              )}

              {/* Tournaments Grid */}
              {tournaments.length === 0 ? (
                <div className="text-center py-16 bg-slate-800/30 rounded-3xl border border-slate-800">
                  <Swords className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                  <p className="text-sm font-bold text-slate-400">Nenhum torneio cadastrado no momento.</p>
                  <p className="text-xs text-slate-500 mt-1">O Administrador pode criar um novo campeonato acima.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tournaments.map((tourn: any) => {
                    const meta = getStatusMeta(tourn.status);
                    return (
                      <div
                        key={tourn.config.id}
                        onClick={() => loadTournamentDetails(tourn.config.id)}
                        className="p-5 rounded-2xl bg-slate-800/70 border border-slate-700 hover:border-amber-500/50 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-black uppercase border border-amber-500/30">
                              {tourn.config.modality === 'doubles' ? 'Duplas 2v2' : 'Individual'}
                            </span>
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase border ${meta.badgeClass}`}>
                              {meta.label}
                            </span>
                          </div>
                          <h4 className="text-base font-black text-white group-hover:text-amber-300 transition-colors">
                            {tourn.config.name}
                          </h4>
                          <p className="text-xs text-slate-400 font-medium mt-1">
                            Inscritos: <strong className="text-white">{tourn.entries?.length || 0}</strong> competidores
                          </p>
                          {tourn.scheduledAt && (
                            <p className="text-[11px] text-sky-300 font-medium mt-1 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {formatDateTimePtBr(tourn.scheduledAt)}
                            </p>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-700/80 flex items-center justify-between text-xs text-amber-400 font-bold">
                          <span>Ver Chaveamento & Administração →</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Team Registration Modal for Doubles */}
        {showTeamModal && (
          <div className="fixed inset-0 z-60 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border-2 border-slate-700 w-full max-w-md rounded-3xl p-6 space-y-4">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <span>Cadastrar Dupla 2v2</span>
              </h4>
              <form onSubmit={handleRegisterTeam} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Nome da Equipe (Opcional)</label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Ex: Os Invencíveis"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Jogador 1 (Username ou ID)</label>
                  <input
                    type="text"
                    value={player1Ident}
                    onChange={(e) => setPlayer1Ident(e.target.value)}
                    placeholder="Ex: will"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Jogador 2 (Username ou ID)</label>
                  <input
                    type="text"
                    value={player2Ident}
                    onChange={(e) => setPlayer2Ident(e.target.value)}
                    placeholder="Ex: henry"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTeamModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg cursor-pointer"
                  >
                    Cadastrar Equipe
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Tournament Modal (Admin) */}
        {showEditModal && selectedTournament && (
          <div className="fixed inset-0 z-60 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border-2 border-slate-600 w-full max-w-md rounded-3xl p-6 space-y-4">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <span>Editar Torneio</span>
              </h4>
              <form onSubmit={handleSaveEditTournament} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Nome do Torneio</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Espectadores</label>
                    <select
                      value={editSpectatorMode}
                      onChange={(e) => setEditSpectatorMode(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                    >
                      <option value="table_only">Apenas Jogadores</option>
                      <option value="tv_hidden">TV Oculta</option>
                      <option value="tv_reveal">TV Revelada</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Turno (seg)</label>
                    <input
                      type="number"
                      min={10}
                      max={180}
                      value={editTurnDuration}
                      onChange={(e) => setEditTurnDuration(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                    />
                  </div>
                </div>

                {isOpenForRegistration(selectedTournament.status) ? (
                  selectedTournament.config.modality === 'doubles' ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Série (Best Of)</label>
                      <select
                        value={editBestOf}
                        onChange={(e) => setEditBestOf(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                      >
                        <option value={1}>Melhor de 1 (Md1)</option>
                        <option value={3}>Melhor de 3 (Md3)</option>
                        <option value={5}>Melhor de 5 (Md5)</option>
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">Partidas por Mesa</label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={editGamesPerGroup}
                          onChange={(e) => setEditGamesPerGroup(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">Avançam por Mesa</label>
                        <select
                          value={editAdvancePerGroup}
                          onChange={(e) => setEditAdvancePerGroup(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                        >
                          <option value={1}>1 classificado</option>
                          <option value={2}>2 classificados</option>
                        </select>
                      </div>
                    </div>
                  )
                ) : (
                  <p className="text-[11px] text-amber-300 bg-amber-950/40 p-2 rounded-xl border border-amber-500/30">
                    Regras de chaveamento ficam bloqueadas após o início das partidas para preservar integridade competitiva.
                  </p>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Data/Hora Agendada (Opcional)</label>
                  <input
                    type="datetime-local"
                    value={editScheduledAt}
                    onChange={(e) => setEditScheduledAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reschedule Tournament Modal (Admin) */}
        {showRescheduleModal && selectedTournament && (
          <div className="fixed inset-0 z-60 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border-2 border-sky-500 w-full max-w-md rounded-3xl p-6 space-y-4">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-sky-400" />
                <span>Reagendar Torneio</span>
              </h4>
              <p className="text-xs text-slate-300">
                O torneio <strong className="text-white">{selectedTournament.config.name}</strong> será transferido para a nova data sem ser encerrado. Inscrições e participações continuam funcionando normalmente.
              </p>
              <form onSubmit={handleRescheduleTournament} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Nova Data e Hora *</label>
                  <input
                    type="datetime-local"
                    required
                    value={rescheduleDateInput}
                    onChange={(e) => setRescheduleDateInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Motivo / Observação (Opcional)</label>
                  <input
                    type="text"
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    placeholder="Ex: Ajuste de agenda da equipe"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-sky-400"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRescheduleModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isRescheduling || !rescheduleDateInput}
                    className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs cursor-pointer disabled:opacity-50"
                  >
                    {isRescheduling ? 'Reagendando...' : 'Confirmar Reagendamento'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Close Tournament Confirmation Modal (Admin — Independent of temporary user deletion) */}
        {showCloseModal && selectedTournament && (
          <div className="fixed inset-0 z-60 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border-2 border-amber-500 w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <Ban className="w-5 h-5 text-amber-400" />
                <span>Encerrar Torneio</span>
              </h4>
              <div className="text-xs text-slate-300 space-y-2 bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700">
                <p>
                  Ao confirmar o encerramento de <strong className="text-white">{selectedTournament.config.name}</strong>:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-300">
                  <li>O status será alterado para <strong className="text-amber-300">Encerrado</strong>.</li>
                  <li>Novas inscrições, participações e partidas serão bloqueadas.</li>
                  <li className="text-emerald-300 font-bold">Resultados, histórico, estatísticas e TODOS os usuários serão preservados integralmente.</li>
                  <li>Nenhum usuário é excluído ao encerrar um torneio.</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Motivo do encerramento (Opcional)</label>
                <input
                  type="text"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="Ex: Torneio de teste concluído"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isClosingTournament}
                  onClick={() => setShowCloseModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isClosingTournament}
                  onClick={handleCloseTournament}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer disabled:opacity-50"
                >
                  {isClosingTournament ? 'Encerrando...' : 'Confirmar Encerramento'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Temporary Users Confirmation Modal with Server Math Challenge */}
        {showTempUsersModal && selectedTournament && (
          <div className="fixed inset-0 z-60 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border-2 border-rose-500 w-full max-w-lg rounded-3xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-black text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                  <span>Excluir Usuários Temporários do Torneio</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowTempUsersModal(false)}
                  className="text-slate-400 hover:text-white text-xs font-black cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {tempUsersChallengeLoading ? (
                <div className="p-6 text-center text-xs text-slate-300 font-bold">
                  Analisando vínculos, dependências e gerando desafio de confirmação no servidor...
                </div>
              ) : tempUsersChallengeData ? (
                <form onSubmit={handleConfirmDeleteTempUsers} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700 text-xs space-y-2">
                    <div>
                      <span className="text-slate-400">Torneio:</span>{' '}
                      <strong className="text-white">{tempUsersChallengeData.tournament.name || selectedTournament.config.name}</strong>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-500/40">
                        <div className="text-[10px] text-rose-300 font-bold">Temporários identificados</div>
                        <div className="text-lg font-black text-rose-400">
                          {tempUsersChallengeData.temporaryUsersCount}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40">
                        <div className="text-[10px] text-emerald-300 font-bold">Permanentes preservados</div>
                        <div className="text-lg font-black text-emerald-400">
                          {tempUsersChallengeData.permanentUsersPreservedCount}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-300 space-y-1 pt-1">
                      <p className="text-emerald-300 font-bold">
                        ✓ Todos os usuários permanentes (mesmo criados durante o torneio), administradores e contas temporárias de outros torneios serão preservados.
                      </p>
                      <p className="text-amber-300">
                        ⚠️ Consequência: Os usuários temporários listados terão suas credenciais removidas permanentemente e sessões desconectadas, mantendo o histórico e resultados do torneio intactos.
                      </p>
                    </div>
                  </div>

                  {tempUsersChallengeData.temporaryUsers.length > 0 && (
                    <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/70 p-2 space-y-1 text-[11px]">
                      {tempUsersChallengeData.temporaryUsers.map((u) => (
                        <div key={u.id} className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-900">
                          <span className="font-bold text-white">{u.displayName}</span>
                          <span className="font-mono text-slate-400">@{u.username} {u.tag || ''}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {!tempUsersChallengeData.canExecute ? (
                    <div className="p-3 rounded-2xl bg-amber-950/60 border border-amber-500/60 text-xs text-amber-200 space-y-1">
                      <div className="font-black text-amber-300">Exclusão bloqueada no momento:</div>
                      <ul className="list-disc pl-4 space-y-1">
                        {tempUsersChallengeData.blockingReasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ) : tempUsersChallengeData.challenge ? (
                    <div className="p-4 rounded-2xl bg-rose-950/40 border-2 border-rose-500/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-rose-200 flex items-center gap-1.5">
                          <Lock className="w-4 h-4 text-rose-400" /> Confirmação Matemática Obrigatória
                        </span>
                        <button
                          type="button"
                          onClick={() => requestTempUsersChallenge(selectedTournament.config.id)}
                          className="text-[11px] text-sky-300 hover:text-sky-200 font-bold cursor-pointer"
                        >
                          Gerar nova soma
                        </button>
                      </div>
                      <div className="text-center py-2 px-3 rounded-xl bg-slate-950 border border-slate-700 font-mono text-xl font-black text-amber-300 tracking-wider">
                        {tempUsersChallengeData.challenge.question}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Informe o resultado da soma para confirmar:
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          required
                          autoFocus
                          value={mathAnswerInput}
                          onChange={(e) => setMathAnswerInput(e.target.value)}
                          placeholder="Digite apenas o resultado numérico"
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-600 text-white font-mono text-sm font-black focus:outline-none focus:border-rose-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Motivo administrativo (Opcional)
                        </label>
                        <input
                          type="text"
                          value={tempCleanupReason}
                          onChange={(e) => setTempCleanupReason(e.target.value)}
                          placeholder="Ex: Limpeza pós-torneio de teste"
                          className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-400"
                        />
                      </div>
                    </div>
                  ) : null}

                  {tempCleanupError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500 text-rose-200 text-xs font-bold">
                      {tempCleanupError}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isDeletingTempUsers}
                      onClick={() => setShowTempUsersModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    {tempUsersChallengeData.canExecute && tempUsersChallengeData.challenge && (
                      <button
                        type="submit"
                        disabled={isDeletingTempUsers || !mathAnswerInput.trim()}
                        className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs cursor-pointer disabled:opacity-50"
                      >
                        {isDeletingTempUsers ? 'Excluindo...' : 'Confirmar Exclusão Temporários'}
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                tempCleanupError && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500 text-rose-200 text-xs font-bold">
                      {tempCleanupError}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowTempUsersModal(false)}
                        className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs cursor-pointer"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
