import type { Chamado } from "../types/chamado";
import type { FilterStatus } from "../hooks/useChamados";
import type { TimeEstimatesResult } from "../hooks/useTimeEstimates";
import ChamadoCard from "./ChamadoCard";

interface ChamadoListProps {
  chamados: Chamado[];
  filterStatus: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
  timeEstimates: TimeEstimatesResult;
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
}: ChamadoListProps) {
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

      {/* List */}
      {chamados.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[30px] border border-dashed border-slate-200 bg-white py-16 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <span className="text-5xl">🏗️</span>
          <p className="mt-4 text-sm font-semibold text-slate-500">
            Nenhum chamado encontrado
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {filterStatus !== "Todos"
              ? "Tente mudar o filtro ou crie um novo chamado"
              : 'Clique em "Solicitar Empilhadeira" para criar um chamado'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {chamados.map((chamado) => (
            <ChamadoCard
              key={chamado.id}
              chamado={chamado}
              estimate={timeEstimates.estimates[chamado.id]}
              remainingMin={timeEstimates.tempoRestanteEmAtendimento[chamado.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
