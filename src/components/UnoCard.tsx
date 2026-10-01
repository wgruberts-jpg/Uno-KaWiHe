import React from 'react';
import { Card, CardColor, CardValue } from '../types/uno.js';

interface UnoCardProps {
  card?: Card;
  isBack?: boolean;
  isPlayable?: boolean;
  isSelected?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
  badge?: string;
}

const colorBgMap: Record<CardColor, string> = {
  red: 'bg-gradient-to-br from-rose-500 via-red-500 to-red-600 text-white shadow-lg shadow-rose-500/25',
  blue: 'bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25',
  green: 'bg-gradient-to-br from-lime-300 via-emerald-400 to-green-600 text-slate-950 shadow-lg shadow-emerald-500/25',
  yellow: 'bg-gradient-to-br from-yellow-200 via-yellow-300 to-amber-400 text-amber-950 shadow-lg shadow-amber-400/25',
  wild: 'bg-gradient-to-br from-fuchsia-500 via-purple-600 to-cyan-500 text-white shadow-lg shadow-purple-500/30',
};

export const UnoCard: React.FC<UnoCardProps> = ({
  card,
  isBack = false,
  isPlayable = false,
  isSelected = false,
  size = 'md',
  onClick,
  className = '',
  badge,
}) => {
  const sizeClasses = {
    sm: 'w-13 h-20 sm:w-16 sm:h-24 text-xs rounded-2xl border-2 sm:border-3 p-1',
    md: 'w-[4.2rem] h-[6.2rem] sm:w-[5rem] sm:h-[7.4rem] md:w-24 md:h-36 lg:w-26 lg:h-38 text-xs sm:text-sm md:text-base rounded-2xl sm:rounded-3xl border-2 sm:border-4 p-1 sm:p-1.5',
    lg: 'w-22 h-32 sm:w-28 sm:h-42 md:w-32 md:h-48 text-base sm:text-lg rounded-3xl border-3 sm:border-4 p-1.5 sm:p-2',
  }[size];

  if (isBack || !card) {
    return (
      <div
        className={`relative ${sizeClasses} bg-white border-white shadow-xl select-none flex items-center justify-center transition-transform ${className}`}
      >
        <div className="w-full h-full rounded-xl sm:rounded-2xl bg-gradient-to-br from-rose-500 via-red-500 to-red-600 flex items-center justify-center overflow-hidden border border-red-300 shadow-inner">
          <div className="w-[74%] h-[56%] -rotate-25 rounded-full bg-slate-950 flex items-center justify-center shadow-lg border-2 border-yellow-300">
            <span className="font-black text-yellow-300 tracking-tighter text-xs sm:text-sm md:text-base italic scale-x-125 drop-shadow-md">
              UNO
            </span>
          </div>
        </div>
      </div>
    );
  }

  const renderSymbol = (value: CardValue, isCorner = false) => {
    switch (value) {
      case 'skip':
        return (
          <svg className={isCorner ? 'w-3 h-3 sm:w-4 sm:h-4' : 'w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
          </svg>
        );
      case 'reverse':
        return (
          <svg className={isCorner ? 'w-3 h-3 sm:w-4 sm:h-4' : 'w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12V8a4 4 0 0 1 4-4h8" />
            <polyline points="13 1 16 4 13 7" />
            <path d="M20 12v4a4 4 0 0 1-4 4H8" />
            <polyline points="11 23 8 20 11 17" />
          </svg>
        );
      case 'draw2':
        return <span className={`font-black ${isCorner ? 'text-[10px] sm:text-xs md:text-sm' : 'text-xl sm:text-2xl md:text-3xl'}`}>+2</span>;
      case 'wild4':
        return (
          <div className="flex flex-col items-center leading-none">
            <span className={`font-black ${isCorner ? 'text-[10px] sm:text-xs' : 'text-lg sm:text-2xl md:text-3xl text-yellow-300 drop-shadow'}`}>+4</span>
            {!isCorner && (
              <div className="grid grid-cols-2 gap-0.5 sm:gap-1 mt-0.5 sm:mt-1">
                <span className="w-1.5 h-2 sm:w-2.5 sm:h-3 bg-rose-500 rounded-xs sm:rounded-sm shadow-sm"></span>
                <span className="w-1.5 h-2 sm:w-2.5 sm:h-3 bg-sky-400 rounded-xs sm:rounded-sm shadow-sm"></span>
                <span className="w-1.5 h-2 sm:w-2.5 sm:h-3 bg-yellow-300 rounded-xs sm:rounded-sm shadow-sm"></span>
                <span className="w-1.5 h-2 sm:w-2.5 sm:h-3 bg-lime-400 rounded-xs sm:rounded-sm shadow-sm"></span>
              </div>
            )}
          </div>
        );
      case 'wild':
        return (
          <div className={isCorner ? 'w-3 h-3 sm:w-4 sm:h-4 rounded-full overflow-hidden grid grid-cols-2 border border-white' : 'w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 rounded-full overflow-hidden grid grid-cols-2 border-2 sm:border-3 border-white shadow-lg'}>
            <span className="w-full h-full bg-rose-500"></span>
            <span className="w-full h-full bg-sky-400"></span>
            <span className="w-full h-full bg-yellow-300"></span>
            <span className="w-full h-full bg-lime-400"></span>
          </div>
        );
      default:
        return (
          <span className={`font-black italic tracking-tighter ${isCorner ? 'text-xs sm:text-sm md:text-base' : 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl drop-shadow-sm'}`}>
            {value}
          </span>
        );
    }
  };

  const isYellow = card.color === 'yellow';
  const textColor = isYellow ? 'text-amber-950 font-black' : 'text-white font-black';
  const ovalBg = card.color === 'wild' ? 'bg-indigo-950' : 'bg-white';
  const centerContentColor = card.color === 'wild' ? 'text-white' : isYellow ? 'text-amber-500' : card.color === 'red' ? 'text-rose-600' : card.color === 'blue' ? 'text-blue-600' : 'text-emerald-600';

  return (
    <button
      type="button"
      draggable={isPlayable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', card.id);
      }}
      onClick={onClick}
      className={`relative ${sizeClasses} border-white select-none flex flex-col justify-between shadow-xl transition-all duration-200 cursor-pointer opacity-100 ${
        colorBgMap[card.color]
      } ${
        isPlayable
          ? 'hover:-translate-y-3 sm:hover:-translate-y-4 hover:shadow-2xl hover:brightness-110 ring-3 sm:ring-4 ring-yellow-300 ring-offset-2 ring-offset-sky-300 scale-105 active:scale-95 z-20'
          : 'brightness-95 hover:brightness-105 hover:-translate-y-1'
      } ${isSelected ? '-translate-y-4 sm:-translate-y-6 ring-3 sm:ring-4 ring-yellow-300' : ''} ${className}`}
    >
      {/* Top Left Mini Value */}
      <div className={`flex items-center justify-start leading-none font-bold ${textColor}`}>
        {renderSymbol(card.value, true)}
      </div>

      {/* Central Oval */}
      <div className="absolute inset-0 flex items-center justify-center p-1 sm:p-2 pointer-events-none">
        <div
          className={`w-[70%] h-[74%] -rotate-25 rounded-full ${ovalBg} flex items-center justify-center shadow-inner overflow-hidden border border-black/10`}
        >
          <div className={`rotate-25 flex items-center justify-center ${centerContentColor}`}>
            {renderSymbol(card.value, false)}
          </div>
        </div>
      </div>

      {/* Bottom Right Inverted Mini Value */}
      <div className={`flex items-center justify-end leading-none font-bold rotate-180 ${textColor}`}>
        {renderSymbol(card.value, true)}
      </div>

      {badge && (
        <span className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 bg-amber-400 text-slate-950 text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full shadow">
          {badge}
        </span>
      )}
    </button>
  );
};
