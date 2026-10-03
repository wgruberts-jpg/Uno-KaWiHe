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
  BarChart2,
  Eye,
  EyeOff,
  Radio,
  Zap,
  Menu,
  X,
  ChevronRight,
  ChevronLeft
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
  onToggleSpectatorReveal?: (reveal: boolean) => void;
}

const currentColorBg: Record<CardColor, string> = {
  red: 'bg-rose-500 text-white border-rose-600',
  blue: 'bg-sky-500 text-white border-sky-600',
  green: 'bg-emerald-500 text-white border-emerald-600',
  yellow: 'bg-amber-400 text-slate-950 border-amber-500',
  wild: 'bg-gradient-to-r from-rose-500 via-yellow-400 via-emerald-500 to-sky-500 text-white border-white',
};

const currentColorNames: Record<CardColor, string> = {
  red: 'Vermelho',
  blue: 'Azul',
  green: 'Verde',
  yellow: 'Amarelo',
  wild: 'Coringa',
};

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
  onToggleSpectatorReveal,
}) => {
  const [isMuted, setIsMuted] = useState(() => sound.getIsMuted());
  const [selectedWildCard, setSelectedWildCard] = useState<Card | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [flyingCardId, setFlyingCardId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTableScoreboardOpen, setIsTableScoreboardOpen] = useState(false);
  const [localSpectatorShowCards, setLocalSpectatorShowCards] = useState(true);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);

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
  const isSpectator = state.isSpectator || !me;
  const isMyTurn = !isSpectator && state.currentTurnPlayerId === myPlayerId;
  const activeTurnPlayer = state.players.find((p) => p.id === state.currentTurnPlayerId);
  const opponents = state.players.filter((p) => p.id !== myPlayerId);

  // Check if someone is on their last card (UNO Climax Suspense)
  const isUnoClimax = activeTurnPlayer && activeTurnPlayer.cardsCount === 1;

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
    if (isSpectator) return;
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

  const handleDrawCard = () => {
    if (isSpectator || !isMyTurn) return;
    statsManager.recordCardDrawn();
    onDrawCard();
  };

  const handleCallUno = () => {
    if (isSpectator) return;
    statsManager.recordUnoCalled();
    onCallUno();
  };

  const handleCatchUno = (targetPlayerId: string) => {
    statsManager.recordCaughtUno();
    onCatchUno(targetPlayerId);
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

  const timerPercent =
    state.turnDuration > 0 ? Math.max(0, Math.min(100, (state.turnTimeLeft / state.turnDuration) * 100)) : 100;

  return (
    <div className="w-full h-full bg-gradient-to-b from-sky-400 via-sky-300 to-indigo-300 flex flex-col justify-between select-none relative overflow-hidden">
      {/* Dramatic Suspense Vignette during UNO climax */}
      {isUnoClimax && (
        <div className="absolute inset-0 pointer-events-none z-10 bg-radial from-transparent via-amber-500/10 to-rose-600/30 animate-pulse" />
      )}

      {/* Top Header Bar (Clean, Space-saving) */}
      <header className="h-10 sm:h-12 shrink-0 border-b-2 sm:border-b-4 border-white/70 px-2 sm:px-4 flex items-center justify-between bg-white/95 backdrop-blur-md z-30 shadow-md">
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-rose-500 via-yellow-400 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-[10px] sm:text-[11px] shadow border-2 border-white tracking-wider">
              KWH
            </div>
            <span className="font-black text-xs text-slate-800 hidden xs:inline">Uno KaWiHe</span>
          </div>

          <span className="font-black text-[11px] sm:text-xs text-amber-950 bg-gradient-to-r from-yellow-300 to-amber-300 px-2.5 sm:px-3.5 py-0.5 sm:py-1 rounded-xl sm:rounded-2xl border-2 border-white shadow-sm flex items-center gap-1">
            <span>🏷️</span> <span className="hidden xs:inline">SALA:</span> {state.roomId}
          </span>

          <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-sky-900 bg-sky-100/90 px-2.5 py-0.5 rounded-xl sm:rounded-2xl border-2 border-white shadow-sm">
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

        {/* Right Header: Chat Shortcut & Collapsible Side Menu Button */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Quick Chat Button */}
          <button
            type="button"
            onClick={onToggleChat}
            className="relative p-1.5 sm:p-2 rounded-xl sm:rounded-2xl bg-white border-2 border-sky-300 text-sky-900 hover:bg-sky-50 cursor-pointer transition-all shadow-sm active:scale-95 flex items-center gap-1 font-bold text-xs"
            title="Abrir Chat da Sala"
          >
            <MessageCircle className="w-4 h-4 text-sky-600" />
            <span className="hidden md:inline">Chat</span>
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white animate-pulse">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Collapsible Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setIsSideMenuOpen(!isSideMenuOpen)}
            className={`py-1.5 px-2.5 sm:px-3 rounded-xl sm:rounded-2xl border-2 font-black text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer transition-all shadow-md active:scale-95 ${
              isSideMenuOpen
                ? 'bg-amber-400 border-white text-slate-950 ring-2 ring-amber-300'
                : 'bg-white border-amber-300 text-slate-800 hover:bg-yellow-50'
            }`}
            title="Abrir / Recolher Menu de Opções"
          >
            {isSideMenuOpen ? (
              <>
                <X className="w-4 h-4 text-slate-950" />
                <span>Fechar</span>
              </>
            ) : (
              <>
                <Menu className="w-4 h-4 text-amber-600" />
                <span className="hidden xs:inline">Menu</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Spectator Top Banner */}
      {isSpectator && (
        <div className="w-full bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold border-b-2 border-amber-400 shadow-md z-30">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="flex items-center gap-1 text-amber-300 font-black">
              <Eye className="w-4 h-4" /> MODO ESPECTADOR (Sala de Espera)
            </span>
            <span className="hidden sm:inline text-slate-300 text-[11px]">
              • Você entrará para jogar automaticamente na próxima rodada!
            </span>
          </div>

          <div className="flex items-center gap-2">
            {state.spectatorCardsRevealed ? (
              <span className="text-[10px] bg-emerald-800 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-400 font-black">
                👀 Visão de Cartas Liberada
              </span>
            ) : (
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-600">
                🔒 Cartas Ocultas
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Table Area */}
      <main className="flex-1 min-h-0 relative flex flex-col justify-between p-1 sm:p-2 md:p-3 overflow-hidden">
        {/* Opponents Layout (Around Table) */}
        <div className="w-full shrink-0 flex items-center justify-around gap-1.5 sm:gap-2 px-1 py-0.5 z-20">
          {(isSpectator ? state.players : opponents).map((opp) => {
            const isOppTurn = state.currentTurnPlayerId === opp.id;
            const isCatchable = state.unoVulnerablePlayerId === opp.id;
            const isUnoAlert = opp.cardsCount === 1;

            return (
              <div
                key={opp.id}
                className={`relative flex flex-col items-center p-1.5 sm:p-2.5 rounded-2xl sm:rounded-3xl transition-all duration-300 backdrop-blur-sm ${
                  isOppTurn
                    ? 'bg-gradient-to-b from-amber-100 via-yellow-200 to-amber-300 text-slate-950 border-3 sm:border-4 border-amber-500 shadow-[0_0_24px_rgba(245,158,11,0.6)] scale-105 sm:scale-110 ring-4 ring-amber-300/80 z-30'
                    : 'bg-white/90 text-slate-800 border-2 sm:border-3 border-white shadow-md'
                }`}
              >
                {/* Active Player Spotlight Halo */}
                {isOppTurn && (
                  <div className="absolute -top-3.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[9px] sm:text-[10px] uppercase tracking-wider border-2 border-white shadow-lg flex items-center gap-1 animate-bounce">
                    <Sparkles className="w-3 h-3 fill-slate-950" />
                    <span>JOGANDO AGORA</span>
                  </div>
                )}

                {/* Catch UNO Alert Button */}
                {isCatchable && (
                  <button
                    type="button"
                    onClick={() => handleCatchUno(opp.id)}
                    className="absolute -bottom-3.5 animate-bounce z-40 bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] sm:text-xs px-2.5 sm:px-3.5 py-1 rounded-full shadow-2xl border-2 border-white flex items-center gap-1 cursor-pointer ring-4 ring-rose-400"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-300 animate-spin" />
                    PEGAR UNO! (+2)
                  </button>
                )}

                {/* Avatar and Name */}
                <div className="relative mt-1">
                  <div
                    className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 border-2 sm:border-4 border-white flex items-center justify-center text-xl sm:text-2xl md:text-3xl shadow-md ${
                      isOppTurn ? 'ring-2 ring-amber-500' : ''
                    }`}
                  >
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
                  {opp.name} {opp.id === myPlayerId && '(Você)'}
                </span>

                {/* Opponent Card Stack or Face-up cards for Kids Mode / Spectator Mode */}
                {opp.botHand && opp.botHand.length > 0 && localSpectatorShowCards ? (
                  <div className="flex flex-col items-center mt-0.5">
                    <span className="text-[8px] sm:text-[9px] font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded-full border border-emerald-300 mb-0.5">
                      Cartas Abertas
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

                <span
                  className={`text-[10px] sm:text-xs font-black text-white mt-1 font-mono px-2 sm:px-2.5 py-0.2 rounded-full border border-white shadow-sm ${
                    isUnoAlert ? 'bg-rose-600 animate-pulse' : 'bg-gradient-to-r from-pink-500 to-rose-500'
                  }`}
                >
                  {opp.cardsCount} {opp.cardsCount === 1 ? '🔥 1 CARTA' : 'cartas'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Central Table Center (Deck, Discard Pile, Color Indicator, Direction) */}
        <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center z-10 py-0.5">
          {/* Prominent Turn status banner */}
          <div className="mb-1 flex flex-col items-center shrink-0">
            {isMyTurn ? (
              <div className="flex flex-col items-center">
                <div className="bg-gradient-to-r from-yellow-300 via-amber-300 to-yellow-400 text-slate-950 font-black text-xs sm:text-sm md:text-base px-5 sm:px-7 py-1 sm:py-1.5 rounded-full shadow-2xl border-3 border-white animate-bounce flex items-center gap-2 uppercase tracking-wider ring-4 ring-amber-400/60">
                  <Sparkles className="w-4 h-4 fill-amber-500 text-amber-500" />
                  👉 SUA VEZ DE JOGAR! 👈
                </div>
                <div className="text-[10px] sm:text-xs text-sky-950 font-black mt-0.5 bg-white/90 px-3 py-0.5 rounded-full border border-white shadow-sm">
                  Toque na carta iluminada ou compre do baralho
                </div>
              </div>
            ) : (
              <div className="text-xs sm:text-sm text-slate-900 flex items-center gap-1.5 font-black bg-white/95 px-4 py-1 rounded-full border-2 border-amber-300 shadow-md">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                <span>Vez de: <strong className="text-amber-700 text-sm sm:text-base">{activeTurnPlayer?.name || '...'}</strong></span>
                {state.turnDuration > 0 && (
                  <span className="text-[11px] font-mono bg-amber-100 px-2 py-0.5 rounded-full text-amber-900">
                    ⏳ {state.turnTimeLeft}s
                  </span>
                )}
              </div>
            )}

            {/* Error or help toast */}
            {feedbackToast && (
              <div className="bg-rose-600 border-2 border-white text-white text-[10px] sm:text-xs px-3.5 sm:px-5 py-1 rounded-full shadow-2xl mt-1 font-black animate-bounce z-30">
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

            {/* Staged Card Levitating / Floating Announcement Animation */}
            {state.stagedCardPlay && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/40 rounded-full backdrop-blur-[2px] animate-in zoom-in-95 duration-200">
                <div className="text-[10px] sm:text-xs font-black text-amber-300 bg-slate-900/90 px-3 py-0.5 rounded-full border border-amber-400 mb-2 shadow-xl animate-pulse flex items-center gap-1">
                  <span>{state.stagedCardPlay.playerAvatar}</span>
                  <span>{state.stagedCardPlay.playerName} jogou:</span>
                </div>

                <div className="transform scale-110 sm:scale-125 shadow-[0_0_30px_rgba(250,204,21,0.9)] animate-bounce rounded-2xl">
                  <UnoCard card={state.stagedCardPlay.card} size="md" />
                </div>
              </div>
            )}

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
                    setFeedbackToast('Toque na carta da sua mão que deseja jogar aqui!');
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
          {/* Universal Catch UNO Vulnerability Alert Banner if someone forgot to call UNO */}
          {state.unoVulnerablePlayerId && (
            <div className="w-full max-w-md my-1 animate-bounce">
              <button
                type="button"
                onClick={() => handleCatchUno(state.unoVulnerablePlayerId!)}
                className="w-full py-2 px-4 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-2xl border-3 border-white flex items-center justify-center gap-2 cursor-pointer ring-4 ring-rose-300"
              >
                <AlertTriangle className="w-4 h-4 text-yellow-300 animate-spin" />
                <span>🚨 PEGAR UNO! (PENALIZAR COM +2 CARTAS)</span>
              </button>
            </div>
          )}

          {/* Action Row: UNO button & Pass button */}
          {!isSpectator && (
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
          )}

          {/* Cards in Hand Fan Layout or Spectator Message */}
          {isSpectator ? (
            <div className="w-full max-w-md p-3 bg-white/90 rounded-2xl border-2 border-white shadow-lg text-center my-1 text-slate-800">
              <div className="text-xs font-black text-slate-900 flex items-center justify-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-500" />
                Aguardando a rodada terminar...
              </div>
              <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                Você entrará como jogador automaticamente assim que a partida for reiniciada!
              </p>
            </div>
          ) : (
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
          )}
        </div>
      </main>

      {/* ========================================================================= */}
      {/* COLLAPSIBLE SIDE MENU / DRAWER (MENU LATERAL RETRÁTIL EXPANSÍVEL)        */}
      {/* ========================================================================= */}
      {isSideMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsSideMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-72 sm:w-80 bg-white/95 backdrop-blur-md shadow-2xl border-l-4 border-amber-400 z-50 transform transition-transform duration-300 flex flex-col justify-between text-slate-800 ${
          isSideMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Side Menu Header */}
        <div className="p-4 border-b-2 border-yellow-200 flex items-center justify-between bg-gradient-to-r from-yellow-300 to-amber-400 text-slate-950">
          <div className="flex items-center gap-2 font-black text-sm uppercase tracking-wider">
            <Settings className="w-5 h-5 text-slate-950" />
            <span>Menu do Jogo</span>
          </div>

          <button
            type="button"
            onClick={() => setIsSideMenuOpen(false)}
            className="p-1.5 rounded-full hover:bg-black/10 text-slate-950 cursor-pointer transition-colors"
            title="Recolher Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Side Menu Options List */}
        <div className="p-3 space-y-2 overflow-y-auto flex-1">
          {/* Chat Button */}
          <button
            type="button"
            onClick={() => {
              setIsSideMenuOpen(false);
              onToggleChat();
            }}
            className="w-full p-3 rounded-2xl bg-sky-50 hover:bg-sky-100 border-2 border-sky-200 text-sky-950 font-black text-xs flex items-center justify-between cursor-pointer transition-all active:scale-98 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-200 flex items-center justify-center text-sky-700">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-xs font-black text-slate-900">Chat da Sala</div>
                <div className="text-[10px] text-slate-500 font-medium">Conversar com os jogadores</div>
              </div>
            </div>
            {unreadChatCount > 0 && (
              <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full border border-white animate-pulse">
                {unreadChatCount} novas
              </span>
            )}
          </button>

          {/* Table Leaderboard Button */}
          <button
            type="button"
            onClick={() => {
              setIsSideMenuOpen(false);
              setIsTableScoreboardOpen(true);
            }}
            className="w-full p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 text-amber-950 font-black text-xs flex items-center justify-between cursor-pointer transition-all active:scale-98 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-200 flex items-center justify-center text-amber-800">
                <Trophy className="w-5 h-5 fill-amber-500" />
              </div>
              <div className="text-left">
                <div className="text-xs font-black text-slate-900">Placar da Mesa</div>
                <div className="text-[10px] text-slate-500 font-medium">Vitórias e pontos da sessão</div>
              </div>
            </div>
          </button>

          {/* Player Career Stats & Trophies */}
          {onOpenStats && (
            <button
              type="button"
              onClick={() => {
                setIsSideMenuOpen(false);
                onOpenStats();
              }}
              className="w-full p-3 rounded-2xl bg-purple-50 hover:bg-purple-100 border-2 border-purple-200 text-purple-950 font-black text-xs flex items-center justify-between cursor-pointer transition-all active:scale-98 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-200 flex items-center justify-center text-purple-800">
                  <BarChart2 className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-black text-slate-900">Troféus & Estatísticas</div>
                  <div className="text-[10px] text-slate-500 font-medium">Conquistas e histórico pessoal</div>
                </div>
              </div>
            </button>
          )}

          {/* Settings Gear Button */}
          {onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                setIsSideMenuOpen(false);
                onOpenSettings();
              }}
              className="w-full p-3 rounded-2xl bg-yellow-50 hover:bg-yellow-100 border-2 border-yellow-300 text-amber-950 font-black text-xs flex items-center justify-between cursor-pointer transition-all active:scale-98 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-yellow-200 flex items-center justify-center text-amber-700">
                  <Settings className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-black text-slate-900">Ajustes & Modo Criança</div>
                  <div className="text-[10px] text-slate-500 font-medium">Regras, velocidade e animações</div>
                </div>
              </div>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={handleToggleMute}
            className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border-2 border-slate-200 text-slate-800 font-black text-xs flex items-center justify-between cursor-pointer transition-all active:scale-98 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center text-slate-700">
                {isMuted ? <VolumeX className="w-5 h-5 text-rose-500" /> : <Volume2 className="w-5 h-5 text-emerald-600" />}
              </div>
              <div className="text-left">
                <div className="text-xs font-black text-slate-900">Efeitos Sonoros</div>
                <div className="text-[10px] text-slate-500 font-medium">{isMuted ? 'Mutado' : 'Som Ativado'}</div>
              </div>
            </div>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isMuted ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {isMuted ? 'MUTADO' : 'LIGADO'}
            </span>
          </button>

          {/* Fullscreen Toggle Button */}
          <button
            type="button"
            onClick={() => {
              toggleFullscreen();
            }}
            className="w-full p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border-2 border-indigo-200 text-indigo-950 font-black text-xs flex items-center justify-between cursor-pointer transition-all active:scale-98 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-200 flex items-center justify-center text-indigo-700">
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </div>
              <div className="text-left">
                <div className="text-xs font-black text-slate-900">Tela Cheia</div>
                <div className="text-[10px] text-slate-500 font-medium">Modo Imersivo</div>
              </div>
            </div>
            <span className="text-[10px] font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
              {isFullscreen ? 'Sair' : 'Ativar'}
            </span>
          </button>
        </div>

        {/* Side Menu Footer: Leave Room & Close */}
        <div className="p-3 border-t-2 border-slate-200 bg-slate-50 space-y-2">
          {/* Leave Button */}
          <button
            type="button"
            onClick={() => {
              setIsSideMenuOpen(false);
              onLeave();
            }}
            className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95 border border-white"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da Sala</span>
          </button>

          {/* Collapse Button */}
          <button
            type="button"
            onClick={() => setIsSideMenuOpen(false)}
            className="w-full py-1.5 px-3 text-center text-slate-500 hover:text-slate-800 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Recolher Menu Lateral</span>
          </button>
        </div>
      </aside>

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
