import React, { useState, useEffect } from 'react';
import { RoomSettings, Player, UserProfile } from '../types/uno.js';
import { AVATARS_CATALOG, AVATAR_CATEGORIES } from '../utils/avatars.js';
import {
  Users,
  Play,
  Plus,
  Trash2,
  Copy,
  Check,
  Server,
  HelpCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Settings,
  Shield,
  RotateCcw,
  LogOut,
  User,
  KeyRound,
  Trophy,
  UserX,
  Crown
} from 'lucide-react';

interface LobbyProps {
  onCreateRoom: (playerName: string, avatar: string, settings: RoomSettings) => void;
  onStartSolo: (playerName: string, avatar: string, botCount: number, settings?: Partial<RoomSettings>) => void;
  onJoinRoom: (roomId: string, playerName: string, avatar: string, asSpectator?: boolean, spectatorRevealCards?: boolean) => void;
  onAddBot: () => void;
  onFillBots: () => void;
  onRemoveBot: (botId: string) => void;
  onKickPlayer?: (targetPlayerId: string) => void;
  onTransferHost?: (targetPlayerId: string) => void;
  onStartGame: () => void;
  onResetRoom?: () => void;
  onOpenVmGuide: () => void;
  onOpenSettings: () => void;
  onOpenStats?: () => void;
  onOpenInvites?: () => void;
  onOpenAdminRooms?: () => void;
  onLeaveRoom: () => void;
  onOpenAuth: () => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
  roomId: string | null;
  players: Player[];
  myPlayerId: string;
  isHost: boolean;
  errorMessage: string | null;
}

export const Lobby: React.FC<LobbyProps> = ({
  onCreateRoom,
  onStartSolo,
  onJoinRoom,
  onAddBot,
  onFillBots,
  onRemoveBot,
  onKickPlayer,
  onTransferHost,
  onStartGame,
  onResetRoom,
  onOpenVmGuide,
  onOpenSettings,
  onOpenStats,
  onOpenInvites,
  onOpenAdminRooms,
  onLeaveRoom,
  onOpenAuth,
  currentUser,
  onLogout,
  roomId,
  players,
  myPlayerId,
  isHost,
  errorMessage,
}) => {
  const [playerName, setPlayerName] = useState(() => currentUser?.displayName || localStorage.getItem('uno_nickname') || 'Jogador 1');
  const [selectedAvatar, setSelectedAvatar] = useState(() => currentUser?.avatar || localStorage.getItem('uno_avatar') || '🦸‍♂️');

  useEffect(() => {
    if (currentUser) {
      setPlayerName(currentUser.displayName);
      setSelectedAvatar(currentUser.avatar);
    }
  }, [currentUser]);
  const [avatarCategory, setAvatarCategory] = useState<'heroes' | 'animals' | 'classics'>('heroes');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinMode, setJoinMode] = useState<'play' | 'watch_hidden' | 'watch_open'>('play');
  const [showBroadcastShare, setShowBroadcastShare] = useState(false);
  const [copiedBroadcastType, setCopiedBroadcastType] = useState<string | null>(null);
  const [turnDuration, setTurnDuration] = useState<number>(() => {
    const saved = localStorage.getItem('uno_turn_duration');
    return saved !== null ? Number(saved) : 90; // Padrão: 1 minuto e meio (90s)
  });
  const [maxPlayers, setMaxPlayers] = useState<number>(4);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [selectedBotCount, setSelectedBotCount] = useState<number>(1);

  const handleAvatarSelect = (av: string) => {
    setSelectedAvatar(av);
    localStorage.setItem('uno_avatar', av);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPlayerName(val);
    localStorage.setItem('uno_nickname', val);
  };

  const getSavedSettings = (): Partial<RoomSettings> => ({
    turnDuration,
    showBotCards: localStorage.getItem('uno_show_bot_cards') === 'true',
    botSpeedMs: Number(localStorage.getItem('uno_bot_speed_ms')) || 1800,
    autoUnoProtection: localStorage.getItem('uno_auto_uno') === 'true',
    highlightHints: localStorage.getItem('uno_highlight_hints') !== 'false',
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateRoom(playerName, selectedAvatar, {
      maxPlayers,
      turnDuration,
      challengeUnoRule: true,
      ...getSavedSettings(),
    });
  };

  const handleStartSoloClick = () => {
    onStartSolo(playerName, selectedAvatar, selectedBotCount, getSavedSettings());
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinCodeInput.trim();
    if (!raw) return;

    const startsWithDollar = raw.startsWith('$');
    const startsWithAtOrStar = raw.startsWith('@') || raw.startsWith('*') || raw.startsWith('#');
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
    if (!clean) return;

    const isSpectator = joinMode !== 'play' || startsWithDollar || startsWithAtOrStar;
    const isReveal = joinMode === 'watch_open' || startsWithDollar;

    onJoinRoom(clean, playerName, selectedAvatar, isSpectator, isReveal);
  };

  const copyRoomCode = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const filteredAvatars = AVATARS_CATALOG.filter((a) => a.category === avatarCategory);

  return (
    <div className="w-full h-full bg-gradient-to-b from-sky-400 via-sky-300 to-indigo-300 text-slate-800 flex flex-col items-center justify-start px-3 sm:px-6 py-4 sm:py-6 select-none relative overflow-y-auto overflow-x-hidden">
      {/* Decorative Cartoon Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-10 left-10 w-36 h-20 bg-white rounded-full blur-[1px]" />
        <div className="absolute top-6 left-20 w-28 h-28 bg-white rounded-full blur-[1px]" />
        <div className="absolute top-20 right-16 w-48 h-24 bg-white rounded-full blur-[1px]" />
        <div className="absolute top-12 right-28 w-32 h-32 bg-white rounded-full blur-[1px]" />
        <div className="absolute bottom-16 left-24 w-40 h-20 bg-white rounded-full blur-[1px]" />
      </div>

      {/* Top bar with guide & settings button */}
      <div className="w-full max-w-4xl flex items-center justify-between py-3 mb-4 border-b-4 border-white/60 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-13 h-11 px-1 rounded-2xl bg-gradient-to-tr from-rose-500 via-yellow-400 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-base shadow-lg border-3 border-white tracking-wider">
            KWH
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-1.5">
              <span className="text-rose-600 drop-shadow-sm">Uno</span>
              <span className="text-amber-500 drop-shadow-sm font-black">KaWiHe</span>
              <span className="ml-1 text-amber-950 font-black text-[10px] sm:text-xs uppercase px-2.5 py-0.5 rounded-full bg-yellow-300 border-2 border-white shadow-sm">
                Kids & Família
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* User Account / Login Button */}
          {currentUser ? (
            <div className="flex items-center gap-1.5 bg-white/95 px-2.5 py-1 rounded-2xl border-2 border-amber-300 shadow-sm">
              <span className="text-base">{currentUser.avatar}</span>
              <div className="hidden xs:flex flex-col text-left leading-none">
                <div className="flex items-center gap-1">
                  <span className="font-black text-xs text-slate-900 max-w-[80px] sm:max-w-[110px] truncate">
                    {currentUser.displayName}
                  </span>
                  {currentUser.tag && (
                    <span className="font-mono text-[9px] font-black text-amber-700 bg-amber-100 px-1 rounded border border-amber-200">
                      {currentUser.tag}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-bold text-amber-700">
                  {currentUser.role === 'admin' ? '👑 Administrador' : '🎮 Jogador'}
                </span>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors ml-0.5"
                title="Sair da Conta"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-3 py-1.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 border-2 border-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
              title="Entrar ou Criar Conta Central"
            >
              <KeyRound className="w-3.5 h-3.5 text-slate-900" />
              <span>Entrar</span>
            </button>
          )}

          {/* Admin Invites Management Button (Visible to Edinho and Admins) */}
          {currentUser?.role === 'admin' && onOpenInvites && (
            <button
              type="button"
              onClick={onOpenInvites}
              className="px-2.5 sm:px-3 py-1.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border-2 border-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
              title="Gerenciador de Convites (@XXXX)"
            >
              <span>🎟️</span>
              <span className="hidden sm:inline">Convites</span>
            </button>
          )}

          {/* Admin Rooms Management Button (Visible to Edinho and Admins) */}
          {currentUser?.role === 'admin' && onOpenAdminRooms && (
            <button
              type="button"
              onClick={onOpenAdminRooms}
              className="px-2.5 sm:px-3 py-1.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white border-2 border-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
              title="Painel de Moderação e Gestão de Salas"
            >
              <span>🛡️</span>
              <span className="hidden sm:inline">Salas</span>
            </button>
          )}

          {/* Player Career Stats & Trophies Button */}
          {onOpenStats && (
            <button
              type="button"
              onClick={onOpenStats}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 border-2 border-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
              title="Ver Estatísticas, Recordes e Troféus"
            >
              <Trophy className="w-4 h-4 text-amber-900 fill-amber-700" />
              <span className="hidden sm:inline">Estatísticas</span>
            </button>
          )}

          {/* Settings Gear Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-2xl bg-white hover:bg-yellow-100 text-amber-900 border-2 border-amber-300 text-xs font-black flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
            title="Configurações & Modo Criança"
          >
            <Settings className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">Configurações</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRules(!showRules)}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-2xl bg-white hover:bg-yellow-100 text-amber-900 text-xs font-black flex items-center gap-1 cursor-pointer border-2 border-amber-300 shadow-sm transition-all"
          >
            <HelpCircle className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">Regras</span>
          </button>

          <button
            type="button"
            onClick={onOpenVmGuide}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-2xl bg-white hover:bg-sky-50 text-sky-900 border-2 border-sky-300 text-xs font-black flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
          >
            <Server className="w-4 h-4 text-sky-600" />
            <span className="hidden sm:inline">Deploy VM</span>
          </button>
        </div>
      </div>

      {/* Rules Accordion */}
      {showRules && (
        <div className="w-full max-w-4xl mb-4 bg-white/95 border-3 border-amber-400 rounded-3xl p-5 text-xs text-slate-700 space-y-2 shadow-2xl backdrop-blur-md z-10">
          <h3 className="font-black text-amber-900 flex items-center gap-2 text-sm uppercase tracking-wide">
            <Sparkles className="w-4 h-4 text-amber-500" /> Regras Rápidas do UNO:
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-slate-700 font-medium">
            <li><strong>Correspondência:</strong> Jogue cartas com a mesma cor ou mesmo número/símbolo da carta descartada.</li>
            <li><strong>Coringa / +4:</strong> Podem ser jogados sobre qualquer carta. Ao jogar, você escolhe a nova cor.</li>
            <li><strong>+2 e +4:</strong> Fazem o próximo jogador comprar cartas e perder a vez.</li>
            <li><strong>Reverso:</strong> Inverte o sentido do jogo (com 2 jogadores, age como pular).</li>
            <li><strong>Gritar UNO:</strong> Quando ficar com 1 carta, clique no botão <strong>GRITAR UNO</strong> antes de passar! (Ou ative a Proteção Infantil nas configurações ⚙️).</li>
          </ul>
        </div>
      )}

      {/* Error notification */}
      {errorMessage && (
        <div className="w-full max-w-md mb-4 p-3.5 bg-rose-500 border-3 border-white text-white font-black text-xs rounded-2xl text-center shadow-xl animate-in fade-in z-10">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Main card */}
      <div className="w-full max-w-2xl bg-white/95 border-4 border-yellow-400 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md z-10 text-slate-800">
        {!roomId ? (
          /* Profile & Room Creation / Join */
          <div className="space-y-6">
            {/* Player Profile Section */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-amber-900 mb-2">
                Seu Nome de Jogador
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={playerName}
                  onChange={handleNameChange}
                  maxLength={18}
                  placeholder="Ex: Gabriel"
                  className="flex-1 bg-amber-50/70 border-3 border-amber-300 rounded-2xl px-4 py-2.5 text-base text-slate-900 font-bold focus:outline-none focus:border-amber-500 shadow-inner"
                />
              </div>

              {/* Categorized Avatar Selector (Heroes, Animals, Classics) */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-black text-slate-700">
                    Escolha seu Avatar:
                  </label>
                  <div className="flex gap-1">
                    {AVATAR_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setAvatarCategory(cat.id)}
                        className={`py-1 px-2 rounded-xl text-[11px] font-black cursor-pointer transition-all border ${
                          avatarCategory === cat.id
                            ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-yellow-50'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1.5 bg-amber-50/60 rounded-2xl border-2 border-amber-200">
                  {filteredAvatars.map((item) => (
                    <button
                      key={item.name + item.emoji}
                      type="button"
                      onClick={() => handleAvatarSelect(item.emoji)}
                      title={item.name}
                      className={`w-11 h-11 rounded-2xl text-xl flex items-center justify-center cursor-pointer transition-all ${
                        selectedAvatar === item.emoji
                          ? 'bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-400 border-3 border-white scale-110 shadow-lg ring-4 ring-yellow-400/50'
                          : 'bg-white border-2 border-amber-100 hover:bg-yellow-100 hover:scale-105'
                      }`}
                    >
                      {item.emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dynamic Bot Solo Match Option */}
            <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border-3 border-emerald-300 rounded-3xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="bg-gradient-to-r from-yellow-300 to-amber-400 text-slate-950 font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow border border-white">
                      Jogo Rápido
                    </span>
                    <h3 className="font-black text-base text-emerald-950">
                      Jogar Contra Robôs Divertidos
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 font-bold">
                    Escolha a quantidade de robôs para a mesa:
                  </p>
                </div>

                {/* Counter Selector with - / + buttons */}
                <div className="flex items-center gap-2 bg-white border-2 border-emerald-300 p-1.5 rounded-2xl shrink-0 self-start sm:self-auto shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSelectedBotCount((prev) => Math.max(1, prev - 1))}
                    disabled={selectedBotCount <= 1}
                    className="w-8 h-8 rounded-xl bg-emerald-100 hover:bg-emerald-200 disabled:opacity-30 text-emerald-900 font-black text-sm flex items-center justify-center cursor-pointer transition-colors"
                    title="Remover um robô"
                  >
                    -
                  </button>

                  <div className="px-3 text-center">
                    <span className="text-lg font-black text-emerald-800 font-mono">
                      {selectedBotCount}
                    </span>
                    <span className="text-[10px] text-slate-500 block font-bold">
                      {selectedBotCount === 1 ? 'robô' : 'robôs'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedBotCount((prev) => Math.min(3, prev + 1))}
                    disabled={selectedBotCount >= 3}
                    className="w-8 h-8 rounded-xl bg-emerald-100 hover:bg-emerald-200 disabled:opacity-30 text-emerald-900 font-black text-sm flex items-center justify-center cursor-pointer transition-colors"
                    title="Adicionar mais um robô"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Bot preset buttons */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { count: 1, label: '1 Robô', desc: '1 contra 1' },
                  { count: 2, label: '2 Robôs', desc: '3 jogadores' },
                  { count: 3, label: '3 Robôs', desc: 'Mesa cheia (4)' },
                ].map((item) => (
                  <button
                    key={item.count}
                    type="button"
                    onClick={() => setSelectedBotCount(item.count)}
                    className={`py-2 px-3 rounded-2xl border-2 text-center transition-all cursor-pointer ${
                      selectedBotCount === item.count
                        ? 'bg-gradient-to-r from-yellow-300 to-amber-400 border-white text-slate-950 font-black shadow-md scale-105'
                        : 'bg-white border-emerald-200 text-slate-700 hover:bg-emerald-100 font-bold'
                    }`}
                  >
                    <div className="text-xs">{item.label}</div>
                    <div className="text-[10px] opacity-80">{item.desc}</div>
                  </button>
                ))}
              </div>

              {/* Live Preview of players on table */}
              <div className="p-3.5 bg-white rounded-2xl border-2 border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-600 font-bold">Mesa:</span>
                  <span className="bg-amber-100 px-2.5 py-1 rounded-xl text-amber-950 font-black flex items-center gap-1 border border-amber-300">
                    <span>{selectedAvatar}</span> {playerName || 'Você'}
                  </span>
                  <span className="text-rose-500 font-black">vs</span>
                  {selectedBotCount >= 1 && (
                    <span className="bg-sky-100 border-2 border-sky-300 px-2.5 py-1 rounded-xl text-sky-900 font-bold flex items-center gap-1">
                      <span>🤖</span> Bot Luna
                    </span>
                  )}
                  {selectedBotCount >= 2 && (
                    <span className="bg-pink-100 border-2 border-pink-300 px-2.5 py-1 rounded-xl text-pink-900 font-bold flex items-center gap-1">
                      <span>🦊</span> Bot Thor
                    </span>
                  )}
                  {selectedBotCount >= 3 && (
                    <span className="bg-emerald-100 border-2 border-emerald-300 px-2.5 py-1 rounded-xl text-emerald-900 font-bold flex items-center gap-1">
                      <span>🐼</span> Bot Maya
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleStartSoloClick}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-2xl bg-gradient-to-b from-emerald-400 to-green-600 hover:from-emerald-300 hover:to-green-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_0_#15803d] active:shadow-[0_1px_0_#15803d] active:translate-y-1 border-2 border-white transition-all shrink-0"
                >
                  <Play className="w-4 h-4 fill-white" /> Iniciar com {selectedBotCount} {selectedBotCount === 1 ? 'Robô' : 'Robôs'}
                </button>
              </div>
            </div>

            {/* Split options: Create or Join */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t-2 border-slate-100">
              {/* Option 1: Create Room */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-3xl border-3 border-blue-200 flex flex-col justify-between shadow-sm">
                <div>
                  <h3 className="font-black text-base text-blue-950 mb-1 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-blue-600" /> Criar Sala com Amigos
                  </h3>
                  <p className="text-xs text-slate-600 mb-4 font-semibold">
                    Gere uma sala privada para jogar com amigos ou bots.
                  </p>

                  <div className="space-y-3 mb-4 text-xs">
                    <div>
                      <span className="text-slate-700 flex items-center gap-1 mb-1 font-black">
                        <Clock className="w-3.5 h-3.5 text-amber-500" /> Tempo de Turno (vs Humanos):
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {[
                          { sec: 30, label: '30s (Rápido)' },
                          { sec: 60, label: '1 Min (60s)' },
                          { sec: 90, label: '1m30s (Padrão ⭐)' },
                          { sec: 120, label: '2 Min (120s)' },
                        ].map((item) => (
                          <button
                            key={item.sec}
                            type="button"
                            onClick={() => setTurnDuration(item.sec)}
                            className={`py-2 px-1 rounded-xl text-[11px] font-black cursor-pointer transition-all border-2 text-center ${
                              turnDuration === item.sec
                                ? 'bg-gradient-to-r from-yellow-300 to-amber-400 text-amber-950 border-white shadow-md scale-102 ring-2 ring-amber-400'
                                : 'bg-white text-slate-700 border-blue-200 hover:bg-blue-100'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreate}
                  className="w-full py-3 rounded-2xl bg-gradient-to-b from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_0_#3730a3] active:shadow-[0_1px_0_#3730a3] active:translate-y-0.5 border-2 border-white transition-all"
                >
                  <Plus className="w-4 h-4" /> Criar Sala
                </button>
              </div>

              {/* Option 2: Join Room */}
              <form
                onSubmit={handleJoin}
                className="bg-gradient-to-br from-amber-50 to-yellow-50 p-5 rounded-3xl border-3 border-amber-200 flex flex-col justify-between shadow-sm"
              >
                <div>
                  <h3 className="font-black text-base text-amber-950 mb-1 flex items-center gap-1.5">
                    <Play className="w-4 h-4 text-amber-600" /> Entrar em Sala
                  </h3>
                  <p className="text-xs text-slate-600 mb-3 font-semibold">
                    Digite o código da sala para jogar ou assistir a partida.
                  </p>

                  {/* Mode Selector: Play vs Watch */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-amber-200/60 rounded-2xl border border-amber-300 mb-3">
                    <button
                      type="button"
                      onClick={() => setJoinMode('play')}
                      className={`py-1.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        joinMode === 'play'
                          ? 'bg-amber-400 text-slate-950 shadow-sm border border-white'
                          : 'text-amber-950 hover:bg-white/50'
                      }`}
                    >
                      <span>🎮</span> Jogador
                    </button>
                    <button
                      type="button"
                      onClick={() => setJoinMode('watch_hidden')}
                      className={`py-1.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        joinMode !== 'play'
                          ? 'bg-sky-500 text-white shadow-sm border border-white'
                          : 'text-amber-950 hover:bg-white/50'
                      }`}
                    >
                      <span>👁️</span> Assistir (TV)
                    </button>
                  </div>

                  {/* Spectator Sub-options */}
                  {joinMode !== 'play' && (
                    <div className="p-2.5 bg-sky-50 rounded-2xl border-2 border-sky-200 mb-3 space-y-1.5 animate-in fade-in">
                      <div className="text-[10px] font-black text-sky-900 uppercase">
                        Modo de Visualização para Transmissão:
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setJoinMode('watch_hidden')}
                          className={`p-1.5 rounded-xl border text-left text-[11px] font-black cursor-pointer transition-all ${
                            joinMode === 'watch_hidden'
                              ? 'bg-sky-500 text-white border-sky-600 shadow-sm'
                              : 'bg-white text-slate-700 border-sky-200 hover:bg-sky-100'
                          }`}
                        >
                          <div>🔒 Só a Mesa</div>
                          <div className="text-[9px] opacity-80">Mãos ocultas</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setJoinMode('watch_open')}
                          className={`p-1.5 rounded-xl border text-left text-[11px] font-black cursor-pointer transition-all ${
                            joinMode === 'watch_open'
                              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-black'
                              : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100 font-bold'
                          }`}
                        >
                          <div>👀 Cartas Abertas</div>
                          <div className="text-[9px] opacity-80">Modo Juiz / TV</div>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mb-2">
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      Código da Sala:
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: K89X ou @K89X"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      maxLength={6}
                      className="w-full uppercase font-mono tracking-widest text-center text-2xl font-black bg-white border-3 border-amber-300 rounded-2xl py-2 text-amber-900 focus:outline-none focus:border-amber-500 shadow-inner"
                    />
                  </div>

                  {/* Prefix hints */}
                  <div className="text-[10px] text-slate-500 font-bold mb-3 bg-amber-100/70 p-2 rounded-xl border border-amber-200 leading-tight">
                    💡 <strong>Atalhos Rápidos:</strong> Digite <code>@CÓDIGO</code> ou <code>*CÓDIGO</code> para assistir a mesa, ou <code>$CÓDIGO</code> para assistir com cartas abertas!
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!joinCodeInput.trim()}
                  className={`w-full py-3 rounded-2xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer border-2 border-white transition-all ${
                    joinMode === 'play'
                      ? 'bg-gradient-to-b from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-[0_4px_0_#c2410c] active:shadow-[0_1px_0_#c2410c]'
                      : 'bg-gradient-to-b from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-[0_4px_0_#1e40af] active:shadow-[0_1px_0_#1e40af]'
                  } disabled:opacity-40 active:translate-y-0.5`}
                >
                  {joinMode === 'play' ? (
                    <>
                      <ArrowRight className="w-4 h-4" /> Entrar para Jogar
                    </>
                  ) : (
                    <>
                      <span>👁️</span> Assistir Transmissão
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Waiting in Room Screen */
          <div className="space-y-6">
            {/* Room Header & Code */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500 rounded-3xl border-4 border-white shadow-xl text-white">
              <div>
                <div className="text-[11px] font-black text-yellow-300 uppercase tracking-wider">
                  Código da Sala
                </div>
                <div className="text-3xl font-black font-mono tracking-widest text-white drop-shadow">
                  {roomId}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={copyRoomCode}
                  className="px-3.5 py-2 rounded-2xl bg-white text-slate-900 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all border-2 border-yellow-300 shadow active:scale-95"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-600">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-amber-500" />
                      <span>Copiar Código</span>
                    </>
                  )}
                </button>

                {/* Tournament / Stream Link Sharing Button */}
                <button
                  type="button"
                  onClick={() => setShowBroadcastShare(!showBroadcastShare)}
                  className="px-3.5 py-2 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all border-2 border-white shadow active:scale-95"
                  title="Compartilhar Link de Transmissão / Espectador"
                >
                  <span>📺</span>
                  <span>Transmissão</span>
                </button>

                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="px-3.5 py-2 rounded-2xl bg-rose-500 hover:bg-rose-600 border-2 border-white text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all shadow active:scale-95"
                  title="Sair desta sala e voltar ao menu principal"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              </div>
            </div>

            {/* Broadcast Sharing Card */}
            {showBroadcastShare && (
              <div className="p-4 bg-sky-50 border-3 border-sky-300 rounded-3xl text-slate-800 space-y-3 shadow-md animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="font-black text-xs text-sky-950 flex items-center gap-1.5 uppercase tracking-wide">
                    <span>📡</span> Links de Transmissão & Espectador
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBroadcastShare(false)}
                    className="text-slate-400 hover:text-slate-700 text-xs font-black cursor-pointer"
                  >
                    ✕ Fechar
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Copie o link para comentaristas, telão do torneio ou amigos assistirem sem ocupar vaga de jogador:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Clean Stream (Hidden Hands) */}
                  <div className="p-3 bg-white rounded-2xl border-2 border-sky-200 flex flex-col justify-between gap-2 shadow-xs">
                    <div>
                      <div className="text-xs font-black text-slate-900 flex items-center gap-1">
                        <span>🔒</span> Transmissão de Torneio (Mesa)
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        Mostra apenas a mesa e descarte (sem ver cartas dos jogadores).
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}${window.location.pathname}?room=${roomId}&watch=1`;
                        navigator.clipboard.writeText(url).then(() => {
                          setCopiedBroadcastType('clean');
                          setTimeout(() => setCopiedBroadcastType(null), 2500);
                        });
                      }}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedBroadcastType === 'clean' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedBroadcastType === 'clean' ? 'Link Copiado!' : 'Copiar Link (Mesa)'}</span>
                    </button>
                  </div>

                  {/* Open Hands (TV / Judge Mode) */}
                  <div className="p-3 bg-white rounded-2xl border-2 border-amber-200 flex flex-col justify-between gap-2 shadow-xs">
                    <div>
                      <div className="text-xs font-black text-amber-950 flex items-center gap-1">
                        <span>👀</span> Transmissão Aberta (Modo TV / Juiz)
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        Exibe todas as mãos abertas para narradores e telão.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}${window.location.pathname}?room=${roomId}&watch=open`;
                        navigator.clipboard.writeText(url).then(() => {
                          setCopiedBroadcastType('open');
                          setTimeout(() => setCopiedBroadcastType(null), 2500);
                        });
                      }}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedBroadcastType === 'open' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedBroadcastType === 'open' ? 'Link Copiado!' : 'Copiar Link (TV Aberta)'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Players in Room */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-amber-500" />
                    Jogadores na Mesa ({players.length}/4)
                  </h3>
                  <span className="text-[11px] text-slate-500 font-bold">
                    · {players.filter((p) => !p.isBot).length} humano(s), {players.filter((p) => p.isBot).length} robô(s)
                  </span>
                </div>

                {isHost && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {players.length < 4 && (
                      <>
                        <button
                          type="button"
                          onClick={onAddBot}
                          className="px-3 py-1.5 rounded-2xl bg-gradient-to-r from-yellow-300 to-amber-400 hover:from-yellow-200 hover:to-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow transition-all active:scale-95 border-2 border-white"
                          title="Adiciona mais um robô na vaga disponível"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Robô</span>
                        </button>

                        <button
                          type="button"
                          onClick={onFillBots}
                          className="px-3 py-1.5 rounded-2xl bg-sky-100 hover:bg-sky-200 text-sky-900 border-2 border-sky-300 text-xs font-black cursor-pointer transition-colors"
                          title="Preenche todas as vagas restantes de uma vez"
                        >
                          Completar
                        </button>
                      </>
                    )}

                    {onResetRoom && (
                      <button
                        type="button"
                        onClick={onResetRoom}
                        className="px-2.5 py-1.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 border-2 border-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        title="Limpa o estado da mesa e redefine para nova partida"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Resetar</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {players.map((p) => {
                  const isMe = p.id === myPlayerId;
                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-2xl border-3 flex items-center justify-between shadow-sm ${
                        isMe
                          ? 'bg-amber-100/90 border-amber-400 ring-2 ring-yellow-400/40'
                          : 'bg-slate-50 border-sky-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{p.avatar}</span>
                        <div>
                          <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span className="truncate max-w-[120px]">{p.name}</span>
                            {isMe && (
                              <span className="text-[10px] text-amber-700 font-black">(Você)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold">
                            {p.isHost && (
                              <span className="text-amber-600 font-black">👑 Anfitrião</span>
                            )}
                            {p.isBot && (
                              <span className="text-sky-600 font-black">🤖 Robô IA</span>
                            )}
                            {!p.isBot && !p.isHost && (
                              <span className="text-emerald-600 font-black">● Conectado</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Host Moderation Controls */}
                      {(isHost || currentUser?.role === 'admin') && (
                        <div className="flex items-center gap-1 shrink-0">
                          {p.isBot ? (
                            <button
                              type="button"
                              onClick={() => onRemoveBot(p.id)}
                              className="p-1.5 rounded-xl text-rose-500 hover:text-white hover:bg-rose-500 cursor-pointer transition-colors"
                              title="Remover Robô"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : !isMe ? (
                            <>
                              {onTransferHost && (
                                <button
                                  type="button"
                                  onClick={() => onTransferHost(p.id)}
                                  className="p-1.5 rounded-xl text-amber-500 hover:text-slate-900 hover:bg-amber-400 cursor-pointer transition-colors"
                                  title="Passar Liderança da Sala para este jogador"
                                >
                                  <Crown className="w-4 h-4" />
                                </button>
                              )}
                              {onKickPlayer && (
                                <button
                                  type="button"
                                  onClick={() => onKickPlayer(p.id)}
                                  className="p-1.5 rounded-xl text-rose-500 hover:text-white hover:bg-rose-500 cursor-pointer transition-colors"
                                  title="Expulsar Jogador da Sala"
                                >
                                  <UserX className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Empty slot cues */}
                {Array.from({ length: 4 - players.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="p-3 rounded-2xl border-3 border-dashed border-sky-300 flex items-center justify-center text-xs text-sky-600 font-bold bg-sky-50/50"
                  >
                    Vaga Aberta
                  </div>
                ))}
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-4 border-t-2 border-slate-100 flex flex-col sm:flex-row items-center gap-3">
              {isHost ? (
                <button
                  type="button"
                  onClick={onStartGame}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-b from-emerald-400 to-green-600 hover:from-emerald-300 hover:to-green-500 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[0_5px_0_#15803d] active:shadow-[0_1px_0_#15803d] active:translate-y-1 border-3 border-white transition-all"
                >
                  <Play className="w-5 h-5 fill-white" />
                  {players.length < 2
                    ? 'Iniciar Partida (+1 Robô Automático)'
                    : `Iniciar Partida (${players.length} Jogadores)`}
                </button>
              ) : (
                <div className="w-full text-center py-3 text-xs text-amber-800 font-black animate-pulse bg-yellow-100 rounded-2xl border-2 border-yellow-300 shadow-sm">
                  Aguardando o anfitrião iniciar a partida...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
