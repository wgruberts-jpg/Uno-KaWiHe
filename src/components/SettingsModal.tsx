import React, { useState, useEffect } from 'react';
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
  Heart,
  Lock,
  Unlock,
  KeyRound,
  ShieldAlert,
  Flame
} from 'lucide-react';
import { sound } from '../services/sound.js';
import { auth } from '../services/auth.js';

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
  const [activeTab, setActiveTab] = useState<'general' | 'admin'>('general');
  const [turnDuration, setTurnDuration] = useState<number>(currentSettings.turnDuration ?? 25);
  const [showBotCards, setShowBotCards] = useState<boolean>(currentSettings.showBotCards ?? false);
  const [botSpeedMs, setBotSpeedMs] = useState<number>(currentSettings.botSpeedMs ?? 1800);
  const [autoUnoProtection, setAutoUnoProtection] = useState<boolean>(currentSettings.autoUnoProtection ?? false);
  const [highlightHints, setHighlightHints] = useState<boolean>(currentSettings.highlightHints ?? true);
  const [avatarCategory, setAvatarCategory] = useState<'heroes' | 'animals' | 'classics'>('heroes');
  const [isMuted, setIsMuted] = useState<boolean>(() => sound.getIsMuted());
  const [savedToast, setSavedToast] = useState(false);

  // Admin PIN verification state
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => auth.isAdmin());
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  useEffect(() => {
    setIsAdminUnlocked(auth.isAdmin());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setIsVerifyingPin(true);

    try {
      const ok = await auth.verifyAdminPin(pinInput);
      if (ok) {
        setIsAdminUnlocked(true);
        setPinInput('');
      } else {
        setPinError('PIN de Administrador incorreto! (Padrão: 1234)');
      }
    } catch {
      setPinError('Erro ao validar PIN.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleApply = () => {
    const updated: Partial<RoomSettings> = {
      turnDuration,
      showBotCards,
      botSpeedMs,
      autoUnoProtection,
      highlightHints,
    };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border-4 border-yellow-400 rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl my-auto text-slate-800 max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-yellow-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-amber-600 shadow-sm text-xl">
              ⚙️
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-1.5">
                Configurações & Painel Admin
              </h3>
              <p className="text-[11px] text-slate-500 font-bold">
                Ajuste opções gerais ou acesse recursos avançados do administrador
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

        {/* Tab switcher: Geral vs Avançado / Admin */}
        <div className="grid grid-cols-2 gap-2 mt-3 p-1 bg-slate-100 rounded-2xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'general'
                ? 'bg-amber-400 text-slate-950 shadow-sm border border-amber-500'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Geral & Perfil</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'admin'
                ? 'bg-indigo-600 text-white shadow-sm border border-indigo-700'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {isAdminUnlocked ? (
              <Unlock className="w-3.5 h-3.5 text-emerald-300" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-amber-500" />
            )}
            <span>Avançado & Admin</span>
            {isAdminUnlocked && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </button>
        </div>

        {/* Scrollable Settings Content */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1 text-xs">
          {activeTab === 'general' ? (
            <>
              {/* Quick Hero & Avatar Selector */}
              <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-slate-900 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-amber-600" />
                    Seu Avatar Visual:
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

              {/* Sound Effects Toggle */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border-2 border-slate-200 flex items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-sky-100 border border-sky-300 flex items-center justify-center text-sky-600 shrink-0">
                    {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <div>
                    <span className="font-black text-slate-900 block text-xs">
                      Efeitos Sonoros do Jogo
                    </span>
                    <p className="text-[11px] text-slate-600 font-medium">
                      Sons de cartas, grito de UNO, compra de cartas e vitória
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleSound}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition-colors cursor-pointer border ${
                    !isMuted
                      ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                >
                  {!isMuted ? 'Ligado' : 'Mutado'}
                </button>
              </div>

              {/* Highlight Hints Toggle */}
              <div className="p-3.5 bg-yellow-50 rounded-2xl border-2 border-yellow-200 flex items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-600 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-black text-slate-900 block text-xs">
                      Destaque de Cartas Jogáveis
                    </span>
                    <p className="text-[11px] text-slate-600 font-medium">
                      Acende uma borda dourada nas cartas válidas da sua mão
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setHighlightHints(!highlightHints)}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 border-2 ${
                    highlightHints ? 'bg-amber-400 border-amber-500' : 'bg-slate-300 border-slate-400'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform transform ${
                      highlightHints ? 'translate-x-6' : 'translate-x-1'
                    } top-0.5 absolute`}
                  />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ADMIN / CHEATS TAB */}
              {!isAdminUnlocked ? (
                /* Locked with PIN prompt */
                <div className="p-5 bg-rose-50 border-3 border-rose-300 rounded-3xl text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-rose-100 border-2 border-rose-400 mx-auto flex items-center justify-center text-rose-600 text-2xl shadow-inner">
                    🔒
                  </div>
                  <div>
                    <h4 className="font-black text-rose-950 text-sm">
                      Área Restrita do Administrador
                    </h4>
                    <p className="text-[11px] text-rose-800 font-medium mt-1">
                      Os recursos avançados da mesa (ver cartas dos robôs no modo treino, ajuste de velocidade e proteção auxiliar) são protegidos por PIN para controle do administrador.
                    </p>
                  </div>

                  <form onSubmit={handleVerifyPin} className="max-w-xs mx-auto space-y-2 pt-2">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Digite o PIN de Administrador (padrão: 1234):
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        required
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        placeholder="PIN..."
                        className="flex-1 px-3 py-2 rounded-xl border-2 border-rose-300 bg-white text-center font-mono font-black text-sm tracking-widest focus:outline-none focus:border-rose-500"
                      />
                      <button
                        type="submit"
                        disabled={isVerifyingPin}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs shadow cursor-pointer transition-all active:scale-95"
                      >
                        {isVerifyingPin ? '...' : 'Destravar'}
                      </button>
                    </div>

                    {pinError && (
                      <p className="text-[11px] text-rose-600 font-bold animate-bounce">
                        ⚠️ {pinError}
                      </p>
                    )}
                  </form>
                </div>
              ) : (
                /* Unlocked Admin Section */
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 rounded-2xl border-2 border-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Unlock className="w-4 h-4 text-emerald-600" />
                      <span className="font-black text-emerald-950 text-xs">
                        👑 Acesso Administrativo Desbloqueado
                      </span>
                    </div>
                    <span className="text-[10px] bg-emerald-200 text-emerald-900 font-black px-2 py-0.5 rounded-full border border-emerald-300">
                      Recursos Liberados
                    </span>
                  </div>

                  {/* Recurso 1: Ver Cartas dos Robôs (Modo Treino / Aprendizado) */}
                  <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 rounded-2xl border-2 border-emerald-300 flex items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
                        <Eye className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-black text-slate-900 block text-xs">
                          👀 Ver Cartas dos Robôs (Modo Treino / Criança)
                        </span>
                        <p className="text-[11px] text-slate-600 font-medium">
                          Mostra as cartas dos robôs abertas e visíveis na mesa para auxiliar crianças e iniciantes.
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

                  {/* Recurso 2: Velocidade dos Robôs */}
                  <div className="p-3.5 bg-sky-50 rounded-2xl border-2 border-sky-200 shadow-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-sky-600" />
                      <span className="font-black text-slate-900">
                        ⚡ Velocidade dos Robôs na Mesa:
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { val: 3000, label: '🧸 Calmo (3.0s)', desc: 'Para crianças' },
                        { val: 1800, label: '⚡ Normal (1.8s)', desc: 'Padrão' },
                        { val: 400, label: '🚀 Turbo (0.4s)', desc: 'Super rápido' },
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setBotSpeedMs(opt.val)}
                          className={`py-2 px-1.5 rounded-xl border-2 text-center transition-all cursor-pointer ${
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

                  {/* Recurso 3: Tempo de Turno */}
                  <div className="p-3.5 bg-amber-50 rounded-2xl border-2 border-amber-200 shadow-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span className="font-black text-slate-900">
                        ⏳ Tempo de Turno dos Jogadores:
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        { sec: 0, label: 'Sem Pressa', sub: 'Ilimitado' },
                        { sec: 15, label: '15s', sub: 'Rápido' },
                        { sec: 25, label: '25s', sub: 'Normal' },
                        { sec: 45, label: '45s', sub: 'Calmo' },
                        { sec: 90, label: '90s', sub: 'Longo' },
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
                          <div className="text-[11px] font-black">{t.label}</div>
                          <div className="text-[8px] text-slate-500">{t.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Recurso 4: Proteção Infantil de UNO */}
                  <div className="p-3.5 bg-rose-50 rounded-2xl border-2 border-rose-200 flex items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600 shrink-0 mt-0.5">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-black text-slate-900 block text-xs">
                          🛡️ Proteção Automática de UNO
                        </span>
                        <p className="text-[11px] text-slate-600 font-medium">
                          Grita UNO automaticamente pelo jogador, evitando tomar +2 cartas de penalidade.
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
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t-2 border-yellow-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-2xl border-2 border-slate-300 hover:bg-slate-100 text-slate-700 font-black text-xs cursor-pointer transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400 hover:from-yellow-400 hover:to-orange-500 text-slate-950 font-black text-xs shadow-md border-2 border-white cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
          >
            {savedToast ? (
              <>
                <Check className="w-4 h-4 text-emerald-800" />
                <span>Salvo com Sucesso!</span>
              </>
            ) : (
              <span>Aplicar Configurações</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
