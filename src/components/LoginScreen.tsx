import React, { useState, useEffect } from 'react';
import { auth } from '../services/auth.js';
import { AVATARS_CATALOG } from '../utils/avatars.js';
import { UserProfile } from '../types/uno.js';
import { KeyRound, Sparkles, User, Ticket, Shield, AlertCircle, CheckCircle2, Lock } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🦸‍♂️');
  const [isAdminRegister, setIsAdminRegister] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if invite code was passed in URL query param: ?invite=@XXXX
    const urlParam = new URLSearchParams(window.location.search).get('invite');
    if (urlParam) {
      let code = urlParam.trim().toUpperCase();
      if (!code.startsWith('@')) code = '@' + code;
      setInviteCode(code);
      setTab('register');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (tab === 'login') {
        const res = await auth.login(username, password);
        if (res.success && res.user) {
          setSuccessMsg(`Bem-vindo, ${res.user.displayName}! Entrando...`);
          setTimeout(() => {
            onLoginSuccess(res.user!);
          }, 600);
        } else {
          setErrorMsg(res.error || 'Usuário ou senha incorretos.');
        }
      } else {
        if (!inviteCode || inviteCode.trim().length < 2) {
          setErrorMsg('O código de convite (@XXXX) é obrigatório para novos cadastros!');
          setIsLoading(false);
          return;
        }

        const res = await auth.register({
          username,
          password,
          displayName: displayName || username,
          avatar: selectedAvatar,
          role: isAdminRegister ? 'admin' : 'player',
          adminSecret: isAdminRegister ? adminSecret : undefined,
          inviteCode: inviteCode.trim(),
        });

        if (res.success && res.user) {
          setSuccessMsg(`Conta criada com sucesso! Sua Tag é ${res.user.tag}! Entrando...`);
          setTimeout(() => {
            onLoginSuccess(res.user!);
          }, 800);
        } else {
          setErrorMsg(res.error || 'Erro ao registrar usuário.');
        }
      }
    } catch (err: any) {
      setErrorMsg('Erro ao conectar com o servidor. Verifique se o servidor está ativo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/80 p-3 sm:p-6 overflow-y-auto">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-amber-500 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-red-500 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 bg-white/95 backdrop-blur-md border-4 border-amber-400 rounded-3xl max-w-md w-full p-5 sm:p-7 shadow-2xl my-auto text-slate-800 flex flex-col shrink-0">
        {/* Brand Logo & Title */}
        <div className="text-center pb-4 border-b-2 border-amber-100">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-3xl shadow-lg border-2 border-white mb-2">
            🎴
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-2">
            UNO <span className="text-amber-600">KaWiHe</span>
          </h1>
          <p className="text-xs font-bold text-slate-500 mt-0.5">
            Acesso Restrito • Identifique-se para Jogar
          </p>
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
            Criar Conta (Convite)
          </button>
        </div>

        {/* Status Messages */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-700 text-xs font-bold flex items-start gap-2 animate-in shake duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-3 p-3 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
          {/* Invite Code Field (MANDATORY on Register) */}
          {tab === 'register' && (
            <div className="p-3 bg-amber-50/80 rounded-2xl border-2 border-amber-300 space-y-1">
              <label className="block text-slate-800 font-black flex items-center justify-between">
                <span className="flex items-center gap-1 text-amber-900">
                  <Ticket className="w-3.5 h-3.5 text-amber-600" />
                  Código de Convite (@XXXX):
                </span>
                <span className="text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-black">
                  OBRIGATÓRIO
                </span>
              </label>
              <input
                type="text"
                required
                value={inviteCode}
                onChange={(e) => {
                  let val = e.target.value.toUpperCase();
                  if (val.length > 0 && !val.startsWith('@')) val = '@' + val;
                  setInviteCode(val.slice(0, 5));
                }}
                placeholder="@XXXX (ex: @KWH1)"
                maxLength={5}
                className="w-full px-3 py-2 rounded-xl border-2 border-amber-400 focus:border-amber-600 focus:outline-none font-mono font-black text-sm bg-white uppercase tracking-widest text-slate-950"
              />
              <p className="text-[10px] text-slate-500 font-medium">
                🔒 Peça seu código ao Administrador <strong>Edinho</strong>.
              </p>
            </div>
          )}

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
              placeholder="ex: edinho, will, henry, grazy..."
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
                placeholder="ex: Edinho 👑, Will, Henry..."
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
                    placeholder="Digite a Chave Mestre de Admin"
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
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg hover:shadow-xl active:scale-98 transition-all cursor-pointer border-2 border-white flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <span>Autenticando...</span>
            ) : tab === 'login' ? (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Entrar no Jogo</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Criar Minha Conta com Convite</span>
              </>
            )}
          </button>
        </form>

        {/* Info footer */}
        <div className="mt-5 pt-3 border-t border-slate-100 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
            <Lock className="w-3 h-3 text-amber-600" />
            <span>Acesso Privado KaWiHe • Protegido por Sessão</span>
          </div>
        </div>
      </div>
    </div>
  );
};
