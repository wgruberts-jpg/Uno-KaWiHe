import React, { useEffect, useState } from 'react';
import { ActiveEmote } from '../types/uno.js';

interface EmoteBubbleProps {
  emote: ActiveEmote;
  side?: 'left' | 'right' | 'top' | 'bottom';
  className?: string;
}

export const EmoteBubble: React.FC<EmoteBubbleProps> = ({
  emote,
  side = 'right',
  className = '',
}) => {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Start fading out after 2.2 seconds, complete around 3.0s
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 2200);

    return () => clearTimeout(fadeTimer);
  }, []);

  const positionClasses = {
    right: 'left-full ml-2 sm:ml-3 top-1/2 -translate-y-1/2',
    left: 'right-full mr-2 sm:mr-3 top-1/2 -translate-y-1/2',
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  }[side];

  return (
    <div
      className={`absolute ${positionClasses} z-50 pointer-events-none flex flex-col items-center transition-all duration-700 ease-out ${
        isFading
          ? 'opacity-0 -translate-y-6 scale-90'
          : 'opacity-100 scale-100 animate-in fade-in zoom-in-75 duration-200'
      } ${className}`}
    >
      {/* Big Animated Emoji */}
      <div className="relative flex items-center justify-center filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)]">
        <span className="text-6xl sm:text-7xl select-none transform hover:scale-110 transition-transform animate-bounce">
          {emote.emoji}
        </span>
      </div>

      {/* Speech Bubble Tag with Phrase */}
      {emote.phrase && (
        <div className="mt-1 px-3 py-1 rounded-2xl bg-white border-3 border-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-xl tracking-wide whitespace-nowrap flex items-center gap-1">
          <span>{emote.phrase}</span>
        </div>
      )}
    </div>
  );
};
