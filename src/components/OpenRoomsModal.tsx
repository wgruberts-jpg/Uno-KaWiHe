import React, { useState, useEffect } from 'react';
import { OpenRoomSummary } from '../types/uno.js';
import { X, RefreshCw, Users, Play, Eye, Search, Sparkles, Clock, Crown } from 'lucide-react';

interface OpenRoomsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinRoom: (roomId: string, asSpectator?: boolean) => void;
  currentRoomId?: string | null;
}

export const OpenRoomsModal: React.FC<OpenRoomsModalProps> = ({
  isOpen,
  onClose,
  onJoinRoom,
  currentRoomId,
}) => {
  const [rooms, setRooms] = useState<OpenRoomSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rooms/open');
      const data = await res.json();
      if (data.success && Array.isArray(data.rooms)) {
        setRooms(data.rooms);
      }
    } catch (err) {
      console.error('Failed to load open rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRooms();
      const interval = setInterval(fetchRooms, 4000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = rooms.filter((r) => {
    if (currentRoomId && r.id === currentRoomId) return false;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      r.id.toLowerCase().includes(term) ||
      r.hostName.toLowerCase().includes(term) ||
      r.players.some((p) => p.name.toLowerCase().includes(term))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border-4 border-indigo-500 shadow-2xl max-w-2xl w-full overflow-hidden text-slate-800 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-500 border-b-2 border-indigo-400 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-xl shadow-sm border border-white/40">
              <span>🌐</span>
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">Salas Abertas do Uno KaWiHe</h2>
              <p className="text-[11px] text-indigo-100 font-semibold">
                Explore as mesas ativas dos outros jogadores e entre para jogar ou assistir
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={fetchRooms}
              className={`p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white cursor-pointer transition-colors border border-white/30 ${
                loading ? 'animate-spin' : ''
              }`}
              title="Atualizar lista de salas"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/20 text-white cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por código da sala ou nome do anfitrião..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 shadow-inner"
            />
          </div>
          <span className="text-[11px] font-black text-slate-500 px-2 py-1 bg-white border border-slate-200 rounded-xl whitespace-nowrap">
            {filtered.length} {filtered.length === 1 ? 'sala aberta' : 'salas abertas'}
          </span>
        </div>

        {/* Rooms List */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="text-5xl animate-bounce">🃏</div>
              <h3 className="font-black text-base text-slate-800">Nenhuma outra sala aberta no momento</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
                Todas as mesas estão em partidas privadas ou ainda não foram criadas. Que tal você criar a primeira sala pública e convidar seus amigos?
              </p>
            </div>
          ) : (
            filtered.map((room) => {
              const isWaiting = room.status === 'waiting';
              const isFull = room.playersCount >= room.maxPlayers;
              const hasSlot = isWaiting && !isFull;

              return (
                <div
                  key={room.id}
                  className="p-3 sm:p-4 rounded-2xl bg-white border-2 border-slate-200 hover:border-indigo-300 transition-all shadow-sm hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-base text-indigo-950 bg-indigo-50 px-2.5 py-0.5 rounded-xl border border-indigo-200 shadow-xs">
                        #{room.id}
                      </span>

                      {isWaiting ? (
                        <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Aguardando ({room.playersCount}/{room.maxPlayers})
                        </span>
                      ) : (
                        <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Partida em Andamento
                        </span>
                      )}

                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3 text-slate-400" /> {room.turnDuration}s
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <div className="flex items-center gap-1">
                        <Crown className="w-3.5 h-3.5 text-amber-500" />
                        <span>Anfitrião:</span>
                        <span className="text-slate-900 font-black flex items-center gap-1">
                          <span>{room.hostAvatar}</span>
                          <span>{room.hostName}</span>
                        </span>
                      </div>
                    </div>

                    {/* Players Avatars in Room */}
                    <div className="flex items-center gap-1 pt-1">
                      <span className="text-[10px] text-slate-400 font-bold mr-1">Na mesa:</span>
                      {room.players.map((p, idx) => (
                        <span
                          key={idx}
                          className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs"
                          title={`${p.name} ${p.isBot ? '(Robô)' : ''}`}
                        >
                          {p.avatar}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {hasSlot ? (
                      <button
                        type="button"
                        onClick={() => {
                          onJoinRoom(room.id, false);
                          onClose();
                        }}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all border border-emerald-400"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>Entrar na Sala</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onJoinRoom(room.id, true);
                          onClose();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all border border-sky-400"
                        title="Assistir esta mesa como espectador"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Assistir Partida</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            Atualização automática a cada 4 segundos
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-black text-xs cursor-pointer transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
