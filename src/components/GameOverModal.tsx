import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Player, RematchVote, TablePlayerScore } from '../types/uno.js';
import {
  Trophy,
  RotateCcw,
  Home,
  Users,
  Zap,
  Clock,
  Target,
  BarChart2,
  Crown,
  Medal,
  Sparkles,
  CheckCircle2,
  Send,
  MessageCircle,
  Flame
} from 'lucide-react';

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
  rematchVotes?: Record<string, RematchVote>;
  onVoteRematch?: (ready: boolean, phrase: string) => void;
}

const QUICK_REMATCH_PHRASES = [
  { id: 'topo', text: '🚀 Topo, vamos lá!', ready: true },
  { id: 'vou_ganhar', text: '👑 Vou ganhar outra!', ready: true },
  { id: 'preparados', text: '😈 Preparados para perder?', ready: true },
  { id: 'vinganca', text: '⚔️ Na próxima eu me vingo!', ready: true },
  { id: 'bora', text: '🔥 Bora mais uma!', ready: true },
  { id: 'sair', text: '🏃‍♂️ Preciso sair, amanhã volto', ready: false },
];

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
  rematchVotes = {},
  onVoteRematch,
}) => {
  const [activeTab, setActiveTab] = useState<'podium' | 'overall'>('podium');
  const [mySelectedPhrase, setMySelectedPhrase] = useState<string | null>(null);

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

  // Rank 1st to 4th for the current round
  const roundPodium = [...players].sort((a, b) => {
    if (a.id === winnerId) return -1;
    if (b.id === winnerId) return 1;
    return a.cardsCount - b.cardsCount;
  });

  // Overall session scores sorted by wins then points
  const tableScoresList = Object.values(tableScores).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.points - a.points;
  });

  const tableChampion = tableScoresList.length > 0 ? tableScoresList[0] : null;

  const handleSelectPhrase = (phraseObj: typeof QUICK_REMATCH_PHRASES[0]) => {
    setMySelectedPhrase(phraseObj.text);
    if (onVoteRematch) {
      onVoteRematch(phraseObj.ready, phraseObj.text);
    }
  };

  const humanPlayers = players.filter((p) => !p.isBot && p.isConnected);
  const readyVotesCount = humanPlayers.filter((p) => rematchVotes[p.id]?.ready).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-300">
      <div className="bg-white border-4 border-yellow-400 rounded-3xl max-w-lg w-full p-4 sm:p-6 text-center shadow-2xl relative overflow-y-auto max-h-[94dvh] my-auto text-slate-800 flex flex-col">
        {/* Glow backdrop */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 bg-yellow-300/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center flex-1">
          {/* Winner Avatar Badge */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-300 to-orange-400 flex items-center justify-center text-4xl shadow-xl border-4 border-white mb-1.5 animate-bounce">
            {winner.avatar}
          </div>

          <div className="flex items-center gap-1.5 text-amber-600 font-black tracking-widest text-[11px] uppercase mb-0.5">
            <Trophy className="w-4 h-4 fill-amber-500 text-amber-500" />
            <span>Fim da Rodada!</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-0.5">
            {isMeWinner ? '🎉 PARABÉNS, VOCÊ VENCEU!' : `🏆 ${winner.name} Venceu a Rodada!`}
          </h2>

          {/* Fastest win banner */}
          {isFastestWin && (
            <div className="my-1.5 px-3 py-1 bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 font-black text-xs rounded-full flex items-center gap-1.5 shadow-md animate-pulse">
              <Zap className="w-3.5 h-3.5 fill-slate-950" />
              <span>⚡ NOVO RECORDE: Partida Mais Rápida da Mesa!</span>
            </div>
          )}

          {/* Tab Switcher: Pódio da Rodada vs Grande Campeão Geral */}
          <div className="grid grid-cols-2 gap-2 w-full mt-3 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('podium')}
              className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'podium'
                  ? 'bg-amber-400 text-slate-950 shadow-sm border border-amber-500'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Medal className="w-4 h-4" />
              <span>Pódio da Rodada (1º ao 4º)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('overall')}
              className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'overall'
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 shadow-sm border border-amber-500'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Crown className="w-4 h-4 text-amber-900" />
              <span>Grande Campeão Geral</span>
            </button>
          </div>

          {/* TAB 1: PÓDIO DA RODADA ATUAL */}
          {activeTab === 'podium' ? (
            <div className="w-full space-y-2.5 my-3 animate-in fade-in duration-200">
              {/* Quick round stats pills */}
              <div className="grid grid-cols-3 gap-2 w-full">
                <div className="bg-slate-50 rounded-xl p-1.5 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-bold uppercase flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" /> Tempo
                  </div>
                  <div className="text-xs font-black font-mono text-slate-800">
                    {formatSeconds(roundDurationSeconds)}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-1.5 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-bold uppercase flex items-center justify-center gap-1">
                    <Target className="w-3 h-3" /> Turnos
                  </div>
                  <div className="text-xs font-black font-mono text-slate-800">
                    {roundTurnCount || '—'}
                  </div>
                </div>

                <div className="bg-amber-50 rounded-xl p-1.5 border border-amber-200">
                  <div className="text-[10px] text-amber-700 font-bold uppercase flex items-center justify-center gap-1">
                    <Trophy className="w-3 h-3 text-amber-600" /> Pontos
                  </div>
                  <div className="text-xs font-black font-mono text-amber-900">
                    +{roundPointsWon}
                  </div>
                </div>
              </div>

              {/* 1st to 4th Place List */}
              <div className="space-y-1.5 text-left">
                {roundPodium.map((p, idx) => {
                  const placeLabels = ['🥇 1º Lugar (Campeão)', '🥈 2º Lugar', '🥉 3º Lugar', '🎖️ 4º Lugar'];
                  const is1st = idx === 0;

                  return (
                    <div
                      key={p.id}
                      className={`p-2.5 rounded-2xl flex items-center justify-between border-2 transition-all ${
                        is1st
                          ? 'bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-100 border-amber-400 shadow-md scale-102'
                          : idx === 1
                          ? 'bg-slate-100/90 border-slate-300'
                          : 'bg-white/80 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl shrink-0">{p.avatar}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 truncate flex items-center gap-1">
                            <span>{p.name}</span>
                            {p.id === myPlayerId && <span className="text-[10px] text-amber-700 font-bold">(Você)</span>}
                            {p.isBot && <span className="text-[9px] bg-slate-200 text-slate-600 px-1 rounded">Robô</span>}
                          </div>
                          <div className="text-[10px] font-bold text-amber-800">
                            {placeLabels[idx] || `${idx + 1}º Lugar`}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {is1st ? (
                          <span className="text-[11px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                            0 cartas (+{roundPointsWon} pts)
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-600">
                            {p.cardsCount} {p.cardsCount === 1 ? 'carta restante' : 'cartas restantes'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* TAB 2: GRANDE CAMPEÃO GERAL ACUMULADO */
            <div className="w-full space-y-2.5 my-3 animate-in fade-in duration-200">
              {tableChampion && (
                <div className="p-3 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 rounded-2xl border-2 border-white shadow-lg text-slate-950 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-12 h-12 rounded-2xl bg-white/90 shadow flex items-center justify-center text-2xl border-2 border-yellow-200 shrink-0">
                      👑
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] uppercase font-black tracking-wider text-amber-950">
                        Líder da Mesa no Momento
                      </div>
                      <div className="text-sm font-black text-slate-950 flex items-center gap-1">
                        <span>{tableChampion.name}</span>
                        <span>{tableChampion.avatar}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black text-slate-950 font-mono">
                      {tableChampion.wins} 🏆
                    </div>
                    <div className="text-[10px] font-black text-amber-900">
                      {tableChampion.points} pontos totais
                    </div>
                  </div>
                </div>
              )}

              {/* Full Standings List */}
              <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5 text-left">
                {tableScoresList.map((tp, idx) => (
                  <div
                    key={tp.playerId}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold border ${
                      idx === 0
                        ? 'bg-yellow-100/90 text-amber-950 border-yellow-400'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-slate-400 text-xs">#{idx + 1}</span>
                      <span className="text-base">{tp.avatar}</span>
                      <span className="truncate max-w-[130px]">
                        {tp.name} {tp.playerId === myPlayerId && '(Você)'}
                      </span>
                    </div>
                    <div className="font-mono text-amber-900 text-xs shrink-0">
                      <strong>{tp.wins}</strong> vitórias <span className="text-slate-400 font-normal">({tp.points} pts)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REMATCH QUICK-REACTION / VOTE SECTION */}
          <div className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-2.5 my-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5 text-amber-600" />
                Diga o que achou para a próxima:
              </span>
              <span className="text-[10px] font-bold text-slate-500">
                {readyVotesCount}/{humanPlayers.length} prontos
              </span>
            </div>

            {/* Quick Phrases Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {QUICK_REMATCH_PHRASES.map((item) => {
                const isSelected = mySelectedPhrase === item.text;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPhrase(item)}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition-all cursor-pointer border text-center truncate ${
                      isSelected
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm scale-102 ring-2 ring-emerald-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-yellow-50 hover:border-amber-300'
                    }`}
                  >
                    {item.text}
                  </button>
                );
              })}
            </div>

            {/* Active Votes List */}
            {Object.keys(rematchVotes).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                {Object.values(rematchVotes).map((v) => (
                  <span
                    key={v.playerId}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      v.ready
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <strong>{v.playerName}:</strong> {v.phrase}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 w-full mt-1">
            {/* Play Again (Immediate Start) */}
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-400 hover:from-yellow-200 hover:to-orange-300 text-slate-950 font-black text-xs sm:text-sm shadow-[0_4px_0_#d97706] active:shadow-[0_1px_0_#d97706] active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer transition-all border-2 border-white uppercase tracking-wider"
            >
              <RotateCcw className="w-4 h-4" />
              {isHost ? 'Começar Próxima Rodada' : 'Confirmar & Jogar Novamente'}
            </button>

            <div className="grid grid-cols-2 gap-2 w-full">
              {/* Return to Room Lobby */}
              <button
                type="button"
                onClick={onReturnToLobby}
                className="py-2 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all border border-slate-300 shadow-sm active:scale-95"
              >
                <Users className="w-3.5 h-3.5 text-slate-600" />
                <span>Sala / Lobby</span>
              </button>

              {/* View Career Stats */}
              {onOpenStats && (
                <button
                  type="button"
                  onClick={onOpenStats}
                  className="py-2 px-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all border border-purple-400 shadow-sm active:scale-95"
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
              className="py-1.5 px-3 rounded-xl text-slate-500 hover:text-rose-600 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
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
