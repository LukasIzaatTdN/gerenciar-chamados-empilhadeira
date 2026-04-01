import { useState } from "react";
import type { Setor, TipoServico, Prioridade } from "../types/chamado";
import { TIPOS_SERVICO, PRIORIDADES } from "../types/chamado";
import type { NovoChamadoInput } from "../hooks/useChamados";
import type { Supermercado } from "../types/supermercado";

type NovoChamadoFormInput = Omit<NovoChamadoInput, "supermercado_id">;

interface ChamadoFormProps {
  solicitanteNome: string;
  solicitantePerfil?: string | null;
  supermercadoNome?: string | null;
  isAdminGeral?: boolean;
  supermercados?: Supermercado[];
  supermercadoSelecionadoId?: string;
  onSupermercadoSelecionadoChange?: (id: string) => void;
  onSubmit: (data: NovoChamadoFormInput) => void;
  onCancel: () => void;
}

export default function ChamadoForm({
  solicitanteNome,
  solicitantePerfil,
  supermercadoNome,
  isAdminGeral = false,
  supermercados = [],
  supermercadoSelecionadoId = "",
  onSupermercadoSelecionadoChange,
  onSubmit,
  onCancel,
}: ChamadoFormProps) {
  const [setor, setSetor] = useState<Setor>("");
  const [tipoServico, setTipoServico] = useState<TipoServico>("Descarga");
  const [prioridade, setPrioridade] = useState<Prioridade>("Normal");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!solicitanteNome.trim()) {
      newErrors.nome = "Faça login para identificar o solicitante";
    }

    if (!setor.trim()) {
      newErrors.setor = "Informe onde o trabalho sera realizado";
    }

    if (isAdminGeral && !supermercadoSelecionadoId) {
      newErrors.supermercado = "Selecione o supermercado para abrir o chamado";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit({
      solicitante_nome: solicitanteNome.trim(),
      setor: setor.trim(),
      tipo_servico: tipoServico,
      prioridade,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/38 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg animate-in overflow-y-auto rounded-t-[30px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] shadow-[0_24px_60px_rgba(15,23,42,0.18)] max-h-[calc(100dvh-0.5rem)] sm:rounded-[30px] sm:max-h-[calc(100dvh-2rem)]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <span className="mx-auto block h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
          </div>
        </div>
        <div className="flex items-center justify-between px-5 pb-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0f3d75] to-slate-900 text-xl text-white shadow-[0_10px_22px_rgba(15,23,42,0.22)]">
            <span className="text-xl">🏗️</span>
            </div>
            <div>
            <h2 className="text-lg font-bold text-slate-900">
              Nova Solicitação de Empilhadeira
            </h2>
              <p className="text-sm text-slate-500">Preencha rápido e envie para a fila</p>
              {supermercadoNome && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
                  Unidade atual: {supermercadoNome}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-2xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          {/* Solicitante */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Solicitante identificado
            </label>
            <div
              className={`touch-target flex flex-col items-start gap-2 rounded-2xl border ${
                errors.nome ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
              } px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {solicitanteNome || "Usuário não identificado"}
                </p>
                {solicitantePerfil && (
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    Perfil: {solicitantePerfil}
                  </p>
                )}
                {supermercadoNome && (
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    Unidade: {supermercadoNome}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                Login ativo
              </span>
            </div>
            {errors.nome && (
              <p className="mt-1 text-xs text-red-500">{errors.nome}</p>
            )}
          </div>

          {isAdminGeral && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Supermercado da solicitação *
              </label>
              <select
                value={supermercadoSelecionadoId}
                onChange={(e) => {
                  onSupermercadoSelecionadoChange?.(e.target.value);
                  setErrors((prev) => ({ ...prev, supermercado: "" }));
                }}
                className={`touch-target w-full rounded-2xl border ${
                  errors.supermercado ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                } px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
              >
                <option value="">Selecione a unidade</option>
                {supermercados
                  .filter((item) => item.status === "Ativo")
                  .map((supermercado) => (
                    <option key={supermercado.id} value={supermercado.id}>
                      {supermercado.nome} · {supermercado.codigo}
                    </option>
                  ))}
              </select>
              {errors.supermercado && (
                <p className="mt-1 text-xs text-red-500">{errors.supermercado}</p>
              )}
            </div>
          )}

          {/* Local do trabalho */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Onde sera feito o trabalho *
            </label>
            <input
              type="text"
              value={setor}
              onChange={(e) => {
                setSetor(e.target.value);
                setErrors((prev) => ({ ...prev, setor: "" }));
              }}
              placeholder="Ex: Doca 3, patio externo, corredor ao lado da expedicao"
              className={`touch-target w-full rounded-2xl border ${
                errors.setor ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
              } px-4 py-3.5 text-base text-gray-800 transition-colors focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
            />
            {errors.setor && (
              <p className="mt-1 text-xs text-red-500">{errors.setor}</p>
            )}
          </div>

          {/* Tipo de Serviço */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Tipo de Serviço
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TIPOS_SERVICO.map((tipo) => {
                const icons: Record<string, string> = {
                  Descarga: "📦",
                  Reposição: "🔄",
                  Retirada: "📤",
                  Movimentação: "🚚",
                };
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setTipoServico(tipo)}
                    className={`touch-target flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium transition-all ${
                      tipoServico === tipo
                        ? "border-[#0f3d75] bg-blue-50 text-[#0f3d75] ring-4 ring-blue-100"
                        : "border-slate-200 bg-slate-50 text-gray-600 hover:border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    <span>{icons[tipo]}</span>
                    {tipo}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prioridade */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Prioridade
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PRIORIDADES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrioridade(p)}
                  className={`touch-target rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
                    prioridade === p
                      ? p === "Urgente"
                        ? "border-red-400 bg-red-50 text-red-700 ring-4 ring-red-100"
                        : "border-amber-400 bg-amber-50 text-amber-700 ring-4 ring-amber-100"
                      : "border-slate-200 bg-slate-50 text-gray-600 hover:border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {p === "Urgente" ? "🚨 " : "📋 "}
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onCancel}
              className="touch-target rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="touch-target rounded-2xl bg-gradient-to-r from-[#0f3d75] to-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(15,23,42,0.24)] transition-all hover:brightness-110 hover:shadow-xl active:scale-[0.98]"
            >
              🏗️ Solicitar Empilhadeira
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
