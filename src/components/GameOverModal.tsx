import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Player } from '../types/uno.js';
import { Trophy, RotateCcw, Home, Users } from 'lucide-react';

interface GameOverModalProps {
  winnerId: string | null;
  players: Player[];
  myPlayerId: string;
  isHost: boolean;
  onRestart: () => void;
  onReturnToLobby: () => void;
  onLeave: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winnerId,
  players,
  myPlayerId,
  isHost,
  onRestart,
  onReturnToLobby,
  onLeave,
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

  // Sort other players by cards remaining
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.id === winnerId) return -1;
    if (b.id === winnerId) return 1;
    return a.cardsCount - b.cardsCount;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-300">
      <div className="bg-white border-4 border-yellow-400 rounded-3xl max-w-md w-full p-4 sm:p-6 text-center shadow-2xl relative overflow-y-auto max-h-[92dvh] my-auto text-slate-800">
        {/* Glow backdrop */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-yellow-300/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-22 h-22 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-300 to-orange-400 flex items-center justify-center text-5xl shadow-xl border-4 border-white mb-3 animate-bounce">
            {winner.avatar}
          </div>

          <div className="flex items-center gap-1.5 text-amber-600 font-black tracking-widest text-xs uppercase mb-1">
            <Trophy className="w-4 h-4 fill-amber-500 text-amber-500" />
            <span>Fim de Partida!</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-1">
            {isMeWinner ? '🎉 VOCÊ VENCEU!' : `${winner.name} Venceu!`}
          </h2>
          <p className="text-xs text-slate-500 mb-5 font-bold">
            Todas as cartas foram jogadas com sucesso!
          </p>

          {/* Ranking list */}
          <div className="w-full bg-amber-50 rounded-2xl p-3 border-2 border-amber-200 mb-5 space-y-2">
            <div className="text-[11px] font-black text-amber-800 text-left px-1 uppercase tracking-wider">
              Classificação da Rodada
            </div>
            {sortedPlayers.map((player, idx) => {
              const isFirst = player.id === winnerId;
              return (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-2 rounded-xl text-xs font-bold ${
                    isFirst
                      ? 'bg-yellow-200 border-2 border-yellow-400 text-amber-950'
                      : 'bg-white text-slate-700 border border-amber-100 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400 w-4 font-black">#{idx + 1}</span>
                    <span className="text-base">{player.avatar}</span>
                    <span className="truncate max-w-[130px]">
                      {player.name} {player.id === myPlayerId && '(Você)'}
                    </span>
                  </div>

                  <div className="text-right">
                    {isFirst ? (
                      <span className="text-[11px] font-black text-amber-700 uppercase">
                        Vencedor 🏆
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        {player.cardsCount} {player.cardsCount === 1 ? 'carta' : 'cartas'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2.5 w-full">
            {/* Play Again (Immediate Start) */}
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-400 hover:from-yellow-200 hover:to-orange-300 text-slate-950 font-black text-sm shadow-[0_4px_0_#d97706] active:shadow-[0_1px_0_#d97706] active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer transition-all border-2 border-white uppercase tracking-wider"
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
                <span>Voltar à Sala</span>
              </button>

              {/* Leave Game completely */}
              <button
                type="button"
                onClick={onLeave}
                className="py-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all border-2 border-slate-300 shadow-sm active:scale-95"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Sair da Sala</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
