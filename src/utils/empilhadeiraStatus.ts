import type { Chamado, Status as ChamadoStatus } from "../types/chamado";
import type { ChecklistEmpilhadeira } from "../types/checklistEmpilhadeira";
import type { Empilhadeira, EmpilhadeiraStatus } from "../types/empilhadeira";
import type { Manutencao } from "../types/manutencao";
import {
  getUltimoChecklistEmpilhadeira,
  isChecklistEmpilhadeiraAprovado,
} from "./checklistEmpilhadeira";

const CHAMADO_STATUS_COM_EMPILHADEIRA_ATIVA = new Set<ChamadoStatus>([
  "Aguardando",
  "Em atendimento",
  "Em separação",
  "Pronto",
  "Incompleto",
]);

function isChamadoAtivoComEmpilhadeira(chamado: Chamado, empilhadeiraId: string) {
  return (
    chamado.empilhadeira_id === empilhadeiraId &&
    CHAMADO_STATUS_COM_EMPILHADEIRA_ATIVA.has(chamado.status)
  );
}

export function getEmpilhadeiraStatusEfetivo(
  empilhadeira: Empilhadeira,
  chamados: Chamado[],
  checklists: ChecklistEmpilhadeira[] = [],
  manutencoes: Manutencao[] = []
): EmpilhadeiraStatus {
  if (
    empilhadeira.status === "Em manutenção" ||
    empilhadeira.status === "Inativa" ||
    empilhadeira.status === "Necessita atenção"
  ) {
    return empilhadeira.status;
  }

  const manutencaoAtiva = manutencoes.some(
    (manutencao) =>
      manutencao.empilhadeira_id === empilhadeira.id &&
      manutencao.supermercado_id === empilhadeira.supermercado_id &&
      manutencao.status === "Em andamento"
  );
  if (manutencaoAtiva) {
    return "Em manutenção";
  }

  const ultimoChecklist = getUltimoChecklistEmpilhadeira(checklists, empilhadeira.id);
  if (ultimoChecklist && !isChecklistEmpilhadeiraAprovado(ultimoChecklist)) {
    return "Necessita atenção";
  }

  const emUso = chamados.some(
    (chamado) =>
      chamado.supermercado_id === empilhadeira.supermercado_id &&
      isChamadoAtivoComEmpilhadeira(chamado, empilhadeira.id)
  );

  if (emUso) {
    return "Em uso";
  }

  if (empilhadeira.status === "Em uso") {
    return "Disponível";
  }

  return empilhadeira.status;
}

export function buildEmpilhadeiraStatusMap(
  empilhadeiras: Empilhadeira[],
  chamados: Chamado[],
  checklists: ChecklistEmpilhadeira[] = [],
  manutencoes: Manutencao[] = []
) {
  return Object.fromEntries(
    empilhadeiras.map((empilhadeira) => [
      empilhadeira.id,
      getEmpilhadeiraStatusEfetivo(empilhadeira, chamados, checklists, manutencoes),
    ])
  ) as Record<string, EmpilhadeiraStatus>;
}
