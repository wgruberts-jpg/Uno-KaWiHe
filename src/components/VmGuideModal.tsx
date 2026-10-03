import React, { useState } from 'react';
import { X, Copy, Check, Server, Terminal, Shield, Cpu, Box, Layers, Globe } from 'lucide-react';

interface VmGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VmGuideModal: React.FC<VmGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'docker' | 'pm2'>('docker');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const dockerSteps = [
    {
      id: 'docker-install',
      title: '1. Instalar Docker & Docker Compose no Ubuntu',
      desc: 'Sua VM de 12GB RAM e 2 OCPU é potente! O Docker permite isolar o UNO e colocar vários outros jogos na mesma máquina sem conflitos.',
      command: `# Atualizar pacotes
sudo apt update && sudo apt upgrade -y

# Instalar Docker oficial e utilitários
curl -fsSL https://get.docker.com | sudo sh

# Dar permissão ao seu usuário ubuntu para rodar docker sem sudo
sudo usermod -aG docker $USER

# Aplicar permissões e verificar versão
newgrp docker
docker --version
docker compose version`,
    },
    {
      id: 'docker-clone-run',
      title: '2. Baixar o UNO e Subir o Container pela Primeira Vez',
      desc: 'O projeto já inclui o Dockerfile e docker-compose.yml otimizados para produção com WebSocket.',
      command: `# Clonar o repositório do jogo
git clone <SEU_REPOSITORIO_AQUI> Uno-KaWiHe
cd Uno-KaWiHe

# Construir a imagem e subir o container em segundo plano
docker compose up -d --build

# Verificar se o container está rodando e saudável
docker compose ps
docker compose logs -f`,
    },
    {
      id: 'docker-update-backup',
      title: '⚡ ATUALIZAR VERSÃO COM BACKUP SEGURO (SEMPRE USAR ESTE)',
      desc: 'Salva todas as contas de usuários, senhas e convites em pasta de backup antes de puxar as novidades do Git e reiniciar o Docker.',
      command: `# Opção 1: Comando direto completo em 1 linha (Cria backup com data/hora + git pull + docker):
cd ~/Uno-KaWiHe && mkdir -p ~/backups_kawihe && cp -r data ~/backups_kawihe/backup_$(date +%Y%m%d_%H%M%S) 2>/dev/null ; git pull && docker compose up -d --build

# Opção 2: Ou usando o script automático que faz tudo para você:
cd ~/Uno-KaWiHe && bash scripts/deploy.sh`,
    },
    {
      id: 'docker-firewall',
      title: '3. Liberar as Portas no Firewall do Linux e Oracle Cloud',
      desc: 'A Oracle Cloud bloqueia portas por padrão no Linux (iptables) e na VCN.',
      command: `# 1. Liberar portas no iptables do Linux (Ubuntu na Oracle):
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save

# 2. Na interface Web da Oracle Cloud (VCN > Security Lists):
# Adicione Ingress Rule:
#   - Source CIDR: 0.0.0.0/0
#   - IP Protocol: TCP
#   - Destination Port Range: 80, 443, 3000`,
    },
    {
      id: 'docker-auth-admin',
      title: '4. Contas Centralizadas e Senha de Administrador',
      desc: 'O sistema inclui o microserviço dedicado (kawihe-auth) que gerencia os usuários em banco persistente e protege as trapaças (cheats).',
      command: `# Credenciais do Administrador Padrão:
#   Usuário: admin
#   Senha:   admin123
#   PIN para Liberar Cheats: 1234
#
# Para alterar a qualquer momento no docker-compose.yml:
#   JWT_SECRET=sua_chave_secreta_aqui
#   ADMIN_PIN=5678  <- Seu PIN mestre personalizado`,
    },
    {
      id: 'docker-multi-games',
      title: '5. Como Adicionar Mais Jogos na Mesma VM e Conectar ao Mesmo Auth',
      desc: 'Com 12GB você pode rodar 10+ jogos simultâneos! Todos eles podem se conectar ao kawihe-auth na porta 4000.',
      command: `# Exemplo de estrutura na sua VM:
# /home/ubuntu/
#   ├── Uno-KaWiHe/     (Porta 3000 + Auth 4000)
#   ├── truco-game/     (Porta 3001 -> conecta em http://kawihe-auth:4000)
#   ├── ludo-game/      (Porta 3002 -> conecta em http://kawihe-auth:4000)
#   └── domino-game/    (Porta 3003 -> conecta em http://kawihe-auth:4000)

# Para cada novo jogo no docker-compose:
# environment:
#   - AUTH_SERVICE_URL=http://kawihe-auth:4000
# networks:
#   - kawihe-net`,
    },
    {
      id: 'docker-nginx-domain',
      title: '6. Nginx Proxy Reverso para Usar Subdomínios e SSL (Opcional)',
      desc: 'Para acessar uno.seusite.com, truco.seusite.com na porta 80/443 com certificado HTTPS grátis (Let\'s Encrypt):',
      command: `# Instalar Nginx e Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Criar arquivo de configuração:
sudo nano /etc/nginx/sites-available/jogos.conf

# Conteúdo do arquivo:
# server {
#     listen 80;
#     server_name uno.seusite.com;
#     location / {
#         proxy_pass http://127.0.0.1:3000;
#         proxy_http_version 1.1;
#         proxy_set_header Upgrade $http_upgrade;
#         proxy_set_header Connection "upgrade";
#         proxy_set_header Host $host;
#     }
# }

# Ativar configuração e gerar SSL:
sudo ln -s /etc/nginx/sites-available/jogos.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d uno.seusite.com`,
    },
  ];

  const pm2Steps = [
    {
      id: 'pm2-install',
      title: '1. Instalar Node.js 22 LTS & Git',
      desc: 'Instalação nativa do Node.js sem container.',
      command: `sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git build-essential`,
    },
    {
      id: 'pm2-run',
      title: '2. Clonar, Compilar e Rodar com PM2',
      desc: 'O PM2 gerencia o processo em segundo plano e reinicia se a máquina reiniciar.',
      command: `sudo npm install -g pm2
git clone <SEU_REPOSITORIO_AQUI> uno-game
cd uno-game
npm install
npm run build
pm2 start "npm run start" --name "uno-game"
pm2 save
pm2 startup`,
    },
    {
      id: 'pm2-ports',
      title: '3. Liberar Porta no Firewall',
      desc: 'Liberar a porta 3000 no iptables da Oracle Cloud.',
      command: `sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save`,
    },
  ];

  const activeSteps = activeTab === 'docker' ? dockerSteps : pm2Steps;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white border-4 border-yellow-400 rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl my-6 text-slate-800 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-amber-600 shadow-sm">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                Deploy na VM Oracle (12GB RAM · 2 OCPU)
              </h3>
              <span className="text-[11px] text-emerald-700 font-black bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                ✨ Capacidade para múltiplos jogos simultâneos
              </span>
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

        {/* Tab Selection */}
        <div className="flex gap-2 mb-4 bg-slate-100 p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('docker')}
            className={`flex-1 py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeTab === 'docker'
                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Box className="w-4 h-4" />
            <span>🐳 Com Docker (Recomendado para 12GB)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pm2')}
            className={`py-2 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeTab === 'pm2'
                ? 'bg-amber-400 text-slate-950 shadow-md border-2 border-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>⚡ Direto no Host (PM2)</span>
          </button>
        </div>

        {/* Info Banner */}
        {activeTab === 'docker' ? (
          <div className="mb-4 p-3 bg-blue-50 border-2 border-blue-200 rounded-2xl text-xs text-blue-900 flex items-start gap-2.5">
            <Layers className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong>Por que usar Docker com 12GB de RAM?</strong>
              <p className="text-[11px] text-blue-800 mt-0.5">
                Com containers, cada jogo fica isolado com limite de 512MB de RAM e 0.75 CPU. Você pode rodar o <strong>UNO</strong> na porta 3000, outro jogo na 3001, outro na 3002, etc. Se um jogo travar ou reiniciar, os outros continuam funcionando sem afetar a VM!
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-4 p-3 bg-amber-50 border-2 border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5">
            <Cpu className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Modo PM2 Tradicional:</strong>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Execução direta via Node.js 22 no sistema operacional da VM sem virtualização de containers.
              </p>
            </div>
          </div>
        )}

        {/* Steps List */}
        <div className="space-y-3.5 max-h-[55vh] overflow-y-auto pr-1">
          {activeSteps.map((step) => (
            <div key={step.id} className="bg-slate-50 p-3.5 sm:p-4 rounded-2xl border-2 border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-blue-600" />
                  {step.title}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(step.command, step.id)}
                  className="flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-2.5 py-1 rounded-xl border border-blue-300 cursor-pointer transition-all active:scale-95"
                >
                  {copiedKey === step.id ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-600 mb-2 font-medium leading-relaxed">
                {step.desc}
              </p>
              <pre className="bg-slate-900 p-3 rounded-xl text-[11px] text-emerald-400 font-mono overflow-x-auto whitespace-pre leading-relaxed border border-slate-800 shadow-inner">
                {step.command}
              </pre>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="pt-4 mt-3 border-t-2 border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-semibold hidden sm:inline">
            Arquivos <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">Dockerfile</code> e <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">docker-compose.yml</code> já estão inclusos no projeto.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs cursor-pointer transition-colors shadow-sm"
          >
            Entendido, fechar guia
          </button>
        </div>
      </div>
    </div>
  );
};
