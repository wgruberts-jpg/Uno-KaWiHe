import React, { useState, useEffect } from 'react';
import { AdminRoomSummary, AdminUserSummary, UserProfile } from '../types/uno.js';
import { auth } from '../services/auth.js';
import {
  ShieldAlert,
  Users,
  X,
  RefreshCw,
  Trash2,
  RotateCcw,
  UserX,
  Megaphone,
  Radio,
  Play,
  Clock,
  ExternalLink,
  Bot,
  Crown,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Send,
  User,
  Shield,
  Activity,
  Layers,
  KeyRound,
  Plus,
  Lock,
  Key,
  Search
} from 'lucide-react';

interface AdminRoomsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onJoinRoomAsAdmin?: (roomId: string) => void;
  onWatchRoom?: (roomId: string, revealCards?: boolean) => void;
  ws?: WebSocket | null;
  initialTab?: 'rooms' | 'users' | 'messages';
}

export const AdminRoomsModal: React.FC<AdminRoomsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onJoinRoomAsAdmin,
  onWatchRoom,
  ws,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'rooms' | 'users' | 'messages'>(initialTab || 'rooms');
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Confirmation Modals State (avoid window.confirm)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{ id: string; username: string } | null>(null);
  const [confirmCloseRoomId, setConfirmCloseRoomId] = useState<string | null>(null);
  const [confirmKickPlayer, setConfirmKickPlayer] = useState<{ roomId: string; playerId: string; playerName: string } | null>(null);

  // Create User Form States
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newAvatar, setNewAvatar] = useState('🦸‍♂️');
  const [newRole, setNewRole] = useState<'player' | 'admin'>('player');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Reset Password States
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [newPasswordForReset, setNewPasswordForReset] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Message Sending States
  const [messageTargetRoom, setMessageTargetRoom] = useState<string>('all');
  const [messageText, setMessageText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Inline room quick message state
  const [quickMsgRoomId, setQuickMsgRoomId] = useState<string | null>(null);
  const [quickMsgText, setQuickMsgText] = useState('');

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('kawihe_auth_token') || ''}`,
      };

      // Fetch Rooms
      const resRooms = await fetch('/api/admin/rooms', { headers });
      const dataRooms = await resRooms.json();
      if (dataRooms.success && dataRooms.rooms) {
        setRooms(dataRooms.rooms);
      }

      // Fetch Users
      const resUsers = await fetch('/api/admin/users', { headers });
      const dataUsers = await resUsers.json();
      if (dataUsers.success && dataUsers.users) {
        setUsers(dataUsers.users);
      }
    } catch (e) {
      console.error('Erro ao buscar dados admin:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      fetchAdminData();
      const interval = setInterval(fetchAdminData, 3500);
      return () => clearInterval(interval);
    }
  }, [isOpen, initialTab]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      setActionError('Informe o nome de usuário e a senha.');
      setTimeout(() => setActionError(null), 4000);
      return;
    }
    if (newUsername.trim().length < 3) {
      setActionError('O nome de usuário deve ter no mínimo 3 caracteres.');
      setTimeout(() => setActionError(null), 4000);
      return;
    }
    if (newPassword.trim().length < 3) {
      setActionError('A senha deve ter no mínimo 3 caracteres.');
      setTimeout(() => setActionError(null), 4000);
      return;
    }

    setIsSubmittingUser(true);
    setActionError(null);
    try {
      const res = await auth.adminCreateUser({
        username: newUsername.trim(),
        password: newPassword.trim(),
        displayName: newDisplayName.trim() || newUsername.trim(),
        avatar: newAvatar,
        role: newRole,
      });
      if (res.success && res.user) {
        setActionFeedback(`✅ Usuário @${res.user.username} cadastrado com sucesso!`);
        setShowCreateUserForm(false);
        setNewUsername('');
        setNewPassword('');
        setNewDisplayName('');
        setNewAvatar('🦸‍♂️');
        setNewRole('player');
        fetchAdminData();
        setTimeout(() => setActionFeedback(null), 4500);
      } else {
        setActionError(res.error || 'Erro ao cadastrar usuário.');
        setTimeout(() => setActionError(null), 5000);
      }
    } catch {
      setActionError('Erro de conexão ao criar usuário.');
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleResetPassword = async (userId: string, username: string) => {
    if (!newPasswordForReset.trim() || newPasswordForReset.trim().length < 3) {
      setActionError('A nova senha deve ter no mínimo 3 caracteres.');
      setTimeout(() => setActionError(null), 4000);
      return;
    }
    setIsResettingPassword(true);
    setActionError(null);
    try {
      const res = await auth.adminResetPassword(userId, newPasswordForReset.trim());
      if (res.success) {
        setActionFeedback(`🔑 Senha do usuário @${username} alterada com sucesso!`);
        setResettingUserId(null);
        setNewPasswordForReset('');
        fetchAdminData();
        setTimeout(() => setActionFeedback(null), 4500);
      } else {
        setActionError(res.error || 'Erro ao redefinir senha.');
        setTimeout(() => setActionError(null), 5000);
      }
    } catch {
      setActionError('Erro de conexão ao redefinir senha.');
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setIsResettingPassword(false);
    }
  };

  const executeDeleteUser = async (userId: string, username: string) => {
    try {
      const res = await auth.adminDeleteUser(userId);
      if (res.success) {
        setActionFeedback(`🗑️ Usuário @${username} removido com sucesso.`);
        setConfirmDeleteUser(null);
        fetchAdminData();
        setTimeout(() => setActionFeedback(null), 4000);
      } else {
        setActionError(res.error || 'Erro ao excluir usuário.');
        setTimeout(() => setActionError(null), 4000);
      }
    } catch {
      setActionError('Erro ao excluir usuário.');
      setTimeout(() => setActionError(null), 4000);
    }
  };

  const executeCloseRoom = async (roomId: string) => {
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('kawihe_auth_token') || ''}`,
        },
        body: JSON.stringify({ reason: 'Esta sala foi encerrada pelo Administrador Edinho.' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(`Sala #${roomId} encerrada com sucesso!`);
        setConfirmCloseRoomId(null);
        fetchAdminData();
        setTimeout(() => setActionFeedback(null), 4000);
      } else {
        setActionError(data.error || 'Erro ao fechar sala.');
        setTimeout(() => setActionError(null), 4000);
      }
    } catch {
      setActionError('Erro ao fechar a sala.');
      setTimeout(() => setActionError(null), 4000);
    }
  };

  const executeKickPlayer = async (roomId: string, playerId: string, playerName: string) => {
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/kick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('kawihe_auth_token') || ''}`,
        },
        body: JSON.stringify({ targetPlayerId: playerId, reason: 'Expulso pelo Administrador Edinho.' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(`${playerName} foi expulso da sala.`);
        setConfirmKickPlayer(null);
        fetchAdminData();
        setTimeout(() => setActionFeedback(null), 4000);
      } else {
        setActionError(data.error || 'Erro ao expulsar jogador.');
        setTimeout(() => setActionError(null), 4000);
      }
    } catch {
      setActionError('Erro ao expulsar jogador.');
      setTimeout(() => setActionError(null), 4000);
    }
  };

  if (!isOpen) return null;

  const handleForceEndGame = (roomId: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'admin_force_end_game',
        roomId,
        token: localStorage.getItem('kawihe_auth_token') || '',
      }));
      setActionFeedback(`Partida da sala ${roomId} retornada ao Lobby.`);
      setTimeout(fetchAdminData, 500);
    }
  };

  const handleSendRoomOrGlobalMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    setIsSendingMessage(true);
    const sender = currentUser ? `👑 ${currentUser.displayName}` : '👑 Admin Edinho';

    try {
      if (messageTargetRoom === 'all') {
        // Broadcast to all rooms
        const res = await fetch('/api/admin/broadcast', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('kawihe_auth_token') || ''}`,
          },
          body: JSON.stringify({
            message: messageText.trim(),
            sender,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setActionFeedback('📢 Aviso global transmitido com sucesso!');
          setMessageText('');
        }
      } else {
        // Send to specific room
        const res = await fetch(`/api/admin/rooms/${messageTargetRoom}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('kawihe_auth_token') || ''}`,
          },
          body: JSON.stringify({
            text: messageText.trim(),
            sender,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setActionFeedback(`💬 Mensagem enviada para a Sala #${messageTargetRoom}!`);
          setMessageText('');
        }
      }
    } catch {
      setActionFeedback('Erro ao enviar mensagem.');
    } finally {
      setIsSendingMessage(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const handleSendQuickMessage = async (roomId: string) => {
    if (!quickMsgText.trim()) return;
    const sender = currentUser ? `👑 ${currentUser.displayName}` : '👑 Admin Edinho';

    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('kawihe_auth_token') || ''}`,
        },
        body: JSON.stringify({
          text: quickMsgText.trim(),
          sender,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(`Mensagem entregue na mesa #${roomId}!`);
        setQuickMsgText('');
        setQuickMsgRoomId(null);
      }
    } catch {
      setActionFeedback('Erro ao enviar mensagem rápida.');
    }
  };

  const totalOnlinePlayers = rooms.reduce((acc, r) => acc + r.players.filter((p) => !p.isBot && p.isConnected).length, 0);
  const totalBots = rooms.reduce((acc, r) => acc + r.players.filter((p) => p.isBot).length, 0);
  const totalUsersOnline = users.filter((u) => u.isOnline || (currentUser && (currentUser.id === u.id || currentUser.username.toLowerCase() === u.username.toLowerCase()))).length;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="relative bg-slate-900 border-4 border-amber-500 rounded-3xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl my-auto text-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-slate-700/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 to-yellow-400 flex items-center justify-center text-2xl shadow-lg border-2 border-amber-300">
              🛡️
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                Painel Central de Administração
                <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  Admin Edinho
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-semibold">
                Monitoramento de jogadores, moderação de salas e envio de mensagens
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchAdminData}
              disabled={isLoading}
              title="Atualizar agora"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl border border-slate-600 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-600 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Overview Numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 shrink-0">
          <div className="bg-slate-800/90 p-2.5 rounded-2xl border border-slate-700 text-center">
            <div className="text-[11px] text-slate-400 font-bold">Salas Abertas</div>
            <div className="text-xl font-black text-amber-400">{rooms.length}</div>
          </div>
          <div className="bg-slate-800/90 p-2.5 rounded-2xl border border-slate-700 text-center">
            <div className="text-[11px] text-slate-400 font-bold">Usuários Online</div>
            <div className="text-xl font-black text-emerald-400">{totalUsersOnline}</div>
          </div>
          <div className="bg-slate-800/90 p-2.5 rounded-2xl border border-slate-700 text-center">
            <div className="text-[11px] text-slate-400 font-bold">Total Cadastrados</div>
            <div className="text-xl font-black text-purple-400">{users.length}</div>
          </div>
          <div className="bg-slate-800/90 p-2.5 rounded-2xl border border-slate-700 text-center">
            <div className="text-[11px] text-slate-400 font-bold">Robôs Ativos</div>
            <div className="text-xl font-black text-sky-400">{totalBots}</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 p-1.5 bg-slate-800/90 rounded-2xl border border-slate-700 mb-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('rooms')}
            className={`flex-1 py-2 px-3 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'rooms'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Salas & Mesas ({rooms.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-2 px-3 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'users'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>👥 Usuários & Senhas ({users.length})</span>
            {totalUsersOnline > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('messages')}
            className={`flex-1 py-2 px-3 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'messages'
                ? 'bg-purple-500 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Enviar Mensagem de Sala</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {actionFeedback && (
          <div className="p-2.5 mb-3 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-300 text-xs font-bold flex items-center gap-2 shrink-0 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Error Alert */}
        {actionError && (
          <div className="p-2.5 mb-3 rounded-xl bg-rose-950/80 border border-rose-500 text-rose-300 text-xs font-bold flex items-center gap-2 shrink-0 animate-in fade-in duration-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{actionError}</span>
          </div>
        )}

        {/* TAB 1: ROOMS MANAGEMENT */}
        {activeTab === 'rooms' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[220px]">
            {rooms.length === 0 ? (
              <div className="p-10 text-center text-slate-400 font-bold bg-slate-800/40 rounded-2xl border border-slate-700/60">
                <div className="text-3xl mb-2">🎴</div>
                <p className="text-sm">Nenhuma sala ativa no momento.</p>
                <p className="text-xs text-slate-500 mt-1">As salas criadas aparecerão aqui em tempo real.</p>
              </div>
            ) : (
              rooms.map((room) => {
                const hostPlayer = room.players.find((p) => p.isHost);
                const isPlaying = room.status === 'playing';

                return (
                  <div
                    key={room.id}
                    className={`p-3.5 rounded-2xl border-2 transition-all ${
                      isPlaying
                        ? 'bg-slate-800/90 border-emerald-500/50 shadow-md'
                        : 'bg-slate-800/60 border-slate-700'
                    }`}
                  >
                    {/* Room Header info */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-black px-2.5 py-0.5 rounded-xl bg-amber-500 text-slate-950 tracking-wider">
                          #{room.id}
                        </span>
                        <span
                          className={`text-[11px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wide flex items-center gap-1 ${
                            isPlaying
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          }`}
                        >
                          {isPlaying ? '🎮 Partida em Andamento' : '⏳ Aguardando no Lobby'}
                        </span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                          <Clock className="w-3 h-3 text-amber-400" /> Turno: {room.turnDuration > 0 ? `${room.turnDuration}s` : 'Ilimitado'}
                        </span>
                      </div>

                      {/* Room Level Actions */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Watch (Hidden / Clean Tournament Table) */}
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onWatchRoom?.(room.id, false);
                          }}
                          className="px-2.5 py-1 bg-sky-600/40 hover:bg-sky-600 text-sky-200 rounded-lg text-[11px] font-black border border-sky-400/40 transition-all flex items-center gap-1 cursor-pointer"
                          title="Assistir partida em modo Transmissão Limpa (sem ver mãos dos jogadores)"
                        >
                          <span>👁️</span> Assistir (Mesa)
                        </button>

                        {/* Watch TV (Revealed Hands) */}
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onWatchRoom?.(room.id, true);
                          }}
                          className="px-2.5 py-1 bg-amber-600/40 hover:bg-amber-500 text-amber-200 rounded-lg text-[11px] font-black border border-amber-400/40 transition-all flex items-center gap-1 cursor-pointer"
                          title="Assistir partida em Modo TV / Juiz (com todas as cartas abertas)"
                        >
                          <span>📺</span> Assistir (TV / Cartas Abertas)
                        </button>

                        {/* Copy Stream Link */}
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}${window.location.pathname}?room=${room.id}&watch=1`;
                            navigator.clipboard.writeText(url).then(() => {
                              setActionFeedback(`Link de Transmissão da Sala #${room.id} copiado!`);
                            });
                          }}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-[11px] font-bold border border-slate-500 transition-all flex items-center gap-1 cursor-pointer"
                          title="Copiar Link para Espectadores / Transmissão"
                        >
                          <span>🔗</span> Link
                        </button>

                        <button
                          type="button"
                          onClick={() => setQuickMsgRoomId(quickMsgRoomId === room.id ? null : room.id)}
                          className="px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600 text-purple-200 rounded-lg text-[11px] font-black border border-purple-500/40 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <MessageSquare className="w-3 h-3" /> Falar
                        </button>

                        {isPlaying && (
                          <button
                            type="button"
                            onClick={() => handleForceEndGame(room.id)}
                            className="px-2 py-1 bg-amber-600/30 hover:bg-amber-600 text-amber-200 rounded-lg text-[11px] font-black border border-amber-500/40 transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" /> Resetar
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setConfirmCloseRoomId(room.id)}
                          className="px-2 py-1 bg-rose-600/30 hover:bg-rose-600 text-rose-200 rounded-lg text-[11px] font-black border border-rose-500/40 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" /> Fechar
                        </button>
                      </div>
                    </div>

                    {/* Quick Inline Message Input */}
                    {quickMsgRoomId === room.id && (
                      <div className="my-2 p-2 bg-purple-950/40 rounded-xl border border-purple-500/50 flex gap-2 animate-in fade-in duration-150">
                        <input
                          type="text"
                          value={quickMsgText}
                          onChange={(e) => setQuickMsgText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSendQuickMessage(room.id)}
                          placeholder={`Enviar recado do Admin para a Mesa #${room.id}...`}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-purple-500/60 text-white font-medium text-xs focus:outline-none focus:border-purple-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleSendQuickMessage(room.id)}
                          disabled={!quickMsgText.trim()}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs rounded-lg cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" /> Enviar
                        </button>
                      </div>
                    )}

                    {/* Players list in room */}
                    <div className="mt-2.5">
                      <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>Jogadores na Mesa ({room.players.length}/{room.maxPlayers}):</span>
                        {hostPlayer && (
                          <span className="text-amber-300 flex items-center gap-1 text-[10px]">
                            <Crown className="w-3 h-3 text-amber-400" /> Anfitrião: {hostPlayer.name}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {room.players.map((p) => (
                          <div
                            key={p.id}
                            className="p-2 bg-slate-900/80 rounded-xl border border-slate-700/80 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-lg shrink-0">{p.avatar}</span>
                              <div className="min-w-0">
                                <div className="text-xs font-black text-slate-100 flex items-center gap-1 truncate">
                                  <span className="truncate">{p.name}</span>
                                  {p.isHost && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                                  {p.isBot && <Bot className="w-3 h-3 text-sky-400 shrink-0" />}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {isPlaying ? `${p.cardsCount} cartas` : p.isBot ? 'Robô' : 'Pronto'}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setConfirmKickPlayer({ roomId: room.id, playerId: p.id, playerName: p.name })}
                              title={`Expulsar ${p.name}`}
                              className="p-1.5 text-rose-400 hover:text-white hover:bg-rose-600 rounded-lg transition-all cursor-pointer shrink-0"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: REGISTERED USERS & PASSWORD MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[220px]">
            {/* Top Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-800/80 rounded-2xl border border-slate-700">
              <div className="text-xs text-slate-300 font-bold flex items-center gap-3">
                <span>Total de Usuários: <strong className="text-white font-black">{users.length}</strong></span>
                <span className="text-emerald-400 flex items-center gap-1.5 font-black">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  {totalUsersOnline} Online
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateUserForm(!showCreateUserForm)}
                className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>{showCreateUserForm ? 'Fechar Cadastro' : 'Cadastrar Novo Usuário'}</span>
              </button>
            </div>

            {/* Quick Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar usuário por nome, @login ou #tag..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-800/90 border border-slate-700 text-white placeholder-slate-400 font-medium text-xs focus:outline-none focus:border-amber-400"
              />
              {userSearchQuery && (
                <button
                  type="button"
                  onClick={() => setUserSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Create User Expandable Form */}
            {showCreateUserForm && (
              <form onSubmit={handleCreateUser} className="p-4 bg-slate-800 border-2 border-amber-400 rounded-2xl space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                  <h4 className="font-black text-xs uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <User className="w-4 h-4" /> Criar Conta de Usuário (Direto sem Convite)
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowCreateUserForm(false)}
                    className="text-slate-400 hover:text-white text-xs font-black cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-black text-slate-300 mb-1">
                      Nome de Usuário / Login (sem espaços):
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: pedrinho"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white font-bold text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-300 mb-1">
                      Senha Inicial:
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Mínimo 3 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white font-bold text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-300 mb-1">
                      Nome / Apelido de Exibição:
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Pedro Silva"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white font-bold text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-300 mb-1">
                      Tipo de Acesso (Cargo):
                    </label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as 'player' | 'admin')}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white font-bold text-xs focus:outline-none focus:border-amber-400"
                    >
                      <option value="player">🎮 Jogador Padrão</option>
                      <option value="admin">👑 Administrador Total</option>
                    </select>
                  </div>
                </div>

                {/* Avatar Quick Selection */}
                <div>
                  <label className="block text-[11px] font-black text-slate-300 mb-1">
                    Escolha um Avatar Inicial:
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {['🦸‍♂️', '👑', '🦊', '🦁', '🐼', '🐯', '🦄', '🧙‍♂️', '⚡', '🚀'].map((av) => (
                      <button
                        key={av}
                        type="button"
                        onClick={() => setNewAvatar(av)}
                        className={`w-9 h-9 rounded-xl border-2 text-xl flex items-center justify-center cursor-pointer transition-all ${
                          newAvatar === av
                            ? 'bg-amber-400 border-white scale-110 shadow-sm'
                            : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        {av}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={() => setShowCreateUserForm(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingUser}
                    className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isSubmittingUser ? 'Criando...' : 'Salvar Novo Usuário'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Registered Users List */}
            {(() => {
              const query = userSearchQuery.trim().toLowerCase();
              const filteredUsers = users.filter((u) => {
                if (!query) return true;
                return (
                  u.username.toLowerCase().includes(query) ||
                  u.displayName.toLowerCase().includes(query) ||
                  (u.tag && u.tag.toLowerCase().includes(query))
                );
              });

              if (filteredUsers.length === 0) {
                return (
                  <div className="p-8 text-center text-slate-400 bg-slate-800/40 rounded-2xl border border-slate-700/60">
                    <p className="text-sm font-bold">Nenhum usuário encontrado{query ? ` para "${userSearchQuery}"` : ''}.</p>
                    {query && (
                      <button
                        type="button"
                        onClick={() => setUserSearchQuery('')}
                        className="mt-2 text-xs text-amber-400 font-black hover:underline cursor-pointer"
                      >
                        Limpar busca
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredUsers.map((u) => {
                    const isResettingThis = resettingUserId === u.id;
                    const isMe = !!(currentUser && (currentUser.id === u.id || currentUser.username.toLowerCase() === u.username.toLowerCase()));
                    const isOnline = u.isOnline || isMe;

                    return (
                      <div
                        key={u.id}
                        className={`p-3 rounded-2xl border-2 flex flex-col justify-between gap-2.5 transition-all ${
                          isOnline
                            ? 'bg-slate-800/90 border-emerald-500/60 shadow-md'
                            : 'bg-slate-800/50 border-slate-700/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-2xl shrink-0">{u.avatar}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-white truncate">{u.displayName}</span>
                                {isMe && (
                                  <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.2 rounded">
                                    VOCÊ
                                  </span>
                                )}
                                {u.tag && (
                                  <span className="font-mono text-[9px] font-black text-amber-400 bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-500/40">
                                    {u.tag}
                                  </span>
                                )}
                                {u.role === 'admin' && (
                                  <span className="text-[9px] font-black bg-amber-500 text-slate-950 px-1.5 rounded">
                                    ADMIN
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <span>@{u.username}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {isOnline ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                  Online
                                </span>
                                {u.currentRoomId ? (
                                  <div className="text-[10px] text-amber-400 font-mono font-black mt-0.5">
                                    Sala #{u.currentRoomId}
                                  </div>
                                ) : (
                                  <div className="text-[9px] text-slate-400 font-medium mt-0.5">
                                    (No Lobby)
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-bold">⚪ Offline</span>
                            )}
                          </div>
                        </div>

                        {/* Inline Reset Password Form */}
                        {isResettingThis ? (
                          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-amber-500/60 space-y-2 animate-in fade-in duration-150">
                            <div className="text-[11px] font-black text-amber-400 flex items-center gap-1">
                              <Key className="w-3.5 h-3.5" /> Nova senha para @{u.username}:
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="password"
                                autoFocus
                                placeholder="Digite nova senha..."
                                value={newPasswordForReset}
                                onChange={(e) => setNewPasswordForReset(e.target.value)}
                                className="flex-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-600 text-white font-medium text-xs focus:outline-none focus:border-amber-400"
                              />
                              <button
                                type="button"
                                onClick={() => handleResetPassword(u.id, u.username)}
                                disabled={isResettingPassword || !newPasswordForReset.trim()}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-lg cursor-pointer disabled:opacity-50"
                              >
                                {isResettingPassword ? 'Salvando...' : 'Salvar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setResettingUserId(null);
                                  setNewPasswordForReset('');
                                }}
                                className="px-2 py-1 bg-slate-800 text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* User Action Toolbar */
                          <div className="flex items-center justify-between pt-2 border-t border-slate-700/60 mt-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setResettingUserId(u.id);
                                setNewPasswordForReset('');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-500/40 text-[10px] font-black flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                              title="Trocar a senha deste usuário"
                            >
                              <KeyRound className="w-3 h-3 text-purple-300" />
                              <span>Redefinir Senha</span>
                            </button>

                            {u.username.toLowerCase() !== 'edinho' && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteUser({ id: u.id, username: u.username })}
                                className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                                title={`Excluir @${u.username}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB 3: ROOM & GLOBAL MESSAGE SENDER */}
        {activeTab === 'messages' && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[220px]">
            <form onSubmit={handleSendRoomOrGlobalMessage} className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 space-y-4">
              <div>
                <label className="block text-xs font-black text-amber-400 mb-1.5 flex items-center gap-1.5">
                  <Megaphone className="w-4 h-4" /> Selecione o Destino da Mensagem:
                </label>
                <select
                  value={messageTargetRoom}
                  onChange={(e) => setMessageTargetRoom(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white font-bold text-xs focus:outline-none focus:border-amber-400"
                >
                  <option value="all">📢 Transmissão Global (Todas as Salas + Banner no Topo)</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      🏠 Sala #{r.id} ({r.status === 'playing' ? 'Em Jogo' : 'Lobby'} - {r.players.length} jogadores)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-300 mb-1.5">
                  Texto da Mensagem ou Comunicado:
                </label>
                <textarea
                  rows={3}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Ex: Atenção jogadores da mesa, boa sorte! / O servidor receberá atualizações em 10 minutos."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white font-medium text-xs focus:outline-none focus:border-amber-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-400">
                  Enviado como: <strong className="text-amber-400">{currentUser?.displayName || 'Admin Edinho'}</strong>
                </span>
                <button
                  type="submit"
                  disabled={!messageText.trim() || isSendingMessage}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg"
                >
                  <Send className="w-4 h-4" /> {messageTargetRoom === 'all' ? 'Transmitir Global' : 'Enviar para a Sala'}
                </button>
              </div>
            </form>

            <div className="p-3 bg-purple-950/30 border border-purple-500/40 rounded-2xl text-xs text-purple-200">
              💡 <strong>Dica:</strong> Mensagens de sala chegam instantaneamente no chat lateral e no log da partida dos jogadores daquela mesa. Transmissões globais geram um banner sonoro de aviso no topo da tela de todos os participantes.
            </div>
          </div>
        )}

        {/* Modal Confirmation Overlay: Delete User */}
        {confirmDeleteUser && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-slate-900 border-2 border-rose-500 p-5 rounded-3xl max-w-sm w-full text-center space-y-3 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-2xl mx-auto">
                🗑️
              </div>
              <h4 className="text-base font-black text-white">Excluir Usuário?</h4>
              <p className="text-xs text-slate-300 font-medium">
                Tem certeza que deseja excluir permanentemente a conta de <strong className="text-white">@{confirmDeleteUser.username}</strong>? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteUser(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => executeDeleteUser(confirmDeleteUser.id, confirmDeleteUser.username)}
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs cursor-pointer shadow-sm"
                >
                  Sim, Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Confirmation Overlay: Close Room */}
        {confirmCloseRoomId && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-slate-900 border-2 border-rose-500 p-5 rounded-3xl max-w-sm w-full text-center space-y-3 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-2xl mx-auto">
                🛑
              </div>
              <h4 className="text-base font-black text-white">Encerrar Sala #{confirmCloseRoomId}?</h4>
              <p className="text-xs text-slate-300 font-medium">
                Tem certeza que deseja encerrar e fechar a sala <strong className="text-white">#{confirmCloseRoomId}</strong>? Todos os jogadores conectados serão redirecionados de volta ao Lobby.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmCloseRoomId(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => executeCloseRoom(confirmCloseRoomId)}
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs cursor-pointer shadow-sm"
                >
                  Sim, Encerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Confirmation Overlay: Kick Player */}
        {confirmKickPlayer && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-slate-900 border-2 border-amber-500 p-5 rounded-3xl max-w-sm w-full text-center space-y-3 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-2xl mx-auto">
                ⚠️
              </div>
              <h4 className="text-base font-black text-white">Expulsar Jogador?</h4>
              <p className="text-xs text-slate-300 font-medium">
                Expulsar o jogador <strong className="text-white">{confirmKickPlayer.playerName}</strong> da Sala <strong className="text-white">#{confirmKickPlayer.roomId}</strong>?
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmKickPlayer(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => executeKickPlayer(confirmKickPlayer.roomId, confirmKickPlayer.playerId, confirmKickPlayer.playerName)}
                  className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer shadow-sm"
                >
                  Sim, Expulsar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
