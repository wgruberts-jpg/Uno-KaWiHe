import { describe, it, expect } from 'vitest';
import {
  assertTournamentAdmin,
  validateTournamentConfig,
  createTournament,
  registerIndividualEntry,
  registerDoublesTeam,
  updateDoublesTeamMembers,
  computeIndividualTableSizes,
  distributeIndividualEntries,
  createDoublesRoundBracket,
  createIndividualRoundGroups,
  startTournament,
  rankIndividualGroupEntries,
  createTieBreakerGame,
  recordGameResult,
  advanceTournamentRound,
  handleSeatDisconnect,
  handleSeatReconnect,
  handleExplicitLeave,
  evaluateSeatTimeouts,
  recoverTournamentAfterRestart,
  resumeTournament,
  resolveGameByAdmin,
  simulateTournament,
  TournamentConfig,
  TournamentSeatState,
} from '../server/tournamentEngine.js';

function makeIndividualConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    id: 't_ind_1',
    name: 'Torneio Individual Teste',
    modality: 'individual',
    gamesPerGroup: 3,
    advancePerGroup: 1,
    tieBreakerPolicy: 'extra_match',
    reconnectGraceMs: 45_000,
    spectatorMode: 'table_only',
    seed: 42,
    ...overrides,
  };
}

function makeDoublesConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    id: 't_dup_1',
    name: 'Torneio Duplas Teste',
    modality: 'doubles',
    bestOf: 3,
    tieBreakerPolicy: 'extra_match',
    reconnectGraceMs: 45_000,
    spectatorMode: 'tv_hidden',
    seed: 99,
    ...overrides,
  };
}

describe('Tournament Engine Pure Domain Tests (Etapa 2)', () => {
  // --------------------------------------------------------------------------
  // 1. Permissões, Configuração e Congelamento de Equipes
  // --------------------------------------------------------------------------
  describe('1. Permissões Admin, Validação de Config e Equipes', () => {
    it('permite criação/gestão apenas para role === "admin" e bloqueia player/visitor/undefined', () => {
      expect(assertTournamentAdmin('admin').allowed).toBe(true);
      expect(assertTournamentAdmin('player').allowed).toBe(false);
      expect(assertTournamentAdmin('visitor').allowed).toBe(false);
      expect(assertTournamentAdmin(undefined).allowed).toBe(false);
      expect(assertTournamentAdmin(null).allowed).toBe(false);
    });

    it('valida séries ímpares (1, 3, 5) em duplas e rejeita série par', () => {
      expect(validateTournamentConfig(makeDoublesConfig({ bestOf: 1 })).valid).toBe(true);
      expect(validateTournamentConfig(makeDoublesConfig({ bestOf: 3 })).valid).toBe(true);
      expect(validateTournamentConfig(makeDoublesConfig({ bestOf: 5 })).valid).toBe(true);
      const invalidEven = validateTournamentConfig(makeDoublesConfig({ bestOf: 2 as unknown as 3 }));
      expect(invalidEven.valid).toBe(false);
      expect(invalidEven.errors.length).toBeGreaterThan(0);
    });

    it('rejeita configuração individual inválida (advance != 1|2, games < 1, reconnectGraceMs < 5000)', () => {
      const res = validateTournamentConfig(
        makeIndividualConfig({ gamesPerGroup: 0, advancePerGroup: 3 as unknown as 1, reconnectGraceMs: 1000 })
      );
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBe(3);
    });

    it('garante equipe 2v2 com exatamente 2 usuários distintos e sem repetição entre equipes', () => {
      let t = createTournament(makeDoublesConfig(), 'admin_1', 1000);
      t = registerDoublesTeam(t, 'team_a', 'Alfa', ['u1', 'u2']).tournament;

      expect(() => registerDoublesTeam(t, 'team_same', 'Duplicado', ['u3', 'u3'])).toThrow();
      expect(() => registerDoublesTeam(t, 'team_reuse', 'Reuso', ['u2', 'u4'])).toThrow();
      expect(() => registerDoublesTeam(t, 'team_a', 'ID Igual', ['u5', 'u6'])).toThrow();

      // Edição permitida antes do início
      t = updateDoublesTeamMembers(t, 'team_a', ['u1', 'u3']);
      expect(t.entries[0].userIds).toEqual(['u1', 'u3']);

      t = registerDoublesTeam(t, 'team_b', 'Beta', ['u4', 'u5']).tournament;
      t = startTournament(t, 2000);

      // Após início, equipes ficam congeladas e alterações são bloqueadas
      expect(t.entries.every((e) => e.frozen)).toBe(true);
      expect(() => updateDoublesTeamMembers(t, 'team_a', ['u1', 'u9'])).toThrow();
      expect(() => registerDoublesTeam(t, 'team_c', 'Gama', ['u7', 'u8'])).toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Distribuição de Mesas Individuais
  // --------------------------------------------------------------------------
  describe('2. Distribuição Individual de Mesas (Seção 5)', () => {
    it('produz exatamente os tamanhos esperados da especificação para 4 a 12 jogadores', () => {
      const expected: Record<number, number[]> = {
        4: [4],
        5: [3, 2],
        6: [3, 3],
        7: [4, 3],
        8: [4, 4],
        9: [3, 3, 3],
        10: [4, 3, 3],
        11: [4, 4, 3],
        12: [4, 4, 4],
      };

      for (const [countStr, sizes] of Object.entries(expected)) {
        const n = Number(countStr);
        expect(computeIndividualTableSizes(n)).toEqual(sizes);
      }
    });

    it('distribui 2, 3, 13, 17, 20 e 32 jogadores sem duplicados, sem perdas e respeitando 2..4 por mesa', () => {
      for (const n of [2, 3, 13, 17, 20, 32]) {
        const ids = Array.from({ length: n }, (_, i) => `p_${i + 1}`);
        const tables = distributeIndividualEntries(ids, 123);
        const flattened = tables.flat();

        expect(flattened.length).toBe(n);
        expect(new Set(flattened).size).toBe(n);
        for (const tbl of tables) {
          expect(tbl.length).toBeGreaterThanOrEqual(2);
          expect(tbl.length).toBeLessThanOrEqual(4);
        }
        if (n >= 6) {
          // Para N >= 6 nunca deve gerar mesa de 2
          expect(tables.every((tbl) => tbl.length >= 3)).toBe(true);
        }
      }
    });

    it('é determinística com a mesma seed e rejeita IDs duplicados ou < 2 participantes', () => {
      const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
      expect(distributeIndividualEntries(ids, 777)).toEqual(distributeIndividualEntries(ids, 777));
      expect(() => distributeIndividualEntries(['p1'], 1)).toThrow();
      expect(() => distributeIndividualEntries(['p1', 'p1', 'p2'], 1)).toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 3. Chaveamento e Séries de Duplas 2v2
  // --------------------------------------------------------------------------
  describe('3. Chaveamento 2v2, Byes e Séries Melhor de 1/3/5', () => {
    it('gera confrontos + byes corretos para 2, 3, 4, 5, 6, 7, 8 e 16 equipes levando à potência de 2 na rodada seguinte', () => {
      const cases = [
        { teams: 2, matches: 1, byes: 0 },
        { teams: 3, matches: 1, byes: 1 },
        { teams: 4, matches: 2, byes: 0 },
        { teams: 5, matches: 1, byes: 3 },
        { teams: 6, matches: 2, byes: 2 },
        { teams: 7, matches: 3, byes: 1 },
        { teams: 8, matches: 4, byes: 0 },
        { teams: 16, matches: 8, byes: 0 },
      ];

      for (const c of cases) {
        const ids = Array.from({ length: c.teams }, (_, i) => `team_${i + 1}`);
        const groups = createDoublesRoundBracket(ids, 3, 1, 10);
        const matchGroups = groups.filter((g) => !g.byeWinnerEntryId);
        const byeGroups = groups.filter((g) => !!g.byeWinnerEntryId);

        expect(matchGroups.length).toBe(c.matches);
        expect(byeGroups.length).toBe(c.byes);
        expect(byeGroups.every((b) => b.status === 'finished' && b.advancingEntryIds.length === 1)).toBe(true);

        // Classificados da rodada 1 somam exatamente potência de 2 (matches + byes)
        const nextRoundCount = c.matches + c.byes;
        expect((nextRoundCount & (nextRoundCount - 1)) === 0).toBe(true);
      }
    });

    it('encerra série Md3 em 2-0 e Md5 em 3-1 marcando jogos restantes como void (early_clinch)', () => {
      // Md3: 2-0 encerra imediatamente
      let t3 = createTournament(makeDoublesConfig({ bestOf: 3 }), 'admin_1', 100);
      t3 = registerDoublesTeam(t3, 'A', 'Alfa', ['u1', 'u2']).tournament;
      t3 = registerDoublesTeam(t3, 'B', 'Beta', ['u3', 'u4']).tournament;
      t3 = startTournament(t3, 200);

      const g1 = t3.rounds[0].groups[0].games[0].id;
      const g2 = t3.rounds[0].groups[0].games[1].id;
      const g3 = t3.rounds[0].groups[0].games[2].id;

      t3 = recordGameResult(t3, { gameId: g1, eventId: 'ev1', winnerEntryId: 'A', finishedAt: 300 }).tournament;
      expect(t3.rounds[0].groups[0].status).toBe('playing');

      t3 = recordGameResult(t3, { gameId: g2, eventId: 'ev2', winnerEntryId: 'A', finishedAt: 400 }).tournament;
      expect(t3.rounds[0].groups[0].status).toBe('finished');
      expect(t3.rounds[0].groups[0].winnerEntryId).toBe('A');
      expect(t3.rounds[0].groups[0].games.find((gm) => gm.id === g3)?.status).toBe('void');
      expect(t3.rounds[0].groups[0].games.find((gm) => gm.id === g3)?.resultReason).toBe('early_clinch');

      // Md5: 3-1 encerra na 4a partida
      let t5 = createTournament(makeDoublesConfig({ id: 't_md5', bestOf: 5 }), 'admin_1', 100);
      t5 = registerDoublesTeam(t5, 'A', 'Alfa', ['u1', 'u2']).tournament;
      t5 = registerDoublesTeam(t5, 'B', 'Beta', ['u3', 'u4']).tournament;
      t5 = startTournament(t5, 200);
      const md5Games = t5.rounds[0].groups[0].games;

      t5 = recordGameResult(t5, { gameId: md5Games[0].id, eventId: 'm1', winnerEntryId: 'B', finishedAt: 300 }).tournament;
      t5 = recordGameResult(t5, { gameId: md5Games[1].id, eventId: 'm2', winnerEntryId: 'A', finishedAt: 310 }).tournament;
      t5 = recordGameResult(t5, { gameId: md5Games[2].id, eventId: 'm3', winnerEntryId: 'B', finishedAt: 320 }).tournament;
      expect(t5.rounds[0].groups[0].status).toBe('playing');
      t5 = recordGameResult(t5, { gameId: md5Games[3].id, eventId: 'm4', winnerEntryId: 'B', finishedAt: 330 }).tournament;

      expect(t5.rounds[0].groups[0].status).toBe('finished');
      expect(t5.rounds[0].groups[0].winnerEntryId).toBe('B');
      expect(t5.rounds[0].groups[0].games[4].status).toBe('void');
    });

    it('conduz um torneio completo de duplas com 5 equipes (byes + rodadas) até exatamente 1 campeã', () => {
      let t = createTournament(makeDoublesConfig({ bestOf: 1, seed: undefined }), 'admin_1', 100);
      for (let i = 1; i <= 5; i++) {
        t = registerDoublesTeam(t, `T${i}`, `Equipe ${i}`, [`p${i}a`, `p${i}b`]).tournament;
      }
      t = startTournament(t, 200);
      // Rodada 1: 1 jogo (T1 vs T2) + 3 byes (T3, T4, T5) => 4 avançam
      expect(t.rounds[0].groups.filter((g) => !g.byeWinnerEntryId).length).toBe(1);
      const r1Game = t.rounds[0].groups[0].games[0];
      t = recordGameResult(t, {
        gameId: r1Game.id,
        eventId: 'r1_g1',
        winnerEntryId: r1Game.participantEntryIds[0],
        finishedAt: 300,
      }).tournament;

      // Avança para Semifinais (2 confrontos)
      t = advanceTournamentRound(t, 400);
      expect(t.rounds.length).toBe(2);
      expect(t.rounds[1].label).toBe('Semifinais');
      expect(t.rounds[1].groups.length).toBe(2);

      for (const grp of t.rounds[1].groups) {
        t = recordGameResult(t, {
          gameId: grp.games[0].id,
          eventId: `semi_${grp.id}`,
          winnerEntryId: grp.entryIds[0],
          finishedAt: 500,
        }).tournament;
      }

      // Avança para Final (1 confronto)
      t = advanceTournamentRound(t, 600);
      expect(t.rounds.length).toBe(3);
      expect(t.rounds[2].label).toBe('Final');
      const finalGroup = t.rounds[2].groups[0];
      t = recordGameResult(t, {
        gameId: finalGroup.games[0].id,
        eventId: 'final_1',
        winnerEntryId: finalGroup.entryIds[1],
        finishedAt: 700,
      }).tournament;

      // Encerra torneio com campeã
      t = advanceTournamentRound(t, 800);
      expect(t.status).toBe('finished');
      expect(t.championEntryId).toBe(finalGroup.entryIds[1]);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Classificação Individual e Política de Desempate V1
  // --------------------------------------------------------------------------
  describe('4. Classificação Individual e Desempate sem roundPointsWon', () => {
    it('classifica direto quando há vencedor isolado e NÃO usa roundPointsWon para desempatar na V1', () => {
      let t = createTournament(
        makeIndividualConfig({ gamesPerGroup: 2, advancePerGroup: 1, seed: undefined }),
        'admin_1',
        100
      );
      for (const id of ['p1', 'p2', 'p3', 'p4']) {
        t = registerIndividualEntry(t, id, id).tournament;
      }
      t = startTournament(t, 200);
      const games = t.rounds[0].groups[0].games;

      // p1 vence com 20 roundPointsWon; p2 vence com 95 roundPointsWon
      t = recordGameResult(t, {
        gameId: games[0].id,
        eventId: 'ev_1',
        winnerEntryId: 'entry_p1',
        roundPointsWon: 20,
        finishedAt: 300,
      }).tournament;
      t = recordGameResult(t, {
        gameId: games[1].id,
        eventId: 'ev_2',
        winnerEntryId: 'entry_p2',
        roundPointsWon: 95,
        finishedAt: 400,
      }).tournament;

      const group = t.rounds[0].groups[0];
      // Mesmo com 95 vs 20 pontos informativos, V1 exige partida extra e NÃO promove entry_p2
      expect(group.status).toBe('tiebreaker_required');
      const check = rankIndividualGroupEntries(group, 'extra_match');
      expect(check.status).toBe('tiebreaker_required');
      expect(check.tiedEntryIds).toEqual(['entry_p1', 'entry_p2']);
      expect(check.standings.find((s) => s.entryId === 'entry_p2')?.informationalPointsWon).toBe(95);
    });

    it('não dispara desempate quando empate está fora da linha de corte (advance=2 e 2 líderes empatados)', () => {
      // 8 jogadores => 2 mesas de 4; advance=2
      let t = createTournament(
        makeIndividualConfig({ gamesPerGroup: 2, advancePerGroup: 2, seed: undefined }),
        'admin_1',
        100
      );
      for (let i = 1; i <= 8; i++) {
        t = registerIndividualEntry(t, `p${i}`, `P${i}`).tournament;
      }
      t = startTournament(t, 200);
      const g = t.rounds[0].groups[0];

      t = recordGameResult(t, {
        gameId: g.games[0].id,
        eventId: 'g1',
        winnerEntryId: g.entryIds[0],
        finishedAt: 300,
      }).tournament;
      t = recordGameResult(t, {
        gameId: g.games[1].id,
        eventId: 'g2',
        winnerEntryId: g.entryIds[1],
        finishedAt: 310,
      }).tournament;

      const updatedGroup = t.rounds[0].groups[0];
      expect(updatedGroup.status).toBe('finished');
      expect(updatedGroup.advancingEntryIds).toEqual([g.entryIds[0], g.entryIds[1]]);
    });

    it('resolve desempate com createTieBreakerGame e trata empate triplo por 2 vagas em 2 desempates se preciso', () => {
      // 8 jogadores => mesa 1 tem 4 jogadores, games=3, advance=2
      let t = createTournament(
        makeIndividualConfig({ gamesPerGroup: 3, advancePerGroup: 2, seed: undefined }),
        'admin_1',
        100
      );
      for (let i = 1; i <= 8; i++) {
        t = registerIndividualEntry(t, `p${i}`, `P${i}`).tournament;
      }
      t = startTournament(t, 200);
      const grp = t.rounds[0].groups[0];
      const [a, b, c] = grp.entryIds;

      // 3 jogadores vencem 1 jogo cada -> empate triplo para 2 vagas!
      t = recordGameResult(t, { gameId: grp.games[0].id, eventId: 'e1', winnerEntryId: a, finishedAt: 300 }).tournament;
      t = recordGameResult(t, { gameId: grp.games[1].id, eventId: 'e2', winnerEntryId: b, finishedAt: 310 }).tournament;
      t = recordGameResult(t, { gameId: grp.games[2].id, eventId: 'e3', winnerEntryId: c, finishedAt: 320 }).tournament;

      expect(t.rounds[0].groups[0].status).toBe('tiebreaker_required');

      // 1o desempate entre a, b, c -> 'b' vence e garante vaga #1; 'a' e 'c' continuam empatados pela vaga #2
      const tb1Group = createTieBreakerGame(t.rounds[0].groups[0], [a, b, c]);
      t = {
        ...t,
        rounds: t.rounds.map((r, idx) =>
          idx === 0 ? { ...r, groups: r.groups.map((g, gi) => (gi === 0 ? tb1Group : g)) } : r
        ),
      };
      const tb1GameId = tb1Group.games[tb1Group.games.length - 1].id;
      t = recordGameResult(t, { gameId: tb1GameId, eventId: 'tb1', winnerEntryId: b, finishedAt: 400 }).tournament;

      const afterTb1 = rankIndividualGroupEntries(t.rounds[0].groups[0]);
      expect(afterTb1.status).toBe('tiebreaker_required');
      expect(afterTb1.advancingEntryIds).toEqual([b]);
      expect(afterTb1.tiedEntryIds).toEqual([a, c]);

      // 2o desempate entre 'a' e 'c' -> 'c' vence e fecha os 2 classificados [b, c]
      const tb2Group = createTieBreakerGame(t.rounds[0].groups[0], afterTb1.tiedEntryIds);
      t = {
        ...t,
        rounds: t.rounds.map((r, idx) =>
          idx === 0 ? { ...r, groups: r.groups.map((g, gi) => (gi === 0 ? tb2Group : g)) } : r
        ),
      };
      const tb2GameId = tb2Group.games[tb2Group.games.length - 1].id;
      t = recordGameResult(t, { gameId: tb2GameId, eventId: 'tb2', winnerEntryId: c, finishedAt: 500 }).tournament;

      expect(t.rounds[0].groups[0].status).toBe('finished');
      expect(t.rounds[0].groups[0].advancingEntryIds).toEqual([b, c]);
    });

    it('envia empate para needs_intervention quando tieBreakerPolicy === "admin_decision" e não inventa vencedor sem resultados', () => {
      const groups = createIndividualRoundGroups(['A', 'B', 'C', 'D'], 2, 1, 1);
      // Antes de jogar: insufficient_results
      expect(rankIndividualGroupEntries(groups[0]).status).toBe('insufficient_results');

      let t = createTournament(
        makeIndividualConfig({ gamesPerGroup: 2, advancePerGroup: 1, tieBreakerPolicy: 'admin_decision', seed: undefined }),
        'admin_1',
        100
      );
      for (const id of ['A', 'B', 'C', 'D']) {
        t = registerIndividualEntry(t, id, id).tournament;
      }
      t = startTournament(t, 200);
      const gm = t.rounds[0].groups[0].games;
      t = recordGameResult(t, { gameId: gm[0].id, eventId: 'x1', winnerEntryId: 'entry_A', finishedAt: 300 }).tournament;
      t = recordGameResult(t, { gameId: gm[1].id, eventId: 'x2', winnerEntryId: 'entry_B', finishedAt: 310 }).tournament;

      expect(t.rounds[0].groups[0].status).toBe('needs_intervention');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Idempotência, Desconexões, Reconexão no Prazo, W.O. e Reinício
  // --------------------------------------------------------------------------
  describe('5. Idempotência, W.O., Reconexão e Recuperação de Reinício (Req. 4B)', () => {
    it('garante idempotência (eventId duplicado), rejeita resultado duplicado em partida encerrada e vencedor com W.O.', () => {
      let t = createTournament(makeDoublesConfig({ bestOf: 3 }), 'admin_1', 100);
      t = registerDoublesTeam(t, 'A', 'Alfa', ['u1', 'u2']).tournament;
      t = registerDoublesTeam(t, 'B', 'Beta', ['u3', 'u4']).tournament;
      t = startTournament(t, 200);

      const game1 = t.rounds[0].groups[0].games[0].id;
      const game2 = t.rounds[0].groups[0].games[1].id;

      const first = recordGameResult(t, { gameId: game1, eventId: 'evt_dup', winnerEntryId: 'A', finishedAt: 300 });
      expect(first.applied).toBe(true);
      t = first.tournament;

      // Mesmo eventId ignorado idempotentemente
      const dup = recordGameResult(t, { gameId: game1, eventId: 'evt_dup', winnerEntryId: 'A', finishedAt: 305 });
      expect(dup.applied).toBe(false);
      expect(dup.reason).toBe('duplicate_event');

      // Outro eventId no mesmo jogo já finalizado
      const alreadyDone = recordGameResult(t, { gameId: game1, eventId: 'evt_new', winnerEntryId: 'B', finishedAt: 310 });
      expect(alreadyDone.applied).toBe(false);
      expect(alreadyDone.reason).toBe('game_already_finalized');

      // Vencedor listado em woEntryIds não pode ser declarado vencedor
      const woWin = recordGameResult(t, {
        gameId: game2,
        eventId: 'evt_wo_invalid',
        winnerEntryId: 'B',
        woEntryIds: ['B'],
        finishedAt: 320,
      });
      expect(woWin.applied).toBe(false);
      expect(woWin.reason).toBe('winner_has_wo');
    });

    it('permite reconexão dentro do prazo sem aplicar W.O., mas aplica W.O. após expiração e bloqueia retorno', () => {
      const initialSeats: TournamentSeatState[] = [
        { entryId: 'e1', userId: 'u1', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'e2', userId: 'u2', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'e3', userId: 'u3', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'e4', userId: 'u4', gameId: 'g1', connectionStatus: 'connected' },
      ];

      // Desconecta u1 em t=1000 com prazo 45_000ms (deadline 46_000ms)
      let seats = handleSeatDisconnect(initialSeats, 'u1', 1000, 45_000);
      expect(seats[0].connectionStatus).toBe('disconnected');
      expect(seats[0].reconnectionDeadlineAt).toBe(46_000);

      // Ainda no prazo em t=30_000 -> não gera W.O. e reconecta normalmente
      const midEval = evaluateSeatTimeouts(seats, 'individual', 30_000);
      expect(midEval.newlyForfeitedEntryIds).toEqual([]);
      expect(midEval.action).toBe('continue_match');

      const recOk = handleSeatReconnect(seats, 'u1', 30_000);
      expect(recOk.reconnected).toBe(true);
      expect(recOk.seats[0].connectionStatus).toBe('connected');

      // Nova queda em t=50_000 -> expira em t=95_000
      seats = handleSeatDisconnect(recOk.seats, 'u1', 50_000, 45_000);
      const expiredEval = evaluateSeatTimeouts(seats, 'individual', 95_000);
      expect(expiredEval.newlyForfeitedEntryIds).toEqual(['e1']);
      expect(expiredEval.allWoEntryIds).toEqual(['e1']);
      expect(expiredEval.activeEntryIds).toEqual(['e2', 'e3', 'e4']);
      expect(expiredEval.action).toBe('continue_match');

      // Tentativa de reconexão depois do W.O. falha
      const recLate = handleSeatReconnect(expiredEval.seats, 'u1', 96_000);
      expect(recLate.reconnected).toBe(false);
      expect(recLate.reason).toBe('already_wo');
    });

    it('mantém partida individual de 4 com 2 W.O.s (2 ativos), anula mesa de 3 com 2 W.O.s (< 2 ativos) e exclui W.O. das partidas seguintes do grupo', () => {
      // Mesa de 4 jogadores com 2 W.O.s -> ainda restam 2 ativos -> continue_match
      let seats4: TournamentSeatState[] = [
        { entryId: 'entry_1', userId: 'u1', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'entry_2', userId: 'u2', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'entry_3', userId: 'u3', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'entry_4', userId: 'u4', gameId: 'g1', connectionStatus: 'connected' },
      ];
      let out4 = handleExplicitLeave(seats4, 'individual', 'u1');
      expect(out4.action).toBe('continue_match');
      out4 = handleExplicitLeave(out4.seats, 'individual', 'u2');
      expect(out4.activeEntryIds).toEqual(['entry_3', 'entry_4']);
      expect(out4.action).toBe('continue_match');

      // Mesa de 3 jogadores: 1 W.O. continua com 2; 2o W.O. deixa apenas 1 ativo => void_insufficient_players
      let seats3: TournamentSeatState[] = [
        { entryId: 'entry_1', userId: 'u1', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'entry_2', userId: 'u2', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'entry_3', userId: 'u3', gameId: 'g1', connectionStatus: 'connected' },
      ];
      const out3_one = handleExplicitLeave(seats3, 'individual', 'u1');
      expect(out3_one.action).toBe('continue_match');
      const out3_two = handleExplicitLeave(out3_one.seats, 'individual', 'u2');
      expect(out3_two.activeEntryIds).toEqual(['entry_3']);
      expect(out3_two.action).toBe('void_insufficient_players');

      // Verifica exclusão do jogador W.O. nas próximas partidas da mesma etapa
      let t = createTournament(makeIndividualConfig({ gamesPerGroup: 3, seed: undefined }), 'admin_1', 100);
      for (const uid of ['u1', 'u2', 'u3', 'u4']) {
        t = registerIndividualEntry(t, uid, uid).tournament;
      }
      t = startTournament(t, 200);
      const grp = t.rounds[0].groups[0];

      t = recordGameResult(t, {
        gameId: grp.games[0].id,
        eventId: 'g1_wo',
        winnerEntryId: 'entry_u2',
        woEntryIds: ['entry_u1'],
        finishedAt: 300,
      }).tournament;

      const updatedGroup = t.rounds[0].groups[0];
      expect(updatedGroup.activeEntryIds).not.toContain('entry_u1');
      expect(updatedGroup.games[1].participantEntryIds).not.toContain('entry_u1');
      expect(updatedGroup.games[2].participantEntryIds).not.toContain('entry_u1');
    });

    it('em duplas 2v2, desistência ou W.O. de 1 integrante concede vitória da partida para a equipe adversária', () => {
      const seats2v2: TournamentSeatState[] = [
        { entryId: 'team_A', userId: 'u1', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'team_A', userId: 'u2', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'team_B', userId: 'u3', gameId: 'g1', connectionStatus: 'connected' },
        { entryId: 'team_B', userId: 'u4', gameId: 'g1', connectionStatus: 'connected' },
      ];
      const outcome = handleExplicitLeave(seats2v2, 'doubles', 'u2');
      expect(outcome.action).toBe('award_wo');
      expect(outcome.winnerEntryId).toBe('team_B');
      expect(outcome.allWoEntryIds).toEqual(['team_A']);
    });

    it('recuperação pós-reinicialização pausa torneio para salas perdidas e nunca inventa vencedor; admin decide e retoma', () => {
      let t = createTournament(makeDoublesConfig({ bestOf: 3 }), 'admin_1', 100);
      t = registerDoublesTeam(t, 'A', 'Alfa', ['u1', 'u2']).tournament;
      t = registerDoublesTeam(t, 'B', 'Beta', ['u3', 'u4']).tournament;
      t = startTournament(t, 200);

      // Marca jogo 1 como 'playing' com uma sala que sumiu no restart
      t = {
        ...t,
        rounds: t.rounds.map((r) => ({
          ...r,
          groups: r.groups.map((g) => ({
            ...g,
            status: 'playing' as const,
            games: g.games.map((gm, idx) =>
              idx === 0 ? { ...gm, status: 'playing' as const, roomId: 'room_lost_123' } : gm
            ),
          })),
        })),
      };

      const recovered = recoverTournamentAfterRestart(t, new Set(['other_room']));
      expect(recovered.affectedGameIds).toEqual(['R1_M1_G1']);
      expect(recovered.tournament.status).toBe('paused');
      expect(recovered.tournament.rounds[0].groups[0].status).toBe('needs_intervention');
      expect(recovered.tournament.rounds[0].groups[0].games[0].status).toBe('needs_intervention');
      expect(recovered.tournament.rounds[0].groups[0].games[0].winnerEntryId).toBeUndefined();

      // Não permite retomar manualmente enquanto existir pendência de intervenção
      expect(() => resumeTournament(recovered.tournament)).toThrow();

      // Opção 1: Admin anula e agenda replay -> jogo substituto criado e torneio volta a running
      const replayed = resolveGameByAdmin(
        recovered.tournament,
        'R1_M1_G1',
        'adm_replay_1',
        { type: 'void_and_replay' },
        500
      );
      expect(replayed.status).toBe('running');
      expect(replayed.rounds[0].groups[0].games[0].status).toBe('void');
      expect(replayed.rounds[0].groups[0].games.some((gm) => gm.id.endsWith('_REPLAY') && gm.status === 'pending')).toBe(true);

      // Opção 2: Admin atribui vencedor administrativo
      const awarded = resolveGameByAdmin(
        recovered.tournament,
        'R1_M1_G1',
        'adm_award_1',
        { type: 'award_winner', winnerEntryId: 'A' },
        500
      );
      expect(awarded.status).toBe('running');
      expect(awarded.rounds[0].groups[0].games[0].winnerEntryId).toBe('A');
      expect(awarded.rounds[0].groups[0].games[0].resultReason).toBe('admin_decision');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Simulação Pré-Início
  // --------------------------------------------------------------------------
  describe('6. Simulação Pré-Início (Seção 11)', () => {
    it('simula individual de 10 jogadores (mesas [4, 3, 3]) e avisa sobre 5 jogadores (mesa de 2 inevitável)', () => {
      const sim10 = simulateTournament(
        makeIndividualConfig({ gamesPerGroup: 3, advancePerGroup: 1, historicalAvgGameMinutes: 5 }),
        10
      );
      expect(sim10.isValid).toBe(true);
      expect(sim10.estimationPrecision).toBe('historical');
      expect(sim10.rounds[0].tableSizes).toEqual([4, 3, 3]);
      expect(sim10.rounds[0].advancingCount).toBe(3);
      expect(sim10.rounds[1].tableSizes).toEqual([3]);
      expect(sim10.rounds[1].advancingCount).toBe(1);
      expect(sim10.totalRounds).toBe(2);
      expect(sim10.totalMatchesMin).toBe(12); // 3*3 + 1*3
      expect(sim10.totalMatchesMax).toBe(16); // +1 desempate possível por mesa

      const sim5 = simulateTournament(makeIndividualConfig(), 5);
      expect(sim5.isValid).toBe(true);
      expect(sim5.rounds[0].tableSizes).toEqual([3, 2]);
      expect(sim5.warnings.some((w) => w.includes('terá 2 jogadores'))).toBe(true);
      expect(sim5.estimationPrecision).toBe('low_estimate');
    });

    it('simula duplas de 6 equipes em Md3 com byes e cálculo correto de min/max jogos e duração', () => {
      const sim6 = simulateTournament(makeDoublesConfig({ bestOf: 3 }), 6);
      expect(sim6.isValid).toBe(true);
      expect(sim6.totalRounds).toBe(3); // R1(2 jogos + 2 byes) -> Semi(2 jogos) -> Final(1 jogo)
      expect(sim6.rounds[0].byesCount).toBe(2);
      expect(sim6.rounds[0].groupsCount).toBe(2);
      expect(sim6.rounds[1].advancingCount).toBe(2);
      expect(sim6.rounds[2].advancingCount).toBe(1);
      // Total de séries jogáveis: 2 + 2 + 1 = 5 séries Md3 => min 10 jogos (5*2), max 15 jogos (5*3)
      expect(sim6.totalMatchesMin).toBe(10);
      expect(sim6.totalMatchesMax).toBe(15);
    });

    it('retorna isValid=false com erro claro quando inscritos < 2', () => {
      const sim1 = simulateTournament(makeDoublesConfig(), 1);
      expect(sim1.isValid).toBe(false);
      expect(sim1.errors.length).toBeGreaterThan(0);
    });
  });
});
