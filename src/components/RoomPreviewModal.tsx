import React from 'react';
import { Users, Play, Eye, X } from 'lucide-react';

interface RoomPreviewModalProps {
  room: {
    id: string;
    creatorName: string;
    status: string;
    playersCount: number;
    maxPlayers: number;
    settings: {
      turnDuration: number;
      maxPlayers: number;
      isPrivate: boolean;
      spectatorPermission: 'disabled' | 'hidden_cards' | 'reveal_cards';
    };
  };
  onJoinAsPlayer: () => void;
  onJoinAsSpectator: () => void;
  onClose: () => void;
}

export const RoomPreviewModal: React.FC<RoomPreviewModalProps> = ({
  room,
  onJoinAsPlayer,
  onJoinAsSpectator,
  onClose,
}) => {
  const permLabels = {
    disabled: '🔒 Bloqueado (Apenas Jogadores)',
    hidden_cards: '👁️ Permitido (Apenas Mesa)',
    reveal_cards: '📺 Permitido (Cartas Abertas / Telão)',
  };

  const isFull = room.playersCount >= room.maxPlayers;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border-4 border-yellow-400 rounded-3xl max-w-md w-full p-6 text-slate-800 shadow-2xl relative flex flex-col my-auto">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-2xl shadow-sm">
            🚪
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 inline-block mb-0.5">
              Convite para Mesa
            </div>
            <h2 className="text-xl font-black text-slate-900">
              Sala #{room.id}
            </h2>
          </div>
        </div>

        {/* Room Info */}
        <div className="space-y-3 bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Anfitrião / Criador:</span>
            <span className="text-slate-900 font-black">{room.creatorName}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Vagas na Mesa:</span>
            <span className="text-slate-900 font-black flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-sky-500" />
              {room.playersCount} / {room.maxPlayers} {isFull ? '(Lotada)' : ''}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Tempo por Turno:</span>
            <span className="text-slate-900 font-black">{room.settings.turnDuration}s</span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Modo da Sala:</span>
            <span className="text-slate-900 font-black">{room.settings.isPrivate ? '🔒 Privada' : '🌐 Pública'}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Regra de Espectador:</span>
            <span className="text-slate-900 font-black">{permLabels[room.settings.spectatorPermission] || 'Padrão'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          {!isFull && room.status === 'waiting' && (
            <button
              type="button"
              onClick={onJoinAsPlayer}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-400 hover:from-yellow-200 hover:to-orange-300 text-slate-950 font-black text-sm shadow-[0_4px_0_#d97706] active:shadow-[0_1px_0_#d97706] active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer transition-all border-2 border-white uppercase tracking-wider"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>Entrar na Mesa como Jogador</span>
            </button>
          )}

          {room.settings.spectatorPermission !== 'disabled' && (
            <button
              type="button"
              onClick={onJoinAsSpectator}
              className="w-full py-2.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all border-2 border-slate-700"
            >
              <Eye className="w-4 h-4 text-amber-400" />
              <span>Assistir Partida (Espectador)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs cursor-pointer transition-all"
          >
            Voltar ao Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
