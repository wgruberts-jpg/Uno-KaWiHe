import React, { useState, useEffect } from 'react';
import { Card, CardColor, GameState, Player, ActiveEmote } from '../types/uno.js';
import { UnoCard } from './UnoCard.js';
import { ColorPickerModal } from './ColorPickerModal.js';
import { TableDirectionArrows } from './TableDirectionArrows.js';
import { EmoteBubble } from './EmoteBubble.js';
import { EmotePicker } from './EmotePicker.js';
import { TableScoreboardModal } from './TableScoreboardModal.js';
import { statsManager } from '../services/statsManager.js';
import {
  Volume2,
  VolumeX,
  RotateCw,
  RotateCcw,
  AlertTriangle,
  Flame,
  ArrowRight,
  LogOut,
  HelpCircle,
  Clock,
  Sparkles,
  Settings,
  MessageCircle,
  Maximize2,
  Minimize2,
  Trophy,
  BarChart2
} from 'lucide-react';
import { sound } from '../services/sound.js';

interface GameBoardProps {
  state: GameState;
  myPlayerId: string;
  onPlayCard: (cardId: string, chosenColor?: CardColor) => void;
  onDrawCard: () => void;
  onPassTurn: () => void;
  onCallUno: () => void;
  onCatchUno: (targetPlayerId: string) => void;
  onLeave: () => void;
  onToggleChat: () => void;
  unreadChatCount: number;
  activeEmotes?: Record<string, ActiveEmote>;
  onSendEmote?: (emoteId: string) => void;
  onOpenSettings?: () => void;
  onOpenStats?: () => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  state,
  myPlayerId,
  onPlayCard,
  onDrawCard,
  onPassTurn,
  onCallUno,
  onCatchUno,
  onLeave,
  onToggleChat,
  unreadChatCount,
  activeEmotes = {},
  onSendEmote,
  onOpenSettings,
  onOpenStats,
}) => {
  const [isMuted, setIsMuted] = useState(() => sound.getIsMuted());
  const [selectedWildCard, setSelectedWildCard] = useState<Card | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [flyingCardId, setFlyingCardId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTableScoreboardOpen, setIsTableScoreboardOpen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const me = state.players.find((p) => p.id === myPlayerId);
  const isMyTurn = state.currentTurnPlayerId === myPlayerId;
  const opponents = state.players.filter((p) => p.id !== myPlayerId);

  const handleToggleMute = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  // Check if a card in my hand is playable
  const isPlayable = (card: Card) => {
    if (!isMyTurn) return false;
    if (!state.discardPileTop) return true;
    if (card.color === 'wild') return true;
    if (card.color === state.currentColor) return true;
    if (card.value === state.discardPileTop.value) return true;
    return false;
  };

  const hasPlayableCard = state.myHand.some(isPlayable);

  const handleCardClick = (card: Card) => {
    if (!isMyTurn) {
      setFeedbackToast('Aguarde a sua vez de jogar!');
      setTimeout(() => setFeedbackToast(null), 2500);
      return;
    }

    if (!isPlayable(card)) {
      setFeedbackToast(
        `Essa carta não combina! A mesa pede ${currentColorNames[state.currentColor].toUpperCase()} ou valor ${state.discardPileTop?.value.toUpperCase()}.`
      );
      sound.penaltyCatch();
      setTimeout(() => setFeedbackToast(null), 3500);
      return;
    }

    if (card.color === 'wild') {
      setSelectedWildCard(card);
      return;
    }

    setFeedbackToast(null);
    setFlyingCardId(card.id);
    statsManager.recordCardPlayed(card);
    onPlayCard(card.id);
    setTimeout(() => setFlyingCardId(null), 400);
  };

  const handleColorPicked = (color: CardColor) => {
    if (!selectedWildCard) return;
    setFlyingCardId(selectedWildCard.id);
    statsManager.recordCardPlayed(selectedWildCard, color);
    onPlayCard(selectedWildCard.id, color);
    setSelectedWildCard(null);
    setTimeout(() => setFlyingCardId(null), 400);
  };

  const handleDropOnCenter = (e: React.DragEvent) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    if (!cardId) return;
    const card = state.myHand.find((c) => c.id === cardId);
    if (card) {
      handleCardClick(card);
    }
  };

  const handleDrawCard = () => {
    statsManager.recordCardDrawn(1);
    onDrawCard();
  };

  const handleCallUno = () => {
    statsManager.recordUnoCalled();
    onCallUno();
  };

  const handleCatchUno = (targetPlayerId: string) => {
    statsManager.recordCaughtUno();
    onCatchUno(targetPlayerId);
  };

  // Turn time percentage
  const timerPercent = Math.max(0, Math.min(100, (state.turnTimeLeft / state.turnDuration) * 100));

  const currentColorBg: Record<CardColor, string> = {
    red: 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-rose-500/40',
    blue: 'bg-gradient-to-r from-cyan-400 to-blue-600 text-white shadow-sky-500/40',
    green: 'bg-gradient-to-r from-lime-400 to-emerald-500 text-slate-950 shadow-emerald-500/40',
    yellow: 'bg-gradient-to-r from-yellow-300 to-amber-400 text-amber-950 shadow-amber-400/40',
    wild: 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-purple-500/40',
  };

  const currentColorNames: Record<CardColor, string> = {
    red: 'Vermelho',
    blue: 'Azul',
    green: 'Verde',
    yellow: 'Amarelo',
    wild: 'Coringa',
  };

  return (
    <div className="relative w-full h-[100dvh] max-h-[100dvh] bg-gradient-to-b from-sky-400 via-sky-300 to-indigo-300 overflow-hidden flex flex-col select-none text-slate-800 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Decorative Cartoon Elements (clouds & soft stars) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-10 left-12 w-32 h-16 bg-white rounded-full blur-[1px]" />
        <div className="absolute top-8 left-20 w-24 h-24 bg-white rounded-full blur-[1px]" />
        <div className="absolute top-24 right-20 w-44 h-20 bg-white rounded-full blur-[1px]" />
        <div className="absolute top-16 right-32 w-28 h-28 bg-white rounded-full blur-[1px]" />
        <div className="absolute bottom-32 left-1/4 w-36 h-18 bg-white rounded-full blur-[1px]" />
      </div>

      {/* Top Header Bar */}
      <header className="h-11 sm:h-12 shrink-0 border-b-2 sm:border-b-4 border-white/70 px-2 sm:px-4 flex items-center justify-between bg-white/90 backdrop-blur-md z-30 shadow-md">
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-rose-500 via-yellow-400 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-[10px] sm:text-[11px] shadow border-2 border-white tracking-wider">
              KWH
            </div>
            <span className="font-black text-xs text-slate-800 hidden md:inline">Uno KaWiHe</span>
          </div>

          <span className="font-black text-[11px] sm:text-xs text-amber-950 bg-gradient-to-r from-yellow-300 to-amber-300 px-2.5 sm:px-3.5 py-1 rounded-xl sm:rounded-2xl border-2 border-white shadow-sm flex items-center gap-1">
            <span>🏷️</span> <span className="hidden xs:inline">SALA:</span> {state.roomId}
          </span>

          <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-sky-900 bg-sky-100/90 px-2.5 py-1 rounded-xl sm:rounded-2xl border-2 border-white shadow-sm">
            <span>Sentido:</span>
            {state.turnDirection === 1 ? (
              <span className="flex items-center gap-1 text-amber-600 font-black">
                <RotateCw className="w-3.5 h-3.5" /> Horário
              </span>
            ) : (
              <span className="flex items-center gap-1 text-pink-600 font-black">
                <RotateCcw className="w-3.5 h-3.5" /> Anti-horário
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Chat Toggle Button with Unread Badge */}
          <button
            type="button"
            onClick={onToggleChat}
            className="relative p-1.5 sm:p-2 rounded-xl sm:rounded-2xl bg-white border-2 border-sky-300 text-sky-900 hover:bg-sky-50 cursor-pointer transition-all shadow-sm active:scale-95 flex items-center gap-1 font-bold text-xs"
            title="Abrir Chat da Sala"
          >
            <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-600" />
            <span className="hidden md:inline">Chat</span>
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white animate-pulse">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Fullscreen Toggle Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 sm:p-2 rounded-xl sm:rounded-2xl bg-white border-2 border-purple-300 text-purple-900 hover:bg-purple-50 cursor-pointer transition-all shadow-sm active:scale-95"
            title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia (ocultar barras)'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600" />
            )}
          </button>

          {/* Table Leaderboard Button */}
          <button
            type="button"
            onClick={() => setIsTableScoreboardOpen(true)}
            className="p-1.5 sm:p-2 rounded-xl sm:rounded-2xl bg-white border-2 border-yellow-400 text-amber-900 hover:bg-yellow-50 cursor-pointer transition-all shadow-sm active:scale-95 flex items-center gap-1 font-bold text-xs"
            title="Ver Placar da Mesa (Sessão)"
          >
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 fill-amber-400" />
            <span className="hidden lg:inline">Placar</span>
          </button>

          {/* Player Career Stats & Trophies */}
          {onOpenStats && (
            <button
              type="button"
              onClick={onOpenStats}
              className="p-1.5 sm:p-2 rounded-xl sm:rounded-2xl bg-white border-2 border-indigo-300 text-indigo-900 hover:bg-indigo-50 cursor-pointer transition-all shadow-sm active:scale-95 flex items-center gap-1 font-bold text-xs"
              title="Ver Minhas Estatísticas & Troféus"
            >
              <BarChart2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500" />
              <span className="hidden lg:inline">Stats</span>
            </button>
          )}

          {/* Settings Gear Button */}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-1.5 sm:p-2 rounded-xl sm:rounded-2xl bg-white border-2 border-yellow-300 text-amber-900 hover:bg-yellow-50 cursor-pointer transition-all shadow-sm active:scale-95 flex items-center gap-1 font-bold text-xs"
              title="Configurações & Modo Criança"
            >
              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
              <span className="hidden md:inline">Ajustes</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={handleToggleMute}
            className="p-1.5 sm:p-2 rounded-xl sm:rounded-2xl bg-white border-2 border-sky-200 text-slate-700 hover:bg-sky-50 cursor-pointer transition-all shadow-sm active:scale-95"
            title={isMuted ? 'Desmutar sons' : 'Mutar sons'}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
            )}
          </button>

          {/* Leave Button */}
          <button
            type="button"
            onClick={onLeave}
            className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl sm:rounded-2xl bg-gradient-to-b from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 border-2 border-white text-white text-[11px] sm:text-xs font-black flex items-center gap-1 cursor-pointer transition-all shadow-md active:scale-95"
            title="Sair para o Menu Principal"
          >
            <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      {/* Main Table Area */}
      <main className="flex-1 min-h-0 relative flex flex-col justify-between p-1 sm:p-2 md:p-3 overflow-hidden">
        {/* Opponents Layout (Around Table) */}
        <div className="w-full shrink-0 flex items-center justify-around gap-1.5 sm:gap-2 px-1 py-0.5 z-20">
          {opponents.map((opp) => {
            const isOppTurn = state.currentTurnPlayerId === opp.id;
            const isCatchable = state.unoVulnerablePlayerId === opp.id;

            return (
              <div
                key={opp.id}
                className={`relative flex flex-col items-center p-1.5 sm:p-2.5 rounded-2xl sm:rounded-3xl transition-all duration-300 backdrop-blur-sm ${
                  isOppTurn
                    ? 'bg-amber-200 text-slate-950 border-3 sm:border-4 border-amber-400 shadow-2xl scale-102 sm:scale-105 ring-2 sm:ring-4 ring-yellow-300/70'
                    : 'bg-white/90 text-slate-800 border-2 sm:border-3 border-white shadow-md'
                }`}
              >
                {/* Catch UNO Alert Button */}
                {isCatchable && (
                  <button
                    type="button"
                    onClick={() => handleCatchUno(opp.id)}
                    className="absolute -top-3.5 animate-bounce z-30 bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] sm:text-xs px-2.5 sm:px-3.5 py-0.5 sm:py-1 rounded-full shadow-xl border-2 border-white flex items-center gap-1 cursor-pointer"
                  >
                    <AlertTriangle className="w-3 h-3 text-yellow-300" />
                    PEGAR UNO! (+2)
                  </button>
                )}

                {/* Avatar and Name */}
                <div className="relative">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 border-2 sm:border-4 border-white flex items-center justify-center text-xl sm:text-2xl md:text-3xl shadow-md">
                    {opp.avatar}
                  </div>
                  {opp.isHost && (
                    <span className="absolute -top-1.5 -right-1.5 text-xs sm:text-sm drop-shadow">👑</span>
                  )}
                  {opp.cardsCount === 1 && opp.hasCalledUno && (
                    <span className="absolute -bottom-1 -right-2 bg-rose-600 text-white text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full border-2 border-white animate-pulse shadow-md">
                      UNO!
                    </span>
                  )}

                  {/* Opponent Emote Reaction Bubble */}
                  {activeEmotes[opp.id] && (
                    <EmoteBubble emote={activeEmotes[opp.id]} side="right" />
                  )}
                </div>

                <span className="text-[11px] sm:text-xs md:text-sm font-black text-slate-900 mt-1 truncate max-w-[80px] sm:max-w-[110px] md:max-w-[130px]">
                  {opp.name}
                </span>

                {/* Opponent Card Stack visualization or Face-up cards for Kids Mode */}
                {opp.botHand && opp.botHand.length > 0 ? (
                  <div className="flex flex-col items-center mt-0.5">
                    <span className="text-[8px] sm:text-[9px] font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded-full border border-emerald-300 mb-0.5">
                      Modo Criança
                    </span>
                    <div className="flex items-center -space-x-4 sm:-space-x-5 py-0.5 overflow-x-auto max-w-[120px] sm:max-w-[160px]">
                      {opp.botHand.map((c, i) => (
                        <div key={c.id || i} className="transform scale-70 origin-center shrink-0 hover:scale-100 transition-transform">
                          <UnoCard card={c} size="sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center -space-x-4 sm:-space-x-5 mt-1">
                    {Array.from({ length: Math.min(opp.cardsCount, 5) }).map((_, i) => (
                      <div
                        key={i}
                        className="w-6 h-9 sm:w-7 sm:h-11 md:w-8 md:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-rose-500 via-red-500 to-red-600 border sm:border-2 border-white shadow-sm flex items-center justify-center -rotate-6 transform hover:rotate-0 transition-transform"
                        title={`${opp.name} tem ${opp.cardsCount} cartas`}
                      >
                        <div className="w-4 h-3 sm:w-5 sm:h-4 -rotate-25 rounded-full bg-slate-950 flex items-center justify-center shadow-inner border border-yellow-300/60">
                          <span className="text-[7px] sm:text-[8px] font-black text-yellow-300 italic">U</span>
                        </div>
                      </div>
                    ))}
                    {opp.cardsCount > 5 && (
                      <span className="text-[10px] sm:text-xs font-black text-rose-600 pl-1">
                        +{opp.cardsCount - 5}
                      </span>
                    )}
                  </div>
                )}

                <span className="text-[10px] sm:text-xs font-black text-white mt-1 font-mono bg-gradient-to-r from-pink-500 to-rose-500 px-2 sm:px-2.5 py-0.2 rounded-full border border-white shadow-sm">
                  {opp.cardsCount} {opp.cardsCount === 1 ? 'carta' : 'cartas'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Central Table Center (Deck, Discard Pile, Color Indicator, Direction) */}
        <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center z-10 py-0.5">
          {/* Turn status banner */}
          <div className="mb-1 flex flex-col items-center shrink-0">
            {isMyTurn ? (
              <div className="flex flex-col items-center">
                <div className="bg-gradient-to-r from-yellow-300 via-amber-300 to-yellow-400 text-slate-950 font-black text-[11px] sm:text-xs md:text-sm px-4 sm:px-6 py-0.5 sm:py-1 rounded-full shadow-lg border-2 border-white animate-bounce flex items-center gap-1.5 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  Sua vez de jogar!
                </div>
                <div className="text-[9px] sm:text-[11px] text-sky-950 font-bold mt-0.5 bg-white/70 px-2.5 py-0.2 rounded-full border border-white/60">
                  👉 Toque ou arraste uma carta destacada para a mesa
                </div>
              </div>
            ) : (
              <div className="text-[11px] sm:text-xs text-slate-700 flex items-center gap-1 font-black bg-white/80 px-3 py-0.5 rounded-full border-2 border-white shadow-sm">
                <Clock className="w-3 h-3 text-slate-500" />
                Vez de {state.players.find((p) => p.id === state.currentTurnPlayerId)?.name || '...'}
              </div>
            )}

            {/* Error or help toast */}
            {feedbackToast && (
              <div className="bg-rose-500 border-2 border-white text-white text-[10px] sm:text-xs px-3 sm:px-4 py-1 rounded-full shadow-2xl mt-1 font-black animate-bounce z-30">
                ⚠️ {feedbackToast}
              </div>
            )}

            {/* Turn timer bar or Unlimited badge */}
            {state.turnDuration > 0 ? (
              <div className="w-32 sm:w-44 md:w-56 h-1.5 sm:h-2 bg-white/70 rounded-full mt-1 overflow-hidden border border-white shadow-inner">
                <div
                  className={`h-full transition-all duration-1000 ${
                    timerPercent > 40 ? 'bg-emerald-500' : timerPercent > 20 ? 'bg-amber-400' : 'bg-rose-500'
                  }`}
                  style={{ width: `${timerPercent}%` }}
                />
              </div>
            ) : (
              <div className="text-[9px] sm:text-[10px] text-emerald-900 font-black mt-1 bg-emerald-100 px-2.5 py-0.2 rounded-full border border-emerald-300 shadow-sm flex items-center gap-1">
                <span>🧸 Modo Sem Pressa</span>
              </div>
            )}
          </div>

          {/* Cards Table Felt Circle (Drop Target for Drag & Drop) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={handleDropOnCenter}
            className="relative w-44 h-44 sm:w-52 sm:h-52 md:w-60 md:h-60 lg:w-70 lg:h-70 rounded-full bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 border-4 sm:border-6 md:border-8 border-white shadow-[0_12px_32px_rgba(0,0,0,0.22)] ring-4 sm:ring-8 ring-emerald-300/50 flex items-center justify-center transition-transform hover:scale-[1.01]"
          >
            {/* Direction Arrows flanking the table on the left and right */}
            <TableDirectionArrows direction={state.turnDirection} />

            {/* Center Play Area */}
            <div className="flex items-center gap-3 sm:gap-4 md:gap-6 z-20">
              {/* Draw Pile (Deck) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={isMyTurn ? handleDrawCard : undefined}
                  disabled={!isMyTurn}
                  className={`group relative cursor-pointer transition-transform ${
                    isMyTurn ? 'hover:scale-105 active:scale-95' : 'opacity-85'
                  }`}
                  title="Comprar carta do baralho"
                >
                  {/* Visual 3D Stack depth */}
                  <div className="absolute top-1 left-1 w-full h-full rounded-2xl sm:rounded-3xl bg-rose-700 border border-white pointer-events-none" />
                  <div className="absolute top-0.5 left-0.5 w-full h-full rounded-2xl sm:rounded-3xl bg-rose-800 border border-white pointer-events-none" />
                  <UnoCard isBack size="md" />

                  {isMyTurn && !hasPlayableCard && (
                    <span className="absolute -bottom-2 -right-1 bg-gradient-to-r from-yellow-300 to-amber-400 text-slate-950 font-black text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full shadow-xl border border-white animate-bounce">
                      COMPRE
                    </span>
                  )}
                </button>
                <span className="text-[9px] sm:text-[11px] text-white font-mono mt-1 font-black drop-shadow bg-emerald-700/60 px-2 py-0.2 rounded-full border border-white/40">
                  {state.deckCardsCount} rest.
                </span>
              </div>

              {/* Discard Pile */}
              <div
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => {
                  if (hasPlayableCard && isMyTurn) {
                    setFeedbackToast("Toque na carta da sua mão que deseja jogar aqui!");
                    setTimeout(() => setFeedbackToast(null), 3000);
                  }
                }}
              >
                {state.discardPileTop ? (
                  <UnoCard card={state.discardPileTop} size="md" />
                ) : (
                  <div className="w-16 h-24 sm:w-20 sm:h-30 md:w-24 md:h-36 rounded-2xl border-2 sm:border-3 border-dashed border-white/60 bg-white/20 flex items-center justify-center text-xs text-white font-black">
                    Vazio
                  </div>
                )}
                <span className="text-[9px] sm:text-[11px] text-white font-black mt-1 drop-shadow bg-emerald-700/60 px-2 py-0.2 rounded-full border border-white/40">
                  Mesa
                </span>
              </div>
            </div>

            {/* Active Color Indicator Circle Badge */}
            <div
              className={`absolute -top-3 sm:-top-4 px-2.5 sm:px-4 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-lg border-2 sm:border-3 border-white flex items-center gap-1.5 ${
                currentColorBg[state.currentColor]
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-white shadow-sm animate-ping"></span>
              Cor: {currentColorNames[state.currentColor]}
            </div>

            {/* Direction Pill below circle */}
            <div
              className={`absolute -bottom-3 sm:-bottom-4 px-2.5 sm:px-4 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-black tracking-wide bg-white/95 shadow-xl flex items-center gap-1.5 z-20 border-2 sm:border-3 transition-colors ${
                state.turnDirection === 1
                  ? 'border-amber-400 text-amber-900'
                  : 'border-pink-400 text-pink-900'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  state.turnDirection === 1
                    ? 'bg-amber-400 shadow-[0_0_8px_1px_rgba(250,204,21,0.9)]'
                    : 'bg-pink-400 shadow-[0_0_8px_1px_rgba(244,114,182,0.9)]'
                }`}
              />
              <span>Sentido: {state.turnDirection === 1 ? 'Horário ↻' : 'Anti-horário ↺'}</span>
            </div>
          </div>
        </div>

        {/* Bottom Area: Controls & Player Hand */}
        <div className="w-full shrink-0 flex flex-col items-center z-20 pb-0.5 sm:pb-1">
          {/* Action Row: UNO button & Pass button */}
          <div className="w-full max-w-2xl flex items-center justify-between px-2 sm:px-4 mb-0.5 sm:mb-1">
            {/* Call UNO button & Emote picker */}
            <div className="relative flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={handleCallUno}
                className={`py-1.5 sm:py-2 md:py-2.5 px-3 sm:px-5 md:px-6 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs md:text-sm uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 border-2 sm:border-4 border-white ${
                  state.myHand.length <= 2
                    ? 'bg-gradient-to-b from-yellow-300 via-orange-500 to-red-500 text-white animate-bounce shadow-[0_4px_0_#991b1b] active:shadow-[0_1px_0_#991b1b] active:translate-y-0.5'
                    : 'bg-gradient-to-b from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white shadow-[0_3px_0_#9f1239] active:shadow-[0_1px_0_#9f1239] active:translate-y-0.5'
                }`}
              >
                <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-yellow-300 text-yellow-300" />
                GRITAR UNO!
                {me?.hasCalledUno && (
                  <span className="text-[9px] sm:text-[10px] bg-white text-rose-600 px-1.5 py-0.2 rounded-full ml-1 font-black shadow-sm">
                    OK
                  </span>
                )}
              </button>

              {/* Emote Reaction Picker */}
              <EmotePicker onSelectEmote={(emote) => onSendEmote?.(emote.id)} />

              {/* My Active Emote Bubble */}
              {activeEmotes[myPlayerId] && (
                <EmoteBubble emote={activeEmotes[myPlayerId]} side="top" />
              )}
            </div>

            {/* Pass Turn Button (Available if player has drawn) */}
            {isMyTurn && (
              <button
                type="button"
                onClick={onPassTurn}
                className="py-1.5 sm:py-2 md:py-2.5 px-3 sm:px-4 md:px-5 rounded-xl sm:rounded-2xl bg-gradient-to-b from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-white text-[11px] sm:text-xs md:text-sm font-black border-2 sm:border-3 border-white shadow-[0_3px_0_#1e40af] active:shadow-[0_1px_0_#1e40af] active:translate-y-0.5 flex items-center gap-1 cursor-pointer transition-all"
              >
                <span>Passar Vez</span>
                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>

          {/* Cards in Hand Fan Layout */}
          <div className="w-full max-w-4xl px-1 sm:px-2 overflow-x-auto pb-0.5 pt-0.5 flex items-center justify-center">
            <div
              className={`flex items-center ${
                state.myHand.length > 8
                  ? '-space-x-8 sm:-space-x-10 md:-space-x-12'
                  : state.myHand.length > 5
                  ? '-space-x-6 sm:-space-x-8 md:-space-x-10'
                  : '-space-x-5 sm:-space-x-7 md:-space-x-8'
              } hover:-space-x-3 sm:hover:-space-x-4 transition-all duration-300 py-1 sm:py-1.5 px-2 sm:px-4`}
            >
              {state.myHand.map((card, idx) => {
                const playable = isPlayable(card);
                const isFlying = flyingCardId === card.id;

                return (
                  <div
                    key={card.id}
                    className={`transform transition-all duration-300 hover:z-40 hover:-translate-y-3 sm:hover:-translate-y-5 ${
                      isFlying ? '-translate-y-48 scale-75 opacity-20 pointer-events-none' : ''
                    }`}
                    style={{ zIndex: isFlying ? 50 : idx }}
                  >
                    <UnoCard
                      card={card}
                      isPlayable={playable}
                      onClick={() => handleCardClick(card)}
                      size="md"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Color Picker for Wild cards */}
      <ColorPickerModal
        isOpen={!!selectedWildCard}
        onSelectColor={handleColorPicked}
      />

      {/* Table Scoreboard Session Modal */}
      <TableScoreboardModal
        isOpen={isTableScoreboardOpen}
        onClose={() => setIsTableScoreboardOpen(false)}
        tableScores={state.tableScores}
        fastestSeconds={state.tableFastestSeconds}
        myPlayerId={myPlayerId}
        roomId={state.roomId}
      />
    </div>
  );
};
