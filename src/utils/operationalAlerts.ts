import type { Chamado } from "../types/chamado";

export type OperationalAlertType = "urgente" | "atrasado" | "pendente";
export type OperationalAlertSeverity = "high" | "medium" | "low";

export interface OperationalAlert {
  id: string;
  type: OperationalAlertType;
  severity: OperationalAlertSeverity;
  title: string;
  description: string;
  count: number;
}

const MINUTE = 60_000;

function formatMinutes(ms: number) {
  return Math.max(1, Math.round(ms / MINUTE));
}

function getRelevantCount(chamados: Chamado[], predicate: (item: Chamado) => boolean) {
  return chamados.filter(predicate).length;
}

export function getOperationalAlerts(chamados: Chamado[]): OperationalAlert[] {
  const now = Date.now();
  const alerts: OperationalAlert[] = [];

  const urgentes = chamados.filter(
    (item) => item.prioridade === "Urgente" && item.status !== "Finalizado"
  );

  if (urgentes.length > 0) {
    alerts.push({
      id: "urgente",
      type: "urgente",
      severity: "high",
      title: `${urgentes.length} chamado${urgentes.length > 1 ? "s" : ""} urgente${urgentes.length > 1 ? "s" : ""}`,
      description: "Há demanda prioritária ainda aberta e sem fechamento operacional.",
      count: urgentes.length,
    });
  }

  const atrasados = chamados.filter((item) => {
    if (item.status === "Finalizado") return false;
    if (item.status === "Em atendimento" && item.iniciado_em) {
      return now - new Date(item.iniciado_em).getTime() > 90 * MINUTE;
    }
    if (item.status === "Aguardando" && item.criado_em) {
      return now - new Date(item.criado_em).getTime() > 45 * MINUTE;
    }
    return false;
  });

  if (atrasados.length > 0) {
    const maiores = [...atrasados].sort((a, b) => {
      const aTime = a.iniciado_em ? new Date(a.iniciado_em).getTime() : new Date(a.criado_em).getTime();
      const bTime = b.iniciado_em ? new Date(b.iniciado_em).getTime() : new Date(b.criado_em).getTime();
      return bTime - aTime;
    });

    const oldest = maiores[0];
    const oldestMinutes = oldest && oldest.iniciado_em
      ? formatMinutes(now - new Date(oldest.iniciado_em).getTime())
      : oldest && oldest.criado_em
        ? formatMinutes(now - new Date(oldest.criado_em).getTime())
        : 0;

    alerts.push({
      id: "atrasado",
      type: "atrasado",
      severity: "medium",
      title: `${atrasados.length} chamado${atrasados.length > 1 ? "s" : ""} em atraso`,
      description: `O mais antigo ficou sem evolução por ${oldestMinutes} min.`,
      count: atrasados.length,
    });
  }

  const pendentes = chamados.filter((item) => {
    if (item.status !== "Aguardando" || item.operador_nome) return false;
    if (!item.criado_em) return false;
    const age = now - new Date(item.criado_em).getTime();
    return age > 20 * MINUTE;
  });

  if (pendentes.length > 0) {
    alerts.push({
      id: "pendente",
      type: "pendente",
      severity: "low",
      title: `${pendentes.length} chamado${pendentes.length > 1 ? "s" : ""} pendente${pendentes.length > 1 ? "s" : ""}`,
      description: "Há demanda sem operador designado e aguardando início do atendimento.",
      count: pendentes.length,
    });
  }

  const totalCritical = getRelevantCount(chamados, (item) => item.prioridade === "Urgente" && item.status !== "Finalizado");
  const totalDelayed = getRelevantCount(chamados, (item) => {
    if (item.status === "Finalizado") return false;
    if (item.status === "Em atendimento" && item.iniciado_em) {
      return now - new Date(item.iniciado_em).getTime() > 90 * MINUTE;
    }
    if (item.status === "Aguardando" && item.criado_em) {
      return now - new Date(item.criado_em).getTime() > 45 * MINUTE;
    }
    return false;
  });

  if (alerts.length === 0) {
    alerts.push({
      id: "ok",
      type: "pendente",
      severity: "low",
      title: "Operação estável",
      description: "Nenhum ponto crítico foi identificado no momento.",
      count: 0,
    });
  }

  if (totalCritical > 0 || totalDelayed > 0) {
    return alerts
      .sort((a, b) => {
        const weight = { high: 3, medium: 2, low: 1 };
        return weight[b.severity] - weight[a.severity];
      })
      .slice(0, 3);
  }

  return alerts.slice(0, 3);
}
