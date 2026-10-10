import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RoomSettings, Player, UserProfile, SpectatorPermission, ClientMessage, OnlinePlayerSummary } from '../types/uno.js';
import { VoiceControls } from './VoiceControls.js';
import { Sidebar } from './Sidebar.js';
import { AvatarSelectModal } from './AvatarSelectModal.js';
import { OpenRoomsModal } from './OpenRoomsModal.js';
import { InviteShareModal } from './InviteShareModal.js';
import { PlayerReportModal } from './PlayerReportModal.js';
import { HowToPlayModal } from './HowToPlayModal.js';
import { auth } from '../services/auth.js';
import {
  Users,
  Play,
  Plus,
  Trash2,
  Copy,
  Check,
  Server,
  HelpCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Settings,
  Shield,
  RotateCcw,
  LogOut,
  User,
  KeyRound,
  Trophy,
  UserX,
  Crown,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Radio,
  Eye,
  EyeOff,
  Layers,
  MessageSquare,
  RefreshCw,
  AlertTriangle,
  Mic
} from 'lucide-react';

interface LobbyProps {
  onCreateRoom: (playerName: string, avatar: string, settings: RoomSettings) => void;
  onStartSolo: (playerName: string, avatar: string, botCount: number, settings?: Partial<RoomSettings>) => void;
  onJoinRoom: (roomId: string, playerName: string, avatar: string, asSpectator?: boolean, spectatorRevealCards?: boolean) => void;
  onAddBot: () => void;
  onFillBots: () => void;
  onRemoveBot: (botId: string) => void;
  onKickPlayer?: (targetPlayerId: string) => void;
  onTransferHost?: (targetPlayerId: string) => void;
  onClaimHost?: () => void;
  onRefreshRoom?: () => void;
  onStartGame: () => void;
  onResetRoom?: () => void;
  onOpenVmGuide: () => void;
  onOpenSettings: () => void;
  onOpenStats?: () => void;
  onOpenInvites?: () => void;
  onOpenAdminRooms?: () => void;
  onOpenAdminUsers?: () => void;
  onLeaveRoom: () => void;
  onOpenAuth: () => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
  roomId: string | null;
  creatorName?: string;
  spectators?: Array<{ id: string; name: string; avatar: string; isConnected: boolean }>;
  players: Player[];
  myPlayerId: string;
  isHost: boolean;
  errorMessage: string | null;
  sendMessage?: (msg: ClientMessage) => void;
  onlinePlayers?: OnlinePlayerSummary[];
  lobbyChat?: Array<{ id: string; name: string; avatar: string; text: string; timestamp: number }>;
}

export const Lobby: React.FC<LobbyProps> = ({
  onCreateRoom,
  onStartSolo,
  onJoinRoom,
  onAddBot,
  onFillBots,
  onRemoveBot,
  onKickPlayer,
  onTransferHost,
  onClaimHost,
  onRefreshRoom,
  onStartGame,
  onResetRoom,
  onOpenVmGuide,
  onOpenSettings,
  onOpenStats,
  onOpenInvites,
  onOpenAdminRooms,
  onOpenAdminUsers,
  onLeaveRoom,
  onOpenAuth,
  currentUser,
  onLogout,
  roomId,
  creatorName,
  spectators = [],
  players,
  myPlayerId,
  isHost,
  errorMessage,
  sendMessage,
  onlinePlayers = [],
  lobbyChat = [],
}) => {
  const [playerName, setPlayerName] = useState(() => currentUser?.displayName || localStorage.getItem('uno_nickname') || 'Jogador 1');
  const [selectedAvatar, setSelectedAvatar] = useState(() => currentUser?.avatar || localStorage.getItem('uno_avatar') || '🦸‍♂️');

  useEffect(() => {
    if (currentUser) {
      setPlayerName(currentUser.displayName);
      setSelectedAvatar(currentUser.avatar);
    }
  }, [currentUser]);

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinMode, setJoinMode] = useState<'play' | 'watch_hidden' | 'watch_open'>('play');
  const [showBroadcastShare, setShowBroadcastShare] = useState(false);
  const [copiedBroadcastType, setCopiedBroadcastType] = useState<string | null>(null);

  // New Collapsible Sidebar state (matching docked icon rail reference)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  // Modal dialog states
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isOpenRoomsModalOpen, setIsOpenRoomsModalOpen] = useState(false);
  const [isInviteShareModalOpen, setIsInviteShareModalOpen] = useState(false);

  // Host Spectator Permission for creating room
  const [creatorSpectatorPermission, setCreatorSpectatorPermission] = useState<SpectatorPermission>('hidden_cards');

  const [turnDuration, setTurnDuration] = useState<number>(() => {
    const saved = localStorage.getItem('uno_turn_duration');
    return saved !== null ? Number(saved) : 90; // Padrão: 1 minuto e meio (90s)
  });
  const [maxPlayers, setMaxPlayers] = useState<number>(4);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rulesTab, setRulesTab] = useState<'rules' | 'mic'>('rules');
  const [isHowToPlayModalOpen, setIsHowToPlayModalOpen] = useState(false);
  const [selectedBotCount, setSelectedBotCount] = useState<number>(1);
  const [trainingShowBotCards, setTrainingShowBotCards] = useState<boolean>(() => localStorage.getItem('uno_show_bot_cards') !== 'false');
  const [chatInputText, setChatInputText] = useState('');
  const [inviteSentFeedback, setInviteSentFeedback] = useState(false);
  const [showLobbyScrollBottomBtn, setShowLobbyScrollBottomBtn] = useState(false);
  const isAdmin = currentUser?.role === 'admin' || currentUser?.username?.toLowerCase() === 'edinho';
  const [inspectedPlayer, setInspectedPlayer] = useState<OnlinePlayerSummary | { id: string; name: string; avatar?: string; username?: string; roomId?: string | null } | null>(null);
  const [isPlayerReportOpen, setIsPlayerReportOpen] = useState(false);
  const [isStartingSolo, setIsStartingSolo] = useState(false);

  const handleOpenPlayerReport = (p: OnlinePlayerSummary | { id: string; name: string; avatar?: string; username?: string; roomId?: string | null }) => {
    if (!isAdmin) return;
    setInspectedPlayer(p as OnlinePlayerSummary);
    setIsPlayerReportOpen(true);
  };

  const lobbyChatContainerRef = useRef<HTMLDivElement>(null);
  const isLobbyNearBottomRef = useRef(true);
  const lastLobbyChatCountRef = useRef(lobbyChat.length);

  const scrollToLobbyBottom = useCallback((smooth = true) => {
    if (!lobbyChatContainerRef.current) return;
    const container = lobbyChatContainerRef.current;
    if (smooth) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  const handleLobbyChatScroll = () => {
    if (!lobbyChatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = lobbyChatContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 70;
    isLobbyNearBottomRef.current = isNearBottom;
    setShowLobbyScrollBottomBtn(!isNearBottom);
  };

  // Auto-scroll lobby chat on new messages
  useEffect(() => {
    const isNewMessage = lobbyChat.length > lastLobbyChatCountRef.current;
    const latestMessage = lobbyChat[lobbyChat.length - 1];
    const isMyMessage = latestMessage?.name === playerName;

    if (isNewMessage) {
      if (isMyMessage || isLobbyNearBottomRef.current) {
        requestAnimationFrame(() => {
          scrollToLobbyBottom(true);
        });
      }
    }
    lastLobbyChatCountRef.current = lobbyChat.length;
  }, [lobbyChat, playerName, scrollToLobbyBottom]);

  // Initial scroll on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToLobbyBottom(false);
      isLobbyNearBottomRef.current = true;
      setShowLobbyScrollBottomBtn(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [scrollToLobbyBottom]);

  const handleSendLobbyChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim()) return;
    sendMessage?.({
      type: 'send_lobby_chat',
      playerId: currentUser?.id || myPlayerId,
      name: playerName,
      avatar: selectedAvatar,
      text: chatInputText.trim(),
    });
    setChatInputText('');
    setTimeout(() => {
      scrollToLobbyBottom(true);
      isLobbyNearBottomRef.current = true;
      setShowLobbyScrollBottomBtn(false);
    }, 30);
  };

  const handleBroadcastLobbyInvite = (targetUserId?: string) => {
    if (!roomId) return;
    if (targetUserId) {
      sendMessage?.({
        type: 'send_room_invite',
        roomId: roomId,
        targetUserId,
      });
    } else {
      onlinePlayers?.forEach((op) => {
        if (op.userId && op.userId !== currentUser?.id) {
          sendMessage?.({
            type: 'send_room_invite',
            roomId: roomId,
            targetUserId: op.userId,
          });
        }
      });
    }
    setInviteSentFeedback(true);
    setTimeout(() => setInviteSentFeedback(false), 4000);
  };

  const handleAvatarSelect = (av: string) => {
    setSelectedAvatar(av);
    localStorage.setItem('uno_avatar', av);
    if (currentUser) {
      auth.updateProfile(playerName, av);
    }
    if (sendMessage && !roomId) {
      sendMessage({
        type: 'register_lobby',
        playerId: currentUser?.id || myPlayerId,
        name: playerName,
        avatar: av,
        token: localStorage.getItem('kawihe_auth_token') || undefined,
      });
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPlayerName(val);
    localStorage.setItem('uno_nickname', val);
  };

  const handleNameBlur = () => {
    if (currentUser && playerName.trim()) {
      auth.updateProfile(playerName.trim(), selectedAvatar);
    }
    if (sendMessage && !roomId && playerName.trim()) {
      sendMessage({
        type: 'register_lobby',
        playerId: currentUser?.id || myPlayerId,
        name: playerName.trim(),
        avatar: selectedAvatar,
        token: localStorage.getItem('kawihe_auth_token') || undefined,
      });
    }
  };

  const getSavedSettings = (): Partial<RoomSettings> => ({
    turnDuration,
    showBotCards: localStorage.getItem('uno_show_bot_cards') === 'true',
    botSpeedMs: Number(localStorage.getItem('uno_bot_speed_ms')) || 1800,
    autoUnoProtection: localStorage.getItem('uno_auto_uno') === 'true',
    highlightHints: localStorage.getItem('uno_highlight_hints') !== 'false',
    spectatorPermission: creatorSpectatorPermission,
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateRoom(playerName, selectedAvatar, {
      maxPlayers,
      turnDuration,
      challengeUnoRule: true,
      ...getSavedSettings(),
    });
  };

  const handleStartSoloClick = () => {
    if (isStartingSolo) return;
    setIsStartingSolo(true);
    onStartSolo(playerName, selectedAvatar, selectedBotCount, {
      ...getSavedSettings(),
      showBotCards: trainingShowBotCards,
    });
    setTimeout(() => setIsStartingSolo(false), 3000);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinCodeInput.trim();
    if (!raw) return;

    const startsWithDollar = raw.startsWith('$');
    const startsWithAtOrStar = raw.startsWith('@') || raw.startsWith('*') || raw.startsWith('#');
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
    if (!clean) return;

    const isSpectator = joinMode !== 'play' || startsWithDollar || startsWithAtOrStar;
    const isReveal = joinMode === 'watch_open' || startsWithDollar;

    onJoinRoom(clean, playerName, selectedAvatar, isSpectator, isReveal);
  };

  const copyRoomCode = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="w-full h-full flex overflow-hidden">
      {/* Permanent Docked Left Sidebar (collapses to narrow icon rail, expands with labels) */}
      <Sidebar
        isExpanded={isSidebarExpanded}
        onToggle={() => setIsSidebarExpanded(!isSidebarExpanded)}
        currentUser={currentUser}
        currentAvatar={selectedAvatar}
        onOpenAuth={onOpenAuth}
        onOpenAvatarSelect={() => setIsAvatarModalOpen(true)}
        onOpenRooms={() => setIsOpenRoomsModalOpen(true)}
        onOpenStats={onOpenStats || (() => {})}
        onOpenSettings={onOpenSettings}
        onOpenRules={() => setShowRules(true)}
        onOpenVmGuide={onOpenVmGuide}
        onOpenInvites={onOpenInvites || (() => {})}
        onOpenAdminRooms={onOpenAdminRooms}
        onOpenUsers={onOpenAdminUsers}
        onLogout={onLogout}
      />

      {/* Main Lobby View Container */}
      <div className="flex-1 h-full bg-gradient-to-b from-sky-400 via-sky-300 to-indigo-300 text-slate-800 flex flex-col items-center justify-start px-3 sm:px-6 py-3 sm:py-5 select-none relative overflow-y-auto overflow-x-hidden">
        {/* Decorative Cartoon Clouds */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
          <div className="absolute top-10 left-10 w-36 h-20 bg-white rounded-full blur-[1px]" />
          <div className="absolute top-6 left-20 w-28 h-28 bg-white rounded-full blur-[1px]" />
          <div className="absolute top-20 right-16 w-48 h-24 bg-white rounded-full blur-[1px]" />
          <div className="absolute top-12 right-28 w-32 h-32 bg-white rounded-full blur-[1px]" />
          <div className="absolute bottom-16 left-24 w-40 h-20 bg-white rounded-full blur-[1px]" />
        </div>

        {/* Main Title Banner in Center */}
        <div className="w-full max-w-4xl flex items-center justify-between py-2 mb-2 z-10 mt-1 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-11 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 via-yellow-400 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-sm shadow-lg border-2 border-white tracking-wider">
              KWH
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-1.5">
              <span className="text-rose-600 drop-shadow-sm">Uno</span>
              <span className="text-amber-500 drop-shadow-sm font-black">KaWiHe</span>
              <span className="ml-1 text-amber-950 font-black text-[10px] sm:text-xs uppercase px-2.5 py-0.5 rounded-full bg-yellow-300 border-2 border-white shadow-sm">
                Kids & Família
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Rooms Explorer button on top */}
            <button
              type="button"
              onClick={() => setIsOpenRoomsModalOpen(true)}
              className="px-3.5 py-2 rounded-2xl bg-white border-2 border-indigo-400 hover:bg-indigo-50 text-indigo-950 font-black text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Salas Abertas</span>
            </button>

            {/* Como Jogar & Ajuda */}
            <button
              type="button"
              onClick={() => {
                setShowRules(true);
                setIsHowToPlayModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-2xl bg-white border-2 border-amber-400 hover:bg-amber-50 text-amber-950 font-black text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              title="Regras do UNO e ajuda sobre microfone no PC (Firefox & Chrome)"
            >
              <HelpCircle className="w-4 h-4 text-amber-600" />
              <span>Como Jogar</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={onOpenAdminUsers}
                className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 border-2 border-white font-black text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                title="Cadastrar usuários, resetar senhas e moderar contas (Admin Edinho)"
              >
                <Users className="w-4 h-4 text-slate-950" />
                <span>Usuários & Senhas</span>
              </button>
            )}
          </div>
        </div>

        {/* Como Jogar & Ajuda Accordion */}
        {showRules && (
          <div className="w-full max-w-4xl mb-4 bg-white/95 border-3 border-amber-400 rounded-3xl p-5 text-xs text-slate-700 space-y-3 shadow-2xl backdrop-blur-md z-10 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="font-black text-amber-900 text-sm uppercase tracking-wide">
                  Como Jogar & Ajuda:
                </h3>
                <div className="flex items-center gap-1.5 ml-1">
                  <button
                    type="button"
                    onClick={() => setRulesTab('rules')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      rulesTab === 'rules'
                        ? 'bg-amber-400 text-slate-950 shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    🃏 Regras do UNO
                  </button>
                  <button
                    type="button"
                    onClick={() => setRulesTab('mic')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                      rulesTab === 'mic'
                        ? 'bg-sky-500 text-white shadow-xs'
                        : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Microfone no PC</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsHowToPlayModalOpen(true)}
                  className="px-2.5 py-1 rounded-xl text-sky-700 bg-sky-50 hover:bg-sky-100 text-[11px] font-bold border border-sky-200 cursor-pointer"
                  title="Abrir em janela completa"
                >
                  Janela Completa ⛶
                </button>
                <button
                  type="button"
                  onClick={() => setShowRules(false)}
                  className="px-2.5 py-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xs font-black cursor-pointer transition-colors"
                >
                  ✕ Fechar
                </button>
              </div>
            </div>

            {rulesTab === 'rules' ? (
              <ul className="list-disc pl-5 space-y-1.5 text-slate-700 font-medium leading-relaxed">
                <li><strong>Correspondência:</strong> Jogue cartas com a mesma cor ou mesmo número/símbolo da carta descartada.</li>
                <li><strong>Coringa / +4:</strong> Podem ser jogados sobre qualquer carta. Ao jogar, você escolhe a nova cor.</li>
                <li><strong>+2 e +4:</strong> Fazem o próximo jogador comprar cartas e perder a vez.</li>
                <li><strong>Reverso:</strong> Inverte o sentido do jogo (com 2 jogadores, age como pular).</li>
                <li><strong>Gritar UNO:</strong> Quando ficar com 1 carta, clique no botão <strong>GRITAR UNO</strong> antes de passar! (Ou ative a Proteção Infantil nas configurações ⚙️).</li>
              </ul>
            ) : (
              <div className="space-y-3 pt-1">
                {/* Firefox Guide */}
                <div className="p-3.5 bg-orange-50/90 rounded-2xl border-2 border-orange-200 space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-orange-200">
                    <span className="font-black text-orange-950 flex items-center gap-1.5 text-xs">
                      🦊 Como liberar no Firefox para PC:
                    </span>
                    <span className="text-[10px] font-bold text-orange-800 bg-orange-200/70 px-2 py-0.5 rounded-full">
                      Passo a Passo
                    </span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-1.5 text-slate-800 leading-relaxed font-medium">
                    <li>Abra o <strong>Firefox</strong> no computador.</li>
                    <li className="flex flex-wrap items-center gap-1.5">
                      <span>Na barra de endereços (onde digita o nome dos sites), digite</span>
                      <code className="px-1.5 py-0.5 bg-white border border-orange-300 rounded font-mono font-bold text-orange-900 select-all">about:config</code>
                      <span>e pressione Enter.</span>
                    </li>
                    <li>O navegador exibirá um aviso de segurança. Clique no botão <strong>"Aceitar o risco e continuar"</strong>.</li>
                    <li className="flex flex-wrap items-center gap-1.5">
                      <span>No campo de busca localizado no topo da página, digite:</span>
                      <code className="px-1.5 py-0.5 bg-white border border-orange-300 rounded font-mono font-bold text-orange-900 select-all">media.devices.insecure.enabled</code>
                    </li>
                    <li>O resultado aparecerá logo abaixo. Clique no <strong>botão de alternar</strong> (duas setas em direções opostas ⇄) no canto direito para mudar o valor de <code>false</code> para <strong><code>true</code></strong>.</li>
                    <li className="flex flex-wrap items-center gap-1.5">
                      <span>Em seguida, limpe a barra de pesquisa interna e busque por:</span>
                      <code className="px-1.5 py-0.5 bg-white border border-orange-300 rounded font-mono font-bold text-orange-900 select-all">media.getusermedia.insecure.enabled</code>
                    </li>
                    <li>Da mesma forma, mude o valor dela de <code>false</code> para <strong><code>true</code></strong>.</li>
                    <li><strong>Reinicie o Firefox</strong> para garantir que as alterações façam efeito.</li>
                  </ol>
                </div>

                {/* Google Chrome Guide */}
                <div className="p-3.5 bg-blue-50/90 rounded-2xl border-2 border-blue-200 space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-blue-200">
                    <span className="font-black text-blue-950 flex items-center gap-1.5 text-xs">
                      🌐 O que fazer no Google Chrome do PC?
                    </span>
                    <span className="text-[10px] font-black text-blue-800 bg-blue-200/70 px-2 py-0.5 rounded-full">
                      Chrome Flags
                    </span>
                  </div>
                  <p className="text-slate-800 leading-relaxed font-medium">
                    Caso mude de ideia e queira aplicar no Chrome do computador, o passo a passo funciona perfeitamente:
                  </p>
                  <div className="p-2.5 bg-white rounded-xl border border-blue-200 space-y-1.5 text-slate-800 font-medium">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span>1. Acesse o endereço no Chrome:</span>
                      <code className="px-1.5 py-0.5 bg-blue-50 border border-blue-300 rounded font-mono font-bold text-blue-950 select-all break-all">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>
                    </p>
                    <p>2. Mude a opção para <strong>Enabled</strong>.</p>
                    <p>3. Digite o <strong>IP ou URL</strong> da sua VM/site no campo de texto exibido.</p>
                    <p>4. Clique no botão <strong>Relaunch</strong> no rodapé para reiniciar o navegador.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error notification */}
        {errorMessage && (
          <div className="w-full max-w-md mb-4 p-3.5 bg-rose-500 border-3 border-white text-white font-black text-xs rounded-2xl text-center shadow-xl animate-in fade-in z-10">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Main Grid Layout for Responsive Dual Columns (Lobby & Social) */}
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-5 z-10 items-start w-full px-1 sm:px-0">
          {/* Left Column: Room Setup Card (occupies 2 cols) */}
          <div className="lg:col-span-2 space-y-4 w-full">
            <div className="w-full bg-white/95 border-4 border-yellow-400 rounded-3xl p-5 sm:p-7 shadow-2xl backdrop-blur-md text-slate-800">
              {!roomId ? (
            /* Profile & Room Creation / Join */
            <div className="space-y-4">
              {/* Compact Player Profile Section (Avatar selector moved to modal!) */}
              <div className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border-2 border-amber-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsAvatarModalOpen(true)}
                    className="w-14 h-14 rounded-2xl bg-white border-3 border-amber-400 shadow-md flex items-center justify-center text-3xl hover:scale-105 active:scale-95 transition-all cursor-pointer relative group shrink-0"
                    title="Clique para trocar de avatar"
                  >
                    <span>{selectedAvatar}</span>
                    <span className="absolute -bottom-1 -right-1 bg-amber-500 text-white rounded-full p-1 shadow-sm border border-white">
                      <Sparkles className="w-3 h-3" />
                    </span>
                  </button>

                  <div className="flex-1 min-w-0">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-amber-900 mb-1">
                      Seu Nome de Jogador
                    </label>
                    <input
                      type="text"
                      value={playerName}
                      onChange={handleNameChange}
                      onBlur={handleNameBlur}
                      maxLength={18}
                      placeholder="Ex: Gabriel"
                      className="w-full bg-white border-2 border-amber-300 rounded-xl px-3 py-1.5 text-sm text-slate-900 font-bold focus:outline-none focus:border-amber-500 shadow-inner"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAvatarModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-100 border-2 border-amber-300 text-amber-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all self-start sm:self-center shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>Trocar Avatar</span>
                </button>
              </div>

              {/* Open Rooms Explorer Banner */}
              <button
                type="button"
                onClick={() => setIsOpenRoomsModalOpen(true)}
                className="w-full p-3.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-500 hover:from-indigo-600 hover:to-sky-600 text-white rounded-2xl border-2 border-white shadow-md flex items-center justify-between cursor-pointer transition-all active:scale-98 group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-lg shadow-sm">
                    <span>🌐</span>
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-black tracking-wide flex items-center gap-1.5">
                      <span>Explorar Salas Abertas (Mesas Disponíveis)</span>
                      <span className="text-[10px] bg-yellow-300 text-slate-950 font-black px-2 py-0.2 rounded-full">
                        Ao Vivo
                      </span>
                    </div>
                    <div className="text-[10px] text-indigo-100 font-medium">
                      Veja mesas de outros jogadores e entre na partida com 1 clique
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-white/80 group-hover:translate-x-1 transition-transform" />
              </button>

            {/* Quick Practice Solo Mode */}
            <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 rounded-3xl border-3 border-emerald-300 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md font-black text-sm">
                    🤖
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-emerald-950">
                      Modo Treino Rápido (Jogar contra Robôs)
                    </h3>
                    <p className="text-[11px] text-emerald-800 font-semibold">
                      Inicie na hora sem precisar criar sala ou esperar amigos
                    </p>
                  </div>
                </div>
              </div>

              {/* Bot Quantity Selector */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { count: 1, label: '1 Robô', desc: '1 contra 1' },
                  { count: 2, label: '2 Robôs', desc: '3 jogadores' },
                  { count: 3, label: '3 Robôs', desc: 'Mesa cheia (4)' },
                ].map((item) => (
                  <button
                    key={item.count}
                    type="button"
                    onClick={() => setSelectedBotCount(item.count)}
                    className={`py-1.5 px-2 rounded-2xl border-2 text-center transition-all cursor-pointer ${
                      selectedBotCount === item.count
                        ? 'bg-gradient-to-r from-yellow-300 to-amber-400 border-white text-slate-950 font-black shadow-md scale-102'
                        : 'bg-white border-emerald-200 text-slate-700 hover:bg-emerald-100 font-bold'
                    }`}
                  >
                    <div className="text-xs">{item.label}</div>
                    <div className="text-[9px] opacity-80">{item.desc}</div>
                  </button>
                ))}
              </div>

              {/* Bot Cards Visibility Toggle for Kids / Practice Mode */}
              <div className="flex items-center justify-between p-2 rounded-2xl bg-white/90 border border-emerald-200 text-xs shadow-2xs">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-800 text-[11px] block">
                      Ver Cartas dos Robôs (Modo Criança / Treino)
                    </span>
                    <span className="text-[9px] text-slate-500">
                      Mostra as cartas dos robôs abertas para aprendizagem
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = !trainingShowBotCards;
                    setTrainingShowBotCards(next);
                    localStorage.setItem('uno_show_bot_cards', String(next));
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer shrink-0 border ${
                    trainingShowBotCards ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-300 border-slate-400'
                  }`}
                  title="Ativar/Desativar visão aberta das cartas dos robôs"
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white shadow-md transition-transform transform ${
                      trainingShowBotCards ? 'translate-x-5' : 'translate-x-0.5'
                    } top-0.5 absolute`}
                  />
                </button>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleStartSoloClick}
                disabled={isStartingSolo}
                className="w-full py-2.5 rounded-2xl bg-gradient-to-b from-emerald-400 to-green-600 hover:from-emerald-300 hover:to-green-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_0_#15803d] active:shadow-[0_1px_0_#15803d] active:translate-y-0.5 border-2 border-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{isStartingSolo ? 'Iniciando Treino...' : `Iniciar Treino com ${selectedBotCount} ${selectedBotCount === 1 ? 'Robô' : 'Robôs'}`}</span>
              </button>
            </div>

            {/* Split options: Create Room or Join Room */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t-2 border-slate-100">
              {/* Option 1: Create Room */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 sm:p-5 rounded-3xl border-3 border-blue-200 flex flex-col justify-between shadow-sm">
                <div>
                  <h3 className="font-black text-sm sm:text-base text-blue-950 mb-1 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-blue-600" /> Criar Sala com Amigos
                  </h3>
                  <p className="text-xs text-slate-600 mb-3 font-semibold">
                    Gere uma sala privada para jogar com amigos ou bots.
                  </p>

                  <div className="space-y-3 mb-3 text-xs">
                    {/* Turn duration */}
                    <div>
                      <span className="text-slate-700 flex items-center gap-1 mb-1 font-black">
                        <Clock className="w-3.5 h-3.5 text-amber-500" /> Tempo de Turno:
                      </span>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          { sec: 30, label: '30s (Rápido)' },
                          { sec: 90, label: '1m30s (Padrão ⭐)' },
                        ].map((item) => (
                          <button
                            key={item.sec}
                            type="button"
                            onClick={() => setTurnDuration(item.sec)}
                            className={`py-1.5 px-1 rounded-xl text-[11px] font-black cursor-pointer transition-all border-2 text-center ${
                              turnDuration === item.sec
                                ? 'bg-gradient-to-r from-yellow-300 to-amber-400 text-amber-950 border-white shadow-sm ring-1 ring-amber-400'
                                : 'bg-white text-slate-700 border-blue-200 hover:bg-blue-100'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Creator Spectator Permission Rule */}
                    <div className="pt-1">
                      <span className="text-slate-700 flex items-center gap-1 mb-1 font-black">
                        <Radio className="w-3.5 h-3.5 text-indigo-600" /> Permitir Espectadores?
                      </span>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { id: 'disabled', label: '🚫 Não', desc: 'Privada' },
                          { id: 'hidden_cards', label: '🔒 Só Mesa', desc: 'Torneio' },
                          { id: 'reveal_cards', label: '👀 Aberto', desc: 'Modo TV' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setCreatorSpectatorPermission(opt.id as SpectatorPermission)}
                            className={`py-1 px-1 rounded-xl text-[10px] font-black cursor-pointer transition-all border-2 text-center ${
                              creatorSpectatorPermission === opt.id
                                ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                                : 'bg-white text-slate-700 border-blue-200 hover:bg-blue-100'
                            }`}
                          >
                            <div>{opt.label}</div>
                            <div className="text-[8px] opacity-80">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreate}
                  className="w-full py-2.5 rounded-2xl bg-gradient-to-b from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_0_#3730a3] active:shadow-[0_1px_0_#3730a3] active:translate-y-0.5 border-2 border-white transition-all"
                >
                  <Plus className="w-4 h-4" /> Criar Sala
                </button>
              </div>

              {/* Option 2: Join Room */}
              <form
                onSubmit={handleJoin}
                className="bg-gradient-to-br from-amber-50 to-yellow-50 p-4 sm:p-5 rounded-3xl border-3 border-amber-200 flex flex-col justify-between shadow-sm"
              >
                <div>
                  <h3 className="font-black text-sm sm:text-base text-amber-950 mb-1 flex items-center gap-1.5">
                    <Play className="w-4 h-4 text-amber-600" /> Entrar em Sala
                  </h3>
                  <p className="text-xs text-slate-600 mb-2.5 font-semibold">
                    Digite o código da sala para jogar ou assistir.
                  </p>

                  {/* Mode Selector: Play vs Watch */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-amber-200/60 rounded-2xl border border-amber-300 mb-2.5">
                    <button
                      type="button"
                      onClick={() => setJoinMode('play')}
                      className={`py-1 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        joinMode === 'play'
                          ? 'bg-amber-400 text-slate-950 shadow-sm border border-white'
                          : 'text-amber-950 hover:bg-white/50'
                      }`}
                    >
                      <span>🎮</span> Jogador
                    </button>
                    <button
                      type="button"
                      onClick={() => setJoinMode('watch_hidden')}
                      className={`py-1 px-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        joinMode !== 'play'
                          ? 'bg-sky-500 text-white shadow-sm border border-white'
                          : 'text-amber-950 hover:bg-white/50'
                      }`}
                    >
                      <span>👁️</span> Assistir (TV)
                    </button>
                  </div>

                  {/* Spectator Sub-options */}
                  {joinMode !== 'play' && (
                    <div className="p-2 bg-sky-50 rounded-2xl border-2 border-sky-200 mb-2 space-y-1 animate-in fade-in">
                      <div className="text-[9px] font-black text-sky-900 uppercase">
                        Transmissão de Espectador:
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => setJoinMode('watch_hidden')}
                          className={`p-1 rounded-xl border text-left text-[10px] font-black cursor-pointer transition-all ${
                            joinMode === 'watch_hidden'
                              ? 'bg-sky-500 text-white border-sky-600 shadow-sm'
                              : 'bg-white text-slate-700 border-sky-200 hover:bg-sky-100'
                          }`}
                        >
                          <div>🔒 Só a Mesa</div>
                          <div className="text-[8px] opacity-80">Mãos ocultas</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setJoinMode('watch_open')}
                          className={`p-1 rounded-xl border text-left text-[10px] font-black cursor-pointer transition-all ${
                            joinMode === 'watch_open'
                              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-black'
                              : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100 font-bold'
                          }`}
                        >
                          <div>👀 Cartas Abertas</div>
                          <div className="text-[8px] opacity-80">Modo Juiz / TV</div>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mb-2">
                    <input
                      type="text"
                      placeholder="Ex: K89X ou @K89X"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      maxLength={6}
                      className="w-full uppercase font-mono tracking-widest text-center text-xl font-black bg-white border-3 border-amber-300 rounded-2xl py-1.5 text-amber-900 focus:outline-none focus:border-amber-500 shadow-inner"
                    />
                  </div>

                  <div className="text-[9px] text-slate-500 font-bold mb-2 bg-amber-100/70 p-1.5 rounded-xl border border-amber-200 leading-tight">
                    💡 <strong>Prefixos:</strong> <code>@CÓDIGO</code> ou <code>*CÓDIGO</code> (Mesa), ou <code>$CÓDIGO</code> (Cartas Abertas).
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!joinCodeInput.trim()}
                  className={`w-full py-2.5 rounded-2xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer border-2 border-white transition-all ${
                    joinMode === 'play'
                      ? 'bg-gradient-to-b from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-[0_4px_0_#c2410c] active:shadow-[0_1px_0_#c2410c]'
                      : 'bg-gradient-to-b from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-[0_4px_0_#1e40af] active:shadow-[0_1px_0_#1e40af]'
                  } disabled:opacity-40 active:translate-y-0.5`}
                >
                  {joinMode === 'play' ? (
                    <>
                      <ArrowRight className="w-4 h-4" /> Entrar para Jogar
                    </>
                  ) : (
                    <>
                      <span>👁️</span> Assistir Transmissão
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Waiting in Room Screen */
          <div className="space-y-5">
            {/* Room Header & Code */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500 rounded-3xl border-4 border-white shadow-xl text-white">
              <div>
                <div className="text-[11px] font-black text-yellow-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Código da Sala</span>
                  {creatorName && (
                    <span className="text-white/80 font-semibold normal-case">
                      · Criada por <strong>{creatorName}</strong>
                    </span>
                  )}
                </div>
                <div className="text-3xl font-black font-mono tracking-widest text-white drop-shadow">
                  {roomId}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Sync / Refresh Room Button */}
                {onRefreshRoom && (
                  <button
                    type="button"
                    onClick={onRefreshRoom}
                    className="px-3 py-2 rounded-2xl bg-white/20 hover:bg-white/30 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all border border-white/40 shadow active:scale-95"
                    title="Atualizar dados da sala e lista de jogadores"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Atualizar</span>
                  </button>
                )}

                {/* Claim Host Button on Header (if not currently host) */}
                {!isHost && onClaimHost && (
                  <button
                    type="button"
                    onClick={onClaimHost}
                    className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all border-2 border-white shadow-md active:scale-95 animate-pulse"
                    title="Reivindicar liderança para gerenciar a mesa e iniciar a partida"
                  >
                    <Crown className="w-3.5 h-3.5 text-slate-950" />
                    <span>Assumir Anfitrião</span>
                  </button>
                )}

                {/* Voice Controls in Lobby */}
                {roomId && sendMessage && (
                  <VoiceControls
                    roomId={roomId}
                    myPlayerId={myPlayerId}
                    players={players}
                    sendMessage={sendMessage}
                  />
                )}

                {/* Invite Friends Modal Trigger */}
                <button
                  type="button"
                  onClick={() => setIsInviteShareModalOpen(true)}
                  className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all border-2 border-white shadow active:scale-95"
                  title="Convidar amigos via WhatsApp ou Link"
                >
                  <span>💌</span>
                  <span>Convidar</span>
                </button>

                <button
                  type="button"
                  onClick={copyRoomCode}
                  className="px-3.5 py-2 rounded-2xl bg-white text-slate-900 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all border-2 border-yellow-300 shadow active:scale-95"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-600">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-amber-500" />
                      <span>Copiar Código</span>
                    </>
                  )}
                </button>

                {/* Tournament / Stream Link Sharing Button */}
                <button
                  type="button"
                  onClick={() => setShowBroadcastShare(!showBroadcastShare)}
                  className="px-3.5 py-2 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all border-2 border-white shadow active:scale-95"
                  title="Compartilhar Link de Transmissão / Espectador"
                >
                  <span>📺</span>
                  <span>Transmissão</span>
                </button>

                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="px-3.5 py-2 rounded-2xl bg-rose-500 hover:bg-rose-600 border-2 border-white text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all shadow active:scale-95"
                  title="Sair desta sala e voltar ao menu principal"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              </div>
            </div>

            {/* Special Notification Banner for Returning Creator */}
            {!isHost && creatorName && (currentUser?.displayName?.toLowerCase() === creatorName.toLowerCase() || playerName.toLowerCase() === creatorName.toLowerCase()) && onClaimHost && (
              <div className="p-3.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-black rounded-3xl border-3 border-white shadow-md flex items-center justify-between gap-3 flex-wrap animate-in fade-in">
                <div className="flex items-center gap-2.5 text-xs">
                  <div className="w-8 h-8 rounded-xl bg-slate-950 text-amber-300 flex items-center justify-center text-base shadow-sm shrink-0">
                    👑
                  </div>
                  <div>
                    <div>Você é o <strong>Criador original</strong> desta sala!</div>
                    <div className="text-[11px] text-amber-950 font-semibold">Reassuma a liderança da mesa para adicionar robôs ou iniciar a partida.</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClaimHost}
                  className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-amber-300 rounded-2xl text-xs font-black cursor-pointer shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>Reassumir Anfitrião</span>
                </button>
              </div>
            )}

            {/* Special Notification Banner when Host is Disconnected */}
            {!isHost && !players.some((p) => p.isHost && p.isConnected && !p.isBot) && onClaimHost && (
              <div className="p-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-3xl border-3 border-white shadow-md flex items-center justify-between gap-3 flex-wrap animate-in fade-in">
                <div className="flex items-center gap-2.5 text-xs">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-base shrink-0">
                    ⚠️
                  </div>
                  <div>
                    <div className="font-black">O Anfitrião anterior saiu ou está desconectado.</div>
                    <div className="text-[11px] text-orange-100 font-medium">Assuma a liderança agora para comandar a sala e começar o jogo!</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClaimHost}
                  className="px-4 py-2 bg-white hover:bg-yellow-100 text-orange-950 rounded-2xl text-xs font-black cursor-pointer shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <Crown className="w-4 h-4 text-orange-600" />
                  <span>Assumir Liderança da Mesa</span>
                </button>
              </div>
            )}

            {/* Broadcast Sharing Card */}
            {showBroadcastShare && (
              <div className="p-4 bg-sky-50 border-3 border-sky-300 rounded-3xl text-slate-800 space-y-3 shadow-md animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="font-black text-xs text-sky-950 flex items-center gap-1.5 uppercase tracking-wide">
                    <span>📡</span> Links de Transmissão & Espectador
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBroadcastShare(false)}
                    className="text-slate-400 hover:text-slate-700 text-xs font-black cursor-pointer"
                  >
                    ✕ Fechar
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Copie o link para comentaristas, telão do torneio ou amigos assistirem sem ocupar vaga de jogador:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Clean Stream (Hidden Hands) */}
                  <div className="p-3 bg-white rounded-2xl border-2 border-sky-200 flex flex-col justify-between gap-2 shadow-xs">
                    <div>
                      <div className="text-xs font-black text-slate-900 flex items-center gap-1">
                        <span>🔒</span> Transmissão de Torneio (Mesa)
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        Mostra apenas a mesa e descarte (sem ver cartas dos jogadores).
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}${window.location.pathname}?room=${roomId}&watch=1`;
                        navigator.clipboard.writeText(url).then(() => {
                          setCopiedBroadcastType('clean');
                          setTimeout(() => setCopiedBroadcastType(null), 2500);
                        });
                      }}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedBroadcastType === 'clean' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedBroadcastType === 'clean' ? 'Link Copiado!' : 'Copiar Link (Mesa)'}</span>
                    </button>
                  </div>

                  {/* Open Hands (TV / Judge Mode) */}
                  <div className="p-3 bg-white rounded-2xl border-2 border-amber-200 flex flex-col justify-between gap-2 shadow-xs">
                    <div>
                      <div className="text-xs font-black text-amber-950 flex items-center gap-1">
                        <span>👀</span> Transmissão Aberta (Modo TV / Juiz)
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        Exibe todas as mãos abertas para narradores e telão.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}${window.location.pathname}?room=${roomId}&watch=open`;
                        navigator.clipboard.writeText(url).then(() => {
                          setCopiedBroadcastType('open');
                          setTimeout(() => setCopiedBroadcastType(null), 2500);
                        });
                      }}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedBroadcastType === 'open' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedBroadcastType === 'open' ? 'Link Copiado!' : 'Copiar Link (TV Aberta)'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Players in Room */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-amber-500" />
                    Jogadores na Mesa ({players.length}/4)
                  </h3>
                  <span className="text-[11px] text-slate-500 font-bold">
                    · {players.filter((p) => !p.isBot).length} humano(s), {players.filter((p) => p.isBot).length} robô(s)
                  </span>
                </div>

                {/* Host Bot Controls */}
                {isHost && players.length < 4 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onAddBot}
                      className="py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs flex items-center gap-1 cursor-pointer transition-all shadow-sm active:scale-95 border border-white"
                      title="Adicionar 1 Robô à mesa"
                    >
                      <span>🤖</span> +1 Robô
                    </button>
                    <button
                      type="button"
                      onClick={onFillBots}
                      className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-black text-xs flex items-center gap-1 cursor-pointer transition-all shadow-sm active:scale-95 border border-white"
                      title="Preencher todas as vagas restantes com Robôs"
                    >
                      <span>👥</span> Completar c/ Robôs
                    </button>
                  </div>
                )}
              </div>

              {/* Player Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {players.map((p) => {
                  const isMe = p.id === myPlayerId;
                  const isRoomCreator = creatorName && p.name.toLowerCase() === creatorName.toLowerCase();

                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all ${
                        isMe
                          ? 'bg-amber-100/90 border-amber-400 shadow-md ring-2 ring-amber-300'
                          : p.isHost
                          ? 'bg-yellow-50 border-amber-300 shadow-xs'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-300 to-orange-400 border-2 border-white flex items-center justify-center text-2xl shadow-sm">
                            {p.avatar}
                          </div>
                          {/* Connection Dot Badge */}
                          <span
                            className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${
                              p.isBot || p.isConnected ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'
                            }`}
                            title={p.isBot ? 'Robô ativo' : p.isConnected ? 'Jogador Online' : 'Jogador Desconectado'}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="font-black text-sm text-slate-900 flex items-center gap-1.5 truncate">
                            <span className="truncate">{p.name}</span>
                            {isMe && (
                              <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-1.5 py-0.2 rounded-md shrink-0">
                                Você
                              </span>
                            )}
                            {p.isHost && (
                              <span className="text-xs bg-amber-400 text-slate-950 font-black px-1.5 py-0.2 rounded-md flex items-center gap-0.5 shrink-0" title="Anfitrião da Sala">
                                <Crown className="w-3 h-3" /> Anfitrião
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
                            {p.isBot ? (
                              <span>🤖 Robô Inteligente</span>
                            ) : !p.isConnected ? (
                              <span className="text-rose-600">🔴 Desconectado</span>
                            ) : p.isHost ? (
                              <span className="text-amber-800">👑 Comanda a mesa</span>
                            ) : isRoomCreator ? (
                              <span className="text-indigo-600">⭐ Criador da Sala</span>
                            ) : (
                              <span className="text-emerald-700">🟢 Conectado e Pronto</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Player Row Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {isHost && !isMe && (
                          <>
                            {p.isBot ? (
                              <button
                                type="button"
                                onClick={() => onRemoveBot(p.id)}
                                className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 cursor-pointer transition-colors"
                                title="Remover Robô"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <>
                                {onTransferHost && p.isConnected && (
                                  <button
                                    type="button"
                                    onClick={() => onTransferHost(p.id)}
                                    className="p-2 rounded-xl text-amber-600 hover:bg-amber-50 cursor-pointer transition-colors"
                                    title="Passar liderança (tornar este jogador o Anfitrião)"
                                  >
                                    <Crown className="w-4 h-4" />
                                  </button>
                                )}
                                {onKickPlayer && (
                                  <button
                                    type="button"
                                    onClick={() => onKickPlayer(p.id)}
                                    className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 cursor-pointer transition-colors"
                                    title="Expulsar Jogador"
                                  >
                                    <UserX className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Empty Slots */}
                {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 flex items-center justify-center gap-2 text-slate-400 font-bold text-xs"
                  >
                    <span>Vaga Disponível</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Spectators List (if any) */}
            {spectators && spectators.length > 0 && (
              <div className="p-3 bg-sky-50 border-2 border-sky-200 rounded-2xl text-xs flex items-center gap-2 flex-wrap text-sky-950">
                <span className="font-black flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-sky-600" />
                  Espectadores ({spectators.length}):
                </span>
                {spectators.map((s) => (
                  <span key={s.id} className="px-2 py-0.5 bg-white border border-sky-300 rounded-lg font-bold text-[11px] flex items-center gap-1">
                    <span>{s.avatar}</span>
                    <span>{s.name}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Start Game Action / Waiting Status */}
            <div className="pt-2">
              {isHost ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (players.length < 2) {
                        onAddBot?.();
                        setTimeout(() => onStartGame?.(), 150);
                      } else {
                        onStartGame?.();
                      }
                    }}
                    className="w-full py-4 rounded-2xl bg-gradient-to-b from-amber-400 via-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_0_#c2410c] active:shadow-[0_1px_0_#c2410c] active:translate-y-1 border-3 border-white transition-all ring-4 ring-amber-300/60"
                  >
                    <Play className="w-5 h-5 fill-slate-950" />
                    <span>{players.length < 2 ? 'Iniciar Partida com Robô' : `Iniciar Partida (${players.length}/4 Jogadores)`}</span>
                  </button>
                  {players.length < 2 && (
                    <div className="text-[11px] text-amber-900 font-bold text-center">
                      💡 Mínimo de 2 jogadores para iniciar. Clique em <strong>+1 Robô</strong> acima se quiser jogar agora!
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border-2 border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
                    <div>
                      <div className="text-xs font-black text-amber-950">
                        Aguardando o Anfitrião ({players.find((p) => p.isHost)?.name || 'da sala'}) iniciar a partida...
                      </div>
                      <div className="text-[10px] text-slate-600 font-medium">
                        Você está conectado na mesa. Assim que o anfitrião clicar em Iniciar, as cartas serão distribuídas.
                      </div>
                    </div>
                  </div>

                  {onClaimHost && (
                    <button
                      type="button"
                      onClick={onClaimHost}
                      className="px-3.5 py-2 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs rounded-xl border border-amber-400 shadow-sm transition-all active:scale-95 cursor-pointer whitespace-nowrap flex items-center gap-1.5 self-start sm:self-center"
                      title="Clique para assumir a liderança e poder iniciar a partida você mesmo"
                    >
                      <Crown className="w-3.5 h-3.5 text-slate-950" />
                      <span>Assumir Anfitrião</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

          {/* Right Column: Lobby Social Dashboard (Online Players & Global Chat) */}
          <div className="w-full flex flex-col gap-4">
            {/* 1. Global Invite Bell on active room waiting area */}
            {roomId && (
              <div className="p-4 bg-gradient-to-br from-indigo-900 to-indigo-950 text-white rounded-3xl border-3 border-amber-400 shadow-lg relative overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-xl shadow-md shrink-0 animate-bounce">
                    🔔
                  </div>
                  <div>
                    <h3 className="font-black text-xs uppercase tracking-wider text-amber-400">
                      Convidar Todo o Lobby!
                    </h3>
                    <p className="text-[10px] text-slate-200 mt-0.5 leading-tight">
                      Clique para chamar todos os jogadores online para sua mesa!
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleBroadcastLobbyInvite()}
                  disabled={inviteSentFeedback}
                  className="w-full mt-3 py-2 rounded-xl bg-gradient-to-b from-amber-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 disabled:opacity-75 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95"
                >
                  <span>{inviteSentFeedback ? '🔔 Convite Enviado!' : 'Enviar Convite Geral (Chime)'}</span>
                </button>
              </div>
            )}

            {/* 2. Online Players Panel */}
            <div className="bg-white/95 border-3 border-sky-400 rounded-3xl p-4 shadow-xl backdrop-blur-md text-slate-800 flex flex-col min-h-[180px] max-h-[300px]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-sky-500" />
                  Jogadores Ativos ({onlinePlayers.length})
                </h3>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              </div>

              <div className="flex-1 overflow-y-auto mt-2.5 space-y-2.5 pr-1 max-h-[220px]">
                {onlinePlayers.length === 0 ? (
                  <div className="text-[11px] text-slate-400 font-bold text-center py-6">
                    Nenhum jogador conectado no momento.
                  </div>
                ) : (
                  onlinePlayers.map((p) => {
                    const isMe = p.id === currentUser?.id || (currentUser?.username && p.userId === currentUser.username);
                    const inRoom = p.roomId !== null;

                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          if (isAdmin) handleOpenPlayerReport(p);
                        }}
                        className={`flex items-center justify-between p-2 rounded-2xl border transition-all ${
                          isMe
                            ? 'border-sky-200 bg-sky-50/70'
                            : 'border-slate-100 bg-slate-50/70 hover:bg-slate-100/60'
                        } ${
                          isAdmin
                            ? 'cursor-pointer hover:border-sky-400 hover:shadow-xs group'
                            : ''
                        }`}
                        title={
                          isAdmin
                            ? `👑 Inspecionar ${p.name} (Relatório de Administrador)`
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-lg shadow-xs shrink-0 relative">
                            {p.avatar}
                            {isAdmin && (
                              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[8px] font-black shadow-xs opacity-80 group-hover:opacity-100">
                                👑
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-slate-900 truncate flex items-center gap-1.5">
                              <span>{p.name}</span>
                              {isMe && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-sky-200 text-sky-800 font-bold">
                                  Você
                                </span>
                              )}
                              {isAdmin && (
                                <span className="text-[9px] font-bold text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                  🔍
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${inRoom ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'}`} />
                              <span className="text-[9px] text-slate-500 font-bold">
                                {inRoom ? (p.roomId ? `Jogando #${p.roomId}` : 'Em partida') : 'No Lobby'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Admin quick inspect action */}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPlayerReport(p);
                              }}
                              className="p-1.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-800 transition-colors cursor-pointer"
                              title={`Abrir Relatório do Administrador para ${p.name}`}
                            >
                              <Shield className="w-3.5 h-3.5 text-sky-700" />
                            </button>
                          )}

                          {/* Invite Button for active host waiting inside a room */}
                          {roomId && !inRoom && !isMe && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBroadcastLobbyInvite(p.userId || p.id);
                              }}
                              className="p-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors cursor-pointer"
                              title={`Convidar ${p.name} para a partida`}
                            >
                              <span className="text-sm">🔔</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. Lobby Chat Panel */}
            <div className="bg-white/95 border-3 border-indigo-400 rounded-3xl p-4 shadow-xl backdrop-blur-md text-slate-800 flex flex-col h-[320px] relative">
              <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100 shrink-0">
                <MessageSquare className="w-4 h-4 text-indigo-500" />
                <h3 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                  Papo do Lobby (Global)
                </h3>
              </div>

              {/* Chat messages stream */}
              <div
                ref={lobbyChatContainerRef}
                onScroll={handleLobbyChatScroll}
                className="flex-1 overflow-y-auto my-2.5 space-y-2 pr-1 text-left scroll-smooth"
              >
                {lobbyChat.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 font-bold text-center py-8">
                    <p className="text-xs">Nenhuma mensagem enviada ainda.</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-normal">Seja o primeiro a dar um "Oi"! 👋</p>
                  </div>
                ) : (
                  lobbyChat.map((msg) => {
                    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return (
                      <div key={msg.id} className="flex gap-2">
                        <div
                          onClick={() => {
                            if (isAdmin) handleOpenPlayerReport({ id: msg.name, name: msg.name, avatar: msg.avatar, roomId: null });
                          }}
                          className={`w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs shadow-xs shrink-0 self-start ${
                            isAdmin ? 'cursor-pointer hover:border-indigo-400 hover:scale-105 transition-all' : ''
                          }`}
                          title={isAdmin ? `👑 Inspecionar ${msg.name} (Admin)` : undefined}
                        >
                          {msg.avatar}
                        </div>
                        <div className="flex-1 bg-slate-100/80 rounded-2xl px-2.5 py-1.5 border border-slate-100 leading-tight">
                          <div className="flex justify-between items-baseline gap-1.5">
                            <span
                              onClick={() => {
                                if (isAdmin) handleOpenPlayerReport({ id: msg.name, name: msg.name, avatar: msg.avatar, roomId: null });
                              }}
                              className={`text-[10px] font-black text-indigo-900 ${
                                isAdmin ? 'cursor-pointer hover:underline' : ''
                              }`}
                              title={isAdmin ? `👑 Inspecionar ${msg.name} (Admin)` : undefined}
                            >
                              {msg.name}
                            </span>
                            <span className="text-[8px] text-slate-400 font-bold">{timeStr}</span>
                          </div>
                          <p className="text-xs font-medium text-slate-700 mt-0.5 break-words">
                            {msg.text}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Floating "Scroll to Bottom" button when user scrolled up */}
              {showLobbyScrollBottomBtn && (
                <button
                  type="button"
                  onClick={() => {
                    scrollToLobbyBottom(true);
                    isLobbyNearBottomRef.current = true;
                    setShowLobbyScrollBottomBtn(false);
                  }}
                  className="absolute bottom-16 right-6 z-10 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg border border-white flex items-center gap-1 animate-bounce cursor-pointer transition-all"
                >
                  <span>Recentes</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              )}

              {/* Chat Input form */}
              <form onSubmit={handleSendLobbyChat} className="flex gap-1.5 pt-2 border-t border-slate-100 shrink-0">
                <input
                  type="text"
                  placeholder="Digite uma mensagem..."
                  value={chatInputText}
                  onChange={(e) => setChatInputText(e.target.value)}
                  maxLength={100}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-500 shadow-inner"
                />
                <button
                  type="submit"
                  disabled={!chatInputText.trim()}
                  className="py-1.5 px-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white font-black text-xs cursor-pointer shadow-sm active:scale-95 transition-all text-center"
                >
                  Enviar
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

    {/* Avatar Selection Modal */}
    <AvatarSelectModal
      isOpen={isAvatarModalOpen}
      onClose={() => setIsAvatarModalOpen(false)}
      currentAvatar={selectedAvatar}
      onSelectAvatar={handleAvatarSelect}
    />

    {/* Public Open Rooms Explorer Modal */}
    <OpenRoomsModal
      isOpen={isOpenRoomsModalOpen}
      onClose={() => setIsOpenRoomsModalOpen(false)}
      onJoinRoom={(targetRoomId, asSpectator) => {
        onJoinRoom(targetRoomId, playerName, selectedAvatar, asSpectator);
      }}
      currentRoomId={roomId}
    />

    {/* Share / Invite Modal */}
    {roomId && (
      <InviteShareModal
        isOpen={isInviteShareModalOpen}
        onClose={() => setIsInviteShareModalOpen(false)}
        roomId={roomId}
        hostName={playerName}
      />
    )}

    {/* How To Play & PC Mic Guide Modal */}
    <HowToPlayModal
      isOpen={isHowToPlayModalOpen}
      onClose={() => setIsHowToPlayModalOpen(false)}
      initialTab={rulesTab}
    />

    {/* Admin Player Diagnostic Report Modal */}
    {isAdmin && (
      <PlayerReportModal
        isOpen={isPlayerReportOpen}
        onClose={() => {
          setIsPlayerReportOpen(false);
          setInspectedPlayer(null);
        }}
        targetPlayer={inspectedPlayer}
        currentUser={currentUser}
        onJoinRoomAsAdmin={(targetRoomId) => {
          setIsPlayerReportOpen(false);
          onJoinRoom(targetRoomId, playerName, selectedAvatar, false);
        }}
        onWatchRoom={(targetRoomId, revealCards) => {
          setIsPlayerReportOpen(false);
          onJoinRoom(targetRoomId, playerName, selectedAvatar, true, revealCards);
        }}
      />
    )}
  </div>
  );
};
