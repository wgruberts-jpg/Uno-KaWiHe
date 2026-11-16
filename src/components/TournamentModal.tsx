import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types/uno.js';
import { Trophy, Users, Shield, Play, Plus, Clock, Eye, Trash2, CheckCircle2, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';

interface TournamentModalProps {
  currentUser: UserProfile | null;
  token?: string;
  onClose: () => void;
  onJoinTournamentRoom: (roomId: string) => void;
}

export const TournamentModal: React.FC<TournamentModalProps> = ({
  currentUser,
  token,
  onClose,
  onJoinTournamentRoom,
}) => {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<any | null>(null);
  const [standings, setStandings] = useState<any>(null);
  const [seriesSummary, setSeriesSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New Tournament Form (Admin)
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModality, setNewModality] = useState<'individual' | 'doubles'>('individual');
  const [newBestOf, setNewBestOf] = useState<number>(3);
  const [newGamesPerGroup, setNewGamesPerGroup] = useState<number>(3);
  const [newAdvancePerGroup, setNewAdvancePerGroup] = useState<number>(1);
  const [newSpectatorMode, setNewSpectatorMode] = useState<'table_only' | 'tv_hidden' | 'tv_reveal'>('tv_hidden');

  // Team Registration Form (Doubles)
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [player1Ident, setPlayer1Ident] = useState('');
  const [player2Ident, setPlayer2Ident] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  const fetchTournaments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tournaments', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.tournaments)) {
        setTournaments(data.tournaments);
      } else {
        setError(data.error || 'Erro ao carregar torneios.');
      }
    } catch {
      setError('Falha de conexão ao carregar torneios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
    const interval = setInterval(fetchTournaments, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadTournamentDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/tournaments/${id}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (data.success) {
        setSelectedTournament(data.tournament);
        setStandings(data.standingsByGroup || {});
        setSeriesSummary(data.seriesSummaryByGroup || {});
      }
    } catch {}
  };

  useEffect(() => {
    if (selectedTournament) {
      const timer = setInterval(() => {
        loadTournamentDetails(selectedTournament.config.id);
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [selectedTournament?.config?.id]);

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: newName.trim(),
          modality: newModality,
          bestOf: newModality === 'doubles' ? newBestOf : undefined,
          gamesPerGroup: newModality === 'individual' ? newGamesPerGroup : undefined,
          advancePerGroup: newModality === 'individual' ? newAdvancePerGroup : undefined,
          spectatorMode: newSpectatorMode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Torneio criado com sucesso!');
        setShowCreate(false);
        setNewName('');
        fetchTournaments();
        loadTournamentDetails(data.tournament.config.id);
      } else {
        setError(data.error || 'Erro ao criar torneio.');
      }
    } catch {
      setError('Erro de conexão ao criar torneio.');
    }
  };

  const handleRegisterSelf = async (tournId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournId}/register`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Inscrição realizada com sucesso!');
        loadTournamentDetails(tournId);
        fetchTournaments();
      } else {
        setError(data.error || 'Erro ao se inscrever.');
      }
    } catch {
      setError('Erro de conexão na inscrição.');
    }
  };

  const handleRegisterTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament || !player1Ident.trim() || !player2Ident.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${selectedTournament.config.id}/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: teamName.trim() || undefined,
          userIds: [player1Ident.trim(), player2Ident.trim()],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Equipe cadastrada com sucesso!');
        setShowTeamModal(false);
        setTeamName('');
        setPlayer1Ident('');
        setPlayer2Ident('');
        loadTournamentDetails(selectedTournament.config.id);
      } else {
        setError(data.error || 'Erro ao cadastrar equipe.');
      }
    } catch {
      setError('Erro de conexão ao cadastrar equipe.');
    }
  };

  const handleStartTournament = async (tournId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournId}/start`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Torneio iniciado com sucesso!');
        loadTournamentDetails(tournId);
        fetchTournaments();
      } else {
        setError(data.error || 'Erro ao iniciar torneio.');
      }
    } catch {
      setError('Erro ao iniciar torneio.');
    }
  };

  const handleStartGame = async (tournId: string, gameId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournId}/games/${gameId}/start`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (data.success && data.roomId) {
        onClose();
        onJoinTournamentRoom(data.roomId);
      } else {
        setError(data.error || 'Erro ao iniciar partida da mesa.');
      }
    } catch {
      setError('Erro de conexão ao iniciar partida.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-slate-700 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Sistema de Torneios Oficial</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase font-black">
                  KaWiHe Pro
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Competições Individuais (Ponto a Ponto) e Duplas 2v2 (Eliminatórias Md3/Md5)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchTournaments}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center font-bold transition-all cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {selectedTournament ? (
            // Tournament Detail & Bracket View
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-slate-800/60 p-4 rounded-2xl border border-slate-700">
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedTournament(null)}
                    className="text-xs text-rose-400 font-black hover:underline mb-1 inline-flex items-center gap-1 cursor-pointer"
                  >
                    ← Voltar à lista de torneios
                  </button>
                  <h3 className="text-xl font-black text-white">{selectedTournament.config.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 font-medium">
                    <span className="capitalize">Modalidade: {selectedTournament.config.modality === 'doubles' ? 'Duplas 2v2' : 'Individual'}</span>
                    <span>•</span>
                    <span className="uppercase font-bold text-amber-400">Status: {selectedTournament.status}</span>
                    <span>•</span>
                    <span>Inscritos: {selectedTournament.entries?.length || 0}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedTournament.status === 'registration' && currentUser && (
                    <>
                      {selectedTournament.config.modality === 'individual' ? (
                        <button
                          type="button"
                          onClick={() => handleRegisterSelf(selectedTournament.config.id)}
                          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xs shadow-lg cursor-pointer flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Inscrever-se</span>
                        </button>
                      ) : (
                        isAdmin && (
                          <button
                            type="button"
                            onClick={() => setShowTeamModal(true)}
                            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black text-xs shadow-lg cursor-pointer flex items-center gap-2"
                          >
                            <Users className="w-4 h-4" />
                            <span>Cadastrar Dupla 2v2</span>
                          </button>
                        )
                      )}
                    </>
                  )}

                  {isAdmin && selectedTournament.status === 'registration' && (
                    <button
                      type="button"
                      onClick={() => handleStartTournament(selectedTournament.config.id)}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white font-black text-xs shadow-lg cursor-pointer flex items-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      <span>Iniciar Torneio</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Entries list in registration */}
              {selectedTournament.status === 'registration' && (
                <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700">
                  <h4 className="text-sm font-black text-slate-300 uppercase tracking-wider mb-3">Participantes / Equipes Inscritas</h4>
                  {selectedTournament.entries?.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Nenhum competidor inscrito ainda.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {selectedTournament.entries.map((ent: any) => (
                        <div key={ent.id} className="p-3 rounded-xl bg-slate-900 border border-slate-700 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-black text-xs">
                            {ent.kind === 'team' ? '👥' : '👤'}
                          </div>
                          <div className="overflow-hidden">
                            <div className="font-bold text-xs text-white truncate">{ent.name}</div>
                            <div className="text-[10px] text-slate-400">{ent.userIds.join(' & ')}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Rounds & Bracket */}
              {selectedTournament.status !== 'registration' && (
                <div className="space-y-6">
                  {selectedTournament.rounds?.map((round: any) => (
                    <div key={round.roundNumber} className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          <span>{round.label} (Rodada {round.roundNumber})</span>
                        </h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-bold uppercase">
                          {round.status}
                        </span>
                      </div>

                      <div className="space-y-4">
                        {round.groups?.map((group: any) => {
                          const groupStandings = standings?.[group.id]?.standings || [];
                          const groupSeries = seriesSummary?.[group.id];

                          return (
                            <div key={group.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
                                <span>Mesa / Chave #{group.matchOrder}</span>
                                <span className="text-amber-400">Status: {group.status}</span>
                              </div>

                              {/* Standings for Individual or Series for Doubles */}
                              {group.rule?.type === 'points' ? (
                                <div className="space-y-1.5">
                                  {groupStandings.map((row: any) => {
                                    const entry = selectedTournament.entries.find((e: any) => e.id === row.entryId);
                                    return (
                                      <div key={row.entryId} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-800/60">
                                        <div className="flex items-center gap-2">
                                          <span className="w-5 font-black text-amber-400">#{row.rank}</span>
                                          <span className="font-bold text-white">{entry?.name || row.entryId}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-slate-400 font-medium">
                                          <span>Vitórias: <strong className="text-white">{row.wins}</strong></span>
                                          <span>Jogadas: {row.gamesPlayed}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-xs text-slate-300 font-medium">
                                  Confronto de Duplas (Série Melhor de {groupSeries?.bestOf || 3}) — Vitórias necessárias: {groupSeries?.winsNeeded || 2}
                                </div>
                              )}

                              {/* Games list in group */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                                {group.games?.map((gm: any) => (
                                  <div key={gm.id} className="p-3 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between">
                                    <div>
                                      <div className="font-black text-xs text-white">Partida #{gm.gameNumber}</div>
                                      <div className="text-[10px] text-slate-400">
                                        {gm.status === 'finished' ? `Vencedor: ${gm.winnerEntryId}` : gm.status === 'void' ? 'Anulada (W.O.)' : 'Pendente / Em Andamento'}
                                      </div>
                                    </div>

                                    {isAdmin && gm.status === 'playing' && gm.roomId && (
                                      <button
                                        type="button"
                                        onClick={() => handleStartGame(selectedTournament.config.id, gm.id)}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md cursor-pointer flex items-center gap-1.5"
                                      >
                                        <Play className="w-3 h-3" />
                                        <span>Entrar na Mesa</span>
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Tournaments List & Creation
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-white">Campeonatos Ativos</h3>
                  <p className="text-xs text-slate-400">Escolha um torneio para ver o chaveamento ou inscrever-se</p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white font-black text-xs shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar Novo Torneio</span>
                  </button>
                )}
              </div>

              {/* Create Tournament Form */}
              {showCreate && isAdmin && (
                <form onSubmit={handleCreateTournament} className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-4 animate-in fade-in duration-200">
                  <h4 className="text-sm font-black text-amber-400 uppercase tracking-wider">Novo Campeonato KaWiHe</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Nome do Torneio</label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Ex: Copa Oficial KaWiHe 2026"
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Modalidade</label>
                      <select
                        value={newModality}
                        onChange={(e) => setNewModality(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                      >
                        <option value="individual">Individual (Mesas de 2 a 4)</option>
                        <option value="doubles">Duplas 2v2 (Mata-mata Md3/Md5)</option>
                      </select>
                    </div>

                    {newModality === 'doubles' ? (
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">Série (Best Of)</label>
                        <select
                          value={newBestOf}
                          onChange={(e) => setNewBestOf(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                        >
                          <option value={1}>Melhor de 1 (Md1)</option>
                          <option value={3}>Melhor de 3 (Md3)</option>
                          <option value={5}>Melhor de 5 (Md5)</option>
                        </select>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-slate-300 mb-1">Partidas por Mesa (Games)</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={newGamesPerGroup}
                            onChange={(e) => setNewGamesPerGroup(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-300 mb-1">Avançam por Mesa</label>
                          <select
                            value={newAdvancePerGroup}
                            onChange={(e) => setNewAdvancePerGroup(Number(e.target.value) as any)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                          >
                            <option value={1}>1 classificado</option>
                            <option value={2}>2 classificados</option>
                          </select>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Política de Espectadores</label>
                      <select
                        value={newSpectatorMode}
                        onChange={(e) => setNewSpectatorMode(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                      >
                        <option value="table_only">Apenas Jogadores (Sem Espectadores)</option>
                        <option value="tv_hidden">TV Oculta (Espectadores sem ver cartas)</option>
                        <option value="tv_reveal">TV Revelada (Espectadores com cartas abertas)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreate(false)}
                      className="px-4 py-2 rounded-xl bg-slate-700 text-slate-300 hover:text-white font-bold text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xs shadow-lg cursor-pointer"
                    >
                      Salvar e Criar
                    </button>
                  </div>
                </form>
              )}

              {/* Tournaments Grid */}
              {tournaments.length === 0 ? (
                <div className="text-center py-16 bg-slate-800/30 rounded-3xl border border-slate-800">
                  <Trophy className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                  <p className="text-sm font-bold text-slate-400">Nenhum torneio cadastrado no momento.</p>
                  <p className="text-xs text-slate-500 mt-1">O Administrador pode criar um novo campeonato acima.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tournaments.map((tourn: any) => (
                    <div
                      key={tourn.config.id}
                      onClick={() => loadTournamentDetails(tourn.config.id)}
                      className="p-5 rounded-2xl bg-slate-800/70 border border-slate-700 hover:border-amber-500/50 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-black uppercase border border-amber-500/30">
                            {tourn.config.modality === 'doubles' ? 'Duplas 2v2' : 'Individual'}
                          </span>
                          <span className="text-xs font-black text-rose-400 uppercase tracking-wide">
                            {tourn.status}
                          </span>
                        </div>
                        <h4 className="text-base font-black text-white group-hover:text-amber-300 transition-colors">
                          {tourn.config.name}
                        </h4>
                        <p className="text-xs text-slate-400 font-medium mt-1">
                          Inscritos: <strong className="text-white">{tourn.entries?.length || 0}</strong> competidores
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-700/80 flex items-center justify-between text-xs text-amber-400 font-bold">
                        <span>Ver Chaveamento & Partidas →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Team Registration Modal for Doubles */}
        {showTeamModal && (
          <div className="fixed inset-0 z-60 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border-2 border-slate-700 w-full max-w-md rounded-3xl p-6 space-y-4">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <span>Cadastrar Dupla 2v2</span>
              </h4>
              <form onSubmit={handleRegisterTeam} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Nome da Equipe (Opcional)</label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Ex: Os Invencíveis"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Jogador 1 (Username ou ID)</label>
                  <input
                    type="text"
                    value={player1Ident}
                    onChange={(e) => setPlayer1Ident(e.target.value)}
                    placeholder="Ex: will"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Jogador 2 (Username ou ID)</label>
                  <input
                    type="text"
                    value={player2Ident}
                    onChange={(e) => setPlayer2Ident(e.target.value)}
                    placeholder="Ex: henry"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTeamModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg cursor-pointer"
                  >
                    Cadastrar Equipe
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
