import type { Chamado } from "../types/chamado";
import type { FilterStatus } from "../hooks/useChamados";
import type { TimeEstimatesResult } from "../hooks/useTimeEstimates";
import ChamadoCard from "./ChamadoCard";

interface ChamadoListProps {
  chamados: Chamado[];
  filterStatus: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
  onIniciar: (id: string) => void;
  onFinalizar: (id: string) => void;
  onExcluir: (id: string) => void;
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
  onIniciar,
  onFinalizar,
  onExcluir,
  timeEstimates,
}: ChamadoListProps) {
  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="sticky top-[86px] z-10 -mx-1 overflow-x-auto pb-1 sm:static sm:mx-0">
        <div className="inline-flex min-w-full gap-2 rounded-[24px] border border-white/70 bg-white/70 p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:min-w-0">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`touch-target shrink-0 rounded-2xl px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
              filterStatus === f.value
                ? "bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.18)]"
                : "bg-transparent text-slate-500 hover:bg-white hover:text-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
        </div>
      </div>

      {/* List */}
      {chamados.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[30px] border border-dashed border-slate-200 bg-white/70 py-16 shadow-[0_18px_36px_rgba(15,23,42,0.05)] backdrop-blur-xl">
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
              onIniciar={onIniciar}
              onFinalizar={onFinalizar}
              onExcluir={onExcluir}
              estimate={timeEstimates.estimates[chamado.id]}
              remainingMin={timeEstimates.tempoRestanteEmAtendimento[chamado.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
