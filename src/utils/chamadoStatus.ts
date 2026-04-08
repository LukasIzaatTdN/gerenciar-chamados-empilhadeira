import type { Chamado, CategoriaChamado, Status } from "../types/chamado";

export function getCategoriaChamado(chamado: Pick<Chamado, "categoria" | "tipo_servico">): CategoriaChamado {
  if (chamado.categoria === "televendas") return "televendas";
  if (chamado.tipo_servico === "Atendimento Televendas") return "televendas";
  return "operacional";
}

export function isTelevendasChamado(chamado: Pick<Chamado, "categoria" | "tipo_servico">) {
  return getCategoriaChamado(chamado) === "televendas";
}

export function isFinalizadoStatus(status: Status) {
  return status === "Finalizado";
}

export function isPendenteStatus(status: Status) {
  return (
    status === "Aguardando" ||
    status === "Aberto" ||
    status === "Em separação" ||
    status === "Incompleto" ||
    status === "Pronto"
  );
}

export function isEmAtendimentoStatus(status: Status) {
  return status === "Em atendimento" || status === "Em separação" || status === "Pronto";
}
