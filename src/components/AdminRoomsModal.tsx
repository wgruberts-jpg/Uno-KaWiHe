import React, { useState, useEffect } from 'react';
import { AdminRoomSummary, AdminUserSummary, UserProfile } from '../types/uno.js';
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
  Layers
} from 'lucide-react';

interface AdminRoomsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onJoinRoomAsAdmin?: (roomId: string) => void;
  onWatchRoom?: (roomId: string, revealCards?: boolean) => void;
  ws?: WebSocket | null;
}

export const AdminRoomsModal: React.FC<AdminRoomsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onJoinRoomAsAdmin,
  onWatchRoom,
  ws,
}) => {
  const [activeTab, setActiveTab] = useState<'rooms' | 'users' | 'messages'>('rooms');
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

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
        'x-admin-pin': '774007',
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
      fetchAdminData();
      const interval = setInterval(fetchAdminData, 3500);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCloseRoom = async (roomId: string) => {
    if (!confirm(`Tem certeza que deseja encerrar e fechar a sala ${roomId}? Todos os jogadores serão desconectados.`)) return;

    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('kawihe_auth_token') || ''}`,
          'x-admin-pin': '774007',
        },
        body: JSON.stringify({ reason: 'Esta sala foi encerrada pelo Administrador Edinho.' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(`Sala ${roomId} encerrada com sucesso!`);
        fetchAdminData();
      }
    } catch {
      setActionFeedback('Erro ao fechar a sala.');
    }
  };

  const handleKickPlayer = async (roomId: string, playerId: string, playerName: string) => {
    if (!confirm(`Expulsar o jogador "${playerName}" da sala ${roomId}?`)) return;

    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/kick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('kawihe_auth_token') || ''}`,
          'x-admin-pin': '774007',
        },
        body: JSON.stringify({ targetPlayerId: playerId, reason: 'Expulso pelo Administrador Edinho.' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(`${playerName} foi expulso da sala.`);
        fetchAdminData();
      }
    } catch {
      setActionFeedback('Erro ao expulsar jogador.');
    }
  };

  const handleForceEndGame = (roomId: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'admin_force_end_game', roomId, adminSecret: '774007' }));
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
            'x-admin-pin': '774007',
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
            'x-admin-pin': '774007',
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
          'x-admin-pin': '774007',
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
  const totalUsersOnline = users.filter((u) => u.isOnline).length;

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
            <span>Usuários & Logados ({users.length})</span>
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
                          onClick={() => handleCloseRoom(room.id)}
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
                              onClick={() => handleKickPlayer(room.id, p.id, p.name)}
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

        {/* TAB 2: REGISTERED USERS & ONLINE STATUS */}
        {activeTab === 'users' && (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
            <div className="text-xs text-slate-400 font-bold mb-2 flex items-center justify-between">
              <span>Lista de Usuários Cadastrados ({users.length}):</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                {totalUsersOnline} Online agora
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {users.map((u) => (
                <div
                  key={u.id}
                  className={`p-3 rounded-2xl border-2 flex items-center justify-between gap-3 transition-all ${
                    u.isOnline
                      ? 'bg-slate-800/90 border-emerald-500/60 shadow-md'
                      : 'bg-slate-800/50 border-slate-700/70 opacity-80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{u.avatar}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-white truncate">{u.displayName}</span>
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
                    {u.isOnline ? (
                      <div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          Online
                        </span>
                        {u.currentRoomId && (
                          <div className="text-[10px] text-amber-400 font-mono font-black mt-0.5">
                            Sala #{u.currentRoomId}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-bold">⚪ Offline</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
      </div>
    </div>
  );
};
