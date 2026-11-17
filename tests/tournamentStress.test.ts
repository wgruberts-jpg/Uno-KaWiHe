import { describe, it, expect } from 'vitest';
import {
  createTournament,
  registerIndividualEntry,
  registerDoublesTeam,
  startTournament,
  advanceTournamentRound,
  recordGameResult,
  rankIndividualGroupEntries,
  createTieBreakerGame,
  TournamentConfig,
  Tournament,
} from '../server/tournamentEngine.js';

function simulateTournamentToCompletion(
  initialTournament: Tournament,
  maxSteps: number
): {
  tournament: Tournament;
  steps: number;
  gamesPlayed: number;
  tieBreakersCreated: number;
} {
  let tournament = initialTournament;
  let steps = 0;
  let gamesPlayed = 0;
  let tieBreakersCreated = 0;

  while (tournament.status === 'running' && steps < maxSteps) {
    const roundIdx = tournament.rounds.length - 1;
    const round = tournament.rounds[roundIdx];
    expect(round).toBeDefined();

    // 1. Se houver mesa aguardando desempate, gera a partida extra oficial
    const tbGroupIdx = round.groups.findIndex((g) => g.status === 'tiebreaker_required');
    if (tbGroupIdx !== -1) {
      const tbGroup = round.groups[tbGroupIdx];
      const classification = rankIndividualGroupEntries(tbGroup, tournament.config.tieBreakerPolicy);
      expect(classification.status).toBe('tiebreaker_required');
      const updatedGroup = createTieBreakerGame(tbGroup, classification.tiedEntryIds);
      tournament = {
        ...tournament,
        rounds: tournament.rounds.map((r, rIdx) =>
          rIdx === roundIdx
            ? {
                ...r,
                groups: r.groups.map((g, gIdx) => (gIdx === tbGroupIdx ? updatedGroup : g)),
              }
            : r
        ),
      };
      tieBreakersCreated++;
      steps++;
      continue;
    }

    // 2. Executa o próximo jogo pendente/em andamento na rodada atual
    let nextGameId: string | null = null;
    let nextWinnerId: string | null = null;
    for (const group of round.groups) {
      const activeGame = group.games.find((gm) => gm.status === 'pending' || gm.status === 'playing');
      if (activeGame) {
        nextGameId = activeGame.id;
        nextWinnerId = activeGame.participantEntryIds[0];
        break;
      }
    }

    if (nextGameId && nextWinnerId) {
      const outcome = recordGameResult(tournament, {
        gameId: nextGameId,
        eventId: `stress_evt_${steps}_${nextGameId}`,
        winnerEntryId: nextWinnerId,
        resultReason: 'normal',
        roundPointsWon: 250,
        finishedAt: Date.now() + steps,
      });
      expect(outcome.applied).toBe(true);
      tournament = outcome.tournament;
      gamesPlayed++;
      steps++;
      continue;
    }

    // 3. Todos os grupos da rodada concluídos -> avança para próxima rodada ou coroa campeão
    const allFinished = round.groups.every((g) => g.status === 'finished');
    expect(allFinished).toBe(true);
    tournament = advanceTournamentRound(tournament, Date.now() + steps);
    steps++;
  }

  return { tournament, steps, gamesPlayed, tieBreakersCreated };
}

describe('Tournament Stress & Bracket Progression Tests (Start-to-Finish Scaling)', () => {
  it('Stress Test 1: Scales individual tournament from 8, 16, to 32 participants and verifies tiebreakers, round reduction, and champion resolution', () => {
    const scenarios = [
      { count: 8, expectedRounds: 2 },
      { count: 16, expectedRounds: 3 },
      { count: 32, expectedRounds: 4 },
    ];

    for (const { count, expectedRounds } of scenarios) {
      const config: TournamentConfig = {
        id: `stress_ind_${count}`,
        name: `Torneio Stress Individual ${count}`,
        modality: 'individual',
        gamesPerGroup: 2,
        advancePerGroup: 2,
        tieBreakerPolicy: 'extra_match',
        reconnectGraceMs: 45_000,
        spectatorMode: 'table_only',
        seed: 123 + count,
      };

      let tournament = createTournament(config, 'admin_1', Date.now());
      for (let i = 1; i <= count; i++) {
        tournament = registerIndividualEntry(tournament, `usr_${count}_${i}`, `Jogador ${i}`).tournament;
      }

      tournament = startTournament(tournament, Date.now());
      expect(tournament.status).toBe('running');
      expect(tournament.rounds.length).toBe(1);

      const sim = simulateTournamentToCompletion(tournament, 250);
      expect(sim.steps).toBeLessThan(250);
      expect(sim.gamesPlayed).toBeGreaterThan(0);
      expect(sim.tieBreakersCreated).toBeGreaterThan(0);
      expect(sim.tournament.status).toBe('finished');
      expect(sim.tournament.championEntryId).toBeTruthy();
      expect(sim.tournament.rounds).toHaveLength(expectedRounds);

      const firstRoundGroups = sim.tournament.rounds[0].groups.length;
      const finalRoundGroups = sim.tournament.rounds[sim.tournament.rounds.length - 1].groups.length;
      expect(firstRoundGroups).toBeGreaterThan(finalRoundGroups);
      expect(finalRoundGroups).toBe(1);
    }
  });

  it('Stress Test 2: Scales 2v2 doubles tournaments (Md3) from 4 to 8 teams with early clinch and bracket progression', () => {
    const scenarios = [
      { count: 4, expectedRounds: 2 },
      { count: 8, expectedRounds: 3 },
    ];

    for (const { count, expectedRounds } of scenarios) {
      const config: TournamentConfig = {
        id: `stress_doubles_${count}`,
        name: `Torneio Stress Duplas ${count}`,
        modality: 'doubles',
        bestOf: 3,
        tieBreakerPolicy: 'extra_match',
        reconnectGraceMs: 45_000,
        spectatorMode: 'tv_hidden',
        seed: 777 + count,
      };

      let tournament = createTournament(config, 'admin_1', Date.now());
      for (let i = 1; i <= count; i++) {
        const teamId = `team_${count}_${i}`;
        const u1 = `u_${count}_${i}_a`;
        const u2 = `u_${count}_${i}_b`;
        tournament = registerDoublesTeam(tournament, teamId, `Equipe ${i}`, [u1, u2]).tournament;
      }

      tournament = startTournament(tournament, Date.now());
      expect(tournament.status).toBe('running');

      const sim = simulateTournamentToCompletion(tournament, 150);
      expect(sim.steps).toBeLessThan(150);
      expect(sim.gamesPlayed).toBeGreaterThan(0);
      expect(sim.tournament.status).toBe('finished');
      expect(sim.tournament.championEntryId).toBeTruthy();
      expect(sim.tournament.rounds).toHaveLength(expectedRounds);

      const earlyClinchGames = sim.tournament.rounds
        .flatMap((r) => r.groups)
        .flatMap((g) => g.games)
        .filter((gm) => gm.status === 'void' && gm.resultReason === 'early_clinch');
      expect(earlyClinchGames.length).toBeGreaterThan(0);
    }
  });
});
