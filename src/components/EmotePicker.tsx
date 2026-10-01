import React, { useState, useRef, useEffect } from 'react';
import { EMOTE_CATALOG } from '../utils/emotes.js';
import { EmoteItem } from '../types/uno.js';
import { Smile, X } from 'lucide-react';

interface EmotePickerProps {
  onSelectEmote: (emote: EmoteItem) => void;
  disabled?: boolean;
}

export const EmotePicker: React.FC<EmotePickerProps> = ({
  onSelectEmote,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handlePick = (emote: EmoteItem) => {
    onSelectEmote(emote);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`px-4 py-2.5 rounded-2xl font-black text-xs sm:text-sm flex items-center gap-1.5 border-3 border-white shadow-[0_4px_0_#7e22ce] active:shadow-[0_1px_0_#7e22ce] active:translate-y-0.5 transition-all cursor-pointer ${
          isOpen
            ? 'bg-gradient-to-r from-yellow-300 to-amber-400 text-slate-950 scale-105'
            : 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-400 hover:to-purple-400 text-white'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title="Enviar Carinhas e Provocações (Visual)"
      >
        <span className="text-base leading-none">🎭</span>
        <span>Reações</span>
      </button>

      {/* Emotes Popup Drawer */}
      {isOpen && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 w-72 sm:w-80 bg-white border-4 border-yellow-400 rounded-3xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b-2 border-yellow-200">
            <span className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎭</span> Provocações & Carinhas
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grid of Emotes */}
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
            {EMOTE_CATALOG.map((emote) => (
              <button
                key={emote.id}
                type="button"
                onClick={() => handlePick(emote)}
                className="flex items-center gap-2 p-2 rounded-2xl bg-amber-50 hover:bg-yellow-200 border-2 border-amber-200 hover:border-amber-400 text-left transition-all active:scale-95 cursor-pointer group shadow-sm"
              >
                <span className="text-2xl group-hover:scale-125 transition-transform duration-200">
                  {emote.emoji}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-slate-900 group-hover:text-amber-900 truncate">
                    {emote.phrase}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate font-semibold">
                    {emote.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
