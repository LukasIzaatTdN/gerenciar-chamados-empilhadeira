import { useEffect, useMemo, useState } from "react";
import type {
  Manutencao,
  ManutencaoPrioridade,
  ManutencaoStatus,
  ManutencaoTipo,
  NovaManutencaoInput,
} from "../types/manutencao";
import {
  MANUTENCAO_PRIORIDADE_OPTIONS,
  MANUTENCAO_STATUS_OPTIONS,
  MANUTENCAO_TIPO_OPTIONS,
} from "../types/manutencao";
import type { Empilhadeira } from "../types/empilhadeira";
import type { Supermercado } from "../types/supermercado";

interface ManutencoesAdminProps {
  manutencoes: Manutencao[];
  empilhadeiras: Empilhadeira[];
  supermercados: Supermercado[];
  isAdminGeral: boolean;
  canCreate: boolean;
  canEdit: boolean;
  currentSupermercadoId: string | null;
  currentSupermercadoNome: string;
  createdByName: string;
  onCreate: (input: NovaManutencaoInput) => Promise<void>;
  onUpdate: (id: string, input: Partial<NovaManutencaoInput>) => Promise<void>;
  onVoltar: () => void;
}

type FormState = {
  empilhadeira_id: string;
  tipo: ManutencaoTipo;
  descricao: string;
  prioridade: ManutencaoPrioridade;
  status: ManutencaoStatus;
  responsavel: string;
  data_abertura: string;
  data_prevista: string;
  data_conclusao: string;
  observacoes: string;
};

const EMPTY_FORM: FormState = {
  empilhadeira_id: "",
  tipo: "Preventiva",
  descricao: "",
  prioridade: "Media",
  status: "Aberta",
  responsavel: "",
  data_abertura: new Date().toISOString().slice(0, 10),
  data_prevista: "",
  data_conclusao: "",
  observacoes: "",
};

function formatDate(date: string | null) {
  if (!date) return "Não definida";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getStatusClassName(status: ManutencaoStatus) {
  if (status === "Concluida") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Em andamento") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "Cancelada") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function getPrioridadeClassName(prioridade: ManutencaoPrioridade) {
  if (prioridade === "Critica") return "border-rose-200 bg-rose-50 text-rose-700";
  if (prioridade === "Alta") return "border-orange-200 bg-orange-50 text-orange-700";
  if (prioridade === "Media") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export default function ManutencoesAdmin({
  manutencoes,
  empilhadeiras,
  supermercados,
  isAdminGeral,
  canCreate,
  canEdit,
  currentSupermercadoId,
  currentSupermercadoNome,
  createdByName,
  onCreate,
  onUpdate,
  onVoltar,
}: ManutencoesAdminProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchEmpilhadeiraId, setSearchEmpilhadeiraId] = useState<string>("todos");
  const [typeFilter, setTypeFilter] = useState<"Todos" | ManutencaoTipo>("Todos");
  const [priorityFilter, setPriorityFilter] = useState<"Todos" | ManutencaoPrioridade>("Todos");
  const [statusFilter, setStatusFilter] = useState<"Todos" | ManutencaoStatus>("Todos");
  const [unitFilter, setUnitFilter] = useState<string>(isAdminGeral ? "todos" : currentSupermercadoId ?? "todos");

  const supermercadosAtivos = useMemo(
    () => supermercados.filter((item) => item.status === "Ativo"),
    [supermercados]
  );
  const supermercadoById = useMemo(
    () => new Map(supermercados.map((item) => [item.id, item])),
    [supermercados]
  );
  const empilhadeiraById = useMemo(
    () => new Map(empilhadeiras.map((item) => [item.id, item])),
    [empilhadeiras]
  );

  const effectiveUnitFilter = isAdminGeral ? unitFilter : currentSupermercadoId ?? "todos";
  const availableEmpilhadeiras = useMemo(() => {
    return empilhadeiras
      .filter((item) => (effectiveUnitFilter === "todos" ? true : item.supermercado_id === effectiveUnitFilter))
      .sort((a, b) => a.identificacao.localeCompare(b.identificacao));
  }, [effectiveUnitFilter, empilhadeiras]);

  const filteredManutencoes = useMemo(() => {
    return manutencoes
      .filter((item) => (effectiveUnitFilter === "todos" ? true : item.supermercado_id === effectiveUnitFilter))
      .filter((item) => (searchEmpilhadeiraId === "todos" ? true : item.empilhadeira_id === searchEmpilhadeiraId))
      .filter((item) => (typeFilter === "Todos" ? true : item.tipo === typeFilter))
      .filter((item) => (priorityFilter === "Todos" ? true : item.prioridade === priorityFilter))
      .filter((item) => (statusFilter === "Todos" ? true : item.status === statusFilter))
      .sort((a, b) => new Date(b.data_abertura).getTime() - new Date(a.data_abertura).getTime());
  }, [effectiveUnitFilter, manutencoes, priorityFilter, searchEmpilhadeiraId, statusFilter, typeFilter]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  useEffect(() => {
    if (isAdminGeral) return;
    setUnitFilter(currentSupermercadoId ?? "todos");
  }, [currentSupermercadoId, isAdminGeral]);

  useEffect(() => {
    if (editingId) return;
    if (effectiveUnitFilter !== "todos") {
      setForm((prev) => {
        const selectedEmpilhadeira = empilhadeiraById.get(prev.empilhadeira_id);
        if (!selectedEmpilhadeira) return prev;
        if (selectedEmpilhadeira.supermercado_id === effectiveUnitFilter) return prev;
        return { ...prev, empilhadeira_id: "" };
      });
    }
  }, [editingId, effectiveUnitFilter, empilhadeiraById]);

  function validateForm() {
    if (!form.empilhadeira_id) return "Selecione a empilhadeira da manutenção.";
    if (!form.descricao.trim()) return "Informe a descrição da manutenção.";
    if (!form.data_abertura) return "Informe a data de abertura.";

    const empilhadeira = empilhadeiraById.get(form.empilhadeira_id);
    if (!empilhadeira) return "Empilhadeira não encontrada.";
    if (!isAdminGeral && currentSupermercadoId !== empilhadeira.supermercado_id) {
      return "Você só pode registrar manutenções da sua unidade.";
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validation = validateForm();
    if (validation) {
      setError(validation);
      return;
    }

    const empilhadeira = empilhadeiraById.get(form.empilhadeira_id);
    if (!empilhadeira) {
      setError("Empilhadeira não encontrada para abertura da manutenção.");
      return;
    }

    const payload: NovaManutencaoInput = {
      supermercado_id: empilhadeira.supermercado_id,
      empilhadeira_id: empilhadeira.id,
      tipo: form.tipo,
      descricao: form.descricao.trim(),
      prioridade: form.prioridade,
      status: form.status,
      responsavel: form.responsavel.trim() || null,
      data_abertura: new Date(form.data_abertura).toISOString(),
      data_prevista: form.data_prevista ? new Date(form.data_prevista).toISOString() : null,
      data_conclusao: form.data_conclusao ? new Date(form.data_conclusao).toISOString() : null,
      criado_por: createdByName,
      observacoes: form.observacoes.trim() || null,
    };

    try {
      setIsSubmitting(true);
      setError(null);
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
          : "Não foi possível salvar a manutenção."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function beginEdit(item: Manutencao) {
    setEditingId(item.id);
    setForm({
      empilhadeira_id: item.empilhadeira_id,
      tipo: item.tipo,
      descricao: item.descricao,
      prioridade: item.prioridade,
      status: item.status,
      responsavel: item.responsavel ?? "",
      data_abertura: item.data_abertura.slice(0, 10),
      data_prevista: item.data_prevista ? item.data_prevista.slice(0, 10) : "",
      data_conclusao: item.data_conclusao ? item.data_conclusao.slice(0, 10) : "",
      observacoes: item.observacoes ?? "",
    });
    setError(null);
  }

  async function handleQuickStatusChange(id: string, nextStatus: ManutencaoStatus) {
    try {
      setError(null);
      await onUpdate(id, {
        status: nextStatus,
        data_conclusao: nextStatus === "Concluida" ? new Date().toISOString() : null,
      });
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Não foi possível atualizar o status da manutenção."
      );
    }
  }

  return (
    <div className="min-h-screen bg-transparent">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 rounded-[30px] border border-white/70 bg-white/75 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Controle técnico multiunidade
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
              Manutenções
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Acompanhe manutenções preventivas e corretivas por unidade, mantendo o isolamento operacional entre supermercados.
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

        {canCreate && (
          <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
              {editingId ? "Editar manutenção" : "Nova manutenção"}
            </h2>
            <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
              {isAdminGeral && (
                <select
                  value={unitFilter}
                  onChange={(event) => {
                    setUnitFilter(event.target.value);
                    setError(null);
                  }}
                  className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <option value="todos">Todas as unidades</option>
                  {supermercadosAtivos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome} ({item.codigo})
                    </option>
                  ))}
                </select>
              )}
              {!isAdminGeral && (
                <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  Unidade vinculada automaticamente: {currentSupermercadoNome}
                </div>
              )}
              <select
                value={form.empilhadeira_id}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, empilhadeira_id: event.target.value }));
                  setError(null);
                }}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Selecione a empilhadeira</option>
                {availableEmpilhadeiras.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.identificacao} · {item.modelo}
                  </option>
                ))}
              </select>
              <select
                value={form.tipo}
                onChange={(event) => setForm((prev) => ({ ...prev, tipo: event.target.value as ManutencaoTipo }))}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                {MANUTENCAO_TIPO_OPTIONS.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
              <select
                value={form.prioridade}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, prioridade: event.target.value as ManutencaoPrioridade }))
                }
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                {MANUTENCAO_PRIORIDADE_OPTIONS.map((prioridade) => (
                  <option key={prioridade} value={prioridade}>
                    Prioridade {prioridade}
                  </option>
                ))}
              </select>
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as ManutencaoStatus }))}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                {MANUTENCAO_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    Status {status}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={form.responsavel}
                onChange={(event) => setForm((prev) => ({ ...prev, responsavel: event.target.value }))}
                placeholder="Responsável técnico"
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <input
                type="date"
                value={form.data_abertura}
                onChange={(event) => setForm((prev) => ({ ...prev, data_abertura: event.target.value }))}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <input
                type="date"
                value={form.data_prevista}
                onChange={(event) => setForm((prev) => ({ ...prev, data_prevista: event.target.value }))}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <input
                type="date"
                value={form.data_conclusao}
                onChange={(event) => setForm((prev) => ({ ...prev, data_conclusao: event.target.value }))}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <textarea
                value={form.descricao}
                onChange={(event) => setForm((prev) => ({ ...prev, descricao: event.target.value }))}
                placeholder="Descreva a necessidade técnica, falha ou revisão programada"
                rows={4}
                className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />
              <textarea
                value={form.observacoes}
                onChange={(event) => setForm((prev) => ({ ...prev, observacoes: event.target.value }))}
                placeholder="Observações adicionais"
                rows={3}
                className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              />

              {error && (
                <div className="md:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {error}
                </div>
              )}

              <div className="md:col-span-2 flex flex-wrap justify-end gap-3">
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="touch-target rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancelar edição
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="touch-target rounded-2xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Salvando..." : editingId ? "Salvar manutenção" : "Abrir manutenção"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                Filtros técnicos
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Refine por unidade, empilhadeira, tipo, prioridade e status.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-5">
              {isAdminGeral && (
                <select
                  value={unitFilter}
                  onChange={(event) => setUnitFilter(event.target.value)}
                  className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <option value="todos">Todas as unidades</option>
                  {supermercadosAtivos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome} ({item.codigo})
                    </option>
                  ))}
                </select>
              )}
              <select
                value={searchEmpilhadeiraId}
                onChange={(event) => setSearchEmpilhadeiraId(event.target.value)}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <option value="todos">Todas as empilhadeiras</option>
                {availableEmpilhadeiras.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.identificacao}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as "Todos" | ManutencaoTipo)}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <option value="Todos">Todos os tipos</option>
                {MANUTENCAO_TIPO_OPTIONS.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
              <select
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(event.target.value as "Todos" | ManutencaoPrioridade)
                }
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <option value="Todos">Todas as prioridades</option>
                {MANUTENCAO_PRIORIDADE_OPTIONS.map((prioridade) => (
                  <option key={prioridade} value={prioridade}>
                    {prioridade}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "Todos" | ManutencaoStatus)}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <option value="Todos">Todos os status</option>
                {MANUTENCAO_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {filteredManutencoes.map((item) => {
            const empilhadeira = empilhadeiraById.get(item.empilhadeira_id);
            const supermercado = supermercadoById.get(item.supermercado_id);

            return (
              <article
                key={item.id}
                className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        {empilhadeira?.identificacao ?? "Empilhadeira não encontrada"}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPrioridadeClassName(item.prioridade)}`}>
                        {item.prioridade}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClassName(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    <div>
                      <h2 className="text-xl font-black tracking-tight text-slate-900">
                        {item.tipo}
                      </h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        {item.descricao}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          Unidade
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-800">
                          {supermercado ? `${supermercado.nome} (${supermercado.codigo})` : item.supermercado_id}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          Data de abertura
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-800">
                          {formatDate(item.data_abertura)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          Data prevista
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-800">
                          {formatDate(item.data_prevista)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          Responsável
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-800">
                          {item.responsavel || "Não definido"}
                        </p>
                      </div>
                    </div>
                    {(item.observacoes || item.criado_por) && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <p>
                          <span className="font-semibold text-slate-800">Criado por:</span> {item.criado_por}
                        </p>
                        {item.observacoes && (
                          <p className="mt-2">
                            <span className="font-semibold text-slate-800">Observações:</span> {item.observacoes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 xl:min-w-[240px]">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => beginEdit(item)}
                          className="touch-target rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Editar manutenção
                        </button>
                        <select
                          value={item.status}
                          onChange={(event) =>
                            void handleQuickStatusChange(item.id, event.target.value as ManutencaoStatus)
                          }
                          className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                        >
                          {MANUTENCAO_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              Status {status}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {filteredManutencoes.length === 0 && (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/75 px-6 py-12 text-center shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                Sem manutenções no recorte
              </p>
              <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">
                Nenhuma manutenção encontrada
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Ajuste os filtros ou abra uma nova manutenção para a unidade atual.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
