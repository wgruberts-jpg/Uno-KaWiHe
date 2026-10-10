import React, { useState } from 'react';
import {
  HelpCircle,
  X,
  Sparkles,
  Mic,
  Copy,
  Check,
  Globe,
  Flame,
  Shield,
  Layers,
  Volume2,
  AlertTriangle,
  RotateCcw,
  CheckCircle2
} from 'lucide-react';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'rules' | 'mic';
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'rules'
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'mic'>(initialTab);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white border-2 border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header Bar */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white px-5 py-4 flex items-center justify-between border-b border-white/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-white/20 text-white border border-white/30 shadow-inner">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide text-white">Como Jogar & Ajuda</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-yellow-100 font-bold border border-white/30 uppercase tracking-wider">
                  Guia Oficial
                </span>
              </div>
              <p className="text-xs text-amber-100/90 font-medium">
                Regras do UNO, pontuação e como liberar o microfone no PC
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2.5 rounded-t-2xl font-black text-xs flex items-center gap-2 transition-all cursor-pointer border-t-2 border-x-2 ${
              activeTab === 'rules'
                ? 'bg-white text-amber-950 border-amber-400 -mb-[2px] shadow-xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${activeTab === 'rules' ? 'text-amber-500' : 'text-slate-400'}`} />
            <span>Regras do Jogo (UNO)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mic')}
            className={`px-4 py-2.5 rounded-t-2xl font-black text-xs flex items-center gap-2 transition-all cursor-pointer border-t-2 border-x-2 ${
              activeTab === 'mic'
                ? 'bg-white text-sky-950 border-sky-400 -mb-[2px] shadow-xs'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <Mic className={`w-4 h-4 ${activeTab === 'mic' ? 'text-sky-500' : 'text-slate-400'}`} />
            <span>Microfone no PC (Firefox & Chrome)</span>
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-slate-800 text-xs">
          {activeTab === 'rules' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Objetivo */}
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
                <h3 className="text-sm font-black text-amber-950 flex items-center gap-2 mb-1">
                  🎯 Objetivo do Jogo
                </h3>
                <p className="text-slate-700 leading-relaxed font-medium">
                  Seja o primeiro a <strong>descartar todas as cartas da sua mão</strong>! A cada rodada vencida, você acumula pontos com base nas cartas que sobraram na mão dos seus adversários.
                </p>
              </div>

              {/* Como Jogar no Turno */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  🃏 Como Funciona a Partida
                </h3>
                <ul className="space-y-2 text-slate-700 font-medium">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">1</span>
                    <span><strong>Correspondência:</strong> Na sua vez, jogue uma carta que coincida em <strong>cor</strong> ou em <strong>número/símbolo</strong> com a carta do topo da mesa.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">2</span>
                    <span><strong>Comprar Carta:</strong> Se não tiver nenhuma carta válida, clique no baralho para comprar. Se ela for jogável, você pode jogá-la; caso contrário, clique em <strong>Passar Vez</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">3</span>
                    <span><strong>Tempo de Turno:</strong> Cada rodada tem cronômetro. Se o tempo expirar sem comprar, o servidor compra 1 carta e passa a vez automaticamente.</span>
                  </li>
                </ul>
              </div>

              {/* Cartas Especiais */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  ✨ Cartas Especiais
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center gap-2.5">
                    <span className="text-xl">🚫</span>
                    <div>
                      <strong className="text-slate-900 block">Pular (Bloqueio)</strong>
                      <span className="text-[11px] text-slate-500">O próximo jogador perde a vez.</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center gap-2.5">
                    <span className="text-xl">🔄</span>
                    <div>
                      <strong className="text-slate-900 block">Inverter Sentido</strong>
                      <span className="text-[11px] text-slate-500">Muda a ordem (horário / anti-horário).</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center gap-2.5">
                    <span className="text-xl">➕2</span>
                    <div>
                      <strong className="text-slate-900 block">Comprar Duas (+2)</strong>
                      <span className="text-[11px] text-slate-500">Próximo compra 2 e perde a vez.</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center gap-2.5">
                    <span className="text-xl">🎨</span>
                    <div>
                      <strong className="text-slate-900 block">Coringa Comum</strong>
                      <span className="text-[11px] text-slate-500">Joga em qualquer carta e escolhe a cor.</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center gap-2.5 sm:col-span-2">
                    <span className="text-xl">➕4</span>
                    <div>
                      <strong className="text-slate-900 block">Coringa Comprar Quatro (+4)</strong>
                      <span className="text-[11px] text-slate-500">Escolhe a nova cor, o próximo jogador compra 4 cartas e perde a vez.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Regra do UNO & Proteção Infantil */}
              <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-2">
                <h3 className="text-sm font-black text-rose-950 flex items-center gap-2">
                  📢 A Regra Sagrada do "UNO!"
                </h3>
                <p className="text-slate-700 leading-relaxed font-medium">
                  Quando ficar com <strong>apenas 1 carta restante</strong>, clique imediatamente no botão <strong>GRITAR UNO</strong>!
                  Se esquecer e outro jogador clicar em <em>Pegar UNO</em>, você comprará <strong>2 cartas de penalidade</strong>!
                </p>
                <div className="mt-2 p-2.5 rounded-xl bg-white/90 border border-rose-200 text-rose-900 text-[11px] font-bold flex items-center gap-2">
                  <span>👶</span>
                  <span><strong>Modo Criança:</strong> Ative a <em>"Proteção Anti-Esquecimento de UNO"</em> nas configurações ⚙️ para que o jogo grite UNO automaticamente pelas crianças!</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mic' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Context Alert */}
              <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-sky-200 text-sky-800 shrink-0">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-sky-950">
                    Por que o navegador bloqueia o microfone no PC?
                  </h3>
                  <p className="text-slate-700 mt-1 leading-relaxed font-medium">
                    Navegadores como <strong>Firefox</strong> e <strong>Google Chrome</strong> exigem conexão segura (HTTPS) para liberar microfone por padrão. Ao acessar a aplicação via IP direto ou HTTP sem certificado SSL, o navegador bloqueia o microfone por segurança.
                  </p>
                  <p className="text-sky-900 mt-1 font-bold">
                    Siga o passo a passo resumido abaixo para liberar o microfone no seu navegador com segurança:
                  </p>
                </div>
              </div>

              {/* 1. Firefox Guide */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-50/80 to-amber-50/50 border-2 border-orange-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-orange-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🦊</span>
                    <h3 className="text-sm font-black text-orange-950 uppercase tracking-wide">
                      Como liberar no Firefox para PC
                    </h3>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-200 text-orange-900">
                    Passo a Passo
                  </span>
                </div>

                <ol className="space-y-2.5 text-slate-800 font-medium">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">1</span>
                    <span>Abra o <strong>Firefox</strong> no computador.</span>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">2</span>
                    <div className="flex-1 flex flex-wrap items-center gap-1.5">
                      <span>Na barra de endereços (onde digita o nome dos sites), digite</span>
                      <code className="px-2 py-0.5 rounded bg-white border border-orange-300 font-mono font-bold text-orange-900 select-all">about:config</code>
                      <span>e pressione Enter.</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('about:config', 'ff_url')}
                        className="p-1 rounded bg-orange-100 hover:bg-orange-200 text-orange-800 transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1"
                        title="Copiar about:config"
                      >
                        {copiedKey === 'ff_url' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedKey === 'ff_url' ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">3</span>
                    <span>O navegador exibirá um aviso de segurança. Clique no botão <strong>"Aceitar o risco e continuar"</strong>.</span>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">4</span>
                    <div className="flex-1 flex flex-wrap items-center gap-1.5">
                      <span>No campo de busca no topo da página, digite:</span>
                      <code className="px-2 py-0.5 rounded bg-white border border-orange-300 font-mono font-bold text-orange-900 select-all">media.devices.insecure.enabled</code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('media.devices.insecure.enabled', 'ff_key1')}
                        className="p-1 rounded bg-orange-100 hover:bg-orange-200 text-orange-800 transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1"
                        title="Copiar chave"
                      >
                        {copiedKey === 'ff_key1' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedKey === 'ff_key1' ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">5</span>
                    <span>O resultado aparecerá logo abaixo. Clique no <strong>botão de alternar</strong> (duas setas em direções opostas ⇄) no canto direito para mudar o valor de <code>false</code> para <strong><code>true</code></strong>.</span>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">6</span>
                    <div className="flex-1 flex flex-wrap items-center gap-1.5">
                      <span>Em seguida, limpe a barra de pesquisa interna e busque por:</span>
                      <code className="px-2 py-0.5 rounded bg-white border border-orange-300 font-mono font-bold text-orange-900 select-all">media.getusermedia.insecure.enabled</code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('media.getusermedia.insecure.enabled', 'ff_key2')}
                        className="p-1 rounded bg-orange-100 hover:bg-orange-200 text-orange-800 transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1"
                        title="Copiar chave"
                      >
                        {copiedKey === 'ff_key2' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedKey === 'ff_key2' ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">7</span>
                    <span>Da mesma forma, mude o valor dela de <code>false</code> para <strong><code>true</code></strong>.</span>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-200 text-orange-900 flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5">8</span>
                    <span><strong>Reinicie o Firefox</strong> para garantir que as alterações façam efeito.</span>
                  </li>
                </ol>
              </div>

              {/* 2. Google Chrome Guide */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/80 to-indigo-50/50 border-2 border-blue-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🌐</span>
                    <h3 className="text-sm font-black text-blue-950 uppercase tracking-wide">
                      O que fazer no Google Chrome do PC?
                    </h3>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-200 text-blue-900">
                    Chrome / Edge
                  </span>
                </div>

                <div className="space-y-2 text-slate-800 font-medium">
                  <p className="leading-relaxed">
                    Caso mude de ideia e queira aplicar no Chrome do computador, o passo a passo funciona perfeitamente:
                  </p>
                  <div className="p-3 bg-white rounded-xl border border-blue-200 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>1. Acesse o endereço no Chrome:</span>
                      <code className="px-2 py-0.5 rounded bg-blue-50 border border-blue-300 font-mono font-bold text-blue-900 select-all break-all">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('chrome://flags/#unsafely-treat-insecure-origin-as-secure', 'chrome_flag')}
                        className="p-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1"
                        title="Copiar link das flags do Chrome"
                      >
                        {copiedKey === 'chrome_flag' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedKey === 'chrome_flag' ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <p>2. Mude a opção para <strong>Enabled</strong>.</p>
                    <p>3. Digite o <strong>IP ou URL</strong> da sua VM/site no campo de texto exibido.</p>
                    <p>4. Clique no botão azul <strong>Relaunch</strong> no rodapé para reiniciar o Chrome.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 font-medium">
            Uno KaWiHe • Instruções e compatibilidade de navegadores
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
