import React from 'react';
import { X, Trophy, Zap, Award, Flame, Crown } from 'lucide-react';
import { TablePlayerScore } from '../types/uno.js';

interface TableScoreboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableScores?: Record<string, TablePlayerScore>;
  fastestSeconds?: number | null;
  myPlayerId?: string;
  roomId?: string;
}

export const TableScoreboardModal: React.FC<TableScoreboardModalProps> = ({
  isOpen,
  onClose,
  tableScores = {},
  fastestSeconds,
  myPlayerId,
  roomId,
}) => {
  if (!isOpen) return null;

  const playersList = Object.values(tableScores).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.points - a.points;
  });

  const formatSeconds = (sec: number | null | undefined) => {
    if (!sec) return '—';
    const mins = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    if (mins === 0) return `${remainingSec}s`;
    return `${mins}m ${remainingSec < 10 ? '0' : ''}${remainingSec}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-yellow-500/50 rounded-3xl max-w-md w-full p-5 text-white shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center text-yellow-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-white">Placar da Mesa (Sessão)</h3>
              <p className="text-xs text-slate-400">
                Sala <span className="font-mono text-yellow-400 font-bold">#{roomId || 'SESSÃO'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fastest Round Badge */}
        {fastestSeconds ? (
          <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/40 rounded-xl p-2.5 flex items-center gap-2.5 mb-4">
            <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400 shrink-0" />
            <div className="text-xs">
              <span className="text-yellow-400 font-black uppercase text-[10px] tracking-wider block">
                Recorde da Mesa
              </span>
              <span className="font-bold text-white">Partida mais rápida batida em {formatSeconds(fastestSeconds)}</span>
            </div>
          </div>
        ) : null}

        {/* Players List */}
        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto pr-1">
          {playersList.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500">
              Nenhuma partida foi finalizada nesta mesa ainda. Comece a jogar!
            </div>
          ) : (
            playersList.map((player, idx) => {
              const isMe = player.playerId === myPlayerId;
              const isFirst = idx === 0 && player.wins > 0;

              return (
                <div
                  key={player.playerId}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                    isFirst
                      ? 'bg-yellow-500/10 border-yellow-500/50 shadow-md'
                      : isMe
                      ? 'bg-blue-950/30 border-blue-500/40'
                      : 'bg-slate-800/60 border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-black text-slate-500 w-4">
                      {isFirst ? <Crown className="w-4 h-4 text-yellow-400 fill-yellow-400" /> : `#${idx + 1}`}
                    </span>
                    <span className="text-2xl">{player.avatar}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-white truncate max-w-[130px]">{player.name}</span>
                        {isMe && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                            Você
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {player.roundsPlayed} {player.roundsPlayed === 1 ? 'partida' : 'partidas'} jogadas
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-1 font-mono font-black text-sm text-yellow-400 justify-end">
                      <span>{player.wins}</span>
                      <Trophy className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 font-medium">+{player.points} pts</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-black text-xs shadow-lg transition-transform active:scale-95"
        >
          Voltar para a Mesa
        </button>
      </div>
    </div>
  );
};
