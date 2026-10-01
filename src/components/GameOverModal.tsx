import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Player, TablePlayerScore } from '../types/uno.js';
import { Trophy, RotateCcw, Home, Users, Zap, Clock, Target, BarChart2 } from 'lucide-react';

interface GameOverModalProps {
  winnerId: string | null;
  players: Player[];
  myPlayerId: string;
  isHost: boolean;
  onRestart: () => void;
  onReturnToLobby: () => void;
  onLeave: () => void;
  roundDurationSeconds?: number;
  roundTurnCount?: number;
  roundPointsWon?: number;
  isFastestWin?: boolean;
  tableScores?: Record<string, TablePlayerScore>;
  onOpenStats?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winnerId,
  players,
  myPlayerId,
  isHost,
  onRestart,
  onReturnToLobby,
  onLeave,
  roundDurationSeconds,
  roundTurnCount,
  roundPointsWon = 0,
  isFastestWin,
  tableScores = {},
  onOpenStats,
}) => {
  const winner = players.find((p) => p.id === winnerId);
  const isMeWinner = winnerId === myPlayerId;

  useEffect(() => {
    if (winnerId) {
      // Fire victory confetti bursts
      const count = 200;
      const defaults = { origin: { y: 0.7 } };

      function fire(particleRatio: number, opts: confetti.Options) {
        confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio),
        });
      }

      fire(0.25, { spread: 26, startVelocity: 55 });
      fire(0.2, { spread: 60 });
      fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
      fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
      fire(0.1, { spread: 120, startVelocity: 45 });
    }
  }, [winnerId]);

  if (!winnerId || !winner) return null;

  const formatSeconds = (sec: number | undefined) => {
    if (!sec) return '—';
    const mins = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    if (mins === 0) return `${remainingSec}s`;
    return `${mins}m ${remainingSec < 10 ? '0' : ''}${remainingSec}s`;
  };

  // Sort other players by cards remaining
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.id === winnerId) return -1;
    if (b.id === winnerId) return 1;
    return a.cardsCount - b.cardsCount;
  });

  // Table scores sorted
  const tableScoresList = Object.values(tableScores).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.points - a.points;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-300">
      <div className="bg-white border-4 border-yellow-400 rounded-3xl max-w-md w-full p-4 sm:p-6 text-center shadow-2xl relative overflow-y-auto max-h-[92dvh] my-auto text-slate-800">
        {/* Glow backdrop */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-yellow-300/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-300 to-orange-400 flex items-center justify-center text-4xl shadow-xl border-4 border-white mb-2 animate-bounce">
            {winner.avatar}
          </div>

          <div className="flex items-center gap-1.5 text-amber-600 font-black tracking-widest text-[11px] uppercase mb-0.5">
            <Trophy className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            <span>Fim de Partida!</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-0.5">
            {isMeWinner ? '🎉 VOCÊ VENCEU!' : `${winner.name} Venceu!`}
          </h2>

          {/* Fastest win banner */}
          {isFastestWin && (
            <div className="my-1.5 px-3 py-1 bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 font-black text-xs rounded-full flex items-center gap-1.5 shadow-md animate-pulse">
              <Zap className="w-3.5 h-3.5 fill-slate-950" />
              <span>⚡ NOVO RECORDE: Partida Mais Rápida da Mesa!</span>
            </div>
          )}

          {/* Round Stats Pills */}
          <div className="grid grid-cols-3 gap-2 w-full my-3">
            <div className="bg-slate-100 rounded-xl p-2 border border-slate-200">
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 font-bold uppercase">
                <Clock className="w-3 h-3" />
                Tempo
              </div>
              <div className="text-sm font-black font-mono text-slate-800">
                {formatSeconds(roundDurationSeconds)}
              </div>
            </div>

            <div className="bg-slate-100 rounded-xl p-2 border border-slate-200">
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 font-bold uppercase">
                <Target className="w-3 h-3" />
                Turnos
              </div>
              <div className="text-sm font-black font-mono text-slate-800">
                {roundTurnCount || '—'}
              </div>
            </div>

            <div className="bg-amber-100 rounded-xl p-2 border border-amber-300">
              <div className="flex items-center justify-center gap-1 text-[10px] text-amber-700 font-bold uppercase">
                <Trophy className="w-3 h-3" />
                Pontos
              </div>
              <div className="text-sm font-black font-mono text-amber-900">
                +{roundPointsWon}
              </div>
            </div>
          </div>

          {/* Table Leaderboard Acumulado */}
          {tableScoresList.length > 0 && (
            <div className="w-full bg-yellow-50/80 rounded-2xl p-2.5 border-2 border-yellow-300 mb-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-black text-amber-900 px-1 uppercase tracking-wider">
                <span>🏆 Placar da Mesa (Sessão)</span>
                <span className="text-[10px] text-amber-700 font-bold">Vitórias / Pontos</span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                {tableScoresList.map((tp, idx) => (
                  <div
                    key={tp.playerId}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold ${
                      tp.playerId === winnerId
                        ? 'bg-yellow-200/90 text-amber-950 border border-yellow-400'
                        : 'bg-white text-slate-700 border border-yellow-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-slate-400 text-[11px]">#{idx + 1}</span>
                      <span className="text-sm">{tp.avatar}</span>
                      <span className="truncate max-w-[120px]">
                        {tp.name} {tp.playerId === myPlayerId && '(Você)'}
                      </span>
                    </div>
                    <div className="font-mono text-amber-800 text-[11px]">
                      {tp.wins} 🏆 <span className="text-slate-400">({tp.points} pts)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 w-full">
            {/* Play Again (Immediate Start) */}
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-400 hover:from-yellow-200 hover:to-orange-300 text-slate-950 font-black text-xs sm:text-sm shadow-[0_4px_0_#d97706] active:shadow-[0_1px_0_#d97706] active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer transition-all border-2 border-white uppercase tracking-wider"
            >
              <RotateCcw className="w-4 h-4" />
              Jogar Novamente
            </button>

            <div className="grid grid-cols-2 gap-2 w-full">
              {/* Return to Room Lobby */}
              <button
                type="button"
                onClick={onReturnToLobby}
                className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all border-2 border-white shadow-md active:scale-95"
                title="Voltar para a sala e aguardar outros jogadores ou alterar regras"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Sala / Lobby</span>
              </button>

              {/* View Career Stats */}
              {onOpenStats && (
                <button
                  type="button"
                  onClick={onOpenStats}
                  className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all border-2 border-white shadow-md active:scale-95"
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>Troféus & Stats</span>
                </button>
              )}
            </div>

            {/* Leave Room Completely */}
            <button
              type="button"
              onClick={onLeave}
              className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors border border-slate-200"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Sair da Sala</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
