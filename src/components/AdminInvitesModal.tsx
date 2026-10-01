import React, { useState, useEffect } from 'react';
import { auth } from '../services/auth.js';
import { InviteCode } from '../types/uno.js';
import { X, Plus, Copy, Check, Trash2, Clock, Users, Shield, Sparkles, MessageCircle, AlertCircle } from 'lucide-react';

interface AdminInvitesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminInvitesModal: React.FC<AdminInvitesModalProps> = ({ isOpen, onClose }) => {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [durationHours, setDurationHours] = useState(24);
  const [maxUses, setMaxUses] = useState(1);
  const [customCode, setCustomCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchInvites = async () => {
    setIsLoading(true);
    try {
      const list = await auth.getInvites();
      setInvites(list);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInvites();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await auth.createInvite({
      durationHours: Number(durationHours),
      maxUses: Number(maxUses),
      customCode: customCode ? customCode.trim() : undefined,
    });

    if (res.success && res.invite) {
      setSuccessMsg(`Convite ${res.invite.code} gerado com sucesso!`);
      setCustomCode('');
      setShowCreateForm(false);
      fetchInvites();
    } else {
      setErrorMsg(res.error || 'Erro ao gerar convite.');
    }
  };

  const handleRevoke = async (code: string) => {
    if (confirm(`Tem certeza que deseja cancelar o convite ${code}?`)) {
      const ok = await auth.revokeInvite(code);
      if (ok) {
        fetchInvites();
      }
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyLink = (code: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('invite', code);
    navigator.clipboard.writeText(url.toString());
    setCopiedCode(`link-${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatExpires = (dateStr: string) => {
    if (dateStr === 'never') return 'Sem expiração';
    const date = new Date(dateStr);
    const diffHours = Math.round((date.getTime() - Date.now()) / (1000 * 3600));
    if (diffHours < 0) return 'Expirado';
    if (diffHours === 0) return 'Menos de 1 hora';
    if (diffHours < 24) return `Em ${diffHours} horas`;
    const days = Math.round(diffHours / 24);
    return `Em ${days} dias (${date.toLocaleDateString('pt-BR')})`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border-4 border-amber-400 rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl relative text-slate-800 max-h-[92dvh] flex flex-col my-auto overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-amber-200 pb-3 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-400 to-yellow-300 flex items-center justify-center text-2xl shadow-md border-2 border-white">
              🎟️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">Gerenciador de Convites</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                  Edinho Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 font-bold">
                Crie códigos temporários (@XXXX) para liberar o acesso de amigos e família
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback messages */}
        {errorMsg && (
          <div className="mb-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mb-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 shrink-0">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Action Button: Toggle Create Form */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <span className="text-xs font-black text-slate-700 uppercase tracking-wide">
            Convites Gerados ({invites.length})
          </span>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer border border-amber-600"
          >
            {showCreateForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showCreateForm ? 'Fechar Formulário' : 'Novo Convite (@XXXX)'}</span>
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <form
            onSubmit={handleCreate}
            className="mb-4 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 space-y-3 shrink-0 animate-in slide-in-from-top-2 duration-200 text-xs"
          >
            <div className="font-black text-amber-900 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Configurar Novo Código de Convite</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">⏱️ Tempo de Validade:</label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full p-2 rounded-xl border border-amber-300 bg-white font-bold text-xs focus:outline-none"
                >
                  <option value={1}>1 Hora (Convite Rápido)</option>
                  <option value={12}>12 Horas</option>
                  <option value={24}>24 Horas (1 Dia — Recomendado)</option>
                  <option value={48}>48 Horas (2 Dias)</option>
                  <option value={168}>7 Dias (1 Semana)</option>
                  <option value={0}>Sem Expiração (Permanente)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">👥 Limite de Utilizações:</label>
                <select
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="w-full p-2 rounded-xl border border-amber-300 bg-white font-bold text-xs focus:outline-none"
                >
                  <option value={1}>Uso Único (1 Jogador)</option>
                  <option value={3}>Até 3 Jogadores</option>
                  <option value={5}>Até 5 Jogadores</option>
                  <option value={10}>Até 10 Jogadores (Grupo)</option>
                  <option value={50}>Até 50 Jogadores</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Customizar Código (Opcional - deixe vazio para gerar automático):
              </label>
              <input
                type="text"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase().slice(0, 5))}
                placeholder="@AMOR, @UNO7, @PLAY (ou vazio)"
                className="w-full p-2 rounded-xl border border-amber-300 bg-white font-mono font-bold text-xs focus:outline-none uppercase"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-200 text-slate-700 font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-md cursor-pointer"
              >
                Confirmar e Gerar
              </button>
            </div>
          </form>
        )}

        {/* Invites List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
          {isLoading && invites.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400 font-bold">Carregando convites...</div>
          ) : invites.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500 font-bold">
              Nenhum convite criado ainda. Clique em "Novo Convite" para começar!
            </div>
          ) : (
            invites.map((inv) => {
              const isActive = inv.status === 'active';
              const isUsed = inv.status === 'used';
              const isExpired = inv.status === 'expired';
              const isRevoked = inv.status === 'revoked';

              return (
                <div
                  key={inv.code}
                  className={`p-3 rounded-2xl border transition-all ${
                    isActive
                      ? 'bg-amber-50/60 border-amber-300 shadow-sm'
                      : 'bg-slate-50 border-slate-200 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-black px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 border border-amber-500 shadow-sm">
                        {inv.code}
                      </span>

                      {isActive ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                          Ativo
                        </span>
                      ) : isUsed ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                          Utilizado Totalmente
                        </span>
                      ) : isExpired ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                          Expirado
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          Cancelado
                        </span>
                      )}
                    </div>

                    {/* Quick action buttons */}
                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(inv.code)}
                            className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-amber-100 text-slate-700 text-xs font-bold flex items-center gap-1 transition-all"
                            title="Copiar Código"
                          >
                            {copiedCode === inv.code ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            <span className="text-[10px]">Código</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyLink(inv.code)}
                            className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1 transition-all"
                            title="Copiar Link para WhatsApp"
                          >
                            {copiedCode === `link-${inv.code}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                            <span className="text-[10px]">Link</span>
                          </button>
                        </>
                      )}

                      {isActive && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(inv.code)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Cancelar este convite"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 border-t border-amber-200/60 pt-2">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>Validade: <strong>{formatExpires(inv.expiresAt)}</strong></span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-amber-600" />
                      <span>
                        Uso: <strong>{inv.usedCount}/{inv.maxUses}</strong>
                      </span>
                    </div>
                  </div>

                  {inv.usedBy.length > 0 && (
                    <div className="mt-2 pt-1 border-t border-slate-200 text-[10px] text-slate-500">
                      <span className="font-bold text-amber-900">Utilizado por: </span>
                      {inv.usedBy.map((u) => u.username).join(', ')}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-200 mt-3 flex justify-between items-center shrink-0">
          <p className="text-[10px] text-slate-500 font-bold">
            💡 Os convites impedem que pessoas não autorizadas criem conta no seu jogo.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shadow-md cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
