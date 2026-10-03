import type { Chamado } from "../types/chamado";
import type { Supermercado } from "../types/supermercado";

export type OperationalForecastRisk = "low" | "medium" | "high";

export interface OperationalForecastSummary {
  unitId: string;
  unitName: string;
  openCalls: number;
  urgentCalls: number;
  averageAgeMinutes: number;
  predictedQueueMinutes: number;
  risk: OperationalForecastRisk;
  recommendation: string;
}

function minutesBetween(reference: string | null): number | null {
  if (!reference) return null;
  const start = new Date(reference).getTime();
  const end = Date.now();
  if (!Number.isFinite(start)) return null;
  const diff = end - start;
  if (diff < 0) return null;
  return Math.max(1, Math.round(diff / 60000));
}

export function getOperationalForecastSummary(
  chamados: Chamado[],
  supermercados: Supermercado[]
): OperationalForecastSummary[] {
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

      const ages = openCalls
        .map((item) => {
          const reference = item.iniciado_em ?? item.assumido_em ?? item.criado_em ?? null;
          return minutesBetween(reference);
        })
        .filter((item): item is number => typeof item === "number");

      const averageAgeMinutes =
        ages.length > 0 ? Math.round(ages.reduce((sum, item) => sum + item, 0) / ages.length) : 0;

      const predictedQueueMinutes =
        openCalls.length === 0
          ? 0
          : Math.max(
              averageAgeMinutes + Math.max(0, openCalls.length - 1) * 18 + urgentCalls.length * 22,
              25
            );

      let risk: OperationalForecastRisk = "low";
      if (
        openCalls.length > 1 && urgentCalls.length > 0 ||
        predictedQueueMinutes >= 120 ||
        (averageAgeMinutes > 0 && averageAgeMinutes >= 90)
      ) {
        risk = "high";
      } else if (
        urgentCalls.length > 0 ||
        predictedQueueMinutes >= 70 ||
        (averageAgeMinutes > 0 && averageAgeMinutes >= 45)
      ) {
        risk = "medium";
      }

      let recommendation = "A operação está estável e a fila segue em equilíbrio.";
      if (openCalls.length === 0) {
        recommendation = "Sem backlog ativo na unidade; concentre o foco em manutenção preventiva.";
      } else if (risk === "high") {
        recommendation = "Redistribua atenção para urgentes e revise a fila antes do próximo pico operacional.";
      } else if (risk === "medium") {
        recommendation = "Priorize revisões rápidas na fila para reduzir o tempo médio de espera.";
      }

      return {
        unitId: supermercado.id,
        unitName: supermercado.nome,
        openCalls: openCalls.length,
        urgentCalls: urgentCalls.length,
        averageAgeMinutes,
        predictedQueueMinutes,
        risk,
        recommendation,
      };
    })
    .sort((a, b) => {
      const weight = { high: 3, medium: 2, low: 1 } as const;
      if (weight[b.risk] !== weight[a.risk]) {
        return weight[b.risk] - weight[a.risk];
      }
      if (b.predictedQueueMinutes !== a.predictedQueueMinutes) {
        return b.predictedQueueMinutes - a.predictedQueueMinutes;
      }
      return b.urgentCalls - a.urgentCalls;
    });
}
