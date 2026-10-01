import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActiveEmote,
  CardColor,
  ChatMessage,
  ClientMessage,
  GameLog,
  GameState,
  RoomSettings,
  ServerMessage
} from './types/uno.js';
import { Lobby } from './components/Lobby.js';
import { GameBoard } from './components/GameBoard.js';
import { ChatPanel } from './components/ChatPanel.js';
import { GameOverModal } from './components/GameOverModal.js';
import { VmGuideModal } from './components/VmGuideModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { AuthModal } from './components/AuthModal.js';
import { StatsModal } from './components/StatsModal.js';
import { AdminInvitesModal } from './components/AdminInvitesModal.js';
import { LoginScreen } from './components/LoginScreen.js';
import { sound } from './services/sound.js';
import { auth } from './services/auth.js';
import { statsManager } from './services/statsManager.js';
import { UserProfile } from './types/uno.js';

export default function App() {
  const wsRef = useRef<WebSocket | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>(() => sessionStorage.getItem('uno_player_id') || '');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [gameLogs, setGameLogs] = useState<GameLog[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isVmGuideOpen, setIsVmGuideOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isAdminInvitesOpen, setIsAdminInvitesOpen] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const lastProcessedWinnerRef = useRef<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => auth.getCurrentUser());
  const [currentAvatar, setCurrentAvatar] = useState<string>(() => localStorage.getItem('uno_avatar') || '🦸‍♂️');
  const [activeEmotes, setActiveEmotes] = useState<Record<string, ActiveEmote>>({});

  useEffect(() => {
    auth.initSession().finally(() => {
      setIsAuthChecking(false);
    });
    const unsub = auth.subscribe((user) => {
      setCurrentUser(user);
      if (user) {
        setCurrentAvatar(user.avatar);
      }
    });
    return unsub;
  }, []);

  const handleIncomingEmote = (emote: ActiveEmote) => {
    setActiveEmotes((prev) => ({
      ...prev,
      [emote.playerId]: emote,
    }));
    setTimeout(() => {
      setActiveEmotes((prev) => {
        const copy = { ...prev };
        if (copy[emote.playerId]?.id === emote.id) {
          delete copy[emote.playerId];
        }
        return copy;
      });
    }, 3200);
  };

  const prevTurnRef = useRef<string>('');
  const roomIdRef = useRef<string | null>(roomId);
  const myPlayerIdRef = useRef<string>(myPlayerId);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
    if (myPlayerId) {
      sessionStorage.setItem('uno_player_id', myPlayerId);
    }
  }, [myPlayerId]);

  // Setup WebSocket connection
  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}/ws`);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('Connected to UNO Game Server');
      const activeRoom = roomIdRef.current || new URLSearchParams(window.location.search).get('room');
      const activePlayer = myPlayerIdRef.current;

      if (activeRoom && activePlayer) {
        socket.send(
          JSON.stringify({
            type: 'sync_session',
            roomId: activeRoom.toUpperCase(),
            playerId: activePlayer,
          })
        );
      } else if (activeRoom) {
        const storedName = localStorage.getItem('uno_nickname') || 'Jogador 1';
        const storedAvatar = localStorage.getItem('uno_avatar') || '🎮';
        socket.send(
          JSON.stringify({
            type: 'join_room',
            roomId: activeRoom.toUpperCase(),
            playerName: storedName,
            avatar: storedAvatar,
            existingPlayerId: activePlayer || undefined,
          })
        );
      }
    };

    socket.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);

        if (msg.type === 'room_joined') {
          setRoomId(msg.roomId);
          setMyPlayerId(msg.playerId);
          setErrorMessage(null);

          // Update URL without reload
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('room', msg.roomId);
          window.history.replaceState({}, '', newUrl.toString());
        } else if (msg.type === 'game_state') {
          setGameState(msg.state);
          if (msg.state.roomId) {
            setRoomId(msg.state.roomId);
          }

          if (msg.state.status === 'playing') {
            lastProcessedWinnerRef.current = null;
          } else if (
            msg.state.status === 'ended' &&
            msg.state.winnerId &&
            lastProcessedWinnerRef.current !== msg.state.winnerId
          ) {
            lastProcessedWinnerRef.current = msg.state.winnerId;
            const isWinner = msg.state.winnerId === myPlayerIdRef.current;
            statsManager.recordGameFinished({
              won: isWinner,
              durationSeconds: msg.state.roundDurationSeconds,
              turnsCount: msg.state.roundTurnCount,
              pointsWon: isWinner ? (msg.state.roundPointsWon || 0) : 0,
            });
          }

          // If turn changed to me, chime!
          if (
            msg.state.currentTurnPlayerId === myPlayerIdRef.current &&
            prevTurnRef.current !== myPlayerIdRef.current &&
            msg.state.status === 'playing'
          ) {
            sound.yourTurn();
          }
          prevTurnRef.current = msg.state.currentTurnPlayerId;
        } else if (msg.type === 'chat_message') {
          setChatMessages((prev) => [...prev, msg.message]);
        } else if (msg.type === 'game_log') {
          setGameLogs((prev) => [...prev, msg.log]);
        } else if (msg.type === 'sound_event') {
          switch (msg.sound) {
            case 'play':
              sound.playCard();
              break;
            case 'draw':
              sound.drawCard();
              break;
            case 'uno':
              sound.unoCall();
              break;
            case 'penalty':
              sound.penaltyCatch();
              break;
            case 'reverse':
              sound.reverse();
              break;
            case 'skip':
              sound.skip();
              break;
            case 'wild':
              sound.wild();
              break;
            case 'win':
              sound.win();
              break;
          }
        } else if (msg.type === 'player_emote') {
          handleIncomingEmote(msg.emote);
        } else if (msg.type === 'error') {
          setErrorMessage(msg.message);
          if (
            msg.message.includes('Sala não encontrada') ||
            msg.message.includes('não encontrada') ||
            msg.message.includes('em andamento')
          ) {
            setRoomId(null);
            setGameState(null);
            sessionStorage.removeItem('uno_player_id');
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('room');
            window.history.replaceState({}, '', newUrl.toString());
          }
          setTimeout(() => setErrorMessage(null), 4000);
        }
      } catch (e) {
        console.error('Error parsing server message:', e);
      }
    };

    socket.onclose = () => {
      console.log('Socket closed, reconnecting in 2s...');
      setTimeout(connectWebSocket, 2000);
    };

    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [connectWebSocket]);

  const send = (msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('Socket not ready, reconnecting and sending...');
      connectWebSocket();
      setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(msg));
        }
      }, 400);
    }
  };

  const getActiveRoomId = () => roomId || gameState?.roomId || roomIdRef.current;

  // Actions
  const handleCreateRoom = (playerName: string, avatar: string, settings: RoomSettings) => {
    send({ type: 'create_room', playerName, avatar, settings });
  };

  const handleStartSolo = (playerName: string, avatar: string, botCount: number, settings?: Partial<RoomSettings>) => {
    send({ type: 'start_solo', playerName, avatar, botCount, settings });
  };

  const handleUpdateSettings = (settings: Partial<RoomSettings>) => {
    const rid = getActiveRoomId();
    if (rid) {
      send({ type: 'update_settings', roomId: rid, settings, playerId: myPlayerId });
    }
  };

  const handleSelectAvatar = (avatar: string) => {
    setCurrentAvatar(avatar);
    localStorage.setItem('uno_avatar', avatar);
  };

  const handleJoinRoom = (targetRoomId: string, playerName: string, avatar: string) => {
    send({ type: 'join_room', roomId: targetRoomId, playerName, avatar, existingPlayerId: myPlayerId });
  };

  const handleAddBot = () => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'add_bot', roomId: rid, playerId: myPlayerId });
  };

  const handleFillBots = () => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'fill_bots', roomId: rid, playerId: myPlayerId });
  };

  const handleRemoveBot = (botId: string) => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'remove_bot', roomId: rid, botId, playerId: myPlayerId });
  };

  const handleStartGame = () => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'start_game', roomId: rid, playerId: myPlayerId });
  };

  const handlePlayCard = (cardId: string, chosenColor?: CardColor) => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'play_card', roomId: rid, cardId, chosenColor, playerId: myPlayerId });
  };

  const handleDrawCard = () => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'draw_card', roomId: rid, playerId: myPlayerId });
  };

  const handlePassTurn = () => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'pass_turn', roomId: rid, playerId: myPlayerId });
  };

  const handleCallUno = () => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'call_uno', roomId: rid, playerId: myPlayerId });
  };

  const handleCatchUno = (targetPlayerId: string) => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'catch_uno', roomId: rid, targetPlayerId, playerId: myPlayerId });
  };

  const handleRestartGame = () => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'restart_game', roomId: rid, playerId: myPlayerId });
  };

  const handleReturnToLobby = () => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'return_to_lobby', roomId: rid, playerId: myPlayerId });
  };

  const handleResetRoom = () => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'reset_room', roomId: rid, playerId: myPlayerId });
  };

  const handleSendEmote = (emoteId: string) => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'send_emote', roomId: rid, emoteId, playerId: myPlayerId });
  };

  const handleSendMessage = (text: string) => {
    const rid = getActiveRoomId();
    if (!rid) return;
    send({ type: 'send_chat', roomId: rid, text, playerId: myPlayerId });
  };

  const handleLeaveGame = () => {
    const rid = getActiveRoomId();
    if (rid && myPlayerId) {
      send({ type: 'leave_room', roomId: rid, playerId: myPlayerId });
    }
    roomIdRef.current = null;
    myPlayerIdRef.current = '';
    setRoomId(null);
    setGameState(null);
    setChatMessages([]);
    setGameLogs([]);
    sessionStorage.removeItem('uno_player_id');
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('room');
    window.history.replaceState({}, '', newUrl.toString());
  };

  const isHost = gameState?.players.find((p) => p.id === myPlayerId)?.isHost ?? false;

  const currentSettings: RoomSettings = gameState?.settings || {
    maxPlayers: 4,
    turnDuration: Number(localStorage.getItem('uno_turn_duration')) || 25,
    challengeUnoRule: true,
    showBotCards: localStorage.getItem('uno_show_bot_cards') === 'true',
    botSpeedMs: Number(localStorage.getItem('uno_bot_speed_ms')) || 1800,
    autoUnoProtection: localStorage.getItem('uno_auto_uno') === 'true',
    highlightHints: localStorage.getItem('uno_highlight_hints') !== 'false',
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-white select-none">
        <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="font-black text-sm tracking-wider text-amber-400">CARREGANDO UNO KAWIHE...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setCurrentAvatar(user.avatar);
        }}
      />
    );
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-gradient-to-br from-indigo-950 via-purple-950 to-sky-950 font-sans text-slate-100 flex overflow-hidden select-none">
      <div className="flex-1 flex flex-col min-w-0 h-[100dvh] max-h-[100dvh] overflow-hidden">
        {!gameState || gameState.status === 'waiting' ? (
          <Lobby
            onCreateRoom={handleCreateRoom}
            onStartSolo={handleStartSolo}
            onJoinRoom={handleJoinRoom}
            onAddBot={handleAddBot}
            onFillBots={handleFillBots}
            onRemoveBot={handleRemoveBot}
            onStartGame={handleStartGame}
            onResetRoom={handleResetRoom}
            onOpenVmGuide={() => setIsVmGuideOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenStats={() => setIsStatsOpen(true)}
            onOpenInvites={() => setIsAdminInvitesOpen(true)}
            onLeaveRoom={handleLeaveGame}
            onOpenAuth={() => setIsAuthOpen(true)}
            currentUser={currentUser}
            onLogout={() => auth.logout()}
            roomId={roomId}
            players={gameState?.players || []}
            myPlayerId={myPlayerId}
            isHost={isHost}
            errorMessage={errorMessage}
          />
        ) : (
          <GameBoard
            state={gameState}
            myPlayerId={myPlayerId}
            onPlayCard={handlePlayCard}
            onDrawCard={handleDrawCard}
            onPassTurn={handlePassTurn}
            onCallUno={handleCallUno}
            onCatchUno={handleCatchUno}
            onLeave={handleLeaveGame}
            onToggleChat={() => setIsChatOpen(!isChatOpen)}
            unreadChatCount={0}
            activeEmotes={activeEmotes}
            onSendEmote={handleSendEmote}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenStats={() => setIsStatsOpen(true)}
          />
        )}
      </div>

      {/* Real-time Chat & Logs Side Panel */}
      {roomId && (
        <ChatPanel
          messages={chatMessages}
          logs={gameLogs}
          onSendMessage={handleSendMessage}
          isOpen={isChatOpen}
          onToggle={() => setIsChatOpen(!isChatOpen)}
          myPlayerId={myPlayerId}
        />
      )}

      {/* Game Over Victory Modal */}
      {gameState?.status === 'ended' && (
        <GameOverModal
          winnerId={gameState.winnerId}
          players={gameState.players}
          myPlayerId={myPlayerId}
          isHost={isHost}
          onRestart={handleRestartGame}
          onReturnToLobby={handleReturnToLobby}
          onLeave={handleLeaveGame}
          roundDurationSeconds={gameState.roundDurationSeconds}
          roundTurnCount={gameState.roundTurnCount}
          roundPointsWon={gameState.roundPointsWon}
          isFastestWin={gameState.isFastestWin}
          tableScores={gameState.tableScores}
          onOpenStats={() => setIsStatsOpen(true)}
        />
      )}

      {/* Settings & Kids Mode Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentSettings={currentSettings}
        onUpdateSettings={handleUpdateSettings}
        currentAvatar={currentAvatar}
        onSelectAvatar={handleSelectAvatar}
        isHost={isHost}
        isInGame={gameState?.status === 'playing'}
      />

      {/* Oracle VM Deployment Manual */}
      <VmGuideModal
        isOpen={isVmGuideOpen}
        onClose={() => setIsVmGuideOpen(false)}
      />

      {/* KaWiHe Central Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      {/* Player Career Stats & Trophies Modal */}
      <StatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        playerName={currentUser?.displayName || localStorage.getItem('uno_nickname') || 'Jogador'}
        playerAvatar={currentUser?.avatar || currentAvatar}
      />

      {/* Admin Invites Management Modal (Edinho Admin) */}
      <AdminInvitesModal
        isOpen={isAdminInvitesOpen}
        onClose={() => setIsAdminInvitesOpen(false)}
      />
    </div>
  );
}
