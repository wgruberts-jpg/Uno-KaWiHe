export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';

export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2'
  | 'wild' | 'wild4';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
  score: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isBot: boolean;
  cardsCount: number;
  hasCalledUno: boolean;
  isConnected: boolean;
  score: number;
  botHand?: Card[]; // Exibido no Modo Criança (ver cartas dos robôs)
}

export type GameStatus = 'waiting' | 'playing' | 'ended';
export type TurnDirection = 1 | -1; // 1 = clockwise, -1 = counter-clockwise

export interface GameLog {
  id: string;
  timestamp: number;
  text: string;
  type: 'action' | 'uno' | 'system' | 'penalty' | 'chat';
  playerName?: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  avatar: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface GameState {
  roomId: string;
  status: GameStatus;
  players: Player[];
  myHand: Card[];
  discardPileTop: Card | null;
  currentColor: CardColor;
  currentTurnPlayerId: string;
  turnDirection: TurnDirection;
  turnTimeLeft: number;
  turnDuration: number;
  drawCountPenalty: number; // accumulated if stacking or pending
  winnerId: string | null;
  unoVulnerablePlayerId: string | null; // player with 1 card who forgot to call UNO
  deckCardsCount: number;
  settings?: RoomSettings;
  // Estatísticas da rodada e placar da mesa
  roundDurationSeconds?: number;
  roundTurnCount?: number;
  roundPointsWon?: number;
  isFastestWin?: boolean;
  tableScores?: Record<string, TablePlayerScore>;
  tableFastestSeconds?: number | null;
}

export interface TablePlayerScore {
  playerId: string;
  name: string;
  avatar: string;
  wins: number;
  points: number;
  roundsPlayed: number;
}

export interface PlayerCareerStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  currentStreak: number;
  bestStreak: number;
  totalPoints: number;
  fastestWinSeconds: number | null; // ex: 68 segundos
  fewestTurnsWin: number | null;     // ex: 7 turnos
  highestRoundPoints: number;       // maior pontuação em uma única rodada
  cardsPlayed: number;
  plusFoursPlayed: number;
  plusTwosPlayed: number;
  skipsPlayed: number;
  reversesPlayed: number;
  colorChangesPlayed: number;
  unoCallsSuccess: number;
  caughtOpponentsUno: number;
  cardsDrawnTotal: number;
  colorDistribution: {
    red: number;
    blue: number;
    green: number;
    yellow: number;
  };
  achievements: string[]; // IDs das conquistas desbloqueadas
}

export interface TrophyDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'victory' | 'skill' | 'fun' | 'speed';
  maxProgress: number;
  getProgress: (stats: PlayerCareerStats) => number;
}

export interface RoomSettings {
  maxPlayers: number;
  turnDuration: number; // 0 = Sem pressa / ilimitado para crianças, ou 15, 25, 40, 60s
  challengeUnoRule: boolean;
  showBotCards?: boolean; // Ver cartas dos robôs (Modo Criança)
  botSpeedMs?: number; // Tempo que os robôs demoram para largar cartas (ex: 800ms, 1800ms, 3000ms)
  autoUnoProtection?: boolean; // Proteção infantil de UNO (grita automaticamente)
  highlightHints?: boolean; // Destaque visual de cartas jogáveis
}

export interface EmoteItem {
  id: string;
  emoji: string;
  label: string;
  phrase: string;
  soundType?: string;
}

export type UserRole = 'admin' | 'player';

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: UserRole;
  tag?: string; // Tag definitiva com # (ex: #0001, #1042)
  createdAt: string;
}

export interface InviteCode {
  code: string; // Começa com @ + 4 caracteres (ex: @K9W2)
  createdBy: string;
  createdAt: string;
  expiresAt: string; // Data ISO ou "never"
  maxUses: number;
  usedCount: number;
  usedBy: Array<{ username: string; usedAt: string }>;
  status: 'active' | 'expired' | 'revoked' | 'used';
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: UserProfile;
  error?: string;
}

export interface ActiveEmote {
  id: string;
  playerId: string;
  emoteId: string;
  emoji: string;
  phrase: string;
  soundType?: string;
  timestamp: number;
}

// WebSocket message protocols
export type ClientMessage =
  | { type: 'create_room'; playerName: string; avatar: string; settings?: Partial<RoomSettings> }
  | { type: 'join_room'; roomId: string; playerName: string; avatar: string; existingPlayerId?: string }
  | { type: 'sync_session'; roomId: string; playerId: string }
  | { type: 'add_bot'; roomId: string; playerId?: string }
  | { type: 'fill_bots'; roomId: string; playerId?: string }
  | { type: 'start_solo'; playerName: string; avatar: string; botCount: number; settings?: Partial<RoomSettings> }
  | { type: 'update_settings'; roomId: string; settings: Partial<RoomSettings>; playerId?: string }
  | { type: 'leave_room'; roomId: string; playerId: string }
  | { type: 'remove_bot'; roomId: string; botId: string; playerId?: string }
  | { type: 'start_game'; roomId: string; playerId?: string }
  | { type: 'play_card'; roomId: string; cardId: string; chosenColor?: CardColor; playerId?: string }
  | { type: 'draw_card'; roomId: string; playerId?: string }
  | { type: 'pass_turn'; roomId: string; playerId?: string }
  | { type: 'call_uno'; roomId: string; playerId?: string }
  | { type: 'catch_uno'; roomId: string; targetPlayerId: string; playerId?: string }
  | { type: 'restart_game'; roomId: string; playerId?: string }
  | { type: 'return_to_lobby'; roomId: string; playerId?: string }
  | { type: 'reset_room'; roomId: string; playerId?: string }
  | { type: 'send_chat'; roomId: string; text: string; playerId?: string }
  | { type: 'send_emote'; roomId: string; emoteId: string; playerId?: string };

export type ServerMessage =
  | { type: 'room_joined'; roomId: string; playerId: string }
  | { type: 'game_state'; state: GameState }
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'game_log'; log: GameLog }
  | { type: 'sound_event'; sound: 'play' | 'draw' | 'uno' | 'reverse' | 'skip' | 'wild' | 'win' | 'penalty' }
  | { type: 'player_emote'; emote: ActiveEmote }
  | { type: 'error'; message: string };
