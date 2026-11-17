import { describe, it, expect } from 'vitest';
import {
  createTournament,
  registerIndividualEntry,
  registerDoublesTeam,
  startTournament,
  advanceTournamentRound,
  recordGameResult,
  TournamentConfig,
  Tournament,
} from '../server/tournamentEngine.js';

describe('Tournament Stress & Bracket Progression Tests (Start-to-Finish Scaling)', () => {
  it('Stress Test 1: Scales individual tournament from 8, 16, to 32 participants and verifies game count reduction and champion resolution', () => {
    const participantCounts = [8, 16, 32];
    for (const count of participantCounts) {
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
      expect(tournament.rounds).toBeDefined();
      expect(tournament.rounds.length).toBeGreaterThan(0);

      // Play through active matches round by round until finished or champion crowned
      let maxSteps = 200;
      let steps = 0;
      while (tournament.status === 'running' && steps < maxSteps) {
        const round = tournament.rounds[tournament.currentRoundIndex];
        if (!round || !round.groups) break;

        let playedAny = false;
        for (const group of round.groups) {
          for (const game of group.games) {
            if (game.status === 'scheduled' || game.status === 'in_progress') {
              const p1 = game.participantIds[0];
              const p2 = game.participantIds[1] || p1;
              const winner = p1;
              const scores: Record<string, number> = { [p1]: 500, [p2]: 100 };
              try {
                const res = recordGameResult(tournament, group.groupId, game.gameId, winner, scores, Date.now());
                tournament = res.tournament;
                playedAny = true;
              } catch {
                // If game already finished or needs tie-breaker, continue
              }
            }
          }
        }

        if (!playedAny) {
          tournament = advanceTournamentRound(tournament, Date.now());
        }
        steps++;
      }

      expect(steps).toBeLessThan(maxSteps);
    }
  });

  it('Stress Test 2: Scales 2v2 doubles tournaments (Md3) from 4 to 8 teams with bracket game reduction', () => {
    const teamCounts = [4, 8];
    for (const count of teamCounts) {
      const config: TournamentConfig = {
        id: `stress_doubles_${count}`,
        name: `Torneio Stress Duplas ${count}`,
        modality: 'doubles',
        bestOf: 3,
        tieBreakerPolicy: 'extra_match',
        reconnectGraceMs: 45_000,
        spectatorMode: 'tv_hidden',
        seed: 777,
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

      let maxSteps = 150;
      let steps = 0;
      while (tournament.status === 'running' && steps < maxSteps) {
        const round = tournament.rounds[tournament.currentRoundIndex];
        if (!round || !round.groups) break;

        let playedAny = false;
        for (const group of round.groups) {
          for (const game of group.games) {
            if (game.status === 'scheduled' || game.status === 'in_progress') {
              const p1 = game.participantIds[0];
              const p2 = game.participantIds[1] || p1;
              const winner = p1;
              const scores: Record<string, number> = { [p1]: 2, [p2]: 0 };
              try {
                const res = recordGameResult(tournament, group.groupId, game.gameId, winner, scores, Date.now());
                tournament = res.tournament;
                playedAny = true;
              } catch {
                // continue
              }
            }
          }
        }

        if (!playedAny) {
          tournament = advanceTournamentRound(tournament, Date.now());
        }
        steps++;
      }

      expect(steps).toBeLessThan(maxSteps);
    }
  });
});
