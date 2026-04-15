import { useMemo, useState } from "react";
import type { Empresa, PlanoCiclo, PlanoStatus } from "../types/empresa";

interface EmpresasAdminProps {
  empresas: Empresa[];
  onCreate: (input: {
    nome: string;
    codigo: string;
    cnpj?: string;
    plano_codigo: string;
    plano_nome: string;
    plano_status: PlanoStatus;
    plano_ciclo: PlanoCiclo;
    max_usuarios?: number | null;
    max_unidades?: number | null;
    contrato_inicio?: string | null;
    contrato_fim?: string | null;
  }) => Promise<void>;
  onUpdate: (
    id: string,
    input: {
      nome: string;
      codigo: string;
      cnpj?: string;
      plano_codigo: string;
      plano_nome: string;
      plano_status: PlanoStatus;
      plano_ciclo: PlanoCiclo;
      max_usuarios?: number | null;
      max_unidades?: number | null;
      contrato_inicio?: string | null;
      contrato_fim?: string | null;
    }
  ) => Promise<void>;
  onToggleStatus: (id: string) => Promise<void>;
  onVoltar: () => void;
}

type FormState = {
  nome: string;
  codigo: string;
  cnpj: string;
  plano_codigo: string;
  plano_nome: string;
  plano_status: PlanoStatus;
  plano_ciclo: PlanoCiclo;
  max_usuarios: string;
  max_unidades: string;
  contrato_inicio: string;
  contrato_fim: string;
};

const EMPTY_FORM: FormState = {
  nome: "",
  codigo: "",
  cnpj: "",
  plano_codigo: "starter",
  plano_nome: "Plano Starter",
  plano_status: "Ativo",
  plano_ciclo: "Mensal",
  max_usuarios: "",
  max_unidades: "",
  contrato_inicio: "",
  contrato_fim: "",
};

const PLANO_STATUS_OPTIONS: PlanoStatus[] = ["Ativo", "Teste", "Suspenso", "Cancelado"];
const PLANO_CICLO_OPTIONS: PlanoCiclo[] = ["Mensal", "Trimestral", "Semestral", "Anual"];
const PLANO_OPTIONS = [
  { codigo: "starter", nome: "Plano Starter" },
  { codigo: "professional", nome: "Plano Professional" },
  { codigo: "enterprise", nome: "Plano Enterprise" },
  { codigo: "custom", nome: "Plano Customizado" },
] as const;

function parseNullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Nao definido";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Nao definido";
  return date.toLocaleDateString("pt-BR");
}

function getPlanStatusClassName(status: PlanoStatus) {
  if (status === "Ativo") return "bg-emerald-100 text-emerald-700";
  if (status === "Teste") return "bg-sky-100 text-sky-700";
  if (status === "Suspenso") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

export default function EmpresasAdmin({
  empresas,
  onCreate,
  onUpdate,
  onToggleStatus,
  onVoltar,
}: EmpresasAdminProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);

  const empresasOrdenadas = useMemo(
    () =>
      [...empresas].sort(
        (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
      ),
    [empresas]
  );

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function validateForm() {
    if (!form.nome.trim()) return "Informe o nome da empresa.";
    if (!form.codigo.trim()) return "Informe o código da empresa.";
    if (!form.plano_codigo.trim()) return "Informe o código do plano comercial.";
    if (!form.plano_nome.trim()) return "Informe o nome do plano comercial.";
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validation = validateForm();
    if (validation) {
      setError(validation);
      return;
    }

    const payload = {
      nome: form.nome.trim(),
      codigo: form.codigo.trim().toUpperCase(),
      cnpj: form.cnpj.trim() || undefined,
      plano_codigo: form.plano_codigo.trim().toLowerCase(),
      plano_nome: form.plano_nome.trim(),
      plano_status: form.plano_status,
      plano_ciclo: form.plano_ciclo,
      max_usuarios: parseNullableNumber(form.max_usuarios),
      max_unidades: parseNullableNumber(form.max_unidades),
      contrato_inicio: form.contrato_inicio.trim() || null,
      contrato_fim: form.contrato_fim.trim() || null,
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
          : "Não foi possível salvar a empresa."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(empresa: Empresa) {
    setEditingId(empresa.id);
    setForm({
      nome: empresa.nome,
      codigo: empresa.codigo,
      cnpj: empresa.cnpj ?? "",
      plano_codigo: empresa.plano_codigo,
      plano_nome: empresa.plano_nome,
      plano_status: empresa.plano_status,
      plano_ciclo: empresa.plano_ciclo,
      max_usuarios: empresa.max_usuarios?.toString() ?? "",
      max_unidades: empresa.max_unidades?.toString() ?? "",
      contrato_inicio: empresa.contrato_inicio ?? "",
      contrato_fim: empresa.contrato_fim ?? "",
    });
    setError(null);
  }

  async function handleToggleStatus(id: string) {
    try {
      setPendingStatusId(id);
      setError(null);
      await onToggleStatus(id);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Não foi possível atualizar o status da empresa."
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
              Plataforma SaaS
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
              Empresas
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Cadastre clientes, contrato ativo e limites básicos do plano comercial.
            </p>
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

        <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            {editingId ? "Editar empresa" : "Nova empresa"}
          </h2>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="text" value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} placeholder="Nome da empresa" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
            <input type="text" value={form.codigo} onChange={(e) => setForm((prev) => ({ ...prev, codigo: e.target.value }))} placeholder="Código da empresa" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
            <input type="text" value={form.cnpj} onChange={(e) => setForm((prev) => ({ ...prev, cnpj: e.target.value }))} placeholder="CNPJ" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
            <select value={form.plano_codigo} onChange={(e) => {
              const selected = PLANO_OPTIONS.find((option) => option.codigo === e.target.value);
              setForm((prev) => ({
                ...prev,
                plano_codigo: e.target.value,
                plano_nome: selected?.nome ?? prev.plano_nome,
              }));
            }} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
              {PLANO_OPTIONS.map((option) => (
                <option key={option.codigo} value={option.codigo}>
                  {option.nome}
                </option>
              ))}
            </select>
            <input type="text" value={form.plano_nome} onChange={(e) => setForm((prev) => ({ ...prev, plano_nome: e.target.value }))} placeholder="Nome exibido do plano" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
            <select value={form.plano_status} onChange={(e) => setForm((prev) => ({ ...prev, plano_status: e.target.value as PlanoStatus }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
              {PLANO_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select value={form.plano_ciclo} onChange={(e) => setForm((prev) => ({ ...prev, plano_ciclo: e.target.value as PlanoCiclo }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
              {PLANO_CICLO_OPTIONS.map((ciclo) => (
                <option key={ciclo} value={ciclo}>
                  {ciclo}
                </option>
              ))}
            </select>
            <input type="number" min="1" value={form.max_usuarios} onChange={(e) => setForm((prev) => ({ ...prev, max_usuarios: e.target.value }))} placeholder="Limite de usuários" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
            <input type="number" min="1" value={form.max_unidades} onChange={(e) => setForm((prev) => ({ ...prev, max_unidades: e.target.value }))} placeholder="Limite de unidades" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
            <input type="date" value={form.contrato_inicio} onChange={(e) => setForm((prev) => ({ ...prev, contrato_inicio: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
            <input type="date" value={form.contrato_fim} onChange={(e) => setForm((prev) => ({ ...prev, contrato_fim: e.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <button type="submit" disabled={isSubmitting} className="rounded-2xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-5 py-3 text-sm font-semibold text-white">
                {isSubmitting ? "Salvando..." : editingId ? "Salvar empresa" : "Cadastrar empresa"}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
                  Cancelar edição
                </button>
              )}
            </div>
            {error && <p className="text-sm font-medium text-red-600 md:col-span-2">{error}</p>}
          </form>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            Empresas cadastradas
          </h2>
          <div className="space-y-3">
            {empresasOrdenadas.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nenhuma empresa cadastrada ou visível para este perfil.
              </p>
            ) : (
              empresasOrdenadas.map((empresa) => (
                <div key={empresa.id} className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1.1fr_0.55fr_0.95fr_0.9fr_0.9fr_auto]">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Empresa</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{empresa.nome}</p>
                    <p className="mt-1 text-xs text-slate-500">{empresa.cnpj ?? "Sem CNPJ"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Código</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{empresa.codigo}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Plano</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{empresa.plano_nome}</p>
                    <p className="mt-1 text-xs text-slate-500">{empresa.plano_codigo} · {empresa.plano_ciclo}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Limites</p>
                    <p className="mt-1 text-sm text-slate-700">{empresa.max_usuarios ?? "Livre"} usu.</p>
                    <p className="text-xs text-slate-500">{empresa.max_unidades ?? "Livre"} unid.</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Contrato</p>
                    <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getPlanStatusClassName(empresa.plano_status)}`}>
                      {empresa.plano_status}
                    </span>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatDate(empresa.contrato_inicio)} ate {formatDate(empresa.contrato_fim)}
                    </p>
                    <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${empresa.status === "Ativa" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                      {empresa.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 md:justify-end">
                    <button type="button" onClick={() => startEdit(empresa)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      Editar
                    </button>
                    <button type="button" onClick={() => { void handleToggleStatus(empresa.id); }} disabled={pendingStatusId === empresa.id} className={`rounded-xl px-3 py-2 text-xs font-semibold ${empresa.status === "Ativa" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {pendingStatusId === empresa.id ? "Atualizando..." : empresa.status === "Ativa" ? "Inativar" : "Ativar"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
