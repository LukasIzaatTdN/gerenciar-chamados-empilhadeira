import { useState } from "react";
import type { Setor, TipoServico, Prioridade } from "../types/chamado";
import { SETORES, TIPOS_SERVICO, PRIORIDADES } from "../types/chamado";
import type { NovoChamadoInput } from "../hooks/useChamados";

interface ChamadoFormProps {
  onSubmit: (data: NovoChamadoInput) => void;
  onCancel: () => void;
}

export default function ChamadoForm({ onSubmit, onCancel }: ChamadoFormProps) {
  const [nome, setNome] = useState("");
  const [setor, setSetor] = useState<Setor>("Doca 1");
  const [tipoServico, setTipoServico] = useState<TipoServico>("Descarga");
  const [prioridade, setPrioridade] = useState<Prioridade>("Normal");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!nome.trim()) {
      newErrors.nome = "Informe o nome do solicitante";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit({
      solicitante_nome: nome.trim(),
      setor,
      tipo_servico: tipoServico,
      prioridade,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg animate-in rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏗️</span>
            <h2 className="text-lg font-bold text-gray-800">
              Nova Solicitação de Empilhadeira
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Nome do Solicitante */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              Nome do Solicitante *
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setErrors((prev) => ({ ...prev, nome: "" }));
              }}
              placeholder="Ex: João Silva"
              className={`w-full rounded-xl border ${
                errors.nome ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"
              } px-4 py-3 text-sm text-gray-800 transition-colors focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-100`}
              autoFocus
            />
            {errors.nome && (
              <p className="mt-1 text-xs text-red-500">{errors.nome}</p>
            )}
          </div>

          {/* Setor */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              Setor
            </label>
            <select
              value={setor}
              onChange={(e) => setSetor(e.target.value as Setor)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 transition-colors focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-100"
            >
              {SETORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de Serviço */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              Tipo de Serviço
            </label>
            <div className="grid grid-cols-2 gap-2">
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
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                      tipoServico === tipo
                        ? "border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-100"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100"
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
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">
              Prioridade
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRIORIDADES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrioridade(p)}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                    prioridade === p
                      ? p === "Urgente"
                        ? "border-red-400 bg-red-50 text-red-700 ring-2 ring-red-100"
                        : "border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-100"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {p === "Urgente" ? "🚨 " : "📋 "}
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition-all hover:from-orange-600 hover:to-orange-700 hover:shadow-xl active:scale-[0.98]"
            >
              🏗️ Solicitar Empilhadeira
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
