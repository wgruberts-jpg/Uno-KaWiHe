/**
 * UNO KaWiHe - Domínio Puro de Torneios (Etapa 2)
 *
 * Módulo 100% puro e determinístico para coordenação de torneios:
 *  - Modalidades: Individual (mesas de 2..4) e Duplas 2v2 (eliminatório Md1/Md3/Md5)
 *  - Distribuição de mesas individuais e chaveamento com byes para duplas
 *  - Classificação determinística (V1: vitórias primeiro; roundPointsWon apenas informativo)
 *  - Desempate por partida extra ou decisão administrativa (nunca arbitrário)
 *  - Máquina de estados de desconexão, prazo de reconexão, W.O. e idempotência
 *  - Simulação pré-início e recuperação pós-reinicialização do servidor
 *
 * Não depende de WebSocket, Express, sistema de arquivos ou relógio global.
 */

export type TournamentModality = 'individual' | 'doubles';
export type TournamentStatus = 'registration' | 'running' | 'paused' | 'finished' | 'cancelled';
export type TieBreakerPolicy = 'extra_match' | 'admin_decision';
export type GroupRule =
  | { type: 'series'; bestOf: 1 | 3 | 5 }
  | { type: 'points'; games: number; advance: 1 | 2 };

export interface TournamentConfig {
  id: string;
  name: string;
  modality: TournamentModality;
  bestOf?: 1 | 3 | 5; // Para duplas (padrão: 3)
  gamesPerGroup?: number; // Para individual (padrão: 3)
  advancePerGroup?: 1 | 2; // Para individual (padrão: 1)
  tieBreakerPolicy: TieBreakerPolicy;
  reconnectGraceMs: number; // Prazo para reconexão antes de W.O.
  spectatorMode: 'table_only' | 'tv_hidden' | 'tv_reveal';
  turnDurationSeconds?: number;
  playAnimationDelaySeconds?: number;
  seed?: number;
  historicalAvgGameMinutes?: number;
  defaultEstimatedGameMinutes?: number;
}

export interface TournamentEntry {
  id: string;
  kind: 'player' | 'team';
  name: string;
  userIds: string[];
  frozen: boolean;
  withdrawn?: boolean;
}

export interface TournamentGame {
  id: string;
  roundNumber: number;
  groupId: string;
  gameNumber: number;
  roomId?: string;
  participantEntryIds: string[];
  status: 'pending' | 'playing' | 'finished' | 'void' | 'needs_intervention';
  winnerEntryId?: string;
  isTieBreaker?: boolean;
  resultReason?: 'normal' | 'wo' | 'void_insufficient_players' | 'admin_decision' | 'server_restart' | 'early_clinch';
  woEntryIds: string[];
  /** Armazenado apenas para histórico/uso futuro; NÃO é usado para desempate na V1. */
  roundPointsWon?: number;
  finishedAt?: number;
  processedEventIds: string[];
}

export interface TournamentGroup {
  id: string;
  roundNumber: number;
  matchOrder: number;
  entryIds: string[];
  activeEntryIds: string[];
  byeWinnerEntryId?: string;
  rule: GroupRule;
  games: TournamentGame[];
  status: 'waiting' | 'playing' | 'tiebreaker_required' | 'needs_intervention' | 'finished';
  winnerEntryId?: string;
  advancingEntryIds: string[];
}

export interface TournamentRound {
  roundNumber: number;
  label: string;
  groups: TournamentGroup[];
  status: 'pending' | 'playing' | 'finished';
}

export interface Tournament {
  config: TournamentConfig;
  status: TournamentStatus;
  createdByUserId: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  entries: TournamentEntry[];
  rounds: TournamentRound[];
  championEntryId?: string;
  pauseReason?: string;
}

export interface IndividualStandingRow {
  entryId: string;
  wins: number;
  gamesPlayed: number;
  woCount: number;
  /** Informativo apenas; não ordena classificação na V1. */
  informationalPointsWon: number;
  rank: number;
  tiedWithNext: boolean;
}

export interface IndividualClassificationResult {
  status: 'classified' | 'tiebreaker_required' | 'insufficient_results';
  standings: IndividualStandingRow[];
  advancingEntryIds: string[];
  tiedEntryIds: string[];
  targetAdvanceCount: number;
}

export interface TournamentSeatState {
  entryId: string;
  userId: string;
  playerId?: string;
  roomId?: string;
  gameId: string;
  connectionStatus: 'connected' | 'disconnected' | 'wo' | 'left';
  disconnectedAt?: number;
  reconnectionDeadlineAt?: number;
  woReason?: string;
}

export interface SeatEvaluationOutcome {
  seats: TournamentSeatState[];
  newlyForfeitedEntryIds: string[];
  activeEntryIds: string[];
  allWoEntryIds: string[];
  action: 'continue_match' | 'award_wo' | 'void_insufficient_players';
  winnerEntryId?: string;
}

export interface SimulationRoundSummary {
  roundNumber: number;
  label: string;
  groupsCount: number;
  tableSizes: number[];
  byesCount: number;
  minGames: number;
  maxGames: number;
  advancingCount: number;
}

export interface TournamentSimulation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  entryCount: number;
  modality: TournamentModality;
  rounds: SimulationRoundSummary[];
  totalRounds: number;
  totalMatchesMin: number;
  totalMatchesMax: number;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  estimationPrecision: 'historical' | 'low_estimate';
}

// ============================================================================
// Permissões & Validação de Configuração
// ============================================================================

export function assertTournamentAdmin(role: string | undefined | null): { allowed: boolean; error?: string } {
  if (role === 'admin') {
    return { allowed: true };
  }
  return {
    allowed: false,
    error: 'Apenas administradores podem criar, configurar, iniciar, pausar ou encerrar torneios.',
  };
}

export function validateTournamentConfig(config: TournamentConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.id || !config.id.trim()) errors.push('ID do torneio é obrigatório.');
  if (!config.name || !config.name.trim()) errors.push('Nome do torneio é obrigatório.');
  if (config.modality !== 'individual' && config.modality !== 'doubles') {
    errors.push('Modalidade inválida. Use "individual" ou "doubles".');
  }
  if (!Number.isFinite(config.reconnectGraceMs) || config.reconnectGraceMs < 5000) {
    errors.push('Prazo de reconexão deve ser de pelo menos 5000ms.');
  }

  if (config.modality === 'doubles') {
    const bestOf = config.bestOf ?? 3;
    if (bestOf !== 1 && bestOf !== 3 && bestOf !== 5) {
      errors.push('Em duplas, a série (bestOf) deve ser ímpar: 1, 3 ou 5.');
    }
  } else {
    const games = config.gamesPerGroup ?? 3;
    const advance = config.advancePerGroup ?? 1;
    if (!Number.isInteger(games) || games < 1 || games > 20) {
      errors.push('Quantidade de partidas por mesa individual deve estar entre 1 e 20.');
    }
    if (advance !== 1 && advance !== 2) {
      errors.push('Quantidade de classificados por mesa individual deve ser 1 ou 2.');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Utilitário Determinístico de Embaralhamento (Auditoria / Reprodutibilidade)
// ============================================================================

export function seededShuffle<T>(items: readonly T[], seed?: number): T[] {
  const result = [...items];
  if (seed === undefined || !Number.isFinite(seed)) {
    return result;
  }
  let state = (Math.floor(seed) >>> 0) || 1;
  const nextRand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// Inscrições e Congelamento de Equipes
// ============================================================================

export function createTournament(config: TournamentConfig, createdByUserId: string, createdAt: number): Tournament {
  const validation = validateTournamentConfig(config);
  if (!validation.valid) {
    throw new Error(`Configuração de torneio inválida: ${validation.errors.join(' ')}`);
  }
  return {
    config: {
      ...config,
      bestOf: config.modality === 'doubles' ? (config.bestOf ?? 3) : undefined,
      gamesPerGroup: config.modality === 'individual' ? (config.gamesPerGroup ?? 3) : undefined,
      advancePerGroup: config.modality === 'individual' ? (config.advancePerGroup ?? 1) : undefined,
    },
    status: 'registration',
    createdByUserId,
    createdAt,
    entries: [],
    rounds: [],
  };
}

export function registerIndividualEntry(
  tournament: Tournament,
  userId: string,
  displayName: string
): { tournament: Tournament; entry: TournamentEntry } {
  if (tournament.status !== 'registration') {
    throw new Error('Inscrições encerradas: o torneio já foi iniciado ou finalizado.');
  }
  if (tournament.config.modality !== 'individual') {
    throw new Error('Este torneio é de duplas e exige equipes de 2 jogadores.');
  }
  if (!userId || !userId.trim()) {
    throw new Error('Usuário autenticado é obrigatório para inscrição em torneio.');
  }
  const alreadyRegistered = tournament.entries.some((e) => e.userIds.includes(userId));
  if (alreadyRegistered) {
    throw new Error(`Usuário "${userId}" já está inscrito neste torneio.`);
  }

  const entry: TournamentEntry = {
    id: `entry_${userId}`,
    kind: 'player',
    name: displayName.trim() || userId,
    userIds: [userId],
    frozen: false,
  };

  return {
    tournament: {
      ...tournament,
      entries: [...tournament.entries, entry],
    },
    entry,
  };
}

export function registerDoublesTeam(
  tournament: Tournament,
  teamId: string,
  teamName: string,
  userIds: [string, string]
): { tournament: Tournament; entry: TournamentEntry } {
  if (tournament.status !== 'registration') {
    throw new Error('Inscrições encerradas: equipes não podem ser inscritas após o início.');
  }
  if (tournament.config.modality !== 'doubles') {
    throw new Error('Este torneio é individual e não aceita equipes.');
  }
  const [u1, u2] = userIds;
  if (!u1 || !u2 || u1 === u2) {
    throw new Error('Uma equipe 2v2 deve possuir exatamente dois usuários distintos.');
  }
  const duplicateUser = tournament.entries.some((e) => e.userIds.includes(u1) || e.userIds.includes(u2));
  if (duplicateUser) {
    throw new Error('Um ou ambos os jogadores já pertencem a outra equipe neste torneio.');
  }
  if (tournament.entries.some((e) => e.id === teamId)) {
    throw new Error(`Equipe "${teamId}" já existe neste torneio.`);
  }

  const entry: TournamentEntry = {
    id: teamId,
    kind: 'team',
    name: teamName.trim() || teamId,
    userIds: [u1, u2],
    frozen: false,
  };

  return {
    tournament: {
      ...tournament,
      entries: [...tournament.entries, entry],
    },
    entry,
  };
}

export function updateDoublesTeamMembers(
  tournament: Tournament,
  teamId: string,
  newUserIds: [string, string]
): Tournament {
  if (tournament.status !== 'registration') {
    throw new Error('Operação bloqueada: integrantes de equipe estão congelados após o início do torneio.');
  }
  const target = tournament.entries.find((e) => e.id === teamId);
  if (!target) {
    throw new Error(`Equipe "${teamId}" não encontrada.`);
  }
  if (target.frozen) {
    throw new Error(`Equipe "${teamId}" está congelada e não pode ser alterada.`);
  }
  const [u1, u2] = newUserIds;
  if (!u1 || !u2 || u1 === u2) {
    throw new Error('Uma equipe 2v2 deve possuir exatamente dois usuários distintos.');
  }
  const usedByOthers = tournament.entries.some(
    (e) => e.id !== teamId && (e.userIds.includes(u1) || e.userIds.includes(u2))
  );
  if (usedByOthers) {
    throw new Error('Um dos usuários informados já está inscrito em outra equipe.');
  }

  return {
    ...tournament,
    entries: tournament.entries.map((e) => (e.id === teamId ? { ...e, userIds: [u1, u2] } : e)),
  };
}

// ============================================================================
// Seção 5: Distribuição de Mesas Individuais
// ============================================================================

/**
 * Calcula os tamanhos ótimos das mesas para N participantes:
 *  - Nenhuma mesa > 4 ou < 2
 *  - Prioriza mesas de 4
 *  - Usa mesas de 3 quando necessário
 *  - Evita mesas de 2 sempre que possível (só ocorre quando N === 2 ou N === 5)
 */
export function computeIndividualTableSizes(participantCount: number): number[] {
  if (!Number.isInteger(participantCount) || participantCount < 2) {
    throw new Error(`Quantidade insuficiente de participantes para formar mesa: ${participantCount}`);
  }
  if (participantCount === 2) return [2];
  if (participantCount === 3) return [3];
  if (participantCount === 5) return [3, 2];

  const rem = participantCount % 4;
  let count4 = 0;
  let count3 = 0;

  if (rem === 0) {
    count4 = participantCount / 4;
  } else if (rem === 3) {
    count4 = Math.floor(participantCount / 4);
    count3 = 1;
  } else if (rem === 2) {
    count4 = (participantCount - 6) / 4;
    count3 = 2;
  } else {
    // rem === 1 e participantCount >= 9
    count4 = (participantCount - 9) / 4;
    count3 = 3;
  }

  const sizes: number[] = [];
  for (let i = 0; i < count4; i++) sizes.push(4);
  for (let i = 0; i < count3; i++) sizes.push(3);
  return sizes;
}

export function distributeIndividualEntries(entryIds: readonly string[], seed?: number): string[][] {
  const unique = Array.from(new Set(entryIds));
  if (unique.length !== entryIds.length) {
    throw new Error('Lista de participantes contém IDs duplicados.');
  }
  const sizes = computeIndividualTableSizes(unique.length);
  const ordered = seededShuffle(unique, seed);

  const tables: string[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    tables.push(ordered.slice(cursor, cursor + size));
    cursor += size;
  }
  return tables;
}

// ============================================================================
// Seção 3.2: Chaveamento de Duplas (Byes + Séries Melhor de 1/3/5)
// ============================================================================

export function createGroupGames(
  groupId: string,
  roundNumber: number,
  participantEntryIds: readonly string[],
  gamesCount: number
): TournamentGame[] {
  const games: TournamentGame[] = [];
  for (let i = 1; i <= gamesCount; i++) {
    games.push({
      id: `${groupId}_G${i}`,
      roundNumber,
      groupId,
      gameNumber: i,
      participantEntryIds: [...participantEntryIds],
      status: 'pending',
      woEntryIds: [],
      processedEventIds: [],
    });
  }
  return games;
}

export function createDoublesRoundBracket(
  entryIds: readonly string[],
  bestOf: 1 | 3 | 5,
  roundNumber = 1,
  seed?: number
): TournamentGroup[] {
  const unique = Array.from(new Set(entryIds));
  if (unique.length !== entryIds.length) {
    throw new Error('Lista de equipes contém IDs duplicados.');
  }
  if (unique.length < 2) {
    throw new Error('São necessárias pelo menos 2 equipes para gerar confrontos de duplas.');
  }
  if (bestOf !== 1 && bestOf !== 3 && bestOf !== 5) {
    throw new Error('Série bestOf em duplas deve ser 1, 3 ou 5.');
  }

  const ordered = seededShuffle(unique, seed);
  let nextPow2 = 1;
  while (nextPow2 < ordered.length) nextPow2 *= 2;

  const byesCount = nextPow2 - ordered.length;
  const playingCount = ordered.length - byesCount; // Sempre par: 2 * matchesCount
  const matchesCount = playingCount / 2;

  const groups: TournamentGroup[] = [];
  let order = 1;

  // Confrontos preliminares / regulares da rodada
  for (let i = 0; i < matchesCount; i++) {
    const e1 = ordered[i * 2];
    const e2 = ordered[i * 2 + 1];
    const groupId = `R${roundNumber}_M${order}`;
    groups.push({
      id: groupId,
      roundNumber,
      matchOrder: order,
      entryIds: [e1, e2],
      activeEntryIds: [e1, e2],
      rule: { type: 'series', bestOf },
      games: createGroupGames(groupId, roundNumber, [e1, e2], bestOf),
      status: 'waiting',
      advancingEntryIds: [],
    });
    order++;
  }

  // Equipes com bye avançam automaticamente nesta rodada
  for (let b = 0; b < byesCount; b++) {
    const byeEntry = ordered[playingCount + b];
    const groupId = `R${roundNumber}_BYE${b + 1}`;
    groups.push({
      id: groupId,
      roundNumber,
      matchOrder: order,
      entryIds: [byeEntry],
      activeEntryIds: [byeEntry],
      byeWinnerEntryId: byeEntry,
      rule: { type: 'series', bestOf },
      games: [],
      status: 'finished',
      winnerEntryId: byeEntry,
      advancingEntryIds: [byeEntry],
    });
    order++;
  }

  return groups;
}

export function createIndividualRoundGroups(
  entryIds: readonly string[],
  gamesPerGroup: number,
  advancePerGroup: 1 | 2,
  roundNumber = 1,
  seed?: number
): TournamentGroup[] {
  const tables = distributeIndividualEntries(entryIds, seed);
  // Se restou apenas 1 mesa (Final), sempre coroa exatamente 1 campeão
  const effectiveAdvance: 1 | 2 = tables.length === 1 ? 1 : advancePerGroup;

  return tables.map((tableEntries, idx) => {
    // Segurança: uma mesa de 2 com advance=2 classificaria todos sem eliminar ninguém; ajusta para 1
    const safeAdvance: 1 | 2 = tableEntries.length <= 2 ? 1 : effectiveAdvance;
    const groupId = `R${roundNumber}_T${idx + 1}`;
    return {
      id: groupId,
      roundNumber,
      matchOrder: idx + 1,
      entryIds: [...tableEntries],
      activeEntryIds: [...tableEntries],
      rule: { type: 'points', games: gamesPerGroup, advance: safeAdvance },
      games: createGroupGames(groupId, roundNumber, tableEntries, gamesPerGroup),
      status: 'waiting',
      advancingEntryIds: [],
    };
  });
}

// ============================================================================
// Início do Torneio (Congelamento + Geração da Rodada 1)
// ============================================================================

export function getRoundLabel(modality: TournamentModality, roundNumber: number, groupsCount: number, remainingAfter: number): string {
  if (groupsCount === 1 && remainingAfter <= 1) return 'Final';
  if (modality === 'doubles') {
    if (groupsCount === 2) return 'Semifinais';
    if (groupsCount === 4) return 'Quartas de Final';
    if (groupsCount === 8) return 'Oitavas de Final';
  }
  return `Rodada ${roundNumber}`;
}

export function startTournament(tournament: Tournament, startedAt: number): Tournament {
  if (tournament.status !== 'registration') {
    throw new Error('O torneio não está em fase de inscrição.');
  }
  if (tournament.entries.length < 2) {
    throw new Error('São necessários pelo menos 2 competidores inscritos para iniciar o torneio.');
  }

  const frozenEntries = tournament.entries.map((e) => ({ ...e, frozen: true }));
  const entryIds = frozenEntries.map((e) => e.id);

  let round1Groups: TournamentGroup[];
  if (tournament.config.modality === 'doubles') {
    round1Groups = createDoublesRoundBracket(
      entryIds,
      tournament.config.bestOf ?? 3,
      1,
      tournament.config.seed
    );
  } else {
    round1Groups = createIndividualRoundGroups(
      entryIds,
      tournament.config.gamesPerGroup ?? 3,
      tournament.config.advancePerGroup ?? 1,
      1,
      tournament.config.seed
    );
  }

  const playableGroupsCount = round1Groups.filter((g) => !g.byeWinnerEntryId).length;
  const label = getRoundLabel(
    tournament.config.modality,
    1,
    round1Groups.length,
    round1Groups.reduce((acc, g) => acc + (g.rule.type === 'series' ? 1 : g.rule.advance), 0)
  );

  const round1: TournamentRound = {
    roundNumber: 1,
    label: playableGroupsCount === 1 && round1Groups.length === 1 ? 'Final' : label,
    groups: round1Groups,
    status: 'playing',
  };

  return {
    ...tournament,
    status: 'running',
    startedAt,
    entries: frozenEntries,
    rounds: [round1],
  };
}

// ============================================================================
// Seção 6: Classificação Individual (Vitórias primeiro; desempate V1 sem pontos)
// ============================================================================

export function rankIndividualGroupEntries(
  group: TournamentGroup,
  tieBreakerPolicy: TieBreakerPolicy = 'extra_match'
): IndividualClassificationResult {
  if (group.rule.type !== 'points') {
    throw new Error('rankIndividualGroupEntries só se aplica a grupos individuais.');
  }

  const targetAdvance = Math.min(group.rule.advance, group.entryIds.length);
  const winsMap = new Map<string, number>();
  const playedMap = new Map<string, number>();
  const woMap = new Map<string, number>();
  const infoPointsMap = new Map<string, number>();

  for (const eid of group.entryIds) {
    winsMap.set(eid, 0);
    playedMap.set(eid, 0);
    woMap.set(eid, 0);
    infoPointsMap.set(eid, 0);
  }

  let finishedValidGames = 0;
  for (const g of group.games) {
    if (g.status === 'finished' && g.winnerEntryId) {
      finishedValidGames++;
      winsMap.set(g.winnerEntryId, (winsMap.get(g.winnerEntryId) || 0) + 1);
      if (typeof g.roundPointsWon === 'number') {
        infoPointsMap.set(
          g.winnerEntryId,
          (infoPointsMap.get(g.winnerEntryId) || 0) + g.roundPointsWon
        );
      }
      for (const pid of g.participantEntryIds) {
        playedMap.set(pid, (playedMap.get(pid) || 0) + 1);
      }
      for (const woid of g.woEntryIds) {
        woMap.set(woid, (woMap.get(woid) || 0) + 1);
      }
    } else if (g.status === 'void') {
      for (const woid of g.woEntryIds) {
        woMap.set(woid, (woMap.get(woid) || 0) + 1);
      }
    }
  }

  // Ordenação determinística estritamente por vitórias (decrescente).
  // Em empate de vitórias, mantém ordem determinística de entrada para exibir na tabela,
  // sem usar roundPointsWon para desempatar na V1.
  const rows: IndividualStandingRow[] = group.entryIds.map((eid) => ({
    entryId: eid,
    wins: winsMap.get(eid) || 0,
    gamesPlayed: playedMap.get(eid) || 0,
    woCount: woMap.get(eid) || 0,
    informationalPointsWon: infoPointsMap.get(eid) || 0,
    rank: 1,
    tiedWithNext: false,
  }));

  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return group.entryIds.indexOf(a.entryId) - group.entryIds.indexOf(b.entryId);
  });

  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i].wins === rows[i - 1].wins) {
      rows[i].rank = rows[i - 1].rank;
      rows[i - 1].tiedWithNext = true;
    } else {
      rows[i].rank = i + 1;
    }
  }

  const hasPendingOrBrokenGames = group.games.some(
    (g) => g.status === 'pending' || g.status === 'playing' || g.status === 'needs_intervention'
  );

  // Sem resultados válidos suficientes não inventa classificação
  if (hasPendingOrBrokenGames || finishedValidGames === 0) {
    return {
      status: 'insufficient_results',
      standings: rows,
      advancingEntryIds: [],
      tiedEntryIds: [],
      targetAdvanceCount: targetAdvance,
    };
  }

  // Verifica se há empate exatamente na linha de corte (entre posição targetAdvance-1 e targetAdvance)
  if (rows.length > targetAdvance) {
    const cutoffWins = rows[targetAdvance - 1].wins;
    const nextWins = rows[targetAdvance].wins;
    if (cutoffWins === nextWins) {
      const tiedAtCutoff = rows.filter((r) => r.wins === cutoffWins).map((r) => r.entryId);
      const lockedWinners = rows.filter((r) => r.wins > cutoffWins).map((r) => r.entryId);
      return {
        status: 'tiebreaker_required',
        standings: rows,
        advancingEntryIds: lockedWinners,
        tiedEntryIds: tiedAtCutoff,
        targetAdvanceCount: targetAdvance,
      };
    }
  }

  void tieBreakerPolicy;
  return {
    status: 'classified',
    standings: rows,
    advancingEntryIds: rows.slice(0, targetAdvance).map((r) => r.entryId),
    tiedEntryIds: [],
    targetAdvanceCount: targetAdvance,
  };
}

export function createTieBreakerGame(group: TournamentGroup, tiedEntryIds: readonly string[]): TournamentGroup {
  if (tiedEntryIds.length < 2) {
    throw new Error('Partida extra exige pelo menos 2 participantes empatados.');
  }
  const nextNumber = group.games.length + 1;
  const tbGame: TournamentGame = {
    id: `${group.id}_TB${nextNumber}`,
    roundNumber: group.roundNumber,
    groupId: group.id,
    gameNumber: nextNumber,
    participantEntryIds: [...tiedEntryIds],
    status: 'pending',
    isTieBreaker: true,
    woEntryIds: [],
    processedEventIds: [],
  };
  return {
    ...group,
    status: 'playing',
    games: [...group.games, tbGame],
  };
}

// ============================================================================
// Processamento Idempotente de Resultados & Séries 2v2
// ============================================================================

export interface RecordGameResultInput {
  gameId: string;
  eventId: string;
  winnerEntryId?: string;
  resultReason?: 'normal' | 'wo' | 'void_insufficient_players' | 'admin_decision';
  woEntryIds?: string[];
  roundPointsWon?: number;
  finishedAt: number;
}

export interface RecordGameResultOutcome {
  tournament: Tournament;
  applied: boolean;
  reason?:
    | 'applied'
    | 'duplicate_event'
    | 'game_not_found'
    | 'game_already_finalized'
    | 'invalid_winner'
    | 'winner_has_wo';
}

export function recordGameResult(
  tournament: Tournament,
  input: RecordGameResultInput,
  tieBreakerPolicy?: TieBreakerPolicy
): RecordGameResultOutcome {
  const policy = tieBreakerPolicy ?? tournament.config.tieBreakerPolicy;

  let targetRoundIdx = -1;
  let targetGroupIdx = -1;
  let targetGameIdx = -1;

  for (let rIdx = 0; rIdx < tournament.rounds.length; rIdx++) {
    const round = tournament.rounds[rIdx];
    for (let gIdx = 0; gIdx < round.groups.length; gIdx++) {
      const grp = round.groups[gIdx];
      const gmIdx = grp.games.findIndex((gm) => gm.id === input.gameId);
      if (gmIdx !== -1) {
        targetRoundIdx = rIdx;
        targetGroupIdx = gIdx;
        targetGameIdx = gmIdx;
        break;
      }
    }
    if (targetGameIdx !== -1) break;
  }

  if (targetGameIdx === -1) {
    return { tournament, applied: false, reason: 'game_not_found' };
  }

  const group = tournament.rounds[targetRoundIdx].groups[targetGroupIdx];
  const game = group.games[targetGameIdx];

  // 1. Idempotência estrita por eventId
  if (game.processedEventIds.includes(input.eventId)) {
    return { tournament, applied: false, reason: 'duplicate_event' };
  }

  // 2. Não aceita resultado após partida já encerrada ou anulada
  if (game.status === 'finished' || game.status === 'void') {
    return { tournament, applied: false, reason: 'game_already_finalized' };
  }

  const woSet = new Set([...game.woEntryIds, ...(input.woEntryIds || [])]);
  const isVoid = input.resultReason === 'void_insufficient_players';

  if (!isVoid) {
    if (!input.winnerEntryId || !game.participantEntryIds.includes(input.winnerEntryId)) {
      return { tournament, applied: false, reason: 'invalid_winner' };
    }
    if (woSet.has(input.winnerEntryId)) {
      return { tournament, applied: false, reason: 'winner_has_wo' };
    }
  }

  const updatedGame: TournamentGame = {
    ...game,
    status: isVoid ? 'void' : 'finished',
    winnerEntryId: isVoid ? undefined : input.winnerEntryId,
    resultReason: input.resultReason || 'normal',
    woEntryIds: Array.from(woSet),
    roundPointsWon: input.roundPointsWon,
    finishedAt: input.finishedAt,
    processedEventIds: [...game.processedEventIds, input.eventId],
  };

  let updatedGames = group.games.map((gm, idx) => (idx === targetGameIdx ? updatedGame : gm));

  // Jogadores com W.O. ficam excluídos dos próximos jogos desta etapa no grupo
  const nextActiveEntryIds = group.activeEntryIds.filter((eid) => !woSet.has(eid));
  updatedGames = updatedGames.map((gm) =>
    gm.status === 'pending'
      ? { ...gm, participantEntryIds: gm.participantEntryIds.filter((eid) => !woSet.has(eid)) }
      : gm
  );

  let updatedGroup: TournamentGroup = {
    ...group,
    activeEntryIds: nextActiveEntryIds,
    games: updatedGames,
  };

  // Avalia conclusão do grupo conforme regra
  if (updatedGroup.rule.type === 'series') {
    const winsNeeded = Math.floor(updatedGroup.rule.bestOf / 2) + 1;
    const winsByEntry = new Map<string, number>();
    for (const eid of updatedGroup.entryIds) winsByEntry.set(eid, 0);
    for (const gm of updatedGroup.games) {
      if (gm.status === 'finished' && gm.winnerEntryId) {
        winsByEntry.set(gm.winnerEntryId, (winsByEntry.get(gm.winnerEntryId) || 0) + 1);
      }
    }

    let seriesWinner: string | undefined;
    for (const [eid, w] of winsByEntry.entries()) {
      if (w >= winsNeeded) {
        seriesWinner = eid;
        break;
      }
    }

    let woClinched = false;
    if (!seriesWinner && updatedGroup.activeEntryIds.length === 1 && woSet.size > 0) {
      seriesWinner = updatedGroup.activeEntryIds[0];
      woClinched = true;
    }

    if (seriesWinner) {
      // Encerramento antecipado da série: jogos pendentes viram 'void'
      updatedGroup = {
        ...updatedGroup,
        status: 'finished',
        winnerEntryId: seriesWinner,
        advancingEntryIds: [seriesWinner],
        games: updatedGroup.games.map((gm) =>
          gm.status === 'pending'
            ? { ...gm, status: 'void', resultReason: woClinched ? 'wo' : 'early_clinch' }
            : gm
        ),
      };
    } else {
      const stillPendingOrPlaying = updatedGroup.games.some(
        (gm) => gm.status === 'pending' || gm.status === 'playing'
      );
      const hasIntervention = updatedGroup.games.some((gm) => gm.status === 'needs_intervention');
      if (hasIntervention) {
        updatedGroup.status = 'needs_intervention';
      } else if (!stillPendingOrPlaying) {
        // Todos jogos acabaram sem atingir maioria (ex.: partidas anuladas) -> intervenção administrativa
        updatedGroup.status = 'needs_intervention';
      } else {
        updatedGroup.status = 'playing';
      }
    }
  } else {
    // Regra individual ('points')
    const hasPendingOrPlaying = updatedGroup.games.some(
      (gm) => gm.status === 'pending' || gm.status === 'playing'
    );
    const hasIntervention = updatedGroup.games.some((gm) => gm.status === 'needs_intervention');

    if (hasIntervention) {
      updatedGroup.status = 'needs_intervention';
    } else if (!hasPendingOrPlaying) {
      const classification = rankIndividualGroupEntries(updatedGroup, policy);
      if (classification.status === 'classified') {
        updatedGroup = {
          ...updatedGroup,
          status: 'finished',
          advancingEntryIds: classification.advancingEntryIds,
        };
      } else if (classification.status === 'tiebreaker_required') {
        if (policy === 'extra_match') {
          updatedGroup = {
            ...updatedGroup,
            status: 'tiebreaker_required',
            advancingEntryIds: classification.advancingEntryIds,
          };
        } else {
          updatedGroup = {
            ...updatedGroup,
            status: 'needs_intervention',
            advancingEntryIds: classification.advancingEntryIds,
          };
        }
      } else {
        updatedGroup = {
          ...updatedGroup,
          status: 'needs_intervention',
        };
      }
    } else {
      updatedGroup.status = 'playing';
    }
  }

  const updatedRounds = tournament.rounds.map((r, rIdx) => {
    if (rIdx !== targetRoundIdx) return r;
    const newGroups = r.groups.map((grp, gIdx) => (gIdx === targetGroupIdx ? updatedGroup : grp));
    const roundDone = newGroups.every((grp) => grp.status === 'finished');
    return {
      ...r,
      groups: newGroups,
      status: roundDone ? ('finished' as const) : r.status,
    };
  });

  return {
    tournament: {
      ...tournament,
      rounds: updatedRounds,
    },
    applied: true,
    reason: 'applied',
  };
}

// ============================================================================
// Progressão entre Rodadas
// ============================================================================

export function advanceTournamentRound(tournament: Tournament, nowMs: number): Tournament {
  if (tournament.status !== 'running') {
    throw new Error('Torneio não está em execução.');
  }
  const currentRound = tournament.rounds[tournament.rounds.length - 1];
  if (!currentRound) {
    throw new Error('Torneio não possui nenhuma rodada.');
  }
  const unfinished = currentRound.groups.filter((g) => g.status !== 'finished');
  if (unfinished.length > 0) {
    throw new Error('Ainda existem mesas/confrontos pendentes na rodada atual.');
  }

  const advancing = Array.from(new Set(currentRound.groups.flatMap((g) => g.advancingEntryIds)));
  if (advancing.length === 0) {
    throw new Error('Nenhum competidor classificado na rodada atual.');
  }

  if (advancing.length === 1) {
    return {
      ...tournament,
      status: 'finished',
      finishedAt: nowMs,
      championEntryId: advancing[0],
    };
  }

  const nextRoundNum = currentRound.roundNumber + 1;
  let nextGroups: TournamentGroup[];
  if (tournament.config.modality === 'doubles') {
    nextGroups = createDoublesRoundBracket(
      advancing,
      tournament.config.bestOf ?? 3,
      nextRoundNum,
      tournament.config.seed !== undefined ? tournament.config.seed + nextRoundNum : undefined
    );
  } else {
    nextGroups = createIndividualRoundGroups(
      advancing,
      tournament.config.gamesPerGroup ?? 3,
      tournament.config.advancePerGroup ?? 1,
      nextRoundNum,
      tournament.config.seed !== undefined ? tournament.config.seed + nextRoundNum : undefined
    );
  }

  const nextRound: TournamentRound = {
    roundNumber: nextRoundNum,
    label: getRoundLabel(
      tournament.config.modality,
      nextRoundNum,
      nextGroups.length,
      nextGroups.reduce((acc, g) => acc + (g.rule.type === 'series' ? 1 : g.rule.advance), 0)
    ),
    groups: nextGroups,
    status: 'playing',
  };

  return {
    ...tournament,
    rounds: [...tournament.rounds, nextRound],
  };
}

// ============================================================================
// Seção 7: Desconexões, Reconexão no Prazo, Desistência e W.O.
// ============================================================================

export function handleSeatDisconnect(
  seats: readonly TournamentSeatState[],
  userId: string,
  nowMs: number,
  reconnectGraceMs: number
): TournamentSeatState[] {
  return seats.map((s) => {
    if (s.userId !== userId) return s;
    if (s.connectionStatus === 'wo' || s.connectionStatus === 'left') return s;
    return {
      ...s,
      connectionStatus: 'disconnected',
      disconnectedAt: s.disconnectedAt ?? nowMs,
      reconnectionDeadlineAt: s.reconnectionDeadlineAt ?? nowMs + reconnectGraceMs,
    };
  });
}

export function handleSeatReconnect(
  seats: readonly TournamentSeatState[],
  userId: string,
  nowMs: number
): { seats: TournamentSeatState[]; reconnected: boolean; reason?: 'already_wo' | 'deadline_expired' | 'not_found' } {
  const target = seats.find((s) => s.userId === userId);
  if (!target) return { seats: [...seats], reconnected: false, reason: 'not_found' };
  if (target.connectionStatus === 'wo' || target.connectionStatus === 'left') {
    return { seats: [...seats], reconnected: false, reason: 'already_wo' };
  }
  if (target.reconnectionDeadlineAt !== undefined && nowMs > target.reconnectionDeadlineAt) {
    return { seats: [...seats], reconnected: false, reason: 'deadline_expired' };
  }

  return {
    seats: seats.map((s) =>
      s.userId === userId
        ? {
            ...s,
            connectionStatus: 'connected',
            disconnectedAt: undefined,
            reconnectionDeadlineAt: undefined,
          }
        : s
    ),
    reconnected: true,
  };
}

export function handleExplicitLeave(
  seats: readonly TournamentSeatState[],
  modality: TournamentModality,
  userId: string
): SeatEvaluationOutcome {
  const newlyForfeited = new Set<string>(
    seats
      .filter((s) => s.userId === userId && s.connectionStatus !== 'wo' && s.connectionStatus !== 'left')
      .map((s) => s.entryId)
  );
  const updatedSeats = seats.map((s) =>
    s.userId === userId && s.connectionStatus !== 'wo' && s.connectionStatus !== 'left'
      ? {
          ...s,
          connectionStatus: 'wo' as const,
          woReason: 'explicit_leave',
        }
      : s
  );
  return summarizeSeatOutcome(updatedSeats, modality, newlyForfeited);
}

export function evaluateSeatTimeouts(
  seats: readonly TournamentSeatState[],
  modality: TournamentModality,
  nowMs: number
): SeatEvaluationOutcome {
  const newlyForfeited = new Set<string>();
  const updatedSeats = seats.map((s) => {
    if (
      s.connectionStatus === 'disconnected' &&
      s.reconnectionDeadlineAt !== undefined &&
      nowMs >= s.reconnectionDeadlineAt
    ) {
      newlyForfeited.add(s.entryId);
      return {
        ...s,
        connectionStatus: 'wo' as const,
        woReason: 'reconnect_timeout',
      };
    }
    return s;
  });

  return summarizeSeatOutcome(updatedSeats, modality, newlyForfeited);
}

function summarizeSeatOutcome(
  seats: TournamentSeatState[],
  modality: TournamentModality,
  newlyForfeitedEntries: Set<string>
): SeatEvaluationOutcome {
  const woEntrySet = new Set(
    seats.filter((s) => s.connectionStatus === 'wo' || s.connectionStatus === 'left').map((s) => s.entryId)
  );
  const allEntries = Array.from(new Set(seats.map((s) => s.entryId)));
  const activeEntryIds = allEntries.filter((eid) => !woEntrySet.has(eid));
  const allWoEntryIds = Array.from(woEntrySet);

  if (modality === 'doubles') {
    if (activeEntryIds.length === 1 && allEntries.length === 2) {
      return {
        seats,
        newlyForfeitedEntryIds: Array.from(newlyForfeitedEntries),
        activeEntryIds,
        allWoEntryIds,
        action: 'award_wo',
        winnerEntryId: activeEntryIds[0],
      };
    }
    if (activeEntryIds.length === 0) {
      return {
        seats,
        newlyForfeitedEntryIds: Array.from(newlyForfeitedEntries),
        activeEntryIds,
        allWoEntryIds,
        action: 'void_insufficient_players',
      };
    }
    return {
      seats,
      newlyForfeitedEntryIds: Array.from(newlyForfeitedEntries),
      activeEntryIds,
      allWoEntryIds,
      action: 'continue_match',
    };
  }

  // Modalidade Individual (3 ou 4 jogadores na mesa; se restarem < 2 ativos, anula/intervenção)
  if (activeEntryIds.length < 2) {
    return {
      seats,
      newlyForfeitedEntryIds: Array.from(newlyForfeitedEntries),
      activeEntryIds,
      allWoEntryIds,
      action: 'void_insufficient_players',
    };
  }

  return {
    seats,
    newlyForfeitedEntryIds: Array.from(newlyForfeitedEntries),
    activeEntryIds,
    allWoEntryIds,
    action: 'continue_match',
  };
}

// ============================================================================
// Seção 10: Recuperação Após Reinicialização do Servidor
// ============================================================================

export function recoverTournamentAfterRestart(
  tournament: Tournament,
  activeRoomIds: ReadonlySet<string>
): { tournament: Tournament; affectedGameIds: string[] } {
  if (tournament.status !== 'running') {
    return { tournament, affectedGameIds: [] };
  }

  const affectedGameIds: string[] = [];

  const updatedRounds = tournament.rounds.map((round) => {
    const updatedGroups = round.groups.map((group) => {
      let groupAffected = false;
      const updatedGames = group.games.map((game) => {
        const roomAlive = !!game.roomId && activeRoomIds.has(game.roomId);
        if (game.status === 'playing' && !roomAlive) {
          affectedGameIds.push(game.id);
          groupAffected = true;
          return {
            ...game,
            status: 'needs_intervention' as const,
            resultReason: 'server_restart' as const,
          };
        }
        return game;
      });

      return groupAffected
        ? { ...group, status: 'needs_intervention' as const, games: updatedGames }
        : group;
    });

    return { ...round, groups: updatedGroups };
  });

  if (affectedGameIds.length === 0) {
    return { tournament, affectedGameIds };
  }

  return {
    tournament: {
      ...tournament,
      status: 'paused',
      pauseReason: `Servidor reiniciado com ${affectedGameIds.length} partida(s) em andamento sem sala recuperável. Aguardando decisão administrativa.`,
      rounds: updatedRounds,
    },
    affectedGameIds,
  };
}

function hasAnyPendingIntervention(tournament: Tournament): boolean {
  return tournament.rounds.some((r) =>
    r.groups.some(
      (g) => g.status === 'needs_intervention' || g.games.some((gm) => gm.status === 'needs_intervention')
    )
  );
}

export function resumeTournament(tournament: Tournament): Tournament {
  if (tournament.status !== 'paused') {
    return tournament;
  }
  if (hasAnyPendingIntervention(tournament)) {
    throw new Error('Ainda existem partidas ou mesas aguardando intervenção administrativa.');
  }
  return {
    ...tournament,
    status: 'running',
    pauseReason: undefined,
  };
}

export function resolveGameByAdmin(
  tournament: Tournament,
  gameId: string,
  eventId: string,
  resolution: { type: 'award_winner'; winnerEntryId: string } | { type: 'void_and_replay' },
  resolvedAt: number
): Tournament {
  let nextTournament: Tournament;

  if (resolution.type === 'award_winner') {
    const outcome = recordGameResult(
      tournament,
      {
        gameId,
        eventId,
        winnerEntryId: resolution.winnerEntryId,
        resultReason: 'admin_decision',
        finishedAt: resolvedAt,
      },
      tournament.config.tieBreakerPolicy
    );
    if (!outcome.applied) {
      throw new Error(`Não foi possível aplicar decisão administrativa: ${outcome.reason}`);
    }
    nextTournament = outcome.tournament;
  } else {
    // void_and_replay: marca jogo quebrado como void e cria um jogo substituto 'pending'
    const updatedRounds = tournament.rounds.map((round) => ({
      ...round,
      groups: round.groups.map((group) => {
        const target = group.games.find((g) => g.id === gameId);
        if (!target) return group;
        const nextNum = group.games.length + 1;
        const replacement: TournamentGame = {
          id: `${group.id}_G${nextNum}_REPLAY`,
          roundNumber: group.roundNumber,
          groupId: group.id,
          gameNumber: nextNum,
          participantEntryIds: [...group.activeEntryIds],
          status: 'pending',
          woEntryIds: [],
          processedEventIds: [],
        };
        return {
          ...group,
          status: 'waiting' as const,
          games: [
            ...group.games.map((g) =>
              g.id === gameId
                ? {
                    ...g,
                    status: 'void' as const,
                    resultReason: 'server_restart' as const,
                    finishedAt: resolvedAt,
                    processedEventIds: [...g.processedEventIds, eventId],
                  }
                : g
            ),
            replacement,
          ],
        };
      }),
    }));

    nextTournament = {
      ...tournament,
      rounds: updatedRounds,
    };
  }

  if (
    nextTournament.status === 'paused' &&
    nextTournament.pauseReason?.startsWith('Servidor reiniciado') &&
    !hasAnyPendingIntervention(nextTournament)
  ) {
    return resumeTournament(nextTournament);
  }

  return nextTournament;
}

// ============================================================================
// Seção 11: Simulação Pré-Início
// ============================================================================

export function simulateTournament(config: TournamentConfig, entryCount: number): TournamentSimulation {
  const validation = validateTournamentConfig(config);
  const errors = [...validation.errors];
  const warnings: string[] = [];

  if (!Number.isInteger(entryCount) || entryCount < 2) {
    errors.push('É necessário ter pelo menos 2 inscritos para simular um torneio.');
  }
  if (config.modality === 'individual' && entryCount === 5) {
    warnings.push('Com 5 inscritos, uma mesa terá 3 jogadores e outra terá 2 jogadores (inevitável).');
  }

  const avgMinutes =
    config.historicalAvgGameMinutes && config.historicalAvgGameMinutes > 0
      ? config.historicalAvgGameMinutes
      : config.defaultEstimatedGameMinutes && config.defaultEstimatedGameMinutes > 0
        ? config.defaultEstimatedGameMinutes
        : 4;
  const estimationPrecision: 'historical' | 'low_estimate' =
    config.historicalAvgGameMinutes && config.historicalAvgGameMinutes > 0 ? 'historical' : 'low_estimate';

  if (estimationPrecision === 'low_estimate') {
    warnings.push(
      'Estimativa de duração com baixa precisão: baseada em tempo médio configurável (sem histórico suficiente).'
    );
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings,
      entryCount,
      modality: config.modality,
      rounds: [],
      totalRounds: 0,
      totalMatchesMin: 0,
      totalMatchesMax: 0,
      estimatedMinutesMin: 0,
      estimatedMinutesMax: 0,
      estimationPrecision,
    };
  }

  const rounds: SimulationRoundSummary[] = [];
  let remaining = entryCount;
  let roundNumber = 1;
  let totalMin = 0;
  let totalMax = 0;

  while (remaining > 1 && roundNumber <= 20) {
    if (config.modality === 'doubles') {
      const bestOf = config.bestOf ?? 3;
      const winsNeeded = Math.floor(bestOf / 2) + 1;
      let nextPow2 = 1;
      while (nextPow2 < remaining) nextPow2 *= 2;
      const byes = nextPow2 - remaining;
      const matches = (remaining - byes) / 2;
      const tableSizes = Array.from({ length: matches }, () => 2);
      const minGames = matches * winsNeeded;
      const maxGames = matches * bestOf;
      const advancing = matches + byes;

      rounds.push({
        roundNumber,
        label: getRoundLabel('doubles', roundNumber, matches + byes, advancing),
        groupsCount: matches,
        tableSizes,
        byesCount: byes,
        minGames,
        maxGames,
        advancingCount: advancing,
      });

      totalMin += minGames;
      totalMax += maxGames;
      remaining = advancing;
    } else {
      const sizes = computeIndividualTableSizes(remaining);
      const gamesPerGroup = config.gamesPerGroup ?? 3;
      const advance = sizes.length === 1 ? 1 : (config.advancePerGroup ?? 1);
      const advancing = sizes.reduce((sum, sz) => sum + (sz <= 2 ? 1 : advance), 0);
      const minGames = sizes.length * gamesPerGroup;
      // Possível 1 partida extra por mesa em caso de empate no corte
      const maxGames = config.tieBreakerPolicy === 'extra_match' ? minGames + sizes.length : minGames;

      rounds.push({
        roundNumber,
        label: getRoundLabel('individual', roundNumber, sizes.length, advancing),
        groupsCount: sizes.length,
        tableSizes: sizes,
        byesCount: 0,
        minGames,
        maxGames,
        advancingCount: advancing,
      });

      totalMin += minGames;
      totalMax += maxGames;
      remaining = advancing;
    }
    roundNumber++;
  }

  // Em paralelo por rodada: duração aproximada segue soma de séries por rodada (1 rodada = ~max jogos de 1 mesa)
  let estMin = 0;
  let estMax = 0;
  for (const r of rounds) {
    if (config.modality === 'doubles') {
      const bestOf = config.bestOf ?? 3;
      const winsNeeded = Math.floor(bestOf / 2) + 1;
      estMin += winsNeeded * avgMinutes;
      estMax += bestOf * avgMinutes;
    } else {
      const gamesPerGroup = config.gamesPerGroup ?? 3;
      estMin += gamesPerGroup * avgMinutes;
      estMax += (gamesPerGroup + (config.tieBreakerPolicy === 'extra_match' ? 1 : 0)) * avgMinutes;
    }
  }

  return {
    isValid: true,
    errors,
    warnings,
    entryCount,
    modality: config.modality,
    rounds,
    totalRounds: rounds.length,
    totalMatchesMin: totalMin,
    totalMatchesMax: totalMax,
    estimatedMinutesMin: Math.round(estMin),
    estimatedMinutesMax: Math.round(estMax),
    estimationPrecision,
  };
}
