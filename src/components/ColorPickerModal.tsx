import React from 'react';
import { CardColor } from '../types/uno.js';

interface ColorPickerModalProps {
  isOpen: boolean;
  onSelectColor: (color: CardColor) => void;
}

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({ isOpen, onSelectColor }) => {
  if (!isOpen) return null;

  const colors: { name: string; emoji: string; value: CardColor; bg: string; text: string }[] = [
    { name: 'Vermelho', emoji: '🍎', value: 'red', bg: 'bg-gradient-to-br from-rose-500 to-red-600', text: 'text-white' },
    { name: 'Azul', emoji: '🌊', value: 'blue', bg: 'bg-gradient-to-br from-cyan-400 to-blue-600', text: 'text-white' },
    { name: 'Verde', emoji: '🍏', value: 'green', bg: 'bg-gradient-to-br from-lime-400 to-emerald-600', text: 'text-slate-950' },
    { name: 'Amarelo', emoji: '🍌', value: 'yellow', bg: 'bg-gradient-to-br from-yellow-300 to-amber-400', text: 'text-amber-950' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border-4 border-yellow-400 p-4 sm:p-6 rounded-3xl max-w-sm w-full text-center shadow-2xl my-auto max-h-[92dvh] overflow-y-auto">
        <h3 className="text-2xl font-black text-amber-900 uppercase tracking-wider mb-1 flex items-center justify-center gap-2">
          <span>🎨</span> Escolha a Cor!
        </h3>
        <p className="text-xs text-slate-600 mb-5 font-bold">
          Qual cor você quer que a mesa siga agora?
        </p>

        <div className="grid grid-cols-2 gap-3.5">
          {colors.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onSelectColor(c.value)}
              className={`h-24 rounded-3xl ${c.bg} border-4 border-white shadow-[0_6px_0_rgba(0,0,0,0.15)] active:shadow-[0_2px_0_rgba(0,0,0,0.15)] active:translate-y-1 transition-all hover:scale-105 flex flex-col items-center justify-center cursor-pointer`}
            >
              <span className="text-3xl filter drop-shadow">{c.emoji}</span>
              <span className={`text-base font-black drop-shadow-sm mt-1 ${c.text}`}>
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
