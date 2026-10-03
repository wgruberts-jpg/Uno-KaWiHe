import React, { useState } from 'react';
import { X, Copy, Check, MessageSquare, Share2, Sparkles, QrCode } from 'lucide-react';

interface InviteShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  hostName: string;
}

export const InviteShareModal: React.FC<InviteShareModalProps> = ({
  isOpen,
  onClose,
  roomId,
  hostName,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('room', roomId);
  const roomLink = currentUrl.toString();

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(roomLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(
      `🃏🎮 Olá! ${hostName} te convidou para uma partida ao vivo no UNO KaWiHe!\n\n🏷️ Código da Sala: ${roomId}\n🔗 Clique no link direto para entrar agora:\n${roomLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border-4 border-amber-400 shadow-2xl max-w-md w-full overflow-hidden text-slate-800 flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-300 border-b-2 border-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/90 flex items-center justify-center text-lg shadow-sm">
              <span>💌</span>
            </div>
            <div>
              <h2 className="text-base font-black text-slate-950">Convidar Amigos para a Sala</h2>
              <p className="text-[11px] font-bold text-amber-900">Envie o código ou link direto no WhatsApp</p>
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

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Room Code Card */}
          <div className="p-3.5 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border-2 border-amber-300 text-center space-y-2">
            <div className="text-[11px] font-black text-amber-800 uppercase tracking-wider">
              Código da Sala Privada
            </div>
            <div className="text-3xl font-black font-mono tracking-widest text-slate-900">
              {roomId}
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="mx-auto px-4 py-1.5 rounded-xl bg-white border-2 border-amber-400 text-slate-900 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm hover:bg-amber-100 transition-all active:scale-95"
            >
              {copiedCode ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">Código Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-amber-600" />
                  <span>Copiar Código</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Actions */}
          <div className="space-y-2.5">
            {/* WhatsApp Direct Share */}
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98 transition-all border-2 border-emerald-400"
            >
              <MessageSquare className="w-4 h-4 fill-white" />
              <span>Compartilhar Convite no WhatsApp</span>
            </button>

            {/* Copy Link Button */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-2.5 px-4 rounded-2xl bg-sky-50 hover:bg-sky-100 border-2 border-sky-300 text-sky-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">Link Completo Copiado!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-sky-600" />
                  <span>Copiar Link Direto da Partida</span>
                </>
              )}
            </button>
          </div>

          <div className="text-[11px] text-slate-500 text-center font-medium bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            Quem abrir o link entrará automaticamente na sua mesa com um clique!
          </div>
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
