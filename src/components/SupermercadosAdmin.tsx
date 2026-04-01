import { useMemo, useState } from "react";
import type { Supermercado } from "../types/supermercado";

interface SupermercadosAdminProps {
  supermercados: Supermercado[];
  onCreate: (input: { nome: string; codigo: string; endereco: string }) => void;
  onUpdate: (id: string, input: { nome: string; codigo: string; endereco: string }) => void;
  onToggleStatus: (id: string) => void;
  onVoltar: () => void;
}

type FormState = {
  nome: string;
  codigo: string;
  endereco: string;
};

const EMPTY_FORM: FormState = {
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

export default function SupermercadosAdmin({
  supermercados,
  onCreate,
  onUpdate,
  onToggleStatus,
  onVoltar,
}: SupermercadosAdminProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const isEditing = editingId !== null;
  const tituloForm = isEditing ? "Editar supermercado" : "Novo supermercado";

  const ordenados = useMemo(
    () =>
      [...supermercados].sort(
        (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
      ),
    [supermercados]
  );

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function validateForm() {
    if (!form.nome.trim()) return "Informe o nome da unidade.";
    if (!form.codigo.trim()) return "Informe o código da unidade.";
    if (!form.endereco.trim()) return "Informe o endereço da unidade.";
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateForm();
    if (validation) {
      setError(validation);
      return;
    }

    const payload = {
      nome: form.nome.trim(),
      codigo: form.codigo.trim().toUpperCase(),
      endereco: form.endereco.trim(),
    };

    if (editingId) {
      onUpdate(editingId, payload);
    } else {
      onCreate(payload);
    }

    resetForm();
  }

  function beginEdit(supermercado: Supermercado) {
    setEditingId(supermercado.id);
    setForm({
      nome: supermercado.nome,
      codigo: supermercado.codigo,
      endereco: supermercado.endereco,
    });
    setError(null);
  }

  return (
    <div className="min-h-screen bg-transparent">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 rounded-[30px] border border-white/70 bg-white/75 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Administração geral
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
              Supermercados
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Cadastro e gerenciamento das unidades operacionais do sistema.
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
            <input
              type="text"
              value={form.nome}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, nome: e.target.value }));
                setError(null);
              }}
              placeholder="Nome da unidade"
              className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
            <input
              type="text"
              value={form.codigo}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, codigo: e.target.value }));
                setError(null);
              }}
              placeholder="Código (ex: CTR)"
              className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
            <input
              type="text"
              value={form.endereco}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, endereco: e.target.value }));
                setError(null);
              }}
              placeholder="Endereço completo"
              className="touch-target rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 md:col-span-3"
            />
            <div className="flex flex-wrap items-center gap-2 md:col-span-3">
              <button
                type="submit"
                className="touch-target rounded-2xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,23,42,0.2)]"
              >
                {isEditing ? "Salvar alteração" : "Cadastrar unidade"}
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
              <p className="text-sm font-medium text-red-600 md:col-span-3">{error}</p>
            )}
          </form>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            Supermercados cadastrados
          </h2>
          <div className="space-y-3">
            {ordenados.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nenhuma unidade cadastrada.
              </p>
            ) : (
              ordenados.map((supermercado) => (
                <div
                  key={supermercado.id}
                  className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1.2fr_0.7fr_1.3fr_0.7fr_0.7fr_auto]"
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Nome</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{supermercado.nome}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Código</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{supermercado.codigo}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Endereço</p>
                    <p className="mt-1 text-sm text-slate-700">{supermercado.endereco}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Status</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        supermercado.status === "Ativo"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {supermercado.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Criação</p>
                    <p className="mt-1 text-sm text-slate-700">{formatDate(supermercado.criado_em)}</p>
                  </div>
                  <div className="flex items-center gap-2 md:justify-end">
                    <button
                      type="button"
                      onClick={() => beginEdit(supermercado)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleStatus(supermercado.id)}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                        supermercado.status === "Ativo"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {supermercado.status === "Ativo" ? "Inativar" : "Ativar"}
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
