import React, { useState } from 'react';
import { Card, CardColor, GameState, Player, ActiveEmote } from '../types/uno.js';
import { UnoCard } from './UnoCard.js';
import { ColorPickerModal } from './ColorPickerModal.js';
import { TableDirectionArrows } from './TableDirectionArrows.js';
import { EmoteBubble } from './EmoteBubble.js';
import { EmotePicker } from './EmotePicker.js';
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
  Settings
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
}) => {
  const [isMuted, setIsMuted] = useState(() => sound.getIsMuted());
  const [selectedWildCard, setSelectedWildCard] = useState<Card | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [flyingCardId, setFlyingCardId] = useState<string | null>(null);

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
    onPlayCard(card.id);
    setTimeout(() => setFlyingCardId(null), 400);
  };

  const handleColorPicked = (color: CardColor) => {
    if (!selectedWildCard) return;
    setFlyingCardId(selectedWildCard.id);
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
    <div className="relative w-full h-screen bg-gradient-to-b from-sky-400 via-sky-300 to-indigo-300 overflow-hidden flex flex-col select-none text-slate-800">
      {/* Decorative Cartoon Elements (clouds & soft stars) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-10 left-12 w-32 h-16 bg-white rounded-full blur-[1px]" />
        <div className="absolute top-8 left-20 w-24 h-24 bg-white rounded-full blur-[1px]" />
        <div className="absolute top-24 right-20 w-44 h-20 bg-white rounded-full blur-[1px]" />
        <div className="absolute top-16 right-32 w-28 h-28 bg-white rounded-full blur-[1px]" />
        <div className="absolute bottom-32 left-1/4 w-36 h-18 bg-white rounded-full blur-[1px]" />
      </div>

      {/* Top Header Bar */}
      <header className="h-13 border-b-4 border-white/70 px-3 sm:px-4 flex items-center justify-between bg-white/90 backdrop-blur-md z-30 shadow-md">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 via-yellow-400 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-[11px] shadow border-2 border-white tracking-wider">
              KWH
            </div>
            <span className="font-black text-xs text-slate-800 hidden md:inline">Uno KaWiHe</span>
          </div>

          <span className="font-black text-xs text-amber-950 bg-gradient-to-r from-yellow-300 to-amber-300 px-3.5 py-1.5 rounded-2xl border-2 border-white shadow-sm flex items-center gap-1.5">
            <span className="text-sm">🏷️</span> SALA: {state.roomId}
          </span>

          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-sky-900 bg-sky-100/90 px-3 py-1 rounded-2xl border-2 border-white shadow-sm">
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

        <div className="flex items-center gap-2">
          {/* Settings Gear Button */}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 rounded-2xl bg-white border-2 border-yellow-300 text-amber-900 hover:bg-yellow-50 cursor-pointer transition-all shadow-sm active:scale-95 flex items-center gap-1 font-bold text-xs"
              title="Configurações & Modo Criança"
            >
              <Settings className="w-4 h-4 text-amber-500" />
              <span className="hidden sm:inline">Configurar</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={handleToggleMute}
            className="p-2 rounded-2xl bg-white border-2 border-sky-200 text-slate-700 hover:bg-sky-50 cursor-pointer transition-all shadow-sm active:scale-95"
            title={isMuted ? 'Desmutar sons' : 'Mutar sons'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4 text-emerald-500" />}
          </button>

          {/* Leave Button */}
          <button
            type="button"
            onClick={onLeave}
            className="px-3.5 py-1.5 rounded-2xl bg-gradient-to-b from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 border-2 border-white text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all shadow-md active:scale-95"
            title="Sair para o Menu Principal"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Main Table Area */}
      <main className="flex-1 relative flex flex-col justify-between p-2 sm:p-4 overflow-hidden">
        {/* Opponents Layout (Around Table) */}
        <div className="w-full flex items-center justify-around gap-2 px-2 py-1 z-20">
          {opponents.map((opp) => {
            const isOppTurn = state.currentTurnPlayerId === opp.id;
            const isCatchable = state.unoVulnerablePlayerId === opp.id;

            return (
              <div
                key={opp.id}
                className={`relative flex flex-col items-center p-2.5 sm:p-3 rounded-3xl transition-all duration-300 backdrop-blur-sm ${
                  isOppTurn
                    ? 'bg-amber-200 text-slate-950 border-4 border-amber-400 shadow-2xl scale-105 ring-4 ring-yellow-300/70'
                    : 'bg-white/90 text-slate-800 border-3 sm:border-4 border-white shadow-lg'
                }`}
              >
                {/* Catch UNO Alert Button */}
                {isCatchable && (
                  <button
                    type="button"
                    onClick={() => onCatchUno(opp.id)}
                    className="absolute -top-4 animate-bounce z-30 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs px-3.5 py-1 rounded-full shadow-xl border-2 border-white flex items-center gap-1 cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-300" />
                    PEGAR UNO! (+2)
                  </button>
                )}

                {/* Avatar and Name */}
                <div className="relative">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 border-4 border-white flex items-center justify-center text-3xl sm:text-4xl shadow-md">
                    {opp.avatar}
                  </div>
                  {opp.isHost && (
                    <span className="absolute -top-1.5 -right-1.5 text-sm sm:text-base drop-shadow">👑</span>
                  )}
                  {opp.cardsCount === 1 && opp.hasCalledUno && (
                    <span className="absolute -bottom-1 -right-2 bg-rose-600 text-white text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-full border-2 border-white animate-pulse shadow-md">
                      UNO!
                    </span>
                  )}

                  {/* Opponent Emote Reaction Bubble */}
                  {activeEmotes[opp.id] && (
                    <EmoteBubble emote={activeEmotes[opp.id]} side="right" />
                  )}
                </div>

                <span className="text-xs sm:text-sm font-black text-slate-900 mt-1.5 truncate max-w-[100px] sm:max-w-[130px]">
                  {opp.name}
                </span>

                {/* Opponent Card Stack visualization or Face-up cards for Kids Mode */}
                {opp.botHand && opp.botHand.length > 0 ? (
                  <div className="flex flex-col items-center mt-1">
                    <span className="text-[9px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 mb-0.5">
                      👀 Modo Criança
                    </span>
                    <div className="flex items-center -space-x-4 sm:-space-x-5 py-0.5 overflow-x-auto max-w-[140px] sm:max-w-[190px]">
                      {opp.botHand.map((c, i) => (
                        <div key={c.id || i} className="transform scale-70 origin-center shrink-0 hover:scale-100 transition-transform">
                          <UnoCard card={c} size="sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center -space-x-5 sm:-space-x-6 mt-1.5">
                    {Array.from({ length: Math.min(opp.cardsCount, 5) }).map((_, i) => (
                      <div
                        key={i}
                        className="w-8 h-12 sm:w-10 sm:h-14 rounded-xl bg-gradient-to-br from-rose-500 via-red-500 to-red-600 border-2 border-white shadow-md flex items-center justify-center -rotate-6 transform hover:rotate-0 transition-transform"
                        title={`${opp.name} tem ${opp.cardsCount} cartas`}
                      >
                        <div className="w-6 h-4 sm:w-7 sm:h-5 -rotate-25 rounded-full bg-slate-950 flex items-center justify-center shadow-inner border border-yellow-300/60">
                          <span className="text-[8px] sm:text-[9px] font-black text-yellow-300 italic">U</span>
                        </div>
                      </div>
                    ))}
                    {opp.cardsCount > 5 && (
                      <span className="text-xs sm:text-sm font-black text-rose-600 pl-2">
                        +{opp.cardsCount - 5}
                      </span>
                    )}
                  </div>
                )}

                <span className="text-xs font-black text-white mt-1.5 font-mono bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-0.5 rounded-full border-2 border-white shadow-md">
                  {opp.cardsCount} {opp.cardsCount === 1 ? 'carta' : 'cartas'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Central Table Center (Deck, Discard Pile, Color Indicator, Direction) */}
        <div className="relative flex-1 flex flex-col items-center justify-center z-10 py-1">
          {/* Turn status banner */}
          <div className="mb-2 flex flex-col items-center">
            {isMyTurn ? (
              <div className="flex flex-col items-center">
                <div className="bg-gradient-to-r from-yellow-300 via-amber-300 to-yellow-400 text-slate-950 font-black text-xs sm:text-sm px-6 py-1.5 rounded-full shadow-lg border-2 border-white animate-bounce flex items-center gap-1.5 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 fill-amber-500 text-amber-500" />
                  Sua vez de jogar!
                </div>
                <div className="text-[11px] text-sky-950 font-bold mt-1 bg-white/70 px-3 py-0.5 rounded-full border border-white/60">
                  👉 Clique ou arraste uma carta destacada para a mesa
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-700 flex items-center gap-1.5 font-black bg-white/80 px-3.5 py-1 rounded-full border-2 border-white shadow-sm">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Vez de {state.players.find((p) => p.id === state.currentTurnPlayerId)?.name || '...'}
              </div>
            )}

            {/* Error or help toast */}
            {feedbackToast && (
              <div className="bg-rose-500 border-2 border-white text-white text-xs px-4 py-1.5 rounded-full shadow-2xl mt-1.5 font-black animate-bounce z-30">
                ⚠️ {feedbackToast}
              </div>
            )}

            {/* Turn timer bar or Unlimited badge */}
            {state.turnDuration > 0 ? (
              <div className="w-44 sm:w-60 h-2 bg-white/70 rounded-full mt-2 overflow-hidden border-2 border-white shadow-inner">
                <div
                  className={`h-full transition-all duration-1000 ${
                    timerPercent > 40 ? 'bg-emerald-500' : timerPercent > 20 ? 'bg-amber-400' : 'bg-rose-500'
                  }`}
                  style={{ width: `${timerPercent}%` }}
                />
              </div>
            ) : (
              <div className="text-[10px] text-emerald-900 font-black mt-2 bg-emerald-100 px-3 py-0.5 rounded-full border border-emerald-300 shadow-sm flex items-center gap-1">
                <span>🧸 Modo Sem Pressa (Tempo Ilimitado)</span>
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
            className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-full bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 border-6 sm:border-8 border-white shadow-[0_16px_40px_rgba(0,0,0,0.22)] ring-8 ring-emerald-300/50 flex items-center justify-center transition-transform hover:scale-[1.01]"
          >
            {/* Direction Arrows flanking the table on the left and right (matching imagem.png) */}
            <TableDirectionArrows direction={state.turnDirection} />

            {/* Center Play Area */}
            <div className="flex items-center gap-4 sm:gap-6 z-20">
              {/* Draw Pile (Deck) */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={isMyTurn ? onDrawCard : undefined}
                  disabled={!isMyTurn}
                  className={`group relative cursor-pointer transition-transform ${
                    isMyTurn ? 'hover:scale-105 active:scale-95' : 'opacity-85'
                  }`}
                  title="Comprar carta do baralho"
                >
                  {/* Visual 3D Stack depth */}
                  <div className="absolute top-1 left-1 w-full h-full rounded-3xl bg-rose-700 border-2 border-white pointer-events-none" />
                  <div className="absolute top-0.5 left-0.5 w-full h-full rounded-3xl bg-rose-800 border-2 border-white pointer-events-none" />
                  <UnoCard isBack size="md" />

                  {isMyTurn && !hasPlayableCard && (
                    <span className="absolute -bottom-2.5 -right-2 bg-gradient-to-r from-yellow-300 to-amber-400 text-slate-950 font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-xl border-2 border-white animate-bounce">
                      COMPRE
                    </span>
                  )}
                </button>
                <span className="text-[11px] text-white font-mono mt-1.5 font-black drop-shadow bg-emerald-700/60 px-2.5 py-0.5 rounded-full border border-white/40">
                  {state.deckCardsCount} restantes
                </span>
              </div>

              {/* Discard Pile */}
              <div
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => {
                  if (hasPlayableCard && isMyTurn) {
                    setFeedbackToast("Clique na carta da sua mão que deseja jogar aqui!");
                    setTimeout(() => setFeedbackToast(null), 3000);
                  }
                }}
              >
                {state.discardPileTop ? (
                  <UnoCard card={state.discardPileTop} size="md" />
                ) : (
                  <div className="w-24 h-36 sm:w-28 sm:h-42 rounded-3xl border-3 border-dashed border-white/60 bg-white/20 flex items-center justify-center text-xs text-white font-black">
                    Vazio
                  </div>
                )}
                <span className="text-[11px] text-white font-black mt-1.5 drop-shadow bg-emerald-700/60 px-2.5 py-0.5 rounded-full border border-white/40">
                  Mesa
                </span>
              </div>
            </div>

            {/* Active Color Indicator Circle Badge */}
            <div
              className={`absolute -top-4 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-lg border-3 border-white flex items-center gap-1.5 ${
                currentColorBg[state.currentColor]
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white shadow-sm animate-ping"></span>
              Cor: {currentColorNames[state.currentColor]}
            </div>

            {/* Direction Pill below circle */}
            <div
              className={`absolute -bottom-4 px-4 py-1.5 rounded-full text-xs font-black tracking-wide bg-white/95 shadow-xl flex items-center gap-1.5 z-20 border-3 transition-colors ${
                state.turnDirection === 1
                  ? 'border-amber-400 text-amber-900'
                  : 'border-pink-400 text-pink-900'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
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
        <div className="w-full flex flex-col items-center z-20 pb-2">
          {/* Action Row: UNO button & Pass button */}
          <div className="w-full max-w-2xl flex items-center justify-between px-4 mb-1">
            {/* Call UNO button & Emote picker */}
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={onCallUno}
                className={`py-2.5 px-5 sm:px-6 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-2 border-3 sm:border-4 border-white ${
                  state.myHand.length <= 2
                    ? 'bg-gradient-to-b from-yellow-300 via-orange-500 to-red-500 text-white animate-bounce shadow-[0_6px_0_#991b1b] active:shadow-[0_2px_0_#991b1b] active:translate-y-1'
                    : 'bg-gradient-to-b from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white shadow-[0_4px_0_#9f1239] active:shadow-[0_1px_0_#9f1239] active:translate-y-0.5'
                }`}
              >
                <Flame className="w-4 h-4 fill-yellow-300 text-yellow-300" />
                GRITAR UNO!
                {me?.hasCalledUno && (
                  <span className="text-[10px] bg-white text-rose-600 px-2 py-0.5 rounded-full ml-1 font-black shadow-sm">
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
                className="py-2.5 px-5 rounded-2xl bg-gradient-to-b from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-white text-xs sm:text-sm font-black border-3 border-white shadow-[0_4px_0_#1e40af] active:shadow-[0_1px_0_#1e40af] active:translate-y-0.5 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <span>Passar Vez</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Cards in Hand Fan Layout */}
          <div className="w-full max-w-4xl px-2 overflow-x-auto pb-2 pt-2 flex items-center justify-center">
            <div className="flex items-center -space-x-8 sm:-space-x-10 hover:-space-x-4 transition-all duration-300 py-2 px-4">
              {state.myHand.map((card, idx) => {
                const playable = isPlayable(card);
                const isFlying = flyingCardId === card.id;

                return (
                  <div
                    key={card.id}
                    className={`transform transition-all duration-300 hover:z-40 hover:-translate-y-5 ${
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
    </div>
  );
};
