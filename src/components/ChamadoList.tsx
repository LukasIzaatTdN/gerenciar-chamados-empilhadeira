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
    <div>
      {/* Filter tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:text-sm ${
              filterStatus === f.value
                ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                : "bg-white text-gray-500 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {chamados.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-16">
          <span className="text-5xl">🏗️</span>
          <p className="mt-4 text-sm font-semibold text-gray-400">
            Nenhum chamado encontrado
          </p>
          <p className="mt-1 text-xs text-gray-300">
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
