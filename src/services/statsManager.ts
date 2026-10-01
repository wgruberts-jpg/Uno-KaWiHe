import { Card, CardColor, PlayerCareerStats, TrophyDefinition } from '../types/uno.js';

const STATS_STORAGE_KEY = 'uno_kawihe_career_stats_v1';

export const DEFAULT_CAREER_STATS: PlayerCareerStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  gamesLost: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalPoints: 0,
  fastestWinSeconds: null,
  fewestTurnsWin: null,
  highestRoundPoints: 0,
  cardsPlayed: 0,
  plusFoursPlayed: 0,
  plusTwosPlayed: 0,
  skipsPlayed: 0,
  reversesPlayed: 0,
  colorChangesPlayed: 0,
  unoCallsSuccess: 0,
  caughtOpponentsUno: 0,
  cardsDrawnTotal: 0,
  colorDistribution: {
    red: 0,
    blue: 0,
    green: 0,
    yellow: 0,
  },
  achievements: [],
};

export const TROPHIES: TrophyDefinition[] = [
  {
    id: 'first_win',
    title: 'Primeira Vitória',
    description: 'Vença sua primeira partida no Uno KaWiHe!',
    icon: '🥇',
    category: 'victory',
    maxProgress: 1,
    getProgress: (s) => Math.min(1, s.gamesWon),
  },
  {
    id: 'streak_3',
    title: 'Imparável',
    description: 'Vença 3 partidas seguidas sem perder nenhuma vez.',
    icon: '🔥',
    category: 'victory',
    maxProgress: 3,
    getProgress: (s) => Math.min(3, s.bestStreak),
  },
  {
    id: 'streak_5',
    title: 'Lenda Viva',
    description: 'Vença 5 partidas consecutivas!',
    icon: '👑',
    category: 'victory',
    maxProgress: 5,
    getProgress: (s) => Math.min(5, s.bestStreak),
  },
  {
    id: 'speed_runner',
    title: 'Relâmpago',
    description: 'Vença uma partida em menos de 90 segundos (1m 30s).',
    icon: '⚡',
    category: 'speed',
    maxProgress: 1,
    getProgress: (s) => (s.fastestWinSeconds && s.fastestWinSeconds <= 90 ? 1 : 0),
  },
  {
    id: 'fewest_turns',
    title: 'Estrategista Nato',
    description: 'Bata todas as suas cartas em 10 turnos ou menos.',
    icon: '🎯',
    category: 'speed',
    maxProgress: 1,
    getProgress: (s) => (s.fewestTurnsWin && s.fewestTurnsWin <= 10 ? 1 : 0),
  },
  {
    id: 'plus_four_master',
    title: 'Chuva de +4',
    description: 'Jogue 10 cartas Coringa Comprar Quatro (+4).',
    icon: '💣',
    category: 'skill',
    maxProgress: 10,
    getProgress: (s) => Math.min(10, s.plusFoursPlayed),
  },
  {
    id: 'plus_two_master',
    title: 'Toma Mais Dois!',
    description: 'Jogue 20 cartas Comprar Duas (+2).',
    icon: '💥',
    category: 'skill',
    maxProgress: 20,
    getProgress: (s) => Math.min(20, s.plusTwosPlayed),
  },
  {
    id: 'shield_wall',
    title: 'Muralha de Bloqueios',
    description: 'Pule a vez dos oponentes com Bloqueio 15 vezes.',
    icon: '🛑',
    category: 'skill',
    maxProgress: 15,
    getProgress: (s) => Math.min(15, s.skipsPlayed),
  },
  {
    id: 'reverse_king',
    title: 'Mestre do Reverso',
    description: 'Inverta o sentido do jogo 15 vezes.',
    icon: '🔄',
    category: 'skill',
    maxProgress: 15,
    getProgress: (s) => Math.min(15, s.reversesPlayed),
  },
  {
    id: 'uno_shouter',
    title: 'Voz de Trovão',
    description: 'Grite UNO 15 vezes com sucesso antes de bater.',
    icon: '🗣️',
    category: 'fun',
    maxProgress: 15,
    getProgress: (s) => Math.min(15, s.unoCallsSuccess),
  },
  {
    id: 'uno_police',
    title: 'Fiscal de UNO',
    description: 'Pegue 5 adversários distraídos que esqueceram de falar UNO!',
    icon: '🚨',
    category: 'fun',
    maxProgress: 5,
    getProgress: (s) => Math.min(5, s.caughtOpponentsUno),
  },
  {
    id: 'score_1000',
    title: 'Milionário de Pontos',
    description: 'Acumule 1.000 pontos somados nas suas vitórias.',
    icon: '💎',
    category: 'victory',
    maxProgress: 1000,
    getProgress: (s) => Math.min(1000, s.totalPoints),
  },
];

class StatsService {
  private stats: PlayerCareerStats;
  private listeners: Array<(stats: PlayerCareerStats) => void> = [];

  constructor() {
    this.stats = this.loadFromStorage();
  }

  private loadFromStorage(): PlayerCareerStats {
    try {
      const saved = localStorage.getItem(STATS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_CAREER_STATS,
          ...parsed,
          colorDistribution: {
            ...DEFAULT_CAREER_STATS.colorDistribution,
            ...(parsed.colorDistribution || {}),
          },
          achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
        };
      }
    } catch {
      // Fallback
    }
    return { ...DEFAULT_CAREER_STATS };
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(this.stats));
      this.notifyListeners();
      this.syncWithBackend();
    } catch {
      // Ignore
    }
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => cb(this.stats));
  }

  public subscribe(cb: (stats: PlayerCareerStats) => void): () => void {
    this.listeners.push(cb);
    cb(this.stats);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  public getStats(): PlayerCareerStats {
    return { ...this.stats };
  }

  public checkAndUnlockAchievements(): string[] {
    const newlyUnlocked: string[] = [];
    TROPHIES.forEach((trophy) => {
      if (!this.stats.achievements.includes(trophy.id)) {
        const currentProgress = trophy.getProgress(this.stats);
        if (currentProgress >= trophy.maxProgress) {
          this.stats.achievements.push(trophy.id);
          newlyUnlocked.push(trophy.id);
        }
      }
    });
    return newlyUnlocked;
  }

  public recordGameFinished(params: {
    won: boolean;
    durationSeconds?: number;
    turnsCount?: number;
    pointsWon?: number;
  }): { newAchievements: string[]; isFastest: boolean; isFewestTurns: boolean } {
    this.stats.gamesPlayed += 1;
    let isFastest = false;
    let isFewestTurns = false;

    if (params.won) {
      this.stats.gamesWon += 1;
      this.stats.currentStreak += 1;
      if (this.stats.currentStreak > this.stats.bestStreak) {
        this.stats.bestStreak = this.stats.currentStreak;
      }

      const pts = params.pointsWon || 0;
      this.stats.totalPoints += pts;
      if (pts > this.stats.highestRoundPoints) {
        this.stats.highestRoundPoints = pts;
      }

      if (params.durationSeconds && params.durationSeconds > 0) {
        if (!this.stats.fastestWinSeconds || params.durationSeconds < this.stats.fastestWinSeconds) {
          this.stats.fastestWinSeconds = params.durationSeconds;
          isFastest = true;
        }
      }

      if (params.turnsCount && params.turnsCount > 0) {
        if (!this.stats.fewestTurnsWin || params.turnsCount < this.stats.fewestTurnsWin) {
          this.stats.fewestTurnsWin = params.turnsCount;
          isFewestTurns = true;
        }
      }
    } else {
      this.stats.gamesLost += 1;
      this.stats.currentStreak = 0;
    }

    const newAchievements = this.checkAndUnlockAchievements();
    this.saveToStorage();

    return { newAchievements, isFastest, isFewestTurns };
  }

  public recordCardPlayed(card: Card, chosenColor?: CardColor) {
    this.stats.cardsPlayed += 1;

    if (card.value === 'wild4') {
      this.stats.plusFoursPlayed += 1;
    } else if (card.value === 'draw2') {
      this.stats.plusTwosPlayed += 1;
    } else if (card.value === 'skip') {
      this.stats.skipsPlayed += 1;
    } else if (card.value === 'reverse') {
      this.stats.reversesPlayed += 1;
    } else if (card.value === 'wild') {
      this.stats.colorChangesPlayed += 1;
    }

    // Color counting
    const effectiveColor = card.color === 'wild' ? (chosenColor || 'red') : card.color;
    if (effectiveColor in this.stats.colorDistribution) {
      this.stats.colorDistribution[effectiveColor as keyof typeof this.stats.colorDistribution] += 1;
    }

    this.checkAndUnlockAchievements();
    this.saveToStorage();
  }

  public recordCardDrawn(count = 1) {
    this.stats.cardsDrawnTotal += count;
    this.saveToStorage();
  }

  public recordUnoCalled() {
    this.stats.unoCallsSuccess += 1;
    this.checkAndUnlockAchievements();
    this.saveToStorage();
  }

  public recordCaughtUno() {
    this.stats.caughtOpponentsUno += 1;
    this.checkAndUnlockAchievements();
    this.saveToStorage();
  }

  public resetStats() {
    this.stats = { ...DEFAULT_CAREER_STATS };
    this.saveToStorage();
  }

  public async syncWithBackend() {
    const token = localStorage.getItem('kawihe_token');
    if (!token) return;

    try {
      await fetch('/api/user/stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stats: this.stats }),
      });
    } catch {
      // Backend offline or running standalone
    }
  }

  public async fetchFromServer(): Promise<void> {
    const token = localStorage.getItem('kawihe_token');
    if (!token) return;

    try {
      const res = await fetch('/api/user/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          // Merge local and server
          this.stats = {
            ...this.stats,
            ...data.stats,
            gamesPlayed: Math.max(this.stats.gamesPlayed, data.stats.gamesPlayed || 0),
            gamesWon: Math.max(this.stats.gamesWon, data.stats.gamesWon || 0),
            totalPoints: Math.max(this.stats.totalPoints, data.stats.totalPoints || 0),
            bestStreak: Math.max(this.stats.bestStreak, data.stats.bestStreak || 0),
            achievements: Array.from(new Set([...this.stats.achievements, ...(data.stats.achievements || [])])),
          };
          localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(this.stats));
          this.notifyListeners();
        }
      }
    } catch {
      // Fallback to local
    }
  }
}

export const statsManager = new StatsService();
