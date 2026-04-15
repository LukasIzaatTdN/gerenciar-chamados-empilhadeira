import { useEffect, useMemo, useState } from "react";
import type { Chamado } from "../types/chamado";
import type { ChecklistEmpilhadeira } from "../types/checklistEmpilhadeira";
import type { Manutencao } from "../types/manutencao";
import type { Supermercado } from "../types/supermercado";
import {
  EMPILHADEIRA_STATUS_OPTIONS,
  type Empilhadeira,
  type EmpilhadeiraStatus,
} from "../types/empilhadeira";
import { getEmpilhadeiraStatusEfetivo } from "../utils/empilhadeiraStatus";
import { isChecklistEmpilhadeiraAprovado } from "../utils/checklistEmpilhadeira";

interface EmpilhadeirasAdminProps {
  empilhadeiras: Empilhadeira[];
  chamados: Chamado[];
  checklists: ChecklistEmpilhadeira[];
  manutencoes: Manutencao[];
  supermercados: Supermercado[];
  isAdminGeral: boolean;
  canManage: boolean;
  canManageStatus: boolean;
  currentSupermercadoId: string | null;
  currentSupermercadoNome: string;
  onCreate: (input: {
    empresa_id: string;
    supermercado_id: string;
    identificacao: string;
    modelo: string;
    numero_interno: string;
    status: EmpilhadeiraStatus;
    observacoes: string;
  }) => Promise<void>;
  onUpdate: (
    id: string,
    input: {
      empresa_id: string;
      supermercado_id: string;
      identificacao: string;
      modelo: string;
      numero_interno: string;
      status: EmpilhadeiraStatus;
      observacoes: string;
    }
  ) => Promise<void>;
  onUpdateStatus?: (id: string, status: EmpilhadeiraStatus) => Promise<void>;
  onVoltar: () => void;
}

type FormState = {
  empresa_id: string;
  supermercado_id: string;
  identificacao: string;
  modelo: string;
  numero_interno: string;
  status: EmpilhadeiraStatus;
  observacoes: string;
};

const EMPTY_FORM: FormState = {
  empresa_id: "",
  supermercado_id: "",
  identificacao: "",
  modelo: "",
  numero_interno: "",
  status: "Disponível",
  observacoes: "",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EmpilhadeirasAdmin({
  empilhadeiras,
  chamados,
  checklists,
  manutencoes,
  supermercados,
  isAdminGeral,
  canManage,
  canManageStatus,
  currentSupermercadoId,
  currentSupermercadoNome,
  onCreate,
  onUpdate,
  onUpdateStatus,
  onVoltar,
}: EmpilhadeirasAdminProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    supermercado_id: !isAdminGeral ? currentSupermercadoId ?? "" : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Todos" | EmpilhadeiraStatus>("Todos");
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);

  const isEditing = editingId !== null;
  const supermercadosAtivos = useMemo(
    () => supermercados.filter((item) => item.status === "Ativo"),
    [supermercados]
  );
  const supermercadoSelecionado = useMemo(
    () => supermercados.find((item) => item.id === form.supermercado_id) ?? null,
    [form.supermercado_id, supermercados]
  );
  const empresaIdDerivadaDaUnidade = supermercadoSelecionado?.empresa_id ?? "";
  const ordenadas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return [...empilhadeiras]
      .filter((item) => {
        const statusEfetivo = getEmpilhadeiraStatusEfetivo(item, chamados, checklists, manutencoes);
        return statusFilter === "Todos" ? true : statusEfetivo === statusFilter;
      })
      .filter((item) => {
        if (!term) return true;
        return (
          item.identificacao.toLowerCase().includes(term) ||
          item.modelo.toLowerCase().includes(term) ||
          item.numero_interno.toLowerCase().includes(term)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime()
      );
  }, [chamados, checklists, empilhadeiras, manutencoes, searchTerm, statusFilter]);
  const checklistsRecentes = useMemo(
    () => checklists.slice(0, 8),
    [checklists]
  );
  const manutencoesRecentes = useMemo(
    () => manutencoes.slice(0, 8),
    [manutencoes]
  );
  const indicadoresTecnicos = useMemo(() => {
    const statusMap = ordenadas.map((item) =>
      getEmpilhadeiraStatusEfetivo(item, chamados, checklists, manutencoes)
    );
    const hoje = new Date().toDateString();
    const checklistHoje = new Set(
      checklists
        .filter((item) => new Date(item.criado_em).toDateString() === hoje)
        .map((item) => item.empilhadeira_id)
    );

    return {
      total: ordenadas.length,
      disponiveis: statusMap.filter((status) => status === "Disponível").length,
      emUso: statusMap.filter((status) => status === "Em uso").length,
      atencao: statusMap.filter((status) => status === "Necessita atenção").length,
      manutencaoAtiva: manutencoes.filter(
        (item) => item.status === "Aberta" || item.status === "Em andamento"
      ).length,
      checklistPendente: ordenadas.filter((item) => !checklistHoje.has(item.id)).length,
    };
  }, [chamados, checklists, manutencoes, ordenadas]);

  function resetForm() {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      empresa_id: !isAdminGeral
        ? supermercados.find((item) => item.id === (currentSupermercadoId ?? ""))?.empresa_id ?? ""
        : "",
      supermercado_id: !isAdminGeral ? currentSupermercadoId ?? "" : "",
    });
    setError(null);
  }

  useEffect(() => {
    if (isEditing) return;
    if (!isAdminGeral) {
      setForm((prev) => ({
        ...prev,
        empresa_id:
          supermercados.find((item) => item.id === (currentSupermercadoId ?? ""))?.empresa_id ?? "",
        supermercado_id: currentSupermercadoId ?? "",
      }));
    }
  }, [currentSupermercadoId, isAdminGeral, isEditing, supermercados]);

  useEffect(() => {
    if (!form.supermercado_id) return;
    if (!empresaIdDerivadaDaUnidade) return;

    setForm((prev) =>
      prev.empresa_id === empresaIdDerivadaDaUnidade
        ? prev
        : { ...prev, empresa_id: empresaIdDerivadaDaUnidade }
    );
  }, [empresaIdDerivadaDaUnidade, form.supermercado_id]);

  function validateForm() {
    if (!form.supermercado_id) return "Selecione a unidade vinculada.";
    if (!empresaIdDerivadaDaUnidade && !form.empresa_id.trim()) {
      return "Não foi possível identificar a empresa da unidade selecionada.";
    }
    if (!form.identificacao.trim()) return "Informe a identificação do equipamento.";
    if (!form.modelo.trim()) return "Informe o modelo da empilhadeira.";
    if (!form.numero_interno.trim()) return "Informe o número interno do equipamento.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateForm();
    if (validation) {
      setError(validation);
      return;
    }

    const payload = {
      empresa_id: (empresaIdDerivadaDaUnidade || form.empresa_id).trim(),
      supermercado_id: form.supermercado_id,
      identificacao: form.identificacao.trim(),
      modelo: form.modelo.trim(),
      numero_interno: form.numero_interno.trim(),
      status: form.status,
      observacoes: form.observacoes.trim(),
    };

    try {
      setIsSubmitting(true);
      if (editingId) {
        await onUpdate(editingId, payload);
      } else {
        await onCreate(payload);
      }
      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível salvar a empilhadeira."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function beginEdit(empilhadeira: Empilhadeira) {
    setEditingId(empilhadeira.id);
    setForm({
      empresa_id: empilhadeira.empresa_id,
      supermercado_id: empilhadeira.supermercado_id,
      identificacao: empilhadeira.identificacao,
      modelo: empilhadeira.modelo,
      numero_interno: empilhadeira.numero_interno,
      status: empilhadeira.status,
      observacoes: empilhadeira.observacoes,
    });
    setError(null);
  }

  async function handleStatusUpdate(id: string, status: EmpilhadeiraStatus) {
    if (!onUpdateStatus) return;

    try {
      setPendingStatusId(id);
      setError(null);
      await onUpdateStatus(id, status);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Não foi possível atualizar o status da empilhadeira."
      );
    } finally {
      setPendingStatusId(null);
    }
  }

  return (
    <div className="min-h-screen bg-transparent">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 rounded-[30px] border border-white/70 bg-white/75 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Administração de ativos
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
              Empilhadeiras
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Controle dos equipamentos da unidade atual, mantendo separação operacional entre supermercados.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
              {isAdminGeral ? `Recorte atual: ${currentSupermercadoNome}` : `Unidade atual: ${currentSupermercadoNome}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onVoltar}
            className="touch-target inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all hover:bg-slate-50"
          >
            <span>←</span>
            Voltar ao painel
          </button>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {[
            {
              label: "Ativos no recorte",
              value: indicadoresTecnicos.total,
              hint: "máquinas monitoradas",
              tone: "border-slate-200 bg-white text-slate-900",
            },
            {
              label: "Disponíveis",
              value: indicadoresTecnicos.disponiveis,
              hint: "prontas para operação",
              tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
            },
            {
              label: "Em uso",
              value: indicadoresTecnicos.emUso,
              hint: "atendimentos ativos",
              tone: "border-blue-200 bg-blue-50 text-blue-800",
            },
            {
              label: "Necessitam atenção",
              value: indicadoresTecnicos.atencao,
              hint: "checklist ou falha crítica",
              tone: "border-rose-200 bg-rose-50 text-rose-800",
            },
            {
              label: "Manutenções ativas",
              value: indicadoresTecnicos.manutencaoAtiva,
              hint: "abertas ou em andamento",
              tone: "border-amber-200 bg-amber-50 text-amber-800",
            },
            {
              label: "Checklist pendente",
              value: indicadoresTecnicos.checklistPendente,
              hint: "sem inspeção hoje",
              tone: "border-violet-200 bg-violet-50 text-violet-800",
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`rounded-[24px] border px-4 py-4 shadow-[0_12px_24px_rgba(15,23,42,0.05)] ${card.tone}`}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-80">
                {card.label}
              </p>
              <p className="mt-3 text-3xl font-black tracking-tight">{card.value}</p>
              <p className="mt-2 text-xs font-medium opacity-80">{card.hint}</p>
            </div>
          ))}
        </div>

        {canManage && (
          <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
              {isEditing ? "Editar empilhadeira" : "Nova empilhadeira"}
            </h2>
            <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                type="text"
                value={empresaIdDerivadaDaUnidade || form.empresa_id}
                readOnly
                placeholder="Empresa vinculada pela unidade"
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              {isAdminGeral ? (
                <select
                  value={form.supermercado_id}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, supermercado_id: e.target.value }));
                    setError(null);
                  }}
                  className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">Selecione a unidade</option>
                  {supermercadosAtivos.map((supermercado) => (
                    <option key={supermercado.id} value={supermercado.id}>
                      {supermercado.nome} ({supermercado.codigo})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  Unidade vinculada automaticamente: {currentSupermercadoNome}
                </div>
              )}
              <input
                type="text"
                value={form.identificacao}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, identificacao: e.target.value }));
                  setError(null);
                }}
                placeholder="Ex.: Empilhadeira 01"
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <input
                type="text"
                value={form.modelo}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, modelo: e.target.value }));
                  setError(null);
                }}
                placeholder="Modelo"
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <input
                type="text"
                value={form.numero_interno}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, numero_interno: e.target.value }));
                  setError(null);
                }}
                placeholder="Número interno"
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <select
                value={form.status}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    status: e.target.value as EmpilhadeiraStatus,
                  }));
                  setError(null);
                }}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                {EMPILHADEIRA_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <textarea
                value={form.observacoes}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, observacoes: e.target.value }));
                  setError(null);
                }}
                placeholder="Observações sobre o equipamento"
                rows={4}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 md:col-span-2"
              />
              <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="touch-target rounded-2xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,23,42,0.2)]"
                >
                  {isSubmitting ? "Salvando..." : isEditing ? "Salvar alteração" : "Cadastrar empilhadeira"}
                </button>
                {isEditing && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700"
                  >
                    Cancelar edição
                  </button>
                )}
              </div>
              {error && (
                <p className="text-sm font-medium text-red-600 md:col-span-2">{error}</p>
              )}
            </form>
          </div>
        )}

        <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por identificação, modelo ou número interno"
              className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "Todos" | EmpilhadeiraStatus)}
              className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              <option value="Todos">Todos os status</option>
              {EMPILHADEIRA_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            {canManage ? "Empilhadeiras cadastradas" : "Empilhadeiras da unidade"}
          </h2>
          <div className="space-y-3">
            {ordenadas.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nenhuma empilhadeira cadastrada.
              </p>
            ) : (
              ordenadas.map((empilhadeira) => {
                const statusEfetivo = getEmpilhadeiraStatusEfetivo(empilhadeira, chamados, checklists, manutencoes);
                const statusAutomatico = statusEfetivo !== empilhadeira.status;
                const ultimaFalhaChecklist = checklists.find(
                  (item) => item.empilhadeira_id === empilhadeira.id && item.reprovado
                );
                const manutencoesAtivas = manutencoes.filter(
                  (item) =>
                    item.empilhadeira_id === empilhadeira.id &&
                    (item.status === "Aberta" || item.status === "Em andamento")
                );
                const historicoTecnico = [
                  ...checklists
                    .filter((item) => item.empilhadeira_id === empilhadeira.id)
                    .slice(0, 4)
                    .map((item) => ({
                      id: `checklist-${item.id}`,
                      date: item.criado_em,
                      title: item.reprovado ? "Checklist reprovado" : "Checklist aprovado",
                      description: item.ocorrencia_tecnica ?? item.observacoes ?? item.operador_nome,
                      tone: item.reprovado
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700",
                    })),
                  ...manutencoes
                    .filter((item) => item.empilhadeira_id === empilhadeira.id)
                    .slice(0, 4)
                    .map((item) => ({
                      id: `manutencao-${item.id}`,
                      date: item.data_abertura,
                      title: `${item.tipo} · ${item.status}`,
                      description: item.descricao,
                      tone: "border-amber-200 bg-amber-50 text-amber-800",
                    })),
                  ...chamados
                    .filter((item) => item.empilhadeira_id === empilhadeira.id)
                    .slice(0, 4)
                    .map((item) => ({
                      id: `chamado-${item.id}`,
                      date: item.criado_em,
                      title: `Uso operacional · ${item.status}`,
                      description: `${item.tipo_servico} em ${item.setor}`,
                      tone: "border-blue-200 bg-blue-50 text-blue-800",
                    })),
                ]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 5);

                return (
                  <div
                    key={empilhadeira.id}
                    className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div className="grid gap-3 md:grid-cols-[0.95fr_0.95fr_0.8fr_1.1fr_0.75fr_0.75fr_auto]">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Identificação</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{empilhadeira.identificacao}</p>
                        <p className="mt-1 text-xs text-slate-500">{empilhadeira.empresa_id}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Unidade</p>
                        <p className="mt-1 text-sm text-slate-700">
                          {supermercados.find((item) => item.id === empilhadeira.supermercado_id)?.nome ??
                            "Unidade não encontrada"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Modelo</p>
                        <p className="mt-1 text-sm text-slate-700">{empilhadeira.modelo}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Número interno</p>
                        <p className="mt-1 text-sm text-slate-700">{empilhadeira.numero_interno}</p>
                        {empilhadeira.observacoes && (
                          <p className="mt-2 text-xs leading-5 text-slate-500">{empilhadeira.observacoes}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Status</p>
                        <span className="mt-1 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {statusEfetivo}
                        </span>
                        {statusAutomatico && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Ajuste automático com base no atendimento atual.
                          </p>
                        )}
                        {canManageStatus && onUpdateStatus ? (
                          <select
                            value={empilhadeira.status}
                            onChange={(e) =>
                              void handleStatusUpdate(
                                empilhadeira.id,
                                e.target.value as EmpilhadeiraStatus
                              )
                            }
                            disabled={pendingStatusId === empilhadeira.id}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 focus:border-[#0f3d75] focus:outline-none focus:ring-2 focus:ring-blue-100"
                          >
                            {EMPILHADEIRA_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Base manual: {empilhadeira.status}
                          </p>
                        )}
                        {ultimaFalhaChecklist && (
                          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                            <p className="font-bold uppercase tracking-[0.12em]">Checklist reprovado</p>
                            <p className="mt-1">{ultimaFalhaChecklist.ocorrencia_tecnica ?? "Falha operacional reportada no checklist."}</p>
                          </div>
                        )}
                        {manutencoesAtivas.length > 0 && (
                          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                            <p className="font-bold uppercase tracking-[0.12em]">Histórico técnico ativo</p>
                            <p className="mt-1">
                              {manutencoesAtivas.length} manutenção(ões) aberta(s) para esta empilhadeira.
                            </p>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Última atualização</p>
                        <p className="mt-1 text-sm text-slate-700">{formatDate(empilhadeira.atualizado_em)}</p>
                      </div>
                      <div className="flex items-center gap-2 md:justify-end">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => beginEdit(empilhadeira)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 rounded-[22px] border border-slate-200 bg-white px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            Histórico técnico da máquina
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Últimos eventos de checklist, manutenção e uso operacional desta empilhadeira.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {historicoTecnico.length === 0 ? (
                          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                            Nenhum evento técnico registrado para esta empilhadeira.
                          </p>
                        ) : (
                          historicoTecnico.map((evento) => (
                            <div
                              key={evento.id}
                              className={`rounded-2xl border px-4 py-3 ${evento.tone}`}
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm font-semibold">{evento.title}</p>
                                <p className="text-xs font-medium opacity-80">
                                  {formatDateTime(evento.date)}
                                </p>
                              </div>
                              <p className="mt-2 text-sm opacity-90">
                                {evento.description || "Sem detalhes adicionais."}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            Checklists recentes da unidade
          </h2>
          <div className="space-y-3">
            {checklistsRecentes.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nenhum checklist registrado neste recorte.
              </p>
            ) : (
              checklistsRecentes.map((checklist) => {
                const equipamento = empilhadeiras.find((item) => item.id === checklist.empilhadeira_id);
                const aprovado = isChecklistEmpilhadeiraAprovado(checklist);

                return (
                  <div
                    key={checklist.id}
                    className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1fr_0.9fr_0.8fr_0.8fr]"
                  >
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Empilhadeira</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {equipamento?.identificacao ?? checklist.empilhadeira_id}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{checklist.operador_nome}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Data</p>
                      <p className="mt-1 text-sm text-slate-700">{checklist.data}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Resultado</p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          aprovado ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {aprovado ? "Aprovado" : "Necessita atenção"}
                      </span>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Observações</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {checklist.observacoes ?? "Sem observações"}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            Manutenções recentes da unidade
          </h2>
          <div className="space-y-3">
            {manutencoesRecentes.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nenhuma manutenção registrada neste recorte.
              </p>
            ) : (
              manutencoesRecentes.map((manutencao) => {
                const equipamento = empilhadeiras.find((item) => item.id === manutencao.empilhadeira_id);

                return (
                  <div
                    key={manutencao.id}
                    className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1fr_0.8fr_0.7fr_0.8fr_1fr]"
                  >
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Empilhadeira</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {equipamento?.identificacao ?? manutencao.empilhadeira_id}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{manutencao.descricao}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Tipo</p>
                      <p className="mt-1 text-sm text-slate-700">{manutencao.tipo}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Prioridade</p>
                      <p className="mt-1 text-sm text-slate-700">{manutencao.prioridade}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Status</p>
                      <p className="mt-1 text-sm text-slate-700">{manutencao.status}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Abertura</p>
                      <p className="mt-1 text-sm text-slate-700">{formatDate(manutencao.data_abertura)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Criado por {manutencao.criado_por}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
