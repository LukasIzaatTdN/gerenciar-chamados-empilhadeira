import { useMemo, useState } from "react";
import type { Chamado } from "../types/chamado";
import type { TipoServico } from "../types/chamado";
import { TIPOS_SERVICO } from "../types/chamado";
import { getCategoriaChamado } from "../utils/chamadoStatus";
import type { FilterStatus } from "../hooks/useChamados";
import type { TimeEstimatesResult } from "../hooks/useTimeEstimates";
import type { Supermercado } from "../types/supermercado";
import ChamadoCard from "./ChamadoCard";

interface ChamadoListProps {
  chamados: Chamado[];
  filterStatus: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
  timeEstimates: TimeEstimatesResult;
  showSupermercado: boolean;
  supermercados?: Supermercado[];
}

const FILTERS: { label: string; value: FilterStatus }[] = [
  { label: "Todos", value: "Todos" },
  { label: "⏳ Aguardando", value: "Aguardando" },
  { label: "🔧 Em atendimento", value: "Em atendimento" },
  { label: "✅ Finalizados", value: "Finalizado" },
];

export default function ChamadoList({
  chamados,
  filterStatus,
  onFilterChange,
  timeEstimates,
  showSupermercado,
  supermercados = [],
}: ChamadoListProps) {
  const [filterCategoria, setFilterCategoria] = useState<"Todos" | "operacional" | "televendas">("Todos");
  const [filterTipo, setFilterTipo] = useState<"Todos" | TipoServico>("Todos");
  const chamadosFiltradosPorCategoria = useMemo(
    () =>
      filterCategoria === "Todos"
        ? chamados
        : chamados.filter((chamado) => getCategoriaChamado(chamado) === filterCategoria),
    [chamados, filterCategoria]
  );
  const chamadosFiltradosPorTipo = useMemo(
    () =>
      filterTipo === "Todos"
        ? chamadosFiltradosPorCategoria
        : chamadosFiltradosPorCategoria.filter((chamado) => chamado.tipo_servico === filterTipo),
    [chamadosFiltradosPorCategoria, filterTipo]
  );

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="sticky top-[86px] z-10 -mx-1 overflow-x-auto pb-1 sm:static sm:mx-0">
        <div className="inline-flex min-w-full gap-2 rounded-[24px] border border-slate-200 bg-white p-1.5 shadow-[0_12px_28px_rgba(15,23,42,0.08)] sm:min-w-0">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`touch-target shrink-0 rounded-2xl px-4 py-3 text-xs font-semibold transition-all sm:text-sm ${
              filterStatus === f.value
                ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white shadow-[0_10px_24px_rgba(15,23,42,0.2)]"
                : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {f.label}
          </button>
        ))}
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="mb-2 inline-flex min-w-full gap-2 rounded-[20px] border border-slate-200 bg-white p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:min-w-0">
          <button
            onClick={() => setFilterCategoria("Todos")}
            className={`touch-target shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
              filterCategoria === "Todos"
                ? "bg-slate-900 text-white"
                : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilterCategoria("operacional")}
            className={`touch-target shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
              filterCategoria === "operacional"
                ? "bg-slate-900 text-white"
                : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            Operacionais
          </button>
          <button
            onClick={() => setFilterCategoria("televendas")}
            className={`touch-target shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
              filterCategoria === "televendas"
                ? "bg-indigo-600 text-white"
                : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            Televendas
          </button>
        </div>
        <div className="inline-flex min-w-full gap-2 rounded-[20px] border border-slate-200 bg-white p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:min-w-0">
          <button
            onClick={() => setFilterTipo("Todos")}
            className={`touch-target shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
              filterTipo === "Todos"
                ? "bg-slate-900 text-white"
                : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            Todos os tipos
          </button>
          {TIPOS_SERVICO.map((tipo) => (
            <button
              key={tipo}
              onClick={() => setFilterTipo(tipo)}
              className={`touch-target shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                filterTipo === tipo
                  ? tipo === "Atendimento Televendas"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-900 text-white"
                  : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {tipo}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {chamadosFiltradosPorTipo.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[30px] border border-dashed border-slate-200 bg-white py-16 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <span className="text-5xl">🏗️</span>
          <p className="mt-4 text-sm font-semibold text-slate-500">
            Nenhum chamado encontrado
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {filterStatus !== "Todos" || filterTipo !== "Todos"
              ? "Tente mudar o filtro ou crie um novo chamado"
              : 'Clique em "Solicitar Empilhadeira" para criar um chamado'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {chamadosFiltradosPorTipo.map((chamado) => (
            <ChamadoCard
              key={chamado.id}
              chamado={chamado}
              estimate={timeEstimates.estimates[chamado.id]}
              remainingMin={timeEstimates.tempoRestanteEmAtendimento[chamado.id]}
              showSupermercado={showSupermercado}
              supermercados={supermercados}
            />
          ))}
        </div>
      )}
    </div>
  );
}
