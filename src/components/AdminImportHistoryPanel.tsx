import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Eye,
  History,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  ImportBatch,
  ImportBatchDetailUser,
  ImportImpactReport,
  ImportOperationMode,
  ImportUserManageAction,
} from '../types/uno.js';
import { auth } from '../services/auth.js';

interface AdminImportHistoryPanelProps {
  onUsersChanged?: () => void;
}

const MODE_LABELS: Record<ImportOperationMode, string> = {
  create_only: 'Apenas Cadastro',
  create_and_enroll: 'Cadastro + Torneio',
  enroll_existing: 'Inscrever Existentes',
};

export const AdminImportHistoryPanel: React.FC<AdminImportHistoryPanelProps> = ({
  onUsersChanged,
}) => {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<ImportOperationMode | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Detail View
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [detailUsers, setDetailUsers] = useState<ImportBatchDetailUser[]>([]);
  const [userFilterQuery, setUserFilterQuery] = useState('');
  const [relationFilter, setRelationFilter] = useState<'all' | 'created_by_batch' | 'existing_enrolled_only'>('all');
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Selection & Lifecycle Management (Phase 4)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [impactReport, setImpactReport] = useState<ImportImpactReport | null>(null);
  const [manageReason, setManageReason] = useState('');
  const [isAnalyzingImpact, setIsAnalyzingImpact] = useState(false);
  const [isExecutingManage, setIsExecutingManage] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadBatches = async () => {
    setIsLoading(true);
    try {
      const res = await auth.listImportBatches({
        search: searchQuery.trim() || undefined,
        mode: modeFilter,
        status: statusFilter,
      });
      if (res.success) {
        setBatches(res.batches);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, [modeFilter, statusFilter]);

  const openBatchDetail = async (batchId: string) => {
    setLoadingDetail(true);
    setErrorMsg(null);
    setFeedback(null);
    setSelectedUserIds([]);
    try {
      const res = await auth.getImportBatchDetail(batchId);
      if (res.success && res.batch && res.users) {
        setSelectedBatch(res.batch);
        setDetailUsers(res.users);
      } else {
        setErrorMsg(res.error || 'Erro ao carregar detalhes do lote.');
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const manageableVisibleUsers = detailUsers.filter(
    (u) => u.relationType === 'created_by_batch' && u.userId && u.accountStatus !== 'deleted' && u.accountStatus !== 'not_created'
  );

  const toggleSelectAllManageable = () => {
    const allIds = manageableVisibleUsers.map((u) => u.userId!).filter(Boolean);
    if (allIds.length > 0 && allIds.every((id) => selectedUserIds.includes(id))) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(allIds);
    }
  };

  const requestActionWithImpact = async (action: ImportUserManageAction, explicitUserIds?: string[]) => {
    if (!selectedBatch) return;
    const ids = explicitUserIds || selectedUserIds;
    if (ids.length === 0) return;

    setIsAnalyzingImpact(true);
    setErrorMsg(null);
    setManageReason('');
    try {
      const res = await auth.analyzeImportUsersImpact(selectedBatch.importBatchId, ids, action);
      if (res.success && res.impact) {
        setImpactReport(res.impact);
      } else {
        setErrorMsg(res.error || 'Erro ao analisar impacto dos usuários.');
      }
    } finally {
      setIsAnalyzingImpact(false);
    }
  };

  const executeManagedAction = async () => {
    if (!selectedBatch || !impactReport) return;
    const ids = impactReport.users.map((u) => u.userId);
    setIsExecutingManage(true);
    setErrorMsg(null);
    try {
      const res = await auth.manageImportBatchUsers({
        batchId: selectedBatch.importBatchId,
        userIds: ids,
        action: impactReport.requestedAction,
        reason: manageReason.trim() || undefined,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Ação não pôde ser executada.');
        setImpactReport(null);
        return;
      }

      const affectedCount = res.affectedUserIds?.length || 0;
      const skippedCount = res.skipped?.length || 0;
      setFeedback(
        `Ação "${impactReport.requestedAction}" concluída em ${affectedCount} usuário(s).` +
          (skippedCount > 0 ? ` ${skippedCount} protegido(s)/ignorado(s).` : '')
      );
      setImpactReport(null);
      setSelectedUserIds([]);
      await openBatchDetail(selectedBatch.importBatchId);
      await loadBatches();
      onUsersChanged?.();
    } finally {
      setIsExecutingManage(false);
    }
  };

  if (selectedBatch) {
    const q = userFilterQuery.trim().toLowerCase();
    const filteredDetailUsers = detailUsers.filter((u) => {
      if (relationFilter !== 'all' && u.relationType !== relationFilter) return false;
      if (q) {
        return (
          u.username.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          (u.userTag && u.userTag.toLowerCase().includes(q))
        );
      }
      return true;
    });

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-700">
          <button
            type="button"
            onClick={() => {
              setSelectedBatch(null);
              setDetailUsers([]);
              setSelectedUserIds([]);
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar aos Lotes
          </button>

          <button
            type="button"
            onClick={() => openBatchDetail(selectedBatch.importBatchId)}
            disabled={loadingDetail}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-black text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDetail ? 'animate-spin' : ''}`} /> Atualizar Detalhes
          </button>
        </div>

        {/* Batch Metadata Header */}
        <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-black text-white">{selectedBatch.name}</h4>
              <div className="text-[11px] text-slate-400 font-mono">
                ID: {selectedBatch.importBatchId} · Tag: <span className="text-amber-300">{selectedBatch.importTag}</span> · Modo: {MODE_LABELS[selectedBatch.mode]}
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-slate-900 border border-slate-600 text-slate-200">
              {selectedBatch.status}
            </span>
          </div>
          {selectedBatch.tournamentName && (
            <div className="text-[11px] text-sky-300 font-bold">
              Torneio vinculado: {selectedBatch.tournamentName} ({selectedBatch.tournamentId})
            </div>
          )}
          <div className="text-[11px] text-slate-400">
            Criado por <strong>@{selectedBatch.createdByUsername}</strong> em{' '}
            {new Date(selectedBatch.createdAt).toLocaleString('pt-BR')}
          </div>
        </div>

        {feedback && (
          <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/60 text-emerald-200 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}
        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/60 text-rose-200 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Filters + Batch Management Toolbar (Phase 4) */}
        <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userFilterQuery}
                onChange={(e) => setUserFilterQuery(e.target.value)}
                placeholder="Filtrar usuários do lote..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs"
              />
            </div>
            <select
              value={relationFilter}
              onChange={(e) => setRelationFilter(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs font-bold"
            >
              <option value="all">Todas as relações ({detailUsers.length})</option>
              <option value="created_by_batch">Criadas por este lote</option>
              <option value="existing_enrolled_only">Contas pré-existentes (apenas inscritas)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700/70">
            <div className="text-[11px] text-slate-300 font-bold">
              {selectedUserIds.length > 0 ? (
                <span className="text-amber-300">{selectedUserIds.length} conta(s) criada(s) pelo lote selecionada(s)</span>
              ) : (
                <span>Selecione contas "Criadas pelo lote" para desativar, arquivar, reativar ou excluir com segurança.</span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={selectedUserIds.length === 0 || isAnalyzingImpact}
                onClick={() => requestActionWithImpact('disable')}
                className="px-2.5 py-1 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Ban className="w-3 h-3" /> Desativar
              </button>
              <button
                type="button"
                disabled={selectedUserIds.length === 0 || isAnalyzingImpact}
                onClick={() => requestActionWithImpact('archive')}
                className="px-2.5 py-1 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Archive className="w-3 h-3" /> Arquivar
              </button>
              <button
                type="button"
                disabled={selectedUserIds.length === 0 || isAnalyzingImpact}
                onClick={() => requestActionWithImpact('reactivate')}
                className="px-2.5 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <RotateCcw className="w-3 h-3" /> Reativar
              </button>
              <button
                type="button"
                disabled={selectedUserIds.length === 0 || isAnalyzingImpact}
                onClick={() => requestActionWithImpact('delete')}
                className="px-2.5 py-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Trash2 className="w-3 h-3" /> Excluir
              </button>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900/80">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-800 text-slate-300 sticky top-0">
              <tr>
                <th className="px-2.5 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={
                      manageableVisibleUsers.length > 0 &&
                      manageableVisibleUsers.every((u) => u.userId && selectedUserIds.includes(u.userId))
                    }
                    onChange={toggleSelectAllManageable}
                    title="Selecionar contas criadas por este lote"
                  />
                </th>
                <th className="px-2.5 py-2">Usuário</th>
                <th className="px-2.5 py-2">Origem no Lote</th>
                <th className="px-2.5 py-2">Status Atual da Conta</th>
                <th className="px-2.5 py-2">Torneio</th>
                <th className="px-2.5 py-2">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredDetailUsers.map((u) => {
                const canSelect =
                  u.relationType === 'created_by_batch' &&
                  !!u.userId &&
                  u.accountStatus !== 'deleted' &&
                  u.accountStatus !== 'not_created';
                return (
                  <tr key={`${u.lineNumber}_${u.username}`} className="hover:bg-slate-800/40">
                    <td className="px-2.5 py-2">
                      {canSelect ? (
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.userId!)}
                          onChange={() => toggleUserSelection(u.userId!)}
                        />
                      ) : (
                        <span className="text-slate-600" title="Conta protegida ou não criada">—</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="font-bold text-white">{u.displayName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        @{u.username} {u.userTag || ''}
                      </div>
                    </td>
                    <td className="px-2.5 py-2">
                      {u.relationType === 'created_by_batch' && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px]">
                          Criada pelo lote
                        </span>
                      )}
                      {u.relationType === 'existing_enrolled_only' && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold text-[10px]">
                          Conta existente
                        </span>
                      )}
                      {u.relationType === 'none' && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-bold text-[10px]">
                          Não criada ({u.outcome})
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 font-black">
                      {u.accountStatus === 'active' && <span className="text-emerald-400">Ativa</span>}
                      {u.accountStatus === 'disabled' && <span className="text-amber-400">Desativada</span>}
                      {u.accountStatus === 'archived' && <span className="text-slate-400">Arquivada</span>}
                      {u.accountStatus === 'deleted' && <span className="text-rose-400">Excluída</span>}
                      {u.accountStatus === 'not_created' && <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-2.5 py-2">
                      {u.enrolledInTournament ? (
                        <span className="text-sky-300 font-bold">
                          {u.isCurrentlyInTournament ? 'Inscrita (ativa)' : 'Inscrita no lote'}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-slate-400">{u.reasonMessage || 'OK'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Audit Trail */}
        <div className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700 space-y-1.5">
          <div className="text-[11px] font-black text-slate-300 uppercase tracking-wider">
            Trilha de Auditoria do Lote
          </div>
          <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-slate-400">
            {selectedBatch.auditTrail.map((ev, idx) => (
              <div key={idx} className="flex gap-2">
                <span className="font-mono text-slate-500 shrink-0">
                  {new Date(ev.at).toLocaleString('pt-BR')}
                </span>
                <span className="text-amber-300 font-bold shrink-0">@{ev.actorUsername}</span>
                <span className="text-slate-300">{ev.details}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Impact Analysis Confirmation Modal (no window.confirm) */}
        {impactReport && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border-2 border-amber-500 p-5 rounded-3xl max-w-lg w-full space-y-3 shadow-2xl">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" /> Análise de Impacto ({impactReport.requestedAction})
              </h4>

              <div className="max-h-56 overflow-y-auto space-y-2">
                {impactReport.users.map((u) => (
                  <div
                    key={u.userId}
                    className={`p-2.5 rounded-xl border text-xs ${
                      !u.canManageInBatch || (impactReport.requestedAction === 'delete' && !u.canDelete)
                        ? 'bg-rose-950/40 border-rose-500/50'
                        : 'bg-slate-800/80 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-white">
                        {u.displayName} (@{u.username})
                      </span>
                      <span className="text-[10px] font-bold uppercase text-slate-300">
                        {u.accountStatus}
                      </span>
                    </div>
                    {u.dependencies.length > 0 ? (
                      <ul className="mt-1 list-disc list-inside text-[11px] text-amber-300 space-y-0.5">
                        {u.dependencies.map((d, idx) => (
                          <li key={idx}>{d}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-1 text-[11px] text-emerald-300">
                        Sem dependências registradas.
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {(impactReport.requestedAction === 'disable' || impactReport.requestedAction === 'archive') && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Motivo (opcional):
                  </label>
                  <input
                    type="text"
                    value={manageReason}
                    onChange={(e) => setManageReason(e.target.value)}
                    placeholder="Ex: Encerramento do evento de maio"
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-600 text-white text-xs"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={isExecutingManage}
                  onClick={() => setImpactReport(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={
                    isExecutingManage ||
                    !impactReport.users.some(
                      (u) =>
                        u.canManageInBatch &&
                        (impactReport.requestedAction !== 'delete' || u.canDelete)
                    )
                  }
                  onClick={executeManagedAction}
                  className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer disabled:opacity-40"
                >
                  {isExecutingManage ? 'Aplicando...' : 'Confirmar Ação Elegível'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters Bar */}
      <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-2xl flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadBatches()}
            placeholder="Buscar lote por nome, tag ou ID..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs"
          />
        </div>

        <select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value as any)}
          className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs font-bold"
        >
          <option value="all">Todos os modos</option>
          <option value="create_only">Apenas Cadastro</option>
          <option value="create_and_enroll">Cadastro + Torneio</option>
          <option value="enroll_existing">Inscrever Existentes</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-xs font-bold"
        >
          <option value="all">Todos os status</option>
          <option value="completed">Concluído</option>
          <option value="partial_success">Parcial</option>
          <option value="reconciled_partial">Reconciliado Parcial</option>
          <option value="failed">Falhou</option>
        </select>

        <button
          type="button"
          onClick={loadBatches}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Buscar
        </button>
      </div>

      {batches.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-slate-800/40 border border-slate-700 text-slate-400 text-xs font-bold">
          <History className="w-8 h-8 mx-auto mb-2 text-slate-500" />
          Nenhum lote de importação encontrado.
        </div>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <div
              key={b.importBatchId}
              className="p-3.5 rounded-2xl bg-slate-800/70 border border-slate-700 hover:border-slate-500 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black text-white truncate">{b.name}</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[10px] font-bold">
                    {b.importTag}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-600 text-[10px] font-bold">
                    {MODE_LABELS[b.mode]}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {new Date(b.createdAt).toLocaleString('pt-BR')} · por <strong>@{b.createdByUsername}</strong>
                  {b.tournamentName && <> · Torneio: <strong className="text-sky-300">{b.tournamentName}</strong></>}
                </div>
                <div className="flex flex-wrap gap-3 text-[11px] font-bold">
                  <span className="text-emerald-400">Criadas: {b.summary.totalCreated}</span>
                  <span className="text-sky-400">Inscritas: {b.summary.totalEnrolled}</span>
                  <span className="text-amber-400">Ignoradas: {b.summary.totalSkipped}</span>
                  <span className="text-rose-400">Rejeitadas: {b.summary.totalRejected + b.summary.totalFailed}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openBatchDetail(b.importBatchId)}
                className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-black text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" /> Abrir Lote
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
