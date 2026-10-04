import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardColor, GameState, Player, ActiveEmote, HandState } from '../types/uno.js';
import { UnoCard } from './UnoCard.js';

import { ColorPickerModal } from './ColorPickerModal.js';
import { TableDirectionArrows } from './TableDirectionArrows.js';
import { EmoteBubble } from './EmoteBubble.js';
import { EmotePicker } from './EmotePicker.js';
import { TableScoreboardModal } from './TableScoreboardModal.js';
import { VoiceControls } from './VoiceControls.js';
import { voiceChat } from '../services/voiceChat.js';
import { statsManager } from '../services/statsManager.js';
import { ClientMessage, VoicePeerState } from '../types/uno.js';
import {
  Volume2,
  VolumeX,
  RotateCw,
  RotateCcw,
  AlertTriangle,
  Flame,
  ArrowRight,
  LogOut,
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
  Menu,
  X,
  ChevronRight,
  Play,
  Pause,
  Bot
} from 'lucide-react';
import { sound } from '../services/sound.js';

interface GameBoardProps {
  state: GameState;
  handState?: HandState | null;
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
  sendMessage?: (msg: ClientMessage) => void;
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
  handState,
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
  sendMessage,
}) => {
  const [isMuted, setIsMuted] = useState(() => sound.getIsMuted());
  const [selectedWildCard, setSelectedWildCard] = useState<Card | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [flyingCardId, setFlyingCardId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTableScoreboardOpen, setIsTableScoreboardOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [localSpectatorShowCards, setLocalSpectatorShowCards] = useState(true);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [peerVoiceStates, setPeerVoiceStates] = useState<Record<string, VoicePeerState>>({});

  useEffect(() => {
    const unsubscribe = voiceChat.subscribe({
      onPeersChange: (peers) => setPeerVoiceStates(peers),
      onLocalStateChange: () => {},
      onError: (msg) => {
        setFeedbackToast(msg);
        setTimeout(() => setFeedbackToast(null), 4000);
      },
    });

    return () => {
      unsubscribe();
      voiceChat.leaveVoice();
    };
  }, []);

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
  const isPaused = state.status === 'paused';

  // Opponents ordered in clockwise sequence relative to current player
  const opponentsInArc = useMemo(() => {
    if (isSpectator) return state.players;
    const myIdx = state.players.findIndex((p) => p.id === myPlayerId);
    if (myIdx === -1) return state.players.filter((p) => p.id !== myPlayerId);
    return [
      ...state.players.slice(myIdx + 1),
      ...state.players.slice(0, myIdx),
    ];
  }, [state.players, myPlayerId, isSpectator]);

  const handleToggleMute = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  // Check if a card in my hand is playable
  const isPlayable = (card: Card) => {
    if (!isMyTurn || isPaused) return false;
    if (!state.discardPileTop) return true;
    if (card.color === 'wild') return true;
    if (card.color === state.currentColor) return true;
    if (card.value === state.discardPileTop.value) return true;
    return false;
  };

  const hasPlayableCard = state.myHand.some(isPlayable);

  const handleCardClick = (card: Card) => {
    if (isSpectator) return;
    if (isPaused) {
      setFeedbackToast('A partida está pausada no momento!');
      setTimeout(() => setFeedbackToast(null), 2500);
      return;
    }
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
    if (isPaused) return;
    if (!isMyTurn) {
      setFeedbackToast('Aguarde a sua vez para comprar cartas!');
      setTimeout(() => setFeedbackToast(null), 2500);
      return;
    }
    statsManager.recordCardDrawn();
    onDrawCard();
  };

  const handleCallUno = () => {
    if (isPaused) return;
    statsManager.recordUnoCalled();
    onCallUno();
  };

  const handleCatchUno = (targetPlayerId: string) => {
    if (isPaused) return;
    statsManager.recordCaughtUno();
    onCatchUno(targetPlayerId);
  };

  const handleTogglePause = () => {
    if (isPaused) {
      sendMessage?.({ type: 'resume_game', roomId: state.roomId, playerId: myPlayerId });
    } else {
      sendMessage?.({ type: 'pause_game', roomId: state.roomId, playerId: myPlayerId });
    }
  };

  // Drop card on center
  const handleDropOnCenter = (e: React.DragEvent) => {
    e.preventDefault();
    if (isPaused) return;
    const cardId = e.dataTransfer.getData('text/plain');
    if (!cardId) return;
    const droppedCard = state.myHand.find((c) => c.id === cardId);
    if (droppedCard) {
      handleCardClick(droppedCard);
    }
  };

  const timerPercent =
    state.turnDuration > 0
      ? Math.max(0, Math.min(100, (state.turnTimeLeft / state.turnDuration) * 100))
      : 100;

  // Render Opponent Card Component
  const renderOpponentBox = (opp: Player, positionClass: string, angleDegree: string) => {
    const isOppTurn = state.currentTurnPlayerId === opp.id;
    const isCatchable = state.unoVulnerablePlayerId === opp.id;
    const isUnoAlert = opp.cardsCount === 1;

    const isHorizontalTop = angleDegree === '180°';

    return (
      <div
        key={opp.id}
        className={`absolute z-20 flex ${
          isHorizontalTop ? 'flex-row items-center gap-2.5 px-3 py-1.5' : 'flex-col items-center p-1.5 sm:p-2.5'
        } rounded-2xl transition-all duration-300 backdrop-blur-md shadow-md ${positionClass} ${
          isOppTurn
            ? 'bg-gradient-to-b from-amber-100 via-yellow-200 to-amber-300 text-slate-950 border-3 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.6)] scale-105 ring-2 ring-amber-300/80 z-30'
            : 'bg-white/95 text-slate-800 border-2 border-white shadow-sm'
        }`}
      >
        {/* Active Player Spotlight Halo */}
        {isOppTurn && (
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[10px] uppercase tracking-wider border-2 border-white shadow-lg flex items-center gap-1 animate-bounce whitespace-nowrap">
            <Sparkles className="w-3 h-3 fill-slate-950" />
            <span>JOGANDO AGORA</span>
          </div>
        )}

        {/* Catch UNO Alert Button */}
        {isCatchable && (
          <button
            type="button"
            onClick={() => handleCatchUno(opp.id)}
            className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 animate-bounce z-40 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs px-3 py-1 rounded-full shadow-2xl border-2 border-white flex items-center gap-1 cursor-pointer ring-4 ring-rose-400 whitespace-nowrap"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-300 animate-spin" />
            PEGAR UNO! (+2)
          </button>
        )}

        {isHorizontalTop ? (
          /* Horizontal Side-by-Side Fixed Comfort Layout for Top Center Opponent (180°) */
          <>
            {/* Left Block: Avatar + Name + Card Count Badge */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <div className="relative">
                {peerVoiceStates[opp.id]?.isSpeaking && (
                  <span className="absolute -inset-1 rounded-full bg-emerald-400/60 animate-ping pointer-events-none" />
                )}

                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 border-2 border-white flex items-center justify-center text-xl shadow-md transition-all ${
                    peerVoiceStates[opp.id]?.isSpeaking
                      ? 'ring-2 ring-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] scale-105'
                      : isOppTurn
                      ? 'ring-2 ring-amber-500'
                      : ''
                  }`}
                >
                  {opp.avatar}
                </div>
                {opp.isHost && (
                  <span className="absolute -top-1.5 -right-1.5 text-xs drop-shadow">👑</span>
                )}

                {opp.isBot && (
                  <span className="absolute -top-1 -right-1 text-[9px] bg-slate-800 text-white px-1 py-0.2 rounded-full border border-white font-black">
                    BOT
                  </span>
                )}

                {peerVoiceStates[opp.id] && (
                  <span
                    className={`absolute -top-1 -left-1 text-[10px] rounded-full p-0.5 border border-white shadow-xs flex items-center justify-center ${
                      peerVoiceStates[opp.id].isSpeaking
                        ? 'bg-emerald-500 text-white animate-bounce'
                        : peerVoiceStates[opp.id].isMuted
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {peerVoiceStates[opp.id].isSpeaking ? '🗣️' : peerVoiceStates[opp.id].isMuted ? '🔇' : '🎙️'}
                  </span>
                )}

                {opp.cardsCount === 1 && opp.hasCalledUno && (
                  <span className="absolute -bottom-1 -right-2 bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full border border-white animate-pulse shadow-sm">
                    UNO!
                  </span>
                )}

                {activeEmotes[opp.id] && (
                  <EmoteBubble emote={activeEmotes[opp.id]} side="right" />
                )}
              </div>

              <span className="text-xs font-black text-slate-900 mt-0.5 truncate max-w-[100px] leading-tight">
                {opp.name} {opp.id === myPlayerId && '(Você)'}
              </span>

              <span
                className={`text-[10px] font-black text-white mt-0.5 font-mono px-2 py-0.5 rounded-full border border-white shadow-xs ${
                  isUnoAlert ? 'bg-rose-600 animate-pulse' : 'bg-gradient-to-r from-pink-500 to-rose-500'
                }`}
              >
                {opp.cardsCount} {opp.cardsCount === 1 ? '🔥 1 CARTA' : 'cartas'}
              </span>
            </div>

            {/* Vertical Divider / Spacer */}
            <div className="w-[1.5px] h-10 bg-slate-200 rounded-full shrink-0" />

            {/* Right Block: Cards Displayed Side by Side */}
            <div className="flex items-center shrink-0">
              {opp.botHand && opp.botHand.length > 0 && localSpectatorShowCards ? (
                <div className="flex items-center -space-x-3 overflow-auto max-w-[180px] py-0.5">
                  {opp.botHand.map((c, i) => (
                    <div key={c.id || i} className="transform scale-80 origin-center shrink-0">
                      <UnoCard card={c} size="sm" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center -space-x-3.5">
                  {Array.from({ length: Math.min(opp.cardsCount, 5) }).map((_, i) => (
                    <div
                      key={i}
                      className="w-6.5 h-10 rounded-lg bg-gradient-to-br from-rose-500 via-red-500 to-red-600 border border-white shadow-md flex items-center justify-center -rotate-2"
                      title={`${opp.name} tem ${opp.cardsCount} cartas`}
                    >
                      <div className="w-4 h-3 -rotate-25 rounded-full bg-slate-950 flex items-center justify-center border border-yellow-300/60">
                        <span className="text-[7px] font-black text-yellow-300 italic">U</span>
                      </div>
                    </div>
                  ))}
                  {opp.cardsCount > 5 && (
                    <span className="text-xs font-black text-rose-600 pl-1.5 font-mono">
                      +{opp.cardsCount - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Standard Vertical Layout for Side Seats (90° and 270°) */
          <>
            {/* Avatar and Badges */}
            <div className="relative mt-1">
              {peerVoiceStates[opp.id]?.isSpeaking && (
                <span className="absolute -inset-1.5 rounded-full bg-emerald-400/60 animate-ping pointer-events-none" />
              )}

              <div
                className={`w-9 h-9 sm:w-12 sm:h-12 md:w-13 md:h-13 rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 border-2 sm:border-3 border-white flex items-center justify-center text-lg sm:text-2xl shadow-md transition-all ${
                  peerVoiceStates[opp.id]?.isSpeaking
                    ? 'ring-4 ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.9)] scale-105'
                    : isOppTurn
                    ? 'ring-2 ring-amber-500'
                    : ''
                }`}
              >
                {opp.avatar}
              </div>
              {opp.isHost && (
                <span className="absolute -top-1.5 -right-1.5 text-xs sm:text-sm drop-shadow">👑</span>
              )}

              {opp.isBot && (
                <span className="absolute -top-1 -right-1.5 text-[10px] bg-slate-800 text-white px-1 py-0.2 rounded-full border border-white font-black">
                  BOT
                </span>
              )}

              {peerVoiceStates[opp.id] && (
                <span
                  className={`absolute -top-1 -left-1.5 text-[10px] rounded-full p-0.5 border border-white shadow-sm flex items-center justify-center ${
                    peerVoiceStates[opp.id].isSpeaking
                      ? 'bg-emerald-500 text-white animate-bounce'
                      : peerVoiceStates[opp.id].isMuted
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-700 text-slate-200'
                  }`}
                >
                  {peerVoiceStates[opp.id].isSpeaking ? '🗣️' : peerVoiceStates[opp.id].isMuted ? '🔇' : '🎙️'}
                </span>
              )}

              {opp.cardsCount === 1 && opp.hasCalledUno && (
                <span className="absolute -bottom-1 -right-2 bg-rose-600 text-white text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full border-2 border-white animate-pulse shadow-md">
                  UNO!
                </span>
              )}

              {activeEmotes[opp.id] && (
                <EmoteBubble emote={activeEmotes[opp.id]} side="right" />
              )}
            </div>

            <span className="text-[11px] sm:text-xs font-black text-slate-900 mt-1 truncate max-w-[80px] sm:max-w-[110px]">
              {opp.name} {opp.id === myPlayerId && '(Você)'}
            </span>

            {/* Cards count or face-up cards */}
            {opp.botHand && opp.botHand.length > 0 && localSpectatorShowCards ? (
              <div className="flex flex-col items-center mt-0.5">
                <div className={`flex ${angleDegree === '90°' || angleDegree === '270°' ? 'flex-col -space-y-4 sm:-space-y-5 max-h-[120px] sm:max-h-[150px]' : 'flex-row -space-x-4 sm:-space-x-5 max-w-[100px] sm:max-w-[140px]'} py-0.5 overflow-auto`}>
                  {opp.botHand.map((c, i) => (
                    <div key={c.id || i} className="transform scale-65 origin-center shrink-0">
                      <UnoCard card={c} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Vertical Stack for Side Seats (90° Left, 270° Right) */
              <div className="flex flex-col items-center -space-y-3.5 sm:-space-y-4 my-1">
                {Array.from({ length: Math.min(opp.cardsCount, 5) }).map((_, i) => (
                  <div
                    key={i}
                    className="w-8 h-5 sm:w-10 sm:h-6 rounded-md sm:rounded-lg bg-gradient-to-br from-rose-500 via-red-500 to-red-600 border border-white shadow-xs flex items-center justify-center rotate-90"
                    title={`${opp.name} tem ${opp.cardsCount} cartas`}
                  >
                    <div className="w-2.5 h-3.5 sm:w-3 sm:h-4 -rotate-25 rounded-full bg-slate-950 flex items-center justify-center border border-yellow-300/60">
                      <span className="text-[6px] sm:text-[7px] font-black text-yellow-300 italic">U</span>
                    </div>
                  </div>
                ))}
                {opp.cardsCount > 5 && (
                  <span className="text-[9px] sm:text-[10px] font-black text-rose-600 pt-0.5">
                    +{opp.cardsCount - 5}
                  </span>
                )}
              </div>
            )}

            <span
              className={`text-[9px] sm:text-[10px] font-black text-white mt-0.5 font-mono px-2 py-0.2 rounded-full border border-white shadow-sm ${
                isUnoAlert ? 'bg-rose-600 animate-pulse' : 'bg-gradient-to-r from-pink-500 to-rose-500'
              }`}
            >
              {opp.cardsCount} {opp.cardsCount === 1 ? '🔥 1 CARTA' : 'cartas'}
            </span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-sky-400 via-sky-300 to-indigo-400 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Header Bar */}
      <header className="w-full shrink-0 px-2 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between z-30 bg-white/30 backdrop-blur-md border-b border-white/40 shadow-xs">
        {/* Left: Brand & Room Tag */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1">
            <span className="text-xl sm:text-2xl drop-shadow">🃏</span>
            <span className="font-black text-sm sm:text-base tracking-wider text-slate-950 drop-shadow-sm">
              UNO <span className="text-amber-500">KaWiHe</span>
            </span>
          </div>

          <span className="font-black text-[11px] sm:text-xs text-amber-950 bg-gradient-to-r from-yellow-300 to-amber-300 px-2.5 sm:px-3.5 py-0.5 sm:py-1 rounded-xl sm:rounded-2xl border-2 border-white shadow-sm flex items-center gap-1">
            <span>🏷️</span> <span className="hidden xs:inline">SALA:</span> {state.roomId}
          </span>
        </div>

        {/* Right Header: Pause, Voice, Chat & Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Pause / Resume Button */}
          {sendMessage && !isSpectator && (
            <button
              type="button"
              onClick={handleTogglePause}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl sm:rounded-2xl font-black text-xs flex items-center gap-1 cursor-pointer transition-all shadow-sm border-2 ${
                isPaused
                  ? 'bg-emerald-500 text-white border-white animate-bounce'
                  : 'bg-white border-amber-300 text-amber-950 hover:bg-amber-50'
              }`}
              title={isPaused ? 'Retomar Partida' : 'Pausar Partida'}
            >
              {isPaused ? <Play className="w-4 h-4 fill-white" /> : <Pause className="w-4 h-4 text-amber-700" />}
              <span className="hidden sm:inline">{isPaused ? 'Retomar' : 'Pausar'}</span>
            </button>
          )}

          {/* Voice Chat Controls */}
          {sendMessage && (
            <VoiceControls
              roomId={state.roomId}
              myPlayerId={myPlayerId}
              players={state.players}
              sendMessage={sendMessage}
            />
          )}

          {/* Chat Shortcut */}
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

          {/* Leave Button */}
          <button
            type="button"
            onClick={() => setIsLeaveModalOpen(true)}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl sm:rounded-2xl bg-rose-500 hover:bg-rose-600 text-white border-2 border-white font-black text-xs flex items-center gap-1 cursor-pointer transition-all shadow-sm active:scale-95"
            title="Sair da Sala"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>

          {/* Menu Drawer */}
          <button
            type="button"
            onClick={() => setIsSideMenuOpen(!isSideMenuOpen)}
            className={`py-1.5 px-2 sm:px-3 rounded-xl sm:rounded-2xl border-2 font-black text-xs flex items-center gap-1 cursor-pointer transition-all shadow-md active:scale-95 ${
              isSideMenuOpen
                ? 'bg-amber-400 border-white text-slate-950 ring-2 ring-amber-300'
                : 'bg-white border-amber-300 text-slate-800 hover:bg-yellow-50'
            }`}
          >
            {isSideMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4 text-amber-600" />}
          </button>
        </div>
      </header>

      {/* Spectator Top Banner */}
      {isSpectator && (
        <div className="w-full bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold border-b-2 border-amber-400 shadow-md z-30 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="flex items-center gap-1 text-amber-300 font-black">
              <Eye className="w-4 h-4" /> MODO TRANSMISSÃO / TV (Espectador)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {state.spectatorCardsRevealed ? (
              <span className="text-[10px] bg-emerald-800 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-400 font-black">
                👀 Visão de Cartas Aberta
              </span>
            ) : (
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-600">
                🔒 Cartas Ocultas
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Table Arena Area */}
      <main className="flex-1 min-h-0 relative flex flex-col justify-between p-1 sm:p-2 overflow-hidden">
        {/* ========================================================================= */}
        {/* SEMI-CIRCULAR RADIAL TABLE ARENA (ÂNGULOS 120°, 90°, 60° E JOGADOR A 0°)  */}
        {/* ========================================================================= */}
        <div className="relative flex-1 w-full flex flex-col items-center justify-end min-h-0 pb-1 sm:pb-2">
          {/* Opponent Arc Seats around Central Table */}
          {opponentsInArc.length === 3 && (
            <>
              {/* Left Opponent (90° / Esquerda) */}
              {renderOpponentBox(opponentsInArc[0], 'top-[15%] sm:top-[18%] left-[1.5%] sm:left-[3%] md:left-[5%]', '90°')}
              {/* Top Center Opponent (180° / Frente) */}
              {renderOpponentBox(opponentsInArc[1], 'top-0 sm:top-1 left-1/2 -translate-x-1/2', '180°')}
              {/* Right Opponent (270° / Direita) */}
              {renderOpponentBox(opponentsInArc[2], 'top-[15%] sm:top-[18%] right-[1.5%] sm:right-[3%] md:right-[5%]', '270°')}
            </>
          )}

          {opponentsInArc.length === 2 && (
            <>
              {/* Left Opponent (90° / Esquerda) */}
              {renderOpponentBox(opponentsInArc[0], 'top-[15%] sm:top-[18%] left-[2%] sm:left-[4%] md:left-[6%]', '90°')}
              {/* Right Opponent (270° / Direita) */}
              {renderOpponentBox(opponentsInArc[1], 'top-[15%] sm:top-[18%] right-[2%] sm:right-[4%] md:right-[6%]', '270°')}
            </>
          )}

          {opponentsInArc.length === 1 && (
            <>
              {/* Single Opponent: Directly Top Center (180° / Frente) */}
              {renderOpponentBox(opponentsInArc[0], 'top-0 sm:top-1 left-1/2 -translate-x-1/2', '180°')}
            </>
          )}

          {/* Central Green Felt Table (Cards, Deck, Discard, Arrow) */}
          <div className="relative flex flex-col items-center justify-center z-10 py-1 mt-auto mb-1 sm:mb-2">
            {feedbackToast && (
              <div className="bg-rose-600 border-2 border-white text-white text-[10px] sm:text-xs px-3.5 sm:px-5 py-1 rounded-full shadow-2xl mb-2 font-black animate-bounce z-30">
                ⚠️ {feedbackToast}
              </div>
            )}

            {/* Cards Table Felt Circle */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={handleDropOnCenter}
              className="relative w-44 h-44 sm:w-52 sm:h-52 md:w-60 md:h-60 lg:w-68 lg:h-68 rounded-full bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 border-4 sm:border-6 md:border-8 border-white shadow-[0_12px_32px_rgba(0,0,0,0.22)] ring-4 sm:ring-8 ring-emerald-300/50 flex items-center justify-center transition-transform"
            >
              {/* Direction Arrows flanking the table */}
              <TableDirectionArrows direction={state.turnDirection} />

              {/* Staged Card Levitating Animation */}
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
                    onClick={isMyTurn && !isPaused ? handleDrawCard : undefined}
                    disabled={!isMyTurn || isPaused}
                    className={`group relative cursor-pointer transition-transform ${
                      isMyTurn && !isPaused ? 'hover:scale-105 active:scale-95' : 'opacity-85'
                    }`}
                    title="Comprar carta do baralho"
                  >
                    <div className="absolute top-1 left-1 w-full h-full rounded-2xl sm:rounded-3xl bg-rose-700 border border-white pointer-events-none" />
                    <div className="absolute top-0.5 left-0.5 w-full h-full rounded-2xl sm:rounded-3xl bg-rose-800 border border-white pointer-events-none" />
                    <UnoCard isBack size="md" />

                    {isMyTurn && !hasPlayableCard && !isPaused && (
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
                    if (hasPlayableCard && isMyTurn && !isPaused) {
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
        </div>

        {/* Bottom Area: Player Hand Cards FIRST, then Centralized Action Bar BELOW Cards */}
        <div className="w-full shrink-0 flex flex-col items-center z-20 pb-1">
          {/* Universal Catch UNO Vulnerability Alert Banner */}
          {state.unoVulnerablePlayerId && (
            <div className="w-full max-w-md my-1 animate-bounce z-30">
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

          {/* 1. CARDS IN HAND (CARTEIRA DE CARTAS DO JOGADOR A 0°) */}
          {isSpectator ? (
            <div className="w-full max-w-md p-3 bg-white/90 rounded-2xl border-2 border-white shadow-lg text-center my-1 text-slate-800">
              <div className="text-xs font-black text-slate-900 flex items-center justify-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-500" />
                Modo Transmissão / Telão
              </div>
              <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                Acompanhando a partida em tempo real.
              </p>
            </div>
          ) : (
            <div className="w-full max-w-4xl px-1 sm:px-2 overflow-x-auto py-1 flex items-center justify-center">
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
                      className={`transform transition-all duration-300 hover:z-40 hover:-translate-y-4 sm:hover:-translate-y-6 ${
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

          {/* 2. CENTRALIZED HUD ACTION BAR (ABAIXO DAS CARTAS DO JOGADOR) */}
          {!isSpectator && (
            <div className="w-full max-w-3xl bg-white/90 backdrop-blur-md p-1.5 sm:p-2 rounded-2xl sm:rounded-3xl border-2 sm:border-3 border-amber-300/80 shadow-2xl flex flex-wrap sm:flex-nowrap items-center justify-center sm:justify-between gap-2 mt-1 z-30 ring-2 ring-white/80">
              {/* Turn Information & Timer (Piscando / Destacado) */}
              <div className="flex items-center gap-2 shrink-0">
                {isPaused ? (
                  <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white font-black text-xs px-3.5 py-1.5 rounded-xl border-2 border-white animate-pulse flex items-center gap-1.5 uppercase shadow-sm">
                    <Pause className="w-4 h-4 fill-white" />
                    <span>PAUSADO</span>
                  </div>
                ) : isMyTurn ? (
                  <div className="bg-gradient-to-r from-yellow-300 via-amber-300 to-yellow-400 text-slate-950 font-black text-xs sm:text-sm px-3.5 sm:px-4 py-1.5 rounded-xl border-2 border-white shadow-md animate-bounce flex items-center gap-1.5 uppercase tracking-wider ring-2 ring-amber-400/80">
                    <Sparkles className="w-4 h-4 fill-amber-600 text-amber-600 animate-spin" />
                    <span>SUA VEZ!</span>
                    {state.turnDuration > 0 && (
                      <span className="font-mono bg-slate-950 text-yellow-300 text-[10px] px-1.5 py-0.2 rounded-md font-bold">
                        ⏳ {state.turnTimeLeft}s
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-900 flex items-center gap-1.5 font-black bg-white px-3 py-1.5 rounded-xl border border-amber-300 shadow-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                    <span>Vez: <strong className="text-amber-700">{activeTurnPlayer?.name || '...'}</strong></span>
                    {state.turnDuration > 0 && (
                      <span className="text-[10px] font-mono bg-amber-100 px-1.5 py-0.2 rounded-md text-amber-900">
                        ⏳ {state.turnTimeLeft}s
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Call UNO button, Reaction Picker & Pass Turn */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Call UNO button (Piscando e com Efeito de Destaque) */}
                <div className="relative flex items-center">
                  <button
                    type="button"
                    onClick={handleCallUno}
                    disabled={isPaused}
                    className={`py-1.5 sm:py-2 px-3 sm:px-4 md:px-5 rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs md:text-sm uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 border-2 sm:border-3 border-white ${
                      state.myHand.length <= 2
                        ? 'bg-gradient-to-r from-yellow-300 via-orange-500 to-rose-600 text-white animate-bounce shadow-[0_0_20px_rgba(245,158,11,0.9)] ring-2 ring-amber-300'
                        : 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white shadow-md active:scale-95'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-yellow-300 text-yellow-300 animate-pulse" />
                    <span>GRITAR UNO!</span>
                    {me?.hasCalledUno && (
                      <span className="text-[9px] bg-white text-rose-600 px-1.5 py-0.2 rounded-full font-black shadow-xs">
                        OK
                      </span>
                    )}
                  </button>

                  {/* Active Emote Bubble */}
                  {activeEmotes[myPlayerId] && (
                    <EmoteBubble emote={activeEmotes[myPlayerId]} side="top" />
                  )}
                </div>

                {/* Emote Reaction Picker */}
                <EmotePicker onSelectEmote={(emote) => onSendEmote?.(emote.id)} />

                {/* Pass Turn Button */}
                {isMyTurn && !isPaused && (
                  <button
                    type="button"
                    onClick={onPassTurn}
                    className="py-1.5 sm:py-2 px-3 sm:px-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-[11px] sm:text-xs md:text-sm font-black border-2 border-white shadow-md active:scale-95 flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <span>Passar Vez</span>
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ========================================================================= */}
      {/* COLLAPSIBLE SIDE MENU / DRAWER                                            */}
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
        <div className="p-4 border-b-2 border-yellow-200 flex items-center justify-between bg-gradient-to-r from-yellow-300 to-amber-400 text-slate-950">
          <div className="flex items-center gap-2 font-black text-sm uppercase tracking-wider">
            <Settings className="w-5 h-5 text-slate-950" />
            <span>Menu do Jogo</span>
          </div>

          <button
            type="button"
            onClick={() => setIsSideMenuOpen(false)}
            className="p-1.5 rounded-full hover:bg-black/10 text-slate-950 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 space-y-2 overflow-y-auto flex-1">
          {/* Pause Button in Menu */}
          {sendMessage && !isSpectator && (
            <button
              type="button"
              onClick={() => {
                setIsSideMenuOpen(false);
                handleTogglePause();
              }}
              className="w-full p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 text-amber-950 font-black text-xs flex items-center justify-between cursor-pointer transition-all active:scale-98 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-200 flex items-center justify-center text-amber-800">
                  {isPaused ? <Play className="w-5 h-5 fill-amber-700" /> : <Pause className="w-5 h-5" />}
                </div>
                <div className="text-left">
                  <div className="text-xs font-black text-slate-900">{isPaused ? 'Retomar Jogo' : 'Pausar Partida'}</div>
                  <div className="text-[10px] text-slate-500 font-medium">Congelar cronômetro e jogadas</div>
                </div>
              </div>
            </button>
          )}

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

          {/* Player Career Stats */}
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

          {/* Settings Button */}
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
                  <div className="text-[10px] text-slate-500 font-medium">Regras e animações</div>
                </div>
              </div>
            </button>
          )}

          {/* Broadcast Link */}
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}?room=${state.roomId}&watch=1`;
              navigator.clipboard.writeText(url).then(() => {
                setFeedbackToast('Link de Transmissão / TV copiado!');
                setTimeout(() => setFeedbackToast(null), 3000);
              });
            }}
            className="w-full p-3 rounded-2xl bg-cyan-50 hover:bg-cyan-100 border-2 border-cyan-200 text-cyan-950 font-black text-xs flex items-center justify-between cursor-pointer transition-all active:scale-98 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-200 flex items-center justify-center text-cyan-800">
                <Radio className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-xs font-black text-slate-900">Link de Transmissão / TV</div>
                <div className="text-[10px] text-slate-500 font-medium">Copiar link para telão</div>
              </div>
            </div>
          </button>

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

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
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
          </button>
        </div>

        <div className="p-3 border-t-2 border-slate-200 bg-slate-50 space-y-2">
          <button
            type="button"
            onClick={() => {
              setIsSideMenuOpen(false);
              setIsLeaveModalOpen(true);
            }}
            className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95 border border-white"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da Sala</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* CONFIRMATION LEAVE MODAL (SAIR OU PAUSAR COM ASSUNÇÃO DE ROBÔ)           */}
      {/* ========================================================================= */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border-4 border-amber-400 shadow-2xl max-w-md w-full overflow-hidden text-slate-800 flex flex-col animate-in zoom-in-95 duration-150">
            <div className="p-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-300 border-b-2 border-amber-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🚪</span>
                <div>
                  <h3 className="text-base font-black text-slate-950">Sair da Sala de Jogo?</h3>
                  <p className="text-[11px] font-bold text-amber-900">Escolha como deseja prosseguir</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                className="p-1 rounded-full hover:bg-black/10 text-slate-950 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="p-3 bg-amber-50 rounded-2xl border-2 border-amber-200 flex items-start gap-2.5">
                <Bot className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-slate-700">
                  <strong className="text-slate-900 block font-black">🤖 Continuidade Inteligente:</strong>
                  Se você sair durante a partida, um <strong>Robô assumirá suas cartas automaticamente</strong> para que a partida continue sem travar para os seus amigos!
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {sendMessage && !isPaused && !isSpectator && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsLeaveModalOpen(false);
                      handleTogglePause();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-100 hover:bg-amber-200 border-2 border-amber-300 text-amber-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
                  >
                    <Pause className="w-4 h-4 text-amber-700" />
                    <span>Apenas Pausar a Partida (Volto logo)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsLeaveModalOpen(false);
                    onLeave();
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sair Definitivamente (Robô assume)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs cursor-pointer"
                >
                  Cancelar e Continuar Jogando
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
