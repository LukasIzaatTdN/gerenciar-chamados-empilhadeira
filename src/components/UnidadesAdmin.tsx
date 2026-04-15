import { useMemo, useState } from "react";
import type { Empresa } from "../types/empresa";
import type { Unidade } from "../types/unidade";

interface UnidadesAdminProps {
  empresas: Empresa[];
  unidades: Unidade[];
  onCreate: (input: {
    empresa_id: string;
    nome: string;
    codigo: string;
    endereco: string;
  }) => Promise<void>;
  onUpdate: (
    id: string,
    input: { empresa_id: string; nome: string; codigo: string; endereco: string }
  ) => Promise<void>;
  onToggleStatus: (id: string) => Promise<void>;
  onVoltar: () => void;
  canSelectEmpresa?: boolean;
  currentEmpresaId?: string | null;
}

type FormState = {
  empresa_id: string;
  nome: string;
  codigo: string;
  endereco: string;
};

const EMPTY_FORM: FormState = {
  empresa_id: "",
  nome: "",
  codigo: "",
  endereco: "",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function UnidadesAdmin({
  empresas,
  unidades,
  onCreate,
  onUpdate,
  onToggleStatus,
  onVoltar,
  canSelectEmpresa = false,
  currentEmpresaId = null,
}: UnidadesAdminProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);

  const empresasAtivas = useMemo(
    () => empresas.filter((empresa) => empresa.status === "Ativa"),
    [empresas]
  );
  const ordenadas = useMemo(
    () =>
      [...unidades].sort(
        (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
      ),
    [unidades]
  );

  const isEditing = editingId !== null;
  const tituloForm = isEditing ? "Editar unidade" : "Nova unidade";

  function resetForm() {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      empresa_id: canSelectEmpresa ? "" : currentEmpresaId ?? "",
    });
    setError(null);
  }

  function validateForm() {
    if (!(canSelectEmpresa ? form.empresa_id : currentEmpresaId)) {
      return "Selecione a empresa da unidade.";
    }
    if (!form.nome.trim()) return "Informe o nome da unidade.";
    if (!form.codigo.trim()) return "Informe o código da unidade.";
    if (!form.endereco.trim()) return "Informe o endereço da unidade.";
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
      empresa_id: canSelectEmpresa ? form.empresa_id : currentEmpresaId ?? "",
      nome: form.nome.trim(),
      codigo: form.codigo.trim().toUpperCase(),
      endereco: form.endereco.trim(),
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
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível salvar a unidade.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

function beginEdit(unidade: Unidade) {
    setEditingId(unidade.id);
    setForm({
      empresa_id: unidade.empresa_id,
      nome: unidade.nome,
      codigo: unidade.codigo,
      endereco: unidade.endereco,
    });
    setError(null);
  }

  async function handleToggleStatus(id: string) {
    try {
      setPendingStatusId(id);
      setError(null);
      await onToggleStatus(id);
    } catch (toggleError) {
      const message =
        toggleError instanceof Error
          ? toggleError.message
          : "Não foi possível atualizar o status da unidade.";
      setError(message);
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
              Administração
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
              Unidades
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Cadastro e gerenciamento das unidades operacionais por empresa cliente.
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
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">{tituloForm}</h2>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-3">
            {canSelectEmpresa && (
              <select
                value={form.empresa_id}
                onChange={(e) => setForm((prev) => ({ ...prev, empresa_id: e.target.value }))}
                className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 md:col-span-3"
              >
                <option value="">Selecione a empresa</option>
                {empresasAtivas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome}
                  </option>
                ))}
              </select>
            )}
            <input type="text" value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} placeholder="Nome da unidade" className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
            <input type="text" value={form.codigo} onChange={(e) => setForm((prev) => ({ ...prev, codigo: e.target.value }))} placeholder="Código (ex: CTR)" className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900" />
            <input type="text" value={form.endereco} onChange={(e) => setForm((prev) => ({ ...prev, endereco: e.target.value }))} placeholder="Endereço completo" className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 md:col-span-3" />
            <div className="flex flex-wrap items-center gap-2 md:col-span-3">
              <button type="submit" disabled={isSubmitting} className="touch-target rounded-2xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,23,42,0.2)]">
                {isSubmitting ? "Salvando..." : isEditing ? "Salvar alteração" : "Cadastrar unidade"}
              </button>
              {isEditing && (
                <button type="button" onClick={resetForm} className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
                  Cancelar edição
                </button>
              )}
            </div>
            {error && <p className="text-sm font-medium text-red-600 md:col-span-3">{error}</p>}
          </form>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            Unidades cadastradas
          </h2>
          <div className="space-y-3">
            {ordenadas.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nenhuma unidade cadastrada.
              </p>
            ) : (
              ordenadas.map((unidade) => (
                <div
                  key={unidade.id}
                  className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1fr_0.8fr_0.6fr_1fr_0.7fr_0.7fr_auto]"
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Nome</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{unidade.nome}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Empresa</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {empresas.find((empresa) => empresa.id === unidade.empresa_id)?.nome ??
                        unidade.empresa_id}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Código</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{unidade.codigo}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Endereço</p>
                    <p className="mt-1 text-sm text-slate-700">{unidade.endereco}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Status</p>
                    <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${unidade.status === "Ativo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                      {unidade.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Criação</p>
                    <p className="mt-1 text-sm text-slate-700">{formatDate(unidade.criado_em)}</p>
                  </div>
                  <div className="flex items-center gap-2 md:justify-end">
                    <button type="button" onClick={() => beginEdit(unidade)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      Editar
                    </button>
                    <button type="button" onClick={() => { void handleToggleStatus(unidade.id); }} disabled={pendingStatusId === unidade.id} className={`rounded-xl px-3 py-2 text-xs font-semibold ${unidade.status === "Ativo" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {pendingStatusId === unidade.id ? "Atualizando..." : unidade.status === "Ativo" ? "Inativar" : "Ativar"}
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
