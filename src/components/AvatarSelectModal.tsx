import React, { useState } from 'react';
import { AVATARS_CATALOG, AVATAR_CATEGORIES } from '../utils/avatars.js';
import { X, Sparkles, Check } from 'lucide-react';

interface AvatarSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatar: string;
  onSelectAvatar: (avatar: string) => void;
}

export const AvatarSelectModal: React.FC<AvatarSelectModalProps> = ({
  isOpen,
  onClose,
  currentAvatar,
  onSelectAvatar,
}) => {
  const [activeCategory, setActiveCategory] = useState<'heroes' | 'animals' | 'classics'>('heroes');

  if (!isOpen) return null;

  const filteredAvatars = AVATARS_CATALOG.filter((a) => a.category === activeCategory);

  const handleSelect = (emoji: string) => {
    onSelectAvatar(emoji);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border-4 border-amber-400 shadow-2xl max-w-md w-full overflow-hidden text-slate-800 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-300 border-b-2 border-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/90 flex items-center justify-center text-lg shadow-sm">
              <Sparkles className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-950">Escolha seu Avatar</h2>
              <p className="text-[11px] font-bold text-amber-900">Seu visual exclusivo nas partidas do Uno</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/10 text-slate-950 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Avatar Highlight */}
        <div className="p-3 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white border-2 border-amber-400 shadow-md flex items-center justify-center text-3xl">
              {currentAvatar}
            </div>
            <div>
              <div className="text-xs font-black text-slate-900">Avatar Atual</div>
              <div className="text-[11px] text-slate-500 font-medium">Clique em qualquer outro para trocar</div>
            </div>
          </div>
          <span className="text-[10px] bg-amber-200 text-amber-900 font-black px-2.5 py-1 rounded-full border border-amber-300">
            Ativo
          </span>
        </div>

        {/* Category Tabs */}
        <div className="p-3 pb-1 flex gap-1.5 border-b border-slate-100">
          {AVATAR_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                activeCategory === cat.id
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 border-amber-500 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Avatars Grid */}
        <div className="p-4 overflow-y-auto flex-1 grid grid-cols-5 sm:grid-cols-6 gap-2.5">
          {filteredAvatars.map((av) => {
            const isSelected = currentAvatar === av.emoji;
            return (
              <button
                key={av.emoji}
                type="button"
                onClick={() => handleSelect(av.emoji)}
                className={`relative h-14 rounded-2xl text-2xl sm:text-3xl flex items-center justify-center transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-br from-yellow-300 to-amber-400 border-3 border-amber-500 shadow-lg scale-105 ring-2 ring-amber-300'
                    : 'bg-slate-50 hover:bg-amber-100 border-2 border-slate-200 hover:scale-105'
                }`}
                title={av.name}
              >
                {av.emoji}
                {isSelected && (
                  <span className="absolute -top-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow-sm border border-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-black text-xs cursor-pointer transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
