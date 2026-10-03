import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Radio, Users, PhoneOff, PhoneCall, Sparkles } from 'lucide-react';
import { voiceChat } from '../services/voiceChat.js';
import { ClientMessage, VoicePeerState, Player } from '../types/uno.js';

interface VoiceControlsProps {
  roomId: string;
  myPlayerId: string;
  players: Player[];
  sendMessage: (msg: ClientMessage) => void;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  roomId,
  myPlayerId,
  players,
  sendMessage,
}) => {
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [peerStates, setPeerStates] = useState<Record<string, VoicePeerState>>({});
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pushToTalkMode, setPushToTalkMode] = useState(false);

  useEffect(() => {
    const unsubscribe = voiceChat.subscribe({
      onPeersChange: (peers) => setPeerStates(peers),
      onLocalStateChange: (state) => {
        setIsJoined(state.isJoined);
        setIsMuted(state.isMuted);
        setIsDeafened(state.isDeafened);
        setIsSpeaking(state.isSpeaking);
      },
      onError: (msg) => {
        setErrorToast(msg);
        setTimeout(() => setErrorToast(null), 5000);
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Keyboard shortcut for Push to Talk (Spacebar when enabled and not typing in chat)
  useEffect(() => {
    if (!isJoined || !pushToTalkMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        voiceChat.setMuted(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        voiceChat.setMuted(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isJoined, pushToTalkMode]);

  const handleJoinVoice = async () => {
    const success = await voiceChat.joinVoice(
      roomId,
      myPlayerId,
      players.map((p) => ({ id: p.id, isBot: p.isBot })),
      sendMessage
    );
    if (success) {
      setIsExpanded(true);
    }
  };

  const handleLeaveVoice = () => {
    voiceChat.leaveVoice();
    setIsExpanded(false);
  };

  const handleToggleMute = () => {
    voiceChat.toggleMute();
  };

  const handleToggleDeafen = () => {
    voiceChat.toggleDeafen();
  };

  const activeInVoiceCount = Object.keys(peerStates).length + (isJoined ? 1 : 0);

  return (
    <div className="relative">
      {/* Error notification */}
      {errorToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white text-xs font-black px-4 py-2 rounded-2xl shadow-2xl border-2 border-white animate-bounce flex items-center gap-2">
          <span>⚠️</span>
          <span>{errorToast}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* 1. Main Voice Status Button */}
        {!isJoined ? (
          <button
            type="button"
            onClick={handleJoinVoice}
            className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs shadow-sm hover:scale-102 active:scale-95 transition-all cursor-pointer border-2 border-emerald-300"
            title="Entrar no Chat de Voz P2P (Sem servidor, direto entre navegadores)"
          >
            <Radio className="w-4 h-4 animate-pulse text-emerald-100" />
            <span className="hidden xs:inline">Voz P2P</span>
            <span className="xs:hidden">Voz</span>
            {activeInVoiceCount > 0 && (
              <span className="bg-emerald-800 text-emerald-100 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                {activeInVoiceCount}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-sm active:scale-95 transition-all cursor-pointer border-2 border-emerald-300"
            title="Clique para ver participantes e configurações de áudio"
          >
            <Radio className="w-4 h-4 text-emerald-200 animate-pulse" />
            <span className="hidden sm:inline">Voz Conectada</span>
            <span className="sm:hidden">Voz</span>
            <span className="bg-emerald-900 text-emerald-100 px-1.5 py-0.2 rounded-full text-[10px] font-black">
              {activeInVoiceCount}
            </span>
          </button>
        )}

        {/* 2. Direct Mute/Unmute Microphone Button - Always beside it! */}
        {!isJoined ? (
          <button
            type="button"
            onClick={handleJoinVoice}
            className="p-1.5 sm:p-2 px-2 sm:px-3 rounded-xl sm:rounded-2xl bg-white border-2 border-emerald-400 text-emerald-800 hover:bg-emerald-50 cursor-pointer transition-all shadow-sm active:scale-95 flex items-center gap-1 font-black text-xs"
            title="Ligar microfone e entrar na chamada de voz"
          >
            <Mic className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Microfone</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleToggleMute}
            className={`p-1.5 sm:p-2 px-2.5 sm:px-3 rounded-xl sm:rounded-2xl border-2 transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5 font-black text-xs ${
              isMuted
                ? 'bg-rose-50 border-rose-400 text-rose-700 hover:bg-rose-100 ring-2 ring-rose-400/40'
                : 'bg-white border-emerald-400 text-emerald-800 hover:bg-emerald-50'
            }`}
            title={isMuted ? 'Microfone Mutado (Clique para Falar)' : 'Microfone Aberto (Clique para Mutar)'}
          >
            {/* Speaking Pulse Dot */}
            <span
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                isMuted
                  ? 'bg-rose-500'
                  : isSpeaking
                  ? 'bg-emerald-500 ring-4 ring-emerald-400/40 animate-pulse scale-110'
                  : 'bg-emerald-500'
              }`}
            />
            {isMuted ? (
              <>
                <MicOff className="w-4 h-4 text-rose-600" />
                <span>Mutado</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-emerald-600" />
                <span>Mutar</span>
              </>
            )}
          </button>
        )}

        {/* 3. Disconnect button when joined */}
        {isJoined && (
          <button
            type="button"
            onClick={handleLeaveVoice}
            className="p-1.5 sm:p-2 rounded-xl sm:rounded-2xl bg-rose-50 hover:bg-rose-100 border-2 border-rose-300 text-rose-700 text-xs font-bold cursor-pointer transition-all shadow-sm active:scale-95 flex items-center"
            title="Desconectar do chat de voz"
          >
            <PhoneOff className="w-4 h-4 text-rose-600" />
          </button>
        )}
      </div>

      {/* Expanded Voice Menu Overlay / Dropdown */}
      {isJoined && isExpanded && (
        <div className="absolute right-0 top-12 z-50 w-64 bg-slate-900/95 border-2 border-emerald-400 rounded-3xl p-3 shadow-2xl backdrop-blur-md text-white space-y-3 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="font-black text-xs text-emerald-300">Voz P2P Direta (WebRTC)</span>
            </div>
            <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-black">
              0% Servidor
            </span>
          </div>

          {/* Mode Switch (Open Mic vs Push to Talk) */}
          <div className="bg-slate-800/80 p-2 rounded-2xl border border-slate-700 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Push-to-Talk (Espaço)</span>
            <button
              type="button"
              onClick={() => {
                const next = !pushToTalkMode;
                setPushToTalkMode(next);
                if (next) voiceChat.setMuted(true);
              }}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                pushToTalkMode ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 ${
                  pushToTalkMode ? 'right-0.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Connected Participants List */}
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            <div className="text-[10px] font-black uppercase text-slate-400">Na Chamada de Voz:</div>

            {/* Local Player */}
            <div className="flex items-center justify-between bg-slate-800/60 px-2.5 py-1.5 rounded-xl text-xs">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isSpeaking ? 'bg-emerald-400 animate-ping' : isMuted ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                />
                <span className="font-black">Você</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                {isMuted ? '🔇 Mutado' : isSpeaking ? '🗣️ Falando' : '🎙️ Aberto'}
              </div>
            </div>

            {/* Peers */}
            {players
              .filter((p) => p.id !== myPlayerId && !p.isBot)
              .map((p) => {
                const peerState = peerStates[p.id];
                const inCall = !!peerState;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-slate-800/60 px-2.5 py-1.5 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{p.avatar}</span>
                      <span className="font-bold truncate max-w-[90px]">{p.name}</span>
                    </div>
                    <div>
                      {inCall ? (
                        <span
                          className={`text-[10px] font-bold ${
                            peerState.isSpeaking
                              ? 'text-emerald-400 font-black'
                              : peerState.isMuted
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {peerState.isSpeaking ? '🗣️ Falando' : peerState.isMuted ? '🔇 Mutado' : '🎙️ Conectado'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">Fora da chamada</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          <button
            type="button"
            onClick={handleLeaveVoice}
            className="w-full py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Sair da Chamada</span>
          </button>
        </div>
      )}
    </div>
  );
};
