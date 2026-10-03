import type { Chamado } from "../types/chamado";
import type { Supermercado } from "../types/supermercado";

export type OperationalEscalationSeverity = "low" | "medium" | "critical";

export interface OperationalEscalationSummary {
  unitId: string;
  unitName: string;
  openCalls: number;
  urgentCalls: number;
  delayedCalls: number;
  severity: OperationalEscalationSeverity;
  action: string;
}

export function getNewCriticalEscalations(
  summaries: OperationalEscalationSummary[],
  previouslyCriticalUnitIds: ReadonlySet<string>
): OperationalEscalationSummary[] {
  return summaries.filter(
    (summary) =>
      summary.severity === "critical" && !previouslyCriticalUnitIds.has(summary.unitId)
  );
}

export function getOperationalEscalationTransitions(
  summaries: OperationalEscalationSummary[],
  previouslyCriticalUnitIds: ReadonlySet<string>
): {
  newCritical: OperationalEscalationSummary[];
  resolved: string[];
} {
  const currentCriticalUnitIds = new Set(
    summaries.filter((summary) => summary.severity === "critical").map((summary) => summary.unitId)
  );

  return {
    newCritical: getNewCriticalEscalations(summaries, previouslyCriticalUnitIds),
    resolved: [...previouslyCriticalUnitIds].filter((unitId) => !currentCriticalUnitIds.has(unitId)),
  };
}

function minutesBetween(reference: string | null): number | null {
  if (!reference) return null;
  const diff = Date.now() - new Date(reference).getTime();
  if (diff < 0) return null;
  return Math.max(1, Math.round(diff / 60000));
}

export function getOperationalEscalationSummary(
  chamados: Chamado[],
  supermercados: Supermercado[]
): OperationalEscalationSummary[] {
  const byUnit = new Map<string, Chamado[]>();

  for (const chamado of chamados) {
    const items = byUnit.get(chamado.supermercado_id) ?? [];
    items.push(chamado);
    byUnit.set(chamado.supermercado_id, items);
  }

  return supermercados
    .map((supermercado) => {
      const items = byUnit.get(supermercado.id) ?? [];
      const openCalls = items.filter((item) => item.status !== "Finalizado");
      const urgentCalls = openCalls.filter((item) => item.prioridade === "Urgente");
      const delayedCalls = openCalls.filter((item) => {
        const reference = item.status === "Em atendimento" ? item.iniciado_em : item.criado_em;
        if (!reference) return false;
        const minutes = minutesBetween(reference);
        return minutes !== null && minutes > (item.status === "Em atendimento" ? 90 : 45);
      }).length;

      let severity: OperationalEscalationSeverity = "low";
      if (urgentCalls.length > 0 && delayedCalls > 0) {
        severity = "critical";
      } else if (urgentCalls.length > 0 || delayedCalls > 1 || openCalls.length > 3) {
        severity = "medium";
      }

      let action = "Manter rotina normal e acompanhar variações da fila.";
      if (severity === "critical") {
        action = "Escalonar supervisor e redistribuir urgentes para reduzir fila e atrasos.";
      } else if (severity === "medium") {
        action = "Priorizar revisão dos chamados em atraso e reforçar apoio operacional.";
      }

      return {
        unitId: supermercado.id,
        unitName: supermercado.nome,
        openCalls: openCalls.length,
        urgentCalls: urgentCalls.length,
        delayedCalls,
        severity,
        action,
      };
    })
    .sort((a, b) => {
      const weight = { critical: 3, medium: 2, low: 1 } as const;
      if (weight[b.severity] !== weight[a.severity]) {
        return weight[b.severity] - weight[a.severity];
      }
      if (b.openCalls !== a.openCalls) return b.openCalls - a.openCalls;
      return b.delayedCalls - a.delayedCalls;
    });
}
