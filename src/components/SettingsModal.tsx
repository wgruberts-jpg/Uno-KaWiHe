import React, { useState } from 'react';
import { RoomSettings } from '../types/uno.js';
import { AVATARS_CATALOG, AVATAR_CATEGORIES } from '../utils/avatars.js';
import {
  X,
  Settings,
  Clock,
  Eye,
  Bot,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  Check,
  User,
  Heart
} from 'lucide-react';
import { sound } from '../services/sound.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: RoomSettings;
  onUpdateSettings: (newSettings: Partial<RoomSettings>) => void;
  currentAvatar: string;
  onSelectAvatar: (avatar: string) => void;
  isHost?: boolean;
  isInGame?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onUpdateSettings,
  currentAvatar,
  onSelectAvatar,
  isHost = true,
  isInGame = false,
}) => {
  const [turnDuration, setTurnDuration] = useState<number>(currentSettings.turnDuration ?? 25);
  const [showBotCards, setShowBotCards] = useState<boolean>(currentSettings.showBotCards ?? false);
  const [botSpeedMs, setBotSpeedMs] = useState<number>(currentSettings.botSpeedMs ?? 1800);
  const [autoUnoProtection, setAutoUnoProtection] = useState<boolean>(currentSettings.autoUnoProtection ?? false);
  const [highlightHints, setHighlightHints] = useState<boolean>(currentSettings.highlightHints ?? true);
  const [avatarCategory, setAvatarCategory] = useState<'heroes' | 'animals' | 'classics'>('heroes');
  const [isMuted, setIsMuted] = useState<boolean>(() => sound.getIsMuted());
  const [savedToast, setSavedToast] = useState(false);

  if (!isOpen) return null;

  const handleToggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const handleApply = () => {
    const updated: Partial<RoomSettings> = {
      turnDuration,
      showBotCards,
      botSpeedMs,
      autoUnoProtection,
      highlightHints,
    };

    // Save to localStorage for future games
    localStorage.setItem('uno_turn_duration', String(turnDuration));
    localStorage.setItem('uno_show_bot_cards', String(showBotCards));
    localStorage.setItem('uno_bot_speed_ms', String(botSpeedMs));
    localStorage.setItem('uno_auto_uno', String(autoUnoProtection));
    localStorage.setItem('uno_highlight_hints', String(highlightHints));

    onUpdateSettings(updated);
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 600);
  };

  const filteredAvatars = AVATARS_CATALOG.filter((a) => a.category === avatarCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border-4 border-yellow-400 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl my-4 text-slate-800 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-yellow-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-amber-600 shadow-sm text-xl">
              ⚙️
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-1.5">
                Configurações & Modo Criança
              </h3>
              <p className="text-[11px] text-slate-500 font-bold">
                Ajuste o tempo, velocidade e regras para jogar em família
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Settings Content */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1 text-xs">
          {/* Quick Hero & Avatar Selector */}
          <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-black text-slate-900 flex items-center gap-1.5">
                <User className="w-4 h-4 text-amber-600" />
                Seu Avatar:
              </span>
              <span className="text-[11px] font-black text-amber-800 bg-amber-200/80 px-2.5 py-0.5 rounded-full border border-amber-300">
                Escolhido: {currentAvatar}
              </span>
            </div>

            {/* Avatar Category Tabs */}
            <div className="flex gap-1.5 mb-2.5">
              {AVATAR_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setAvatarCategory(cat.id)}
                  className={`py-1 px-2.5 rounded-xl font-black text-[11px] cursor-pointer transition-all border ${
                    avatarCategory === cat.id
                      ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-sm'
                      : 'bg-white text-slate-600 border-amber-200 hover:bg-amber-100/50'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Avatar Grid */}
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-1 bg-white/70 rounded-xl border border-amber-200">
              {filteredAvatars.map((item) => (
                <button
                  key={item.name + item.emoji}
                  type="button"
                  onClick={() => onSelectAvatar(item.emoji)}
                  title={item.name}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center cursor-pointer transition-all ${
                    currentAvatar === item.emoji
                      ? 'bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-400 border-2 border-white scale-110 shadow-md ring-2 ring-yellow-400'
                      : 'bg-white border border-slate-200 hover:scale-105 hover:bg-yellow-50'
                  }`}
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Setting 1: Ver Cartas dos Robôs (Modo Criança) */}
          <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 rounded-2xl border-2 border-emerald-300 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <span className="font-black text-slate-900 block text-xs">
                  Ver Cartas dos Robôs (Modo Criança)
                </span>
                <p className="text-[11px] text-slate-600 font-medium">
                  Mostra as cartas dos robôs abertas na mesa. Ideal para crianças aprenderem a jogar e planejarem suas jogadas!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowBotCards(!showBotCards)}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 border-2 ${
                showBotCards ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-300 border-slate-400'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform transform ${
                  showBotCards ? 'translate-x-6' : 'translate-x-1'
                } top-0.5 absolute`}
              />
            </button>
          </div>

          {/* Setting 2: Velocidade dos Robôs */}
          <div className="p-3.5 bg-sky-50 rounded-2xl border-2 border-sky-200 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-sky-600" />
              <span className="font-black text-slate-900">
                Velocidade das Jogadas dos Robôs:
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium">
              Escolha o tempo que os robôs demoram para largar a carta:
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 3000, label: '🧸 Calmo (3.0s)', desc: 'Para crianças acompanharem' },
                { val: 1800, label: '⚡ Normal (1.8s)', desc: 'Ritmo padrão divertido' },
                { val: 800, label: '🚀 Rápido (0.8s)', desc: 'Partidas dinâmicas' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setBotSpeedMs(opt.val)}
                  className={`py-2 px-2.5 rounded-xl border-2 text-center transition-all cursor-pointer ${
                    botSpeedMs === opt.val
                      ? 'bg-sky-500 text-white border-sky-600 font-black shadow-sm scale-102'
                      : 'bg-white text-slate-700 border-sky-200 hover:bg-sky-100 font-bold'
                  }`}
                >
                  <div className="text-[11px] font-black">{opt.label}</div>
                  <div className="text-[9px] opacity-80 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Setting 3: Tempo de Turno */}
          <div className="p-3.5 bg-amber-50 rounded-2xl border-2 border-amber-200 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="font-black text-slate-900">
                Tempo do Seu Turno:
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium">
              Defina quanto tempo cada jogador tem para jogar sua carta:
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {[
                { sec: 0, label: 'Sem Pressa', sub: 'Ilimitado' },
                { sec: 15, label: '15s', sub: 'Rápido' },
                { sec: 25, label: '25s', sub: 'Normal' },
                { sec: 40, label: '40s', sub: 'Tranquilo' },
                { sec: 60, label: '1 Min', sub: '60s' },
                { sec: 90, label: '1m 30s', sub: '90s' },
              ].map((t) => (
                <button
                  key={t.sec}
                  type="button"
                  onClick={() => setTurnDuration(t.sec)}
                  className={`py-1.5 px-1 rounded-xl border-2 text-center transition-all cursor-pointer ${
                    turnDuration === t.sec
                      ? 'bg-gradient-to-r from-yellow-300 to-amber-400 text-amber-950 border-amber-500 font-black shadow-sm scale-105'
                      : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100 font-bold'
                  }`}
                >
                  <div className="text-xs font-black">{t.label}</div>
                  <div className="text-[9px] text-slate-500">{t.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Setting 4: Proteção Infantil de UNO (Grito Automático) */}
          <div className="p-3.5 bg-rose-50 rounded-2xl border-2 border-rose-200 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600 shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="font-black text-slate-900 block text-xs">
                  Proteção Infantil de UNO (Grito Automático)
                </span>
                <p className="text-[11px] text-slate-600 font-medium">
                  Evita que a criança tome penalidade de +2 cartas se esquecer de clicar em "Gritar UNO". O jogo fala por ela!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAutoUnoProtection(!autoUnoProtection)}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 border-2 ${
                autoUnoProtection ? 'bg-rose-500 border-rose-600' : 'bg-slate-300 border-slate-400'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform transform ${
                  autoUnoProtection ? 'translate-x-6' : 'translate-x-1'
                } top-0.5 absolute`}
              />
            </button>
          </div>

          {/* Setting 5: Destaque de Cartas Jogáveis & Sons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Destaque visual */}
            <div className="p-3 bg-yellow-50 rounded-2xl border-2 border-yellow-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="font-black text-[11px] text-slate-900">
                  Destacar Cartas Jogáveis
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHighlightHints(!highlightHints)}
                className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer border-2 ${
                  highlightHints ? 'bg-amber-400 border-amber-500' : 'bg-slate-300 border-slate-400'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform transform ${
                    highlightHints ? 'translate-x-5' : 'translate-x-0.5'
                  } top-0.2 absolute`}
                />
              </button>
            </div>

            {/* Sons da partida */}
            <div className="p-3 bg-slate-50 rounded-2xl border-2 border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4 text-emerald-500" />}
                <span className="font-black text-[11px] text-slate-900">
                  Efeitos Sonoros do Jogo
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleSound}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-black cursor-pointer border transition-colors ${
                  isMuted ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                }`}
              >
                {isMuted ? 'Mudo' : 'Ligado'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="pt-3 border-t-2 border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-400 hover:from-yellow-200 hover:to-orange-300 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_4px_0_#d97706] active:shadow-[0_1px_0_#d97706] active:translate-y-0.5 border-2 border-white cursor-pointer transition-all"
          >
            {savedToast ? (
              <>
                <Check className="w-4 h-4 text-emerald-800" />
                <span>Salvo!</span>
              </>
            ) : (
              <span>Salvar Configurações</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
