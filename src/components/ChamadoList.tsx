import { useMemo, useState } from "react";
import type { Chamado } from "../types/chamado";
import type { TipoServico } from "../types/chamado";
import { TIPOS_SERVICO } from "../types/chamado";
import { getCategoriaChamado } from "../utils/chamadoStatus";
import type { FilterStatus } from "../hooks/useChamados";
import type { TimeEstimatesResult } from "../hooks/useTimeEstimates";
import type { Supermercado } from "../types/supermercado";
import ChamadoCard from "./ChamadoCard";
import AdminIcon from "./AdminIcon";

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
  { label: "Aguardando", value: "Aguardando" },
  { label: "Em atendimento", value: "Em atendimento" },
  { label: "Incompletos", value: "Incompleto" },
  { label: "Finalizados", value: "Finalizado" },
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
    <section className="workspace-call-list" aria-label="Lista de chamados">
      <div className="workspace-tabs" aria-label="Filtrar por status">
        {FILTERS.map((filter) => <button key={filter.value} type="button" aria-pressed={filterStatus === filter.value} onClick={() => onFilterChange(filter.value)}>
          {filter.label}
        </button>)}
      </div>
      <div className="workspace-call-filters">
        <label><span>Categoria</span><select value={filterCategoria} onChange={(event) => setFilterCategoria(event.target.value as typeof filterCategoria)}>
          <option value="Todos">Todas as categorias</option><option value="operacional">Operacionais</option><option value="televendas">Televendas</option>
        </select></label>
        <label><span>Tipo de serviço</span><select value={filterTipo} onChange={(event) => setFilterTipo(event.target.value as typeof filterTipo)}>
          <option value="Todos">Todos os tipos</option>
          {TIPOS_SERVICO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
        </select></label>
        <span className="workspace-call-results">{chamadosFiltradosPorTipo.length.toLocaleString("pt-BR")} {chamadosFiltradosPorTipo.length === 1 ? "chamado encontrado" : "chamados encontrados"}</span>
      </div>
      {chamadosFiltradosPorTipo.length === 0 ? (
        <div className="workspace-empty">
          <span className="workspace-empty-icon"><AdminIcon name="box" width={25} height={25} /></span>
          <h3>Nenhum chamado encontrado</h3>
          <p>{filterStatus !== "Todos" || filterTipo !== "Todos" || filterCategoria !== "Todos" ? "Ajuste os filtros para consultar outras solicitações." : "As solicitações disponíveis para o seu acesso aparecerão aqui."}</p>
        </div>
      ) : (
        <div className="workspace-call-results-list">
          {chamadosFiltradosPorTipo.map((chamado) => <ChamadoCard
            key={chamado.id} chamado={chamado} estimate={timeEstimates.estimates[chamado.id]}
            remainingMin={timeEstimates.tempoRestanteEmAtendimento[chamado.id]}
            showSupermercado={showSupermercado} supermercados={supermercados}
          />)}
        </div>
      )}
    </section>
  );
}
