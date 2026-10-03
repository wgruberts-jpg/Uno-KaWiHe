import React from 'react';
import { UserProfile } from '../types/uno.js';
import {
  ChevronRight,
  ChevronLeft,
  User,
  Sparkles,
  Radio,
  Trophy,
  Settings,
  HelpCircle,
  Server,
  KeyRound,
  LogOut,
  Layers,
  Crown
} from 'lucide-react';

interface SidebarProps {
  isExpanded: boolean;
  onToggle: () => void;
  currentUser: UserProfile | null;
  currentAvatar: string;
  onOpenAuth: () => void;
  onOpenAvatarSelect: () => void;
  onOpenRooms: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  onOpenRules: () => void;
  onOpenVmGuide: () => void;
  onOpenInvites: () => void;
  onLogout: () => void;
  activeTab?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isExpanded,
  onToggle,
  currentUser,
  currentAvatar,
  onOpenAuth,
  onOpenAvatarSelect,
  onOpenRooms,
  onOpenStats,
  onOpenSettings,
  onOpenRules,
  onOpenVmGuide,
  onOpenInvites,
  onLogout,
  activeTab,
}) => {
  const isAdmin = currentUser?.role === 'admin';

  return (
    <aside
      className={`h-full bg-white/95 backdrop-blur-md border-r-2 border-slate-200 shadow-xl flex flex-col justify-between select-none transition-all duration-300 ease-in-out z-30 shrink-0 ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
    >
      {/* Top Header with Logo and Expand/Collapse Button */}
      <div>
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            {/* Logo Icon */}
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 via-yellow-400 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-xs shadow-md border-2 border-white shrink-0">
              KWH
            </div>
            {isExpanded && (
              <div className="animate-in fade-in duration-200 overflow-hidden whitespace-nowrap">
                <div className="font-black text-sm tracking-tight flex items-center gap-1">
                  <span className="text-rose-600">Uno</span>
                  <span className="text-slate-950">KaWiHe</span>
                </div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Menu Principal
                </div>
              </div>
            )}
          </div>

          {/* Toggle Button (matching the pink-orange gradient in user's image) */}
          <button
            type="button"
            onClick={onToggle}
            className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white flex items-center justify-center shadow-md active:scale-90 transition-all cursor-pointer border border-white/60 shrink-0"
            title={isExpanded ? 'Recolher Menu Lateral' : 'Expandir Menu Lateral'}
          >
            {isExpanded ? (
              <ChevronLeft className="w-4 h-4 stroke-[3]" />
            ) : (
              <ChevronRight className="w-4 h-4 stroke-[3]" />
            )}
          </button>
        </div>

        {/* User Card when expanded */}
        {isExpanded && (
          <div className="p-3 border-b border-slate-100 bg-slate-50/70">
            {currentUser ? (
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-2xl shadow-inner shrink-0">
                  {currentUser.avatar}
                </div>
                <div className="overflow-hidden flex-1">
                  <div className="font-black text-xs text-slate-900 truncate flex items-center gap-1">
                    <span>{currentUser.displayName}</span>
                    {isAdmin && <Crown className="w-3 h-3 text-amber-500 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    {isAdmin ? 'Administrador' : 'Jogador'}
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
              >
                <KeyRound className="w-4 h-4" />
                <span>Entrar / Criar Conta</span>
              </button>
            )}
          </div>
        )}

        {/* Navigation Items List */}
        <div className="p-2 space-y-1 overflow-y-auto">
          {/* 1. Account / Auth */}
          {!currentUser && (
            <button
              type="button"
              onClick={onOpenAuth}
              className={`w-full flex items-center rounded-2xl transition-all cursor-pointer ${
                isExpanded ? 'p-2.5 gap-3' : 'p-2.5 justify-center'
              } text-amber-700 hover:bg-amber-50 hover:text-amber-900`}
              title="Entrar ou Criar Conta"
            >
              <KeyRound className="w-5 h-5 shrink-0 text-amber-500" />
              {isExpanded && (
                <div className="text-left font-black text-xs">
                  <div>Entrar / Cadastro</div>
                  <div className="text-[10px] text-slate-400 font-medium">Acessar com convite</div>
                </div>
              )}
            </button>
          )}

          {/* 2. Avatar Selection */}
          <button
            type="button"
            onClick={onOpenAvatarSelect}
            className={`w-full flex items-center rounded-2xl transition-all cursor-pointer ${
              isExpanded ? 'p-2.5 gap-3' : 'p-2.5 justify-center'
            } text-slate-700 hover:bg-amber-50 hover:text-amber-900`}
            title={`Alterar Avatar (Atual: ${currentAvatar})`}
          >
            <div className="w-6 h-6 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-sm shadow-xs shrink-0">
              {currentAvatar}
            </div>
            {isExpanded && (
              <div className="text-left font-black text-xs">
                <div>Meu Avatar</div>
                <div className="text-[10px] text-slate-400 font-medium">Trocar visual do personagem</div>
              </div>
            )}
          </button>

          {/* 3. Open Rooms Explorer */}
          <button
            type="button"
            onClick={onOpenRooms}
            className={`w-full flex items-center rounded-2xl transition-all cursor-pointer ${
              isExpanded ? 'p-2.5 gap-3' : 'p-2.5 justify-center'
            } ${
              activeTab === 'rooms'
                ? 'bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 text-white shadow-md'
                : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-900'
            }`}
            title="Explorar Salas Abertas"
          >
            <Layers className={`w-5 h-5 shrink-0 ${activeTab === 'rooms' ? 'text-white' : 'text-indigo-600'}`} />
            {isExpanded && (
              <div className="text-left font-black text-xs">
                <div>Salas Abertas</div>
                <div className={`text-[10px] font-medium ${activeTab === 'rooms' ? 'text-pink-100' : 'text-slate-400'}`}>
                  Ver mesas e solicitar entrada
                </div>
              </div>
            )}
          </button>

          {/* 4. Trophies & Career Stats */}
          <button
            type="button"
            onClick={onOpenStats}
            className={`w-full flex items-center rounded-2xl transition-all cursor-pointer ${
              isExpanded ? 'p-2.5 gap-3' : 'p-2.5 justify-center'
            } text-slate-700 hover:bg-amber-50 hover:text-amber-900`}
            title="Troféus & Estatísticas"
          >
            <Trophy className="w-5 h-5 shrink-0 text-amber-500" />
            {isExpanded && (
              <div className="text-left font-black text-xs">
                <div>Troféus & Recordes</div>
                <div className="text-[10px] text-slate-400 font-medium">Vitórias e partidas</div>
              </div>
            )}
          </button>

          {/* 5. Settings Gear */}
          <button
            type="button"
            onClick={onOpenSettings}
            className={`w-full flex items-center rounded-2xl transition-all cursor-pointer ${
              isExpanded ? 'p-2.5 gap-3' : 'p-2.5 justify-center'
            } text-slate-700 hover:bg-yellow-50 hover:text-yellow-900`}
            title="Configurações & Kids"
          >
            <Settings className="w-5 h-5 shrink-0 text-amber-600" />
            {isExpanded && (
              <div className="text-left font-black text-xs">
                <div>Configurações</div>
                <div className="text-[10px] text-slate-400 font-medium">Regras e proteções</div>
              </div>
            )}
          </button>

          {/* 6. Quick Rules */}
          <button
            type="button"
            onClick={onOpenRules}
            className={`w-full flex items-center rounded-2xl transition-all cursor-pointer ${
              isExpanded ? 'p-2.5 gap-3' : 'p-2.5 justify-center'
            } text-slate-700 hover:bg-slate-100 hover:text-slate-900`}
            title="Regras Rápidas do Uno"
          >
            <HelpCircle className="w-5 h-5 shrink-0 text-slate-500" />
            {isExpanded && (
              <div className="text-left font-black text-xs">
                <div>Regras do Jogo</div>
                <div className="text-[10px] text-slate-400 font-medium">Como jogar e pontuar</div>
              </div>
            )}
          </button>

          {/* ADMIN ONLY MENUS */}
          {isAdmin && (
            <>
              <div className="pt-2 pb-1 border-t border-slate-100">
                {isExpanded && (
                  <div className="text-[10px] font-black text-purple-700 uppercase tracking-wider px-2.5 mb-1">
                    Painel Admin
                  </div>
                )}
              </div>

              {/* Admin: Invites */}
              <button
                type="button"
                onClick={onOpenInvites}
                className={`w-full flex items-center rounded-2xl transition-all cursor-pointer ${
                  isExpanded ? 'p-2.5 gap-3' : 'p-2.5 justify-center'
                } text-purple-800 hover:bg-purple-50`}
                title="Gerenciar Convites (@KWH)"
              >
                <div className="w-5 h-5 flex items-center justify-center text-sm shrink-0">
                  🎟️
                </div>
                {isExpanded && (
                  <div className="text-left font-black text-xs">
                    <div>Gerenciar Convites</div>
                    <div className="text-[10px] text-purple-500 font-medium">Criar códigos @XXXX</div>
                  </div>
                )}
              </button>

              {/* Admin: Deploy VM (ONLY SHOWN TO ADMIN!) */}
              <button
                type="button"
                onClick={onOpenVmGuide}
                className={`w-full flex items-center rounded-2xl transition-all cursor-pointer ${
                  isExpanded ? 'p-2.5 gap-3' : 'p-2.5 justify-center'
                } text-sky-800 hover:bg-sky-50`}
                title="Deploy & Servidor VM (Admin Edinho)"
              >
                <Server className="w-5 h-5 shrink-0 text-sky-600" />
                {isExpanded && (
                  <div className="text-left font-black text-xs">
                    <div>Deploy Servidor VM</div>
                    <div className="text-[10px] text-sky-500 font-medium">Comandos Docker & Nuvem</div>
                  </div>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom Footer: Logout when authenticated */}
      <div className="p-2 border-t border-slate-200">
        {currentUser ? (
          <button
            type="button"
            onClick={onLogout}
            className={`w-full flex items-center rounded-2xl transition-all cursor-pointer ${
              isExpanded ? 'p-2.5 gap-3' : 'p-2.5 justify-center'
            } text-rose-600 hover:bg-rose-50 hover:text-rose-700`}
            title={`Sair da conta (${currentUser.displayName})`}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isExpanded && (
              <div className="text-left font-black text-xs">
                <div>Sair da Conta</div>
                <div className="text-[10px] text-rose-400 font-medium truncate max-w-[130px]">
                  {currentUser.displayName}
                </div>
              </div>
            )}
          </button>
        ) : (
          <div className={`text-center py-2 text-[10px] text-slate-400 font-bold ${!isExpanded ? 'hidden' : ''}`}>
            Uno KaWiHe v2.0
          </div>
        )}
      </div>
    </aside>
  );
};
