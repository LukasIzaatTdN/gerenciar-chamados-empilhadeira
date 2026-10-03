import type { Chamado } from "../types/chamado";

export type OperationalActionPriority = "high" | "medium" | "low";

export interface OperationalActionPlanItem {
  id: string;
  priority: OperationalActionPriority;
  title: string;
  description: string;
  count: number;
}

export function getOperationalActionPlan(chamados: Chamado[]): OperationalActionPlanItem[] {
  const now = Date.now();

  const urgentes = chamados.filter(
    (item) => item.prioridade === "Urgente" && item.status !== "Finalizado"
  );

  const pendentesSemOperador = chamados.filter(
    (item) => item.status === "Aguardando" && !item.operador_nome
  );

  const atrasados = chamados.filter((item) => {
    if (item.status === "Finalizado") return false;
    if (item.status === "Em atendimento" && item.iniciado_em) {
      return now - new Date(item.iniciado_em).getTime() > 90 * 60_000;
    }
    if (item.status === "Aguardando" && item.criado_em) {
      return now - new Date(item.criado_em).getTime() > 45 * 60_000;
    }
    return false;
  });

  const plan: OperationalActionPlanItem[] = [];

  if (urgentes.length > 0) {
    plan.push({
      id: "urgente-prioridade",
      priority: "high",
      title: `${urgentes.length} chamado${urgentes.length > 1 ? "s" : ""} urgente${urgentes.length > 1 ? "s" : ""} em fila`,
      description: "Escalone a equipe para responder urgências sem perder tempo de atendimento e entrega.",
      count: urgentes.length,
    });
  }

  if (pendentesSemOperador.length > 0) {
    plan.push({
      id: "redistribuir-fila",
      priority: "medium",
      title: `${pendentesSemOperador.length} chamado${pendentesSemOperador.length > 1 ? "s" : ""} sem operador designado`,
      description: "Redistribua os itens pendentes para reduzir o tempo de espera e evitar acúmulo na fila.",
      count: pendentesSemOperador.length,
    });
  }

  if (atrasados.length > 0) {
    plan.push({
      id: "revisar-atraso",
      priority: "medium",
      title: `${atrasados.length} chamado${atrasados.length > 1 ? "s" : ""} acima do tempo de resposta`,
      description: "Revise o histórico dos itens em atraso para liberar bloqueios e reordenar a operação.",
      count: atrasados.length,
    });
  }

  if (plan.length === 0) {
    plan.push({
      id: "operacao-estavel",
      priority: "low",
      title: "Operação estável",
      description: "Não há ações prioritárias pendentes neste momento e a fila está em equilíbrio.",
      count: 0,
    });
  }

  return plan.sort((a, b) => {
    const weight = { high: 3, medium: 2, low: 1 };
    return weight[b.priority] - weight[a.priority];
  });
}
