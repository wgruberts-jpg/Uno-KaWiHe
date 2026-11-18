import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  History,
  Info,
  Play,
  RefreshCw,
  ShieldCheck,
  Tag,
  Trophy,
  Upload,
  Users,
  XCircle,
} from 'lucide-react';
import {
  ImportBatch,
  ImportDelimiter,
  ImportOperationMode,
  ImportSourceType,
  ImportValidationResponse,
} from '../types/uno.js';
import { auth } from '../services/auth.js';
import { parseJsonSafe } from '../utils/http.js';

interface TournamentSummaryOption {
  config: {
    id: string;
    name: string;
    modality: 'individual' | 'doubles';
  };
  status: string;
  entries: Array<{ id: string; name: string; userIds: string[] }>;
}

interface AdminImportPanelProps {
  onImportCompleted?: (batch: ImportBatch) => void;
  onOpenHistory?: () => void;
}

const MAX_CLIENT_BYTES = 512 * 1024;

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const AdminImportPanel: React.FC<AdminImportPanelProps> = ({
  onImportCompleted,
  onOpenHistory,
}) => {
  // 1. Batch Identification
  const [batchName, setBatchName] = useState('');
  const [importTag, setImportTag] = useState('');
  const [description, setDescription] = useState('');

  // 2. Data Input
  const [sourceType, setSourceType] = useState<ImportSourceType>('text_paste');
  const [rawText, setRawText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [delimiter, setDelimiter] = useState<ImportDelimiter | 'auto'>('auto');
  const [ignoreExistingUsers, setIgnoreExistingUsers] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 3. Mode & Tournament
  const [mode, setMode] = useState<ImportOperationMode>('create_only');
  const [tournaments, setTournaments] = useState<TournamentSummaryOption[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [createAsTemporary, setCreateAsTemporary] = useState(false);

  // 4. Validation & Commit State
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState<ImportValidationResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showConfirmCommit, setShowConfirmCommit] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => makeIdempotencyKey());
  const [commitResult, setCommitResult] = useState<ImportBatch | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const loadTournaments = async () => {
    const token = auth.getToken();
    if (!token) return;
    setLoadingTournaments(true);
    try {
      const res = await fetch('/api/tournaments', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsed = await parseJsonSafe<{ success?: boolean; tournaments?: TournamentSummaryOption[] }>(res);
      if (parsed.ok && parsed.isJson && parsed.data?.success && Array.isArray(parsed.data.tournaments)) {
        setTournaments(parsed.data.tournaments);
      }
    } catch {
      // ignore silently
    } finally {
      setLoadingTournaments(false);
    }
  };

  useEffect(() => {
    loadTournaments();
  }, []);

  const resetValidationAndResult = () => {
    setValidation(null);
    setValidationError(null);
    setCommitError(null);
    setShowConfirmCommit(false);
    setIdempotencyKey(makeIdempotencyKey());
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resetValidationAndResult();

    if (file.size > MAX_CLIENT_BYTES) {
      setValidationError(
        `O arquivo "${file.name}" possui ${Math.round(file.size / 1024)} KB e excede o limite de 512 KB.`
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const text = await file.text();
      setRawText(text);
      setSelectedFileName(file.name);
      setSourceType('csv_upload');
      if (!batchName.trim()) {
        const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        if (baseName.length >= 2) setBatchName(baseName.slice(0, 60));
      }
    } catch {
      setValidationError('Não foi possível ler o conteúdo do arquivo selecionado.');
    }
  };

  const handleValidate = async () => {
    setValidationError(null);
    setCommitError(null);
    setCommitResult(null);

    if (!rawText.trim()) {
      setValidationError('Cole os dados ou carregue um arquivo CSV antes de validar.');
      return;
    }

    setIsValidating(true);
    try {
      const res = await auth.validateBulkImport({
        rawText,
        mode,
        delimiter,
        tournamentId: mode !== 'create_only' ? selectedTournamentId : undefined,
        ignoreExistingUsers,
        createAsTemporary: mode === 'create_and_enroll' ? createAsTemporary : false,
      });
      setValidation(res);
      if (!res.success && res.error) {
        setValidationError(res.error);
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirmAndCommit = async () => {
    setCommitError(null);

    if (batchName.trim().length < 2) {
      setCommitError('Informe um Nome do Lote (mínimo 2 caracteres) antes de confirmar.');
      setShowConfirmCommit(false);
      return;
    }

    setIsCommitting(true);
    try {
      const res = await auth.commitBulkImport({
        rawText,
        mode,
        sourceType,
        delimiter: validation?.detectedDelimiter || delimiter,
        tournamentId: mode !== 'create_only' ? selectedTournamentId : undefined,
        ignoreExistingUsers,
        createAsTemporary: mode === 'create_and_enroll' ? createAsTemporary : false,
        name: batchName.trim(),
        importTag: importTag.trim() || undefined,
        description: description.trim() || undefined,
        idempotencyKey,
      });

      if (!res.success || !res.batch) {
        setCommitError(res.error || 'Falha ao processar a importação em massa.');
        if (res.validation) setValidation(res.validation);
        setShowConfirmCommit(false);
        return;
      }

      // Privacy safeguard: immediately wipe raw text & file input containing plaintext passwords from UI memory
      setRawText('');
      setSelectedFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setValidation(null);
      setShowConfirmCommit(false);
      setCommitResult(res.batch);
      setIdempotencyKey(makeIdempotencyKey());
      onImportCompleted?.(res.batch);
    } finally {
      setIsCommitting(false);
    }
  };

  const selectedTournament = tournaments.find((t) => t.config.id === selectedTournamentId);
  const selectedTournamentDoubles = selectedTournament?.config.modality === 'doubles';
  const selectedTournamentClosed =
    !!selectedTournament && !['registration', 'rescheduled'].includes(selectedTournament.status);

  const canOpenConfirm =
    !!validation?.success &&
    (validation.summary?.readyToProcessCount || 0) > 0 &&
    batchName.trim().length >= 2 &&
    !(mode !== 'create_only' && (!selectedTournamentId || selectedTournamentClosed));

  return (
    <div className="space-y-4">
      {/* Top Info Banner */}
      <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="text-xs text-slate-300 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-white">Importador Administrativo (Lotes até 200 jogadores / 512 KB):</strong>{' '}
            Valide o lote em pré-visualização antes de gravar. Senhas exigem mínimo de 4 caracteres e nunca ficam salvas em texto puro ou histórico.
          </div>
        </div>
        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-amber-300 font-black text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>Ver Histórico de Lotes</span>
          </button>
        )}
      </div>

      {/* Commit Result Summary (Area 7) */}
      {commitResult && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border-2 border-emerald-500/70 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <h4 className="text-sm font-black text-white">
                  Lote "{commitResult.name}" processado!
                </h4>
                <div className="text-[11px] text-emerald-300 font-mono">
                  ID: {commitResult.importBatchId} · Tag: {commitResult.importTag} · Status: {commitResult.status}
                </div>
              </div>
            </div>
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs cursor-pointer"
              >
                Abrir no Histórico
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-700">
              <div className="text-[10px] text-slate-400 font-bold">Recebidas</div>
              <div className="text-base font-black text-white">{commitResult.summary.totalReceived}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-emerald-500/40">
              <div className="text-[10px] text-emerald-300 font-bold">Criadas</div>
              <div className="text-base font-black text-emerald-400">{commitResult.summary.totalCreated}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-sky-500/40">
              <div className="text-[10px] text-sky-300 font-bold">Inscritas</div>
              <div className="text-base font-black text-sky-400">{commitResult.summary.totalEnrolled}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-amber-500/40">
              <div className="text-[10px] text-amber-300 font-bold">Ignoradas</div>
              <div className="text-base font-black text-amber-400">{commitResult.summary.totalSkipped}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-rose-500/40">
              <div className="text-[10px] text-rose-300 font-bold">Rejeitadas / Falhas</div>
              <div className="text-base font-black text-rose-400">
                {commitResult.summary.totalRejected + commitResult.summary.totalFailed}
              </div>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/70">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-800 text-slate-300 sticky top-0">
                <tr>
                  <th className="px-2.5 py-1.5">Linha</th>
                  <th className="px-2.5 py-1.5">Username</th>
                  <th className="px-2.5 py-1.5">Nome</th>
                  <th className="px-2.5 py-1.5">Resultado</th>
                  <th className="px-2.5 py-1.5">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {commitResult.items.map((item) => (
                  <tr key={`${item.lineNumber}_${item.username}`}>
                    <td className="px-2.5 py-1.5 font-mono text-slate-400">{item.lineNumber}</td>
                    <td className="px-2.5 py-1.5 font-mono text-white">@{item.username}</td>
                    <td className="px-2.5 py-1.5 text-slate-200">{item.displayName || '—'}</td>
                    <td className="px-2.5 py-1.5 font-black">
                      {item.outcome === 'created_and_enrolled' && <span className="text-emerald-400">Criado + Inscrito</span>}
                      {item.outcome === 'created' && <span className="text-emerald-400">Criado</span>}
                      {item.outcome === 'enrolled' && <span className="text-sky-400">Inscrito (Existente)</span>}
                      {item.outcome === 'skipped' && <span className="text-amber-400">Ignorado</span>}
                      {(item.outcome === 'rejected' || item.outcome === 'failed') && (
                        <span className="text-rose-400">Rejeitado</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-slate-400">{item.reasonMessage || (item.userTag ? `Tag ${item.userTag}` : 'OK')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Area 1: Batch Identification + Area 3: Mode Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-2xl space-y-2.5">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> 1. Identificação do Lote
          </h4>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              Nome do Lote *
            </label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Ex: Turma A - Torneio de Maio"
              maxLength={80}
              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs font-bold focus:outline-none focus:border-amber-400"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Tag de Origem (opcional)
              </label>
              <input
                type="text"
                value={importTag}
                onChange={(e) => setImportTag(e.target.value)}
                placeholder="Ex: TURMA_A_2026"
                maxLength={32}
                className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs font-mono focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Observação (opcional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Alunos novos do evento"
                maxLength={120}
                className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        {/* Area 3 & 4: Operation Mode & Tournament Selector */}
        <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-2xl space-y-2.5">
          <h4 className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> 2. Modo de Operação & Torneio
          </h4>
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              O que deseja fazer com este lote?
            </label>
            <select
              value={mode}
              onChange={(e) => {
                const nextMode = e.target.value as ImportOperationMode;
                setMode(nextMode);
                if (nextMode !== 'create_and_enroll') {
                  setCreateAsTemporary(false);
                }
                resetValidationAndResult();
              }}
              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs font-bold focus:outline-none focus:border-sky-400"
            >
              <option value="create_only">Modo A — Apenas cadastrar novos usuários (sem torneio)</option>
              <option value="create_and_enroll">Modo B — Cadastrar novos usuários + inscrever em torneio</option>
              <option value="enroll_existing">Modo C — Apenas inscrever usuários já existentes em torneio</option>
            </select>
          </div>

          {mode !== 'create_only' ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> Torneio de Destino *
                </label>
                <button
                  type="button"
                  onClick={loadTournaments}
                  className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingTournaments ? 'animate-spin' : ''}`} /> Atualizar
                </button>
              </div>
              <select
                value={selectedTournamentId}
                onChange={(e) => {
                  setSelectedTournamentId(e.target.value);
                  resetValidationAndResult();
                }}
                className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs font-bold focus:outline-none focus:border-amber-400"
              >
                <option value="">-- Selecione um torneio --</option>
                {tournaments.map((t) => (
                  <option key={t.config.id} value={t.config.id}>
                    {t.config.name} ({t.config.modality === 'doubles' ? 'Duplas 2v2 (Pares: 1º e 2º)' : 'Individual'} · {t.status} · {t.entries.length} {t.config.modality === 'doubles' ? 'dupla(s)' : 'inscrito(s)'})
                  </option>
                ))}
              </select>

              {selectedTournamentDoubles && (
                <div className="p-2 rounded-xl bg-sky-950/60 border border-sky-500/60 text-[11px] text-sky-200 flex items-start gap-1.5">
                  <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    Torneios de <strong>Duplas (2v2)</strong>: As linhas do lote serão consideradas em pares consecutivos (1ª e 2ª linhas = 1ª dupla, 3ª e 4ª linhas = 2ª dupla, etc.). Certifique-se de que o lote possui um número par de usuários.
                  </span>
                </div>
              )}

              {selectedTournamentClosed && (
                <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-500/60 text-[11px] text-amber-200 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Este torneio está com status <strong>{selectedTournament?.status}</strong> e não aceita novas inscrições.
                  </span>
                </div>
              )}

              {mode === 'create_and_enroll' && (
                <label className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-700 cursor-pointer hover:border-amber-500/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={createAsTemporary}
                    onChange={(e) => {
                      setCreateAsTemporary(e.target.checked);
                      resetValidationAndResult();
                    }}
                    className="mt-0.5 rounded border-slate-600 bg-slate-900"
                  />
                  <div className="text-[11px] leading-snug">
                    <div className="font-black text-amber-300">
                      Criar contas como usuários temporários exclusivos deste torneio
                    </div>
                    <div className="text-slate-400">
                      Opcional (desmarcado por padrão = usuários permanentes). Contas marcadas como temporárias poderão ser limpas após o torneio sem afetar contas permanentes.
                    </div>
                  </div>
                </label>
              )}
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/80 text-[11px] text-slate-400 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>Cadastro independente: cria usuários com cargo Jogador sem vínculo obrigatório com torneios.</span>
            </div>
          )}
        </div>
      </div>

      {/* Area 2: Data Input (Upload CSV or Paste) */}
      <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> 3. Entrada de Dados (CSV ou Texto Colado)
          </h4>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => auth.downloadImportTemplate(mode)}
              className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Baixar Modelo CSV
            </button>
            <label className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{selectedFileName ? `Arquivo: ${selectedFileName}` : 'Carregar Arquivo CSV'}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/plain"
                onChange={handleFileSelected}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <textarea
          rows={6}
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value);
            if (sourceType === 'csv_upload') setSelectedFileName(null);
            setSourceType('text_paste');
            resetValidationAndResult();
          }}
          placeholder={
            mode === 'enroll_existing'
              ? 'username\njogador01\njogador02'
              : 'username;displayName;password\njogador01;João Silva;1234\njogador02;Maria Souza;5678'
          }
          className="w-full p-3 rounded-xl bg-slate-950 border border-slate-600 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-400"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-300">Delimitador:</span>
              <select
                value={delimiter}
                onChange={(e) => {
                  setDelimiter(e.target.value as ImportDelimiter | 'auto');
                  resetValidationAndResult();
                }}
                className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-600 text-white text-[11px] font-bold"
              >
                <option value="auto">Auto-detectar</option>
                <option value=";">Ponto e vírgula (;)</option>
                <option value=",">Vírgula (,)</option>
                <option value={'\t'}>TAB (\t)</option>
              </select>
            </div>

            {mode === 'create_only' && (
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={ignoreExistingUsers}
                  onChange={(e) => {
                    setIgnoreExistingUsers(e.target.checked);
                    resetValidationAndResult();
                  }}
                  className="rounded border-slate-600 bg-slate-900"
                />
                <span>Ignorar usernames já existentes (não rejeitar linha)</span>
              </label>
            )}
          </div>

          <button
            type="button"
            onClick={handleValidate}
            disabled={isValidating || !rawText.trim()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isValidating ? 'Validando...' : 'Validar Prévia'}</span>
          </button>
        </div>
      </div>

      {/* Validation Error Banner */}
      {(validationError || commitError) && (
        <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-500 text-rose-200 text-xs font-bold flex items-start gap-2">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div>{commitError || validationError}</div>
            {validation?.ambiguousDelimiter && (
              <div className="text-[11px] text-amber-300">
                Selecione manualmente o delimitador acima (Ponto e vírgula, Vírgula ou TAB) e clique em "Validar Prévia" novamente.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Area 5: Validation Preview & Diagnostic Table */}
      {validation?.success && validation.summary && (
        <div className="p-3.5 bg-slate-800/90 border-2 border-slate-600 rounded-2xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-white">
                4. Pré-visualização e Diagnóstico ({validation.summary.totalLines} linha(s))
              </h4>
              <div className="text-[11px] text-slate-400">
                Delimitador detectado: <code className="text-amber-300">{validation.detectedDelimiter === '\t' ? 'TAB' : validation.detectedDelimiter}</code>
                {validation.tournament && (
                  <> · Torneio: <strong className="text-sky-300">{validation.tournament.name}</strong></>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowConfirmCommit(true)}
              disabled={!canOpenConfirm}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-xs cursor-pointer disabled:opacity-40 shadow-md"
            >
              Confirmar Importação ({validation.summary.readyToProcessCount} válido(s))
            </button>
          </div>

          {batchName.trim().length < 2 && (
            <div className="p-2 rounded-xl bg-amber-950/50 border border-amber-500/50 text-[11px] text-amber-200 font-bold">
              Informe um Nome do Lote (seção 1) para liberar o botão de confirmação.
            </div>
          )}

          {/* Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
            <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-700">
              <div className="text-[10px] text-slate-400 font-bold">Total</div>
              <div className="text-sm font-black text-white">{validation.summary.totalLines}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-emerald-500/40">
              <div className="text-[10px] text-emerald-300 font-bold">Válidas</div>
              <div className="text-sm font-black text-emerald-400">{validation.summary.validCount}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-rose-500/40">
              <div className="text-[10px] text-rose-300 font-bold">Inválidas</div>
              <div className="text-sm font-black text-rose-400">{validation.summary.invalidCount}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-amber-500/40">
              <div className="text-[10px] text-amber-300 font-bold">Ignoradas</div>
              <div className="text-sm font-black text-amber-400">{validation.summary.ignoredCount}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-700">
              <div className="text-[10px] text-slate-400 font-bold">Conflitos Nome/User</div>
              <div className="text-sm font-black text-orange-300">
                {validation.summary.existingUsernameCount +
                  validation.summary.duplicateUsernameInFileCount +
                  validation.summary.existingDisplayNameCount +
                  validation.summary.duplicateDisplayNameInFileCount}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-sky-500/40">
              <div className="text-[10px] text-sky-300 font-bold">Elegíveis Torneio</div>
              <div className="text-sm font-black text-sky-400">{validation.summary.eligibleEnrollCount}</div>
            </div>
          </div>

          {/* Line-by-line Table (no plaintext passwords displayed!) */}
          <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/80">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-800 text-slate-300 sticky top-0">
                <tr>
                  <th className="px-2.5 py-1.5">Linha</th>
                  <th className="px-2.5 py-1.5">Username</th>
                  <th className="px-2.5 py-1.5">DisplayName</th>
                  <th className="px-2.5 py-1.5">Status</th>
                  <th className="px-2.5 py-1.5">Diagnóstico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {validation.rows.map((r) => (
                  <tr key={`${r.lineNumber}_${r.username}`}>
                    <td className="px-2.5 py-1.5 font-mono text-slate-400">{r.lineNumber}</td>
                    <td className="px-2.5 py-1.5 font-mono text-white">{r.username || '—'}</td>
                    <td className="px-2.5 py-1.5 text-slate-200">{r.displayName || '—'}</td>
                    <td className="px-2.5 py-1.5 font-black">
                      {r.status === 'valid' && <span className="text-emerald-400">Válido</span>}
                      {r.status === 'conflict_ignorable' && <span className="text-amber-400">Ignorado</span>}
                      {r.status === 'invalid' && <span className="text-rose-400">Inválido</span>}
                    </td>
                    <td className="px-2.5 py-1.5 text-slate-300">{r.messages.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Area 6: Explicit Confirmation Modal (no window.confirm) */}
      {showConfirmCommit && validation?.summary && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-emerald-500 p-5 rounded-3xl max-w-md w-full space-y-3 shadow-2xl">
            <h4 className="text-base font-black text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" /> Confirmar Gravação do Lote
            </h4>
            <div className="text-xs text-slate-300 space-y-1.5 bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
              <div><strong>Lote:</strong> {batchName.trim()}</div>
              {importTag.trim() && <div><strong>Tag:</strong> {importTag.trim().toUpperCase()}</div>}
              <div><strong>Modo:</strong> {mode}</div>
              {validation.tournament && (
                <div><strong>Torneio:</strong> {validation.tournament.name}</div>
              )}
              {mode === 'create_and_enroll' && (
                <div>
                  <strong>Tipo das novas contas:</strong>{' '}
                  {createAsTemporary ? (
                    <span className="text-amber-300 font-black">Temporárias exclusivas do torneio</span>
                  ) : (
                    <span className="text-emerald-300 font-black">Permanentes (preservadas)</span>
                  )}
                </div>
              )}
              <div>
                <strong>Ações previstas:</strong>{' '}
                <span className="text-emerald-400 font-black">{validation.summary.readyToProcessCount} registro(s) válido(s)</span>
                {validation.summary.invalidCount > 0 && (
                  <span className="text-rose-400"> · {validation.summary.invalidCount} rejeitado(s)</span>
                )}
                {validation.summary.ignoredCount > 0 && (
                  <span className="text-amber-400"> · {validation.summary.ignoredCount} ignorado(s)</span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              As senhas serão criptografadas em thread dedicada e removidas da memória imediatamente após a confirmação.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isCommitting}
                onClick={() => setShowConfirmCommit(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isCommitting}
                onClick={handleConfirmAndCommit}
                className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs cursor-pointer disabled:opacity-50"
              >
                {isCommitting ? 'Processando lote...' : 'Gravar Agora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
