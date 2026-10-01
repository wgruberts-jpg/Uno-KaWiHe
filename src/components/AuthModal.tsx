import React, { useState } from 'react';
import { auth } from '../services/auth.js';
import { AVATARS_CATALOG } from '../utils/avatars.js';
import { X, Lock, User, KeyRound, Sparkles, Shield, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🦸‍♂️');
  const [isAdminRegister, setIsAdminRegister] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (tab === 'login') {
        const res = await auth.login(username, password);
        if (res.success && res.user) {
          setSuccessMsg(`Bem-vindo de volta, ${res.user.displayName}!`);
          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 800);
        } else {
          setErrorMsg(res.error || 'Credenciais inválidas.');
        }
      } else {
        const res = await auth.register({
          username,
          password,
          displayName: displayName || username,
          avatar: selectedAvatar,
          role: isAdminRegister ? 'admin' : 'player',
          adminSecret: isAdminRegister ? adminSecret : undefined,
        });

        if (res.success && res.user) {
          setSuccessMsg(`Conta criada com sucesso! Olá, ${res.user.displayName}!`);
          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 900);
        } else {
          setErrorMsg(res.error || 'Erro ao registrar usuário.');
        }
      }
    } catch (err: any) {
      setErrorMsg('Erro de conexão. Verifique se o servidor está ativo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border-4 border-yellow-400 rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl my-auto text-slate-800 max-h-[92dvh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-yellow-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-amber-600 shadow-sm text-xl">
              🔐
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-1.5">
                Conta Central KaWiHe
              </h3>
              <p className="text-[11px] text-slate-500 font-bold">
                Um único login para o Uno e novos jogos na VM
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

        {/* Tab switch */}
        <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-100 rounded-2xl shrink-0">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg(null);
            }}
            className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              tab === 'login'
                ? 'bg-amber-400 text-slate-950 shadow-sm border border-amber-500'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Entrar (Login)
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('register');
              setErrorMsg(null);
            }}
            className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              tab === 'register'
                ? 'bg-amber-400 text-slate-950 shadow-sm border border-amber-500'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Criar Nova Conta
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mt-3 p-2.5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-2 animate-bounce">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-3 p-2.5 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-amber-500" />
              Nome de Usuário (Login):
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="ex: edinho, joao, bia"
              className="w-full px-3.5 py-2.5 rounded-2xl border-2 border-slate-300 focus:border-amber-400 focus:outline-none font-bold text-sm bg-slate-50"
            />
          </div>

          {tab === 'register' && (
            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Nome de Exibição na Sala:
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ex: Edinho Campeão 🏆"
                className="w-full px-3.5 py-2.5 rounded-2xl border-2 border-slate-300 focus:border-amber-400 focus:outline-none font-bold text-sm bg-slate-50"
              />
            </div>
          )}

          <div>
            <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5 text-amber-500" />
              Senha:
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-2xl border-2 border-slate-300 focus:border-amber-400 focus:outline-none font-bold text-sm bg-slate-50"
            />
          </div>

          {/* Avatar Picker for Registration */}
          {tab === 'register' && (
            <div>
              <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1">
                <span>Escolha seu Avatar:</span>
              </label>
              <div className="flex gap-2 overflow-x-auto p-2 bg-amber-50/70 rounded-2xl border border-amber-200">
                {AVATARS_CATALOG.slice(0, 10).map((a) => (
                  <button
                    key={a.emoji}
                    type="button"
                    onClick={() => setSelectedAvatar(a.emoji)}
                    className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                      selectedAvatar === a.emoji
                        ? 'bg-amber-400 border-2 border-white scale-110 shadow-md ring-2 ring-amber-400'
                        : 'bg-white border border-slate-200 hover:scale-105'
                    }`}
                  >
                    {a.emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Admin Registration Checkbox */}
          {tab === 'register' && (
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={isAdminRegister}
                  onChange={(e) => setIsAdminRegister(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 cursor-pointer"
                />
                <span className="flex items-center gap-1 text-amber-950">
                  <Shield className="w-3.5 h-3.5 text-amber-600" />
                  Cadastrar como Conta de Administrador
                </span>
              </label>

              {isAdminRegister && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Chave / PIN Mestre de Admin:
                  </label>
                  <input
                    type="password"
                    value={adminSecret}
                    onChange={(e) => setAdminSecret(e.target.value)}
                    placeholder="Digite o PIN de admin (padrão: 1234)"
                    className="w-full px-3 py-1.5 rounded-xl border border-amber-300 bg-white font-mono text-xs focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm uppercase tracking-wider shadow-md hover:shadow-lg active:scale-98 transition-all cursor-pointer border-2 border-white flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span>Carregando...</span>
            ) : tab === 'login' ? (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Entrar no Jogo</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Criar Minha Conta</span>
              </>
            )}
          </button>
        </form>

        {/* Tip footer */}
        <div className="mt-4 pt-3 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-500 font-bold">
            🔒 Senhas protegidas com criptografia bcrypt de ponta a ponta.
          </p>
        </div>
      </div>
    </div>
  );
};
