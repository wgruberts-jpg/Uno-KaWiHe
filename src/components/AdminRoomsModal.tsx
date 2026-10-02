import React, { useState, useEffect } from 'react';
import { AdminRoomSummary, UserProfile } from '../types/uno.js';
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
  AlertTriangle
} from 'lucide-react';

interface AdminRoomsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onJoinRoomAsAdmin?: (roomId: string) => void;
  ws?: WebSocket | null;
}

export const AdminRoomsModal: React.FC<AdminRoomsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onJoinRoomAsAdmin,
  ws,
}) => {
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const fetchRooms = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/rooms', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('kawihe_auth_token') || ''}`,
          'x-admin-pin': '774007',
        },
      });
      const data = await res.json();
      if (data.success && data.rooms) {
        setRooms(data.rooms);
      }
    } catch (e) {
      console.error('Erro ao buscar salas:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRooms();
      const interval = setInterval(fetchRooms, 3500);
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
        fetchRooms();
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
        fetchRooms();
      }
    } catch {
      setActionFeedback('Erro ao expulsar jogador.');
    }
  };

  const handleForceEndGame = (roomId: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'admin_force_end_game', roomId, adminSecret: '774007' }));
      setActionFeedback(`Partida da sala ${roomId} retornada ao Lobby.`);
      setTimeout(fetchRooms, 500);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;

    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('kawihe_auth_token') || ''}`,
          'x-admin-pin': '774007',
        },
        body: JSON.stringify({
          message: broadcastMsg.trim(),
          sender: currentUser ? `👑 ${currentUser.displayName}` : '👑 Admin Edinho',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback('📢 Aviso global transmitido para todas as mesas com sucesso!');
        setBroadcastMsg('');
        setTimeout(() => setActionFeedback(null), 4000);
      }
    } catch {
      setActionFeedback('Erro ao transmitir aviso global.');
    }
  };

  const totalPlayers = rooms.reduce((acc, r) => acc + r.players.filter((p) => !p.isBot).length, 0);
  const totalBots = rooms.reduce((acc, r) => acc + r.players.filter((p) => p.isBot).length, 0);

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
                Painel de Gestão de Salas
                <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  Admin Edinho
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-semibold">
                Monitoramento, moderação ao vivo e controle central de mesas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchRooms}
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

        {/* Global Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 shrink-0">
          <div className="bg-slate-800/90 p-2.5 rounded-2xl border border-slate-700 text-center">
            <div className="text-[11px] text-slate-400 font-bold">Salas Abertas</div>
            <div className="text-xl font-black text-amber-400">{rooms.length}</div>
          </div>
          <div className="bg-slate-800/90 p-2.5 rounded-2xl border border-slate-700 text-center">
            <div className="text-[11px] text-slate-400 font-bold">Jogadores Humanos</div>
            <div className="text-xl font-black text-emerald-400">{totalPlayers}</div>
          </div>
          <div className="bg-slate-800/90 p-2.5 rounded-2xl border border-slate-700 text-center">
            <div className="text-[11px] text-slate-400 font-bold">Robôs na Mesa</div>
            <div className="text-xl font-black text-sky-400">{totalBots}</div>
          </div>
          <div className="bg-slate-800/90 p-2.5 rounded-2xl border border-slate-700 text-center">
            <div className="text-[11px] text-slate-400 font-bold">Status Servidor</div>
            <div className="text-xs font-black text-emerald-400 flex items-center justify-center gap-1 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> 100% Online
            </div>
          </div>
        </div>

        {/* Global Broadcast Box */}
        <form onSubmit={handleSendBroadcast} className="bg-amber-950/40 p-3 rounded-2xl border border-amber-500/50 mb-3 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="text-xs font-black text-amber-300 flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-amber-400" /> Transmissão de Aviso Global para Todas as Salas:
            </label>
            <span className="text-[10px] text-amber-200/70 font-semibold">Aparece em pop-up e chat para todos</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={broadcastMsg}
              onChange={(e) => setBroadcastMsg(e.target.value)}
              placeholder="Digite o aviso para todos os jogadores online... (ex: Partida rápida às 20h!)"
              className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-amber-500/60 text-white font-medium text-xs focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={!broadcastMsg.trim()}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5 shrink-0"
            >
              <Radio className="w-3.5 h-3.5" /> Transmitir
            </button>
          </div>
        </form>

        {/* Feedback Alert */}
        {actionFeedback && (
          <div className="p-2.5 mb-3 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-300 text-xs font-bold flex items-center gap-2 shrink-0 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Rooms List */}
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
                    <div className="flex items-center gap-1.5">
                      {isPlaying && (
                        <button
                          type="button"
                          onClick={() => handleForceEndGame(room.id)}
                          className="px-2.5 py-1 bg-amber-600/30 hover:bg-amber-600 text-amber-200 rounded-lg text-[11px] font-black border border-amber-500/40 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" /> Resetar p/ Lobby
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCloseRoom(room.id)}
                        className="px-2.5 py-1 bg-rose-600/30 hover:bg-rose-600 text-rose-200 rounded-lg text-[11px] font-black border border-rose-500/40 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" /> Fechar Sala
                      </button>
                    </div>
                  </div>

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

                          {/* Kick button */}
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
      </div>
    </div>
  );
};
