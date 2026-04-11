import type { ChecklistEmpilhadeira } from "../types/checklistEmpilhadeira";

export function isChecklistEmpilhadeiraAprovado(checklist: ChecklistEmpilhadeira) {
  return !checklist.reprovado;
}

export function getChecklistEmpilhadeiraItensReprovados(
  checklist: Pick<
    ChecklistEmpilhadeira,
    "bateria_ok" | "garfo_ok" | "pneus_ok" | "freio_ok" | "sem_avaria"
  >
) {
  const itens: string[] = [];
  if (!checklist.bateria_ok) itens.push("Bateria");
  if (!checklist.garfo_ok) itens.push("Garfo");
  if (!checklist.pneus_ok) itens.push("Pneus");
  if (!checklist.freio_ok) itens.push("Freio");
  if (!checklist.sem_avaria) itens.push("Avarias");
  return itens;
}

export function getChecklistEmpilhadeiraOcorrencia(
  checklist: Pick<
    ChecklistEmpilhadeira,
    "bateria_ok" | "garfo_ok" | "pneus_ok" | "freio_ok" | "sem_avaria"
  >
) {
  const itens = getChecklistEmpilhadeiraItensReprovados(checklist);
  if (itens.length === 0) return null;
  return `Checklist reprovado: ${itens.join(", ")}.`;
}

export function getUltimoChecklistEmpilhadeira(
  checklists: ChecklistEmpilhadeira[],
  empilhadeiraId: string
) {
  return checklists
    .filter((item) => item.empilhadeira_id === empilhadeiraId)
    .sort(
      (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
    )[0] ?? null;
}
