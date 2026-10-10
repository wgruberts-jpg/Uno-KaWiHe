import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, GameLog } from '../types/uno.js';
import { Send, MessageSquare, History, X, ChevronDown } from 'lucide-react';

interface ChatPanelProps {
  messages: ChatMessage[];
  logs: GameLog[];
  onSendMessage: (text: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  myPlayerId: string;
}

const QUICK_EMOJIS = ['🃏', '🔥', '😱', '😂', '🎉', '👏', '🤫', '👀'];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  logs,
  onSendMessage,
  isOpen,
  onToggle,
  myPlayerId,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'logs'>('chat');
  const [inputVal, setInputVal] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const lastSeenCountRef = useRef(messages.length);
  const isUserNearBottomRef = useRef(true);

  // Scroll chat to bottom helper
  const scrollToChatBottom = useCallback((smooth = true) => {
    if (!chatContainerRef.current) return;
    const container = chatContainerRef.current;
    if (smooth) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Scroll logs to bottom helper
  const scrollToLogsBottom = useCallback((smooth = true) => {
    if (!logsContainerRef.current) return;
    const container = logsContainerRef.current;
    if (smooth) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Track scroll position to know if user is reading older messages
  const handleChatScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 80;
    isUserNearBottomRef.current = isNearBottom;
    setShowScrollBottomBtn(!isNearBottom);
  };

  // When messages update
  useEffect(() => {
    const isNewMessage = messages.length > lastSeenCountRef.current;
    const latestMessage = messages[messages.length - 1];
    const isMyMessage = latestMessage?.playerId === myPlayerId;

    if (!isOpen || activeTab !== 'chat') {
      if (isNewMessage) {
        setUnreadCount((prev) => prev + (messages.length - lastSeenCountRef.current));
      }
    } else {
      setUnreadCount(0);
      // Auto-scroll if user is near bottom or user just sent the message
      if (isMyMessage || isUserNearBottomRef.current) {
        requestAnimationFrame(() => {
          scrollToChatBottom(true);
        });
      }
    }
    lastSeenCountRef.current = messages.length;
  }, [messages, isOpen, activeTab, myPlayerId, scrollToChatBottom]);

  // When opening panel or switching tabs, instant snap to bottom
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (activeTab === 'chat') {
          scrollToChatBottom(false);
          isUserNearBottomRef.current = true;
          setShowScrollBottomBtn(false);
        } else {
          scrollToLogsBottom(false);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeTab, scrollToChatBottom, scrollToLogsBottom]);

  // Auto-scroll logs
  useEffect(() => {
    if (activeTab === 'logs' && isOpen) {
      requestAnimationFrame(() => {
        scrollToLogsBottom(true);
      });
    }
  }, [logs, activeTab, isOpen, scrollToLogsBottom]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    onSendMessage(inputVal);
    setInputVal('');
    // Snap to bottom immediately after user sends message
    setTimeout(() => {
      scrollToChatBottom(true);
      isUserNearBottomRef.current = true;
      setShowScrollBottomBtn(false);
    }, 30);
  };

  const handleEmojiClick = (emoji: string) => {
    onSendMessage(emoji);
    setTimeout(() => {
      scrollToChatBottom(true);
      isUserNearBottomRef.current = true;
      setShowScrollBottomBtn(false);
    }, 30);
  };

  return (
    <>
      {/* Slide-in or Docked Panel */}
      <div
        className={`fixed sm:static bottom-0 right-0 z-40 w-full sm:w-80 h-[70dvh] sm:h-full bg-white/95 sm:bg-white border-t-4 sm:border-t-0 sm:border-l-4 border-sky-200 flex flex-col shadow-2xl backdrop-blur-md rounded-t-3xl sm:rounded-none transition-all duration-300 pb-[env(safe-area-inset-bottom)] ${
          isOpen ? 'translate-y-0 opacity-100' : 'translate-y-full sm:translate-y-0 sm:hidden pointer-events-none'
        }`}
      >
        {/* Header with Tabs */}
        <div className="flex items-center justify-between px-3 py-2 border-b-2 border-sky-100 bg-sky-50 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('chat');
                setUnreadCount(0);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-amber-300 text-slate-950 border-2 border-amber-400 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Bate-Papo</span>
              {unreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-sky-200 text-sky-950 border-2 border-sky-300 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Jogadas</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onToggle}
            className="p-1 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-sky-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 1: Chat Content */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0 relative">
            <div
              ref={chatContainerRef}
              onScroll={handleChatScroll}
              className="flex-1 p-3 overflow-y-auto space-y-2.5 text-xs scroll-smooth"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center px-4">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-amber-500" />
                  <p className="font-bold text-slate-600">Nenhuma mensagem ainda.</p>
                  <p className="text-[11px] text-slate-400">Envie mensagens ou emojis para os outros jogadores!</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.playerId === myPlayerId;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5 px-1 font-semibold">
                        <span>{m.avatar}</span>
                        <span className="font-bold text-slate-700">{isMe ? 'Você' : m.playerName}</span>
                        <span>·</span>
                        <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div
                        className={`px-3 py-1.5 rounded-2xl max-w-[85%] break-words text-xs shadow-sm ${
                          isMe
                            ? 'bg-amber-300 text-slate-950 font-bold rounded-tr-none border border-amber-400'
                            : 'bg-sky-100 text-slate-800 font-semibold rounded-tl-none border border-sky-200'
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Floating "Scroll to Bottom" button when user scrolled up */}
            {showScrollBottomBtn && (
              <button
                type="button"
                onClick={() => {
                  scrollToChatBottom(true);
                  isUserNearBottomRef.current = true;
                  setShowScrollBottomBtn(false);
                }}
                className="absolute bottom-16 right-4 z-10 bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-black px-3 py-1.5 rounded-full shadow-lg border border-white flex items-center gap-1 animate-bounce cursor-pointer transition-all"
              >
                <span>Recentes</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Quick Emoji Bar */}
            <div className="px-2 py-1.5 bg-sky-50 border-t border-sky-100 flex items-center justify-between gap-1 overflow-x-auto shrink-0">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  className="p-1 hover:bg-white rounded-xl text-base transition-transform active:scale-125 cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSend} className="p-2 border-t-2 border-sky-100 bg-white flex items-center gap-2 shrink-0">
              <input
                type="text"
                placeholder="Enviar mensagem..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                maxLength={140}
                className="flex-1 bg-amber-50 text-slate-900 font-semibold text-xs rounded-xl px-3 py-2 border-2 border-amber-200 focus:outline-none focus:border-amber-400 placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!inputVal.trim()}
                className="bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 p-2 rounded-xl cursor-pointer transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Logs Content */}
        {activeTab === 'logs' && (
          <div
            ref={logsContainerRef}
            className="flex-1 p-3 overflow-y-auto space-y-2 text-xs scroll-smooth"
          >
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 font-bold">
                Aguardando início da partida...
              </div>
            ) : (
              logs.map((log) => {
                let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
                if (log.type === 'uno') badgeColor = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
                if (log.type === 'penalty') badgeColor = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
                if (log.type === 'system') badgeColor = 'bg-sky-100 text-sky-800 border-sky-300';

                return (
                  <div
                    key={log.id}
                    className={`p-2 rounded-xl border ${badgeColor} text-[11px] leading-relaxed flex items-start gap-1.5 shadow-sm`}
                  >
                    <span className="text-[10px] text-slate-400 shrink-0 font-mono font-bold">
                      {new Date(log.timestamp).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="flex-1">{log.text}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  );
};
