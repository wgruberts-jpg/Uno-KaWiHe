import React, { useState, useEffect } from 'react';
import { X, Trophy, Flame, Zap, Award, Target, RotateCcw, Shield, PieChart, CheckCircle2, Lock } from 'lucide-react';
import { PlayerCareerStats } from '../types/uno.js';
import { statsManager, TROPHIES } from '../services/statsManager.js';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName?: string;
  playerAvatar?: string;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  playerName = 'Jogador',
  playerAvatar = '🦸‍♂️',
}) => {
  const [stats, setStats] = useState<PlayerCareerStats>(() => statsManager.getStats());
  const [activeTab, setActiveTab] = useState<'resumo' | 'recordes' | 'arsenal' | 'trofeus'>('resumo');
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  useEffect(() => {
    const unsub = statsManager.subscribe(setStats);
    statsManager.fetchFromServer();
    return unsub;
  }, []);

  if (!isOpen) return null;

  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;

  // Level title based on wins
  const getPlayerTitle = (wins: number) => {
    if (wins >= 50) return { title: 'Lenda Imortal do Uno', badge: '👑 Mestre Supremo', color: 'text-amber-500' };
    if (wins >= 25) return { title: 'Estrategista Lendário', badge: '💎 Grão-Mestre', color: 'text-purple-500' };
    if (wins >= 10) return { title: 'Ás dos Tabuleiros', badge: '🥇 Especialista', color: 'text-blue-500' };
    if (wins >= 3) return { title: 'Jogador Experiente', badge: '🥈 Veterano', color: 'text-emerald-500' };
    return { title: 'Iniciante Promissor', badge: '🥉 Aprendiz', color: 'text-slate-500' };
  };

  const rankInfo = getPlayerTitle(stats.gamesWon);

  const formatSeconds = (sec: number | null) => {
    if (!sec) return '—';
    const mins = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    if (mins === 0) return `${remainingSec}s`;
    return `${mins}m ${remainingSec < 10 ? '0' : ''}${remainingSec}s`;
  };

  const totalColorPlays =
    stats.colorDistribution.red +
    stats.colorDistribution.blue +
    stats.colorDistribution.green +
    stats.colorDistribution.yellow;

  const getColorPercent = (count: number) => {
    if (totalColorPlays === 0) return 0;
    return Math.round((count / totalColorPlays) * 100);
  };

  const unlockedCount = stats.achievements.length;

  const handleReset = () => {
    statsManager.resetStats();
    setShowConfirmReset(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-amber-500/40 rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl relative text-white max-h-[92dvh] flex flex-col my-auto overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-3xl shadow-lg border border-amber-300/40">
              {playerAvatar}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">{playerName}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {rankInfo.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">{rankInfo.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800 mb-4 shrink-0">
          <button
            onClick={() => setActiveTab('resumo')}
            className={`py-2 px-1 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'resumo'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Resumo</span>
          </button>

          <button
            onClick={() => setActiveTab('recordes')}
            className={`py-2 px-1 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'recordes'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Recordes</span>
          </button>

          <button
            onClick={() => setActiveTab('arsenal')}
            className={`py-2 px-1 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'arsenal'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Arsenal</span>
          </button>

          <button
            onClick={() => setActiveTab('trofeus')}
            className={`py-2 px-1 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 relative ${
              activeTab === 'trofeus'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Troféus</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900 text-amber-300 font-mono font-bold">
              {unlockedCount}/{TROPHIES.length}
            </span>
          </button>
        </div>

        {/* Tab Contents (Scrollable) */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {/* TAB 1: RESUMO */}
          {activeTab === 'resumo' && (
            <div className="space-y-4">
              {/* Win Rate Banner */}
              <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-yellow-500/20 border border-amber-500/40 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase font-black text-amber-400 tracking-wider">Aproveitamento</div>
                  <div className="text-3xl font-black text-white">{winRate}% de Vitórias</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {stats.gamesWon} vitórias em {stats.gamesPlayed} partidas disputadas
                  </div>
                </div>
                <div className="w-16 h-16 rounded-full border-4 border-amber-400 flex items-center justify-center bg-slate-950 text-amber-300 font-mono text-lg font-black shadow-lg">
                  {winRate}%
                </div>
              </div>

              {/* Grid Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3 text-center">
                  <div className="text-xs text-slate-400 font-semibold mb-1">Partidas Jogadas</div>
                  <div className="text-2xl font-black text-white font-mono">{stats.gamesPlayed}</div>
                </div>

                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-3 text-center">
                  <div className="text-xs text-emerald-300 font-semibold mb-1">Vitórias 🏆</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">{stats.gamesWon}</div>
                </div>

                <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-3 text-center">
                  <div className="text-xs text-rose-300 font-semibold mb-1">Derrotas</div>
                  <div className="text-2xl font-black text-rose-400 font-mono">{stats.gamesLost}</div>
                </div>

                <div className="bg-orange-950/40 border border-orange-500/40 rounded-2xl p-3 text-center">
                  <div className="text-xs text-orange-300 font-semibold mb-1">Sequência Atual 🔥</div>
                  <div className="text-2xl font-black text-orange-400 font-mono">{stats.currentStreak}</div>
                </div>

                <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-3 text-center">
                  <div className="text-xs text-amber-300 font-semibold mb-1">Maior Sequência 👑</div>
                  <div className="text-2xl font-black text-amber-300 font-mono">{stats.bestStreak}</div>
                </div>

                <div className="bg-cyan-950/40 border border-cyan-500/40 rounded-2xl p-3 text-center">
                  <div className="text-xs text-cyan-300 font-semibold mb-1">Pontos Acumulados 💎</div>
                  <div className="text-2xl font-black text-cyan-300 font-mono">{stats.totalPoints}</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RECORDES */}
          {activeTab === 'recordes' && (
            <div className="space-y-3">
              <div className="bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border-2 border-yellow-500/50 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-yellow-500/30 flex items-center justify-center text-3xl border border-yellow-400/50">
                  ⚡
                </div>
                <div className="flex-1">
                  <div className="text-[11px] font-black uppercase tracking-wider text-yellow-400">
                    Recorde de Velocidade
                  </div>
                  <div className="text-2xl font-black text-white font-mono">
                    {formatSeconds(stats.fastestWinSeconds)}
                  </div>
                  <p className="text-xs text-slate-300">
                    {stats.fastestWinSeconds ? 'Sua partida batida no menor tempo!' : 'Vença uma partida para cravar o recorde.'}
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-cyan-500/20 to-blue-600/10 border border-cyan-500/40 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/30 flex items-center justify-center text-3xl border border-cyan-400/50">
                  🎯
                </div>
                <div className="flex-1">
                  <div className="text-[11px] font-black uppercase tracking-wider text-cyan-400">
                    Menor Número de Turnos
                  </div>
                  <div className="text-2xl font-black text-white font-mono">
                    {stats.fewestTurnsWin ? `${stats.fewestTurnsWin} turnos` : '—'}
                  </div>
                  <p className="text-xs text-slate-300">A vitória com o menor número de rodadas jogadas.</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-500/20 to-indigo-600/10 border border-purple-500/40 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/30 flex items-center justify-center text-3xl border border-purple-400/50">
                  💰
                </div>
                <div className="flex-1">
                  <div className="text-[11px] font-black uppercase tracking-wider text-purple-400">
                    Maior Pontuação Única
                  </div>
                  <div className="text-2xl font-black text-white font-mono">
                    +{stats.highestRoundPoints} pontos
                  </div>
                  <p className="text-xs text-slate-300">Pontos das cartas deixadas na mão dos oponentes.</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ARSENAL & CORES */}
          {activeTab === 'arsenal' && (
            <div className="space-y-4">
              <div className="text-xs uppercase font-black text-slate-400 tracking-wider">Cartas Especiais Jogadas</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3 text-center">
                  <div className="text-2xl mb-1">💣</div>
                  <div className="text-xs text-slate-400">Coringa +4</div>
                  <div className="text-xl font-black text-amber-400 font-mono">{stats.plusFoursPlayed}</div>
                </div>

                <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3 text-center">
                  <div className="text-2xl mb-1">💥</div>
                  <div className="text-xs text-slate-400">Comprar +2</div>
                  <div className="text-xl font-black text-blue-400 font-mono">{stats.plusTwosPlayed}</div>
                </div>

                <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3 text-center">
                  <div className="text-2xl mb-1">🛑</div>
                  <div className="text-xs text-slate-400">Bloqueios</div>
                  <div className="text-xl font-black text-rose-400 font-mono">{stats.skipsPlayed}</div>
                </div>

                <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3 text-center">
                  <div className="text-2xl mb-1">🔄</div>
                  <div className="text-xs text-slate-400">Reversos</div>
                  <div className="text-xl font-black text-emerald-400 font-mono">{stats.reversesPlayed}</div>
                </div>
              </div>

              {/* Action Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-3 flex items-center gap-3">
                  <div className="text-3xl">🗣️</div>
                  <div>
                    <div className="text-xs text-indigo-300 font-bold">Gritos de UNO</div>
                    <div className="text-xl font-black text-white font-mono">{stats.unoCallsSuccess}</div>
                  </div>
                </div>

                <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-3 flex items-center gap-3">
                  <div className="text-3xl">🚨</div>
                  <div>
                    <div className="text-xs text-red-300 font-bold">Pegos no Flagra</div>
                    <div className="text-xl font-black text-white font-mono">{stats.caughtOpponentsUno}</div>
                  </div>
                </div>
              </div>

              {/* Color preference bars */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="text-xs uppercase font-black text-slate-400 tracking-wider">
                  Distribuição de Cores Jogadas
                </div>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-red-400">🔴 Vermelho</span>
                      <span className="font-mono text-slate-400">
                        {stats.colorDistribution.red} ({getColorPercent(stats.colorDistribution.red)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-red-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${getColorPercent(stats.colorDistribution.red)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-blue-400">🔵 Azul</span>
                      <span className="font-mono text-slate-400">
                        {stats.colorDistribution.blue} ({getColorPercent(stats.colorDistribution.blue)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${getColorPercent(stats.colorDistribution.blue)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-emerald-400">🟢 Verde</span>
                      <span className="font-mono text-slate-400">
                        {stats.colorDistribution.green} ({getColorPercent(stats.colorDistribution.green)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${getColorPercent(stats.colorDistribution.green)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-yellow-400">🟡 Amarelo</span>
                      <span className="font-mono text-slate-400">
                        {stats.colorDistribution.yellow} ({getColorPercent(stats.colorDistribution.yellow)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-yellow-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${getColorPercent(stats.colorDistribution.yellow)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TROFÉUS */}
          {activeTab === 'trofeus' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Coleção de Medalhas & Conquistas</span>
                <span className="font-bold text-amber-400">
                  {unlockedCount} de {TROPHIES.length} Desbloqueados
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TROPHIES.map((trophy) => {
                  const isUnlocked = stats.achievements.includes(trophy.id);
                  const progress = trophy.getProgress(stats);
                  const percent = Math.min(100, Math.round((progress / trophy.maxProgress) * 100));

                  return (
                    <div
                      key={trophy.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center gap-3 ${
                        isUnlocked
                          ? 'bg-gradient-to-r from-amber-950/40 to-slate-900 border-amber-500/50 shadow-md'
                          : 'bg-slate-900/60 border-slate-800/80 opacity-60'
                      }`}
                    >
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                          isUnlocked
                            ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-lg'
                            : 'bg-slate-800 text-slate-600 border border-slate-700'
                        }`}
                      >
                        {isUnlocked ? trophy.icon : <Lock className="w-5 h-5 text-slate-500" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className={`text-xs font-black truncate ${isUnlocked ? 'text-amber-300' : 'text-slate-400'}`}>
                            {trophy.title}
                          </h4>
                          {isUnlocked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1">{trophy.description}</p>

                        {!isUnlocked && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-amber-500 h-full rounded-full" style={{ width: `${percent}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              {progress}/{trophy.maxProgress}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 pt-3 mt-4 flex items-center justify-between shrink-0">
          {showConfirmReset ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-400 font-bold">Zerar tudo?</span>
              <button
                onClick={handleReset}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold"
              >
                Sim, zerar
              </button>
              <button
                onClick={() => setShowConfirmReset(false)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmReset(true)}
              className="text-[11px] text-slate-500 hover:text-rose-400 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Zerar Estatísticas</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg transition-transform active:scale-95"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
