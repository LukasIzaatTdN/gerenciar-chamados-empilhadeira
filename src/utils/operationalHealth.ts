import type { Chamado } from "../types/chamado";
import type { Supermercado } from "../types/supermercado";

export type OperationalHealthStatus = "healthy" | "warning" | "critical";

export interface OperationalHealthSummary {
  unitId: string;
  unitName: string;
  total: number;
  urgentes: number;
  emAtraso: number;
  slaPercent: number;
  score: number;
  status: OperationalHealthStatus;
}

function minutesBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  const diff = endTime - startTime;
  if (diff < 0) return null;
  return Math.max(1, Math.round(diff / 60000));
}

export function getOperationalHealthSummary(
  chamados: Chamado[],
  supermercados: Supermercado[]
): OperationalHealthSummary[] {
  const byUnit = new Map<string, Chamado[]>();

  for (const chamado of chamados) {
    const next = byUnit.get(chamado.supermercado_id) ?? [];
    next.push(chamado);
    byUnit.set(chamado.supermercado_id, next);
  }

  return supermercados
    .map((supermercado) => {
      const items = byUnit.get(supermercado.id) ?? [];
      const finalizados = items.filter(
        (item) => item.status === "Finalizado" && item.iniciado_em && item.finalizado_em
      );
      const slaThresholdMinutes = 120;
      const slaAchieved = finalizados.filter((item) => {
        const minutes = minutesBetween(item.iniciado_em, item.finalizado_em);
        return minutes !== null && minutes <= slaThresholdMinutes;
      }).length;
      const slaPercent =
        finalizados.length > 0 ? Math.round((slaAchieved / finalizados.length) * 100) : 100;

      const urgentes = items.filter(
        (item) => item.prioridade === "Urgente" && item.status !== "Finalizado"
      ).length;

      const emAtraso = items.filter((item) => {
        if (item.status === "Finalizado") return false;
        const threshold = item.status === "Em atendimento" ? 120 : 60;
        const reference = item.status === "Em atendimento" ? item.iniciado_em : item.criado_em;
        if (!reference) return false;
        const minutes = minutesBetween(reference, new Date().toISOString());
        return minutes !== null && minutes > threshold;
      }).length;

      let score = 100;
      score -= urgentes * 18;
      score -= emAtraso * 14;
      score -= Math.max(0, items.length - finalizados.length) * 8;
      score -= Math.max(0, 100 - slaPercent) * 0.6;
      score = Math.min(100, Math.max(0, score));

      let status: OperationalHealthStatus = "healthy";
      if (urgentes > 0 || emAtraso > 1) status = "critical";
      else if (score < 80) status = "warning";

      return {
        unitId: supermercado.id,
        unitName: supermercado.nome,
        total: items.length,
        urgentes,
        emAtraso,
        slaPercent,
        score,
        status,
      };
    })
    .sort((a, b) => {
      const statusWeight = { healthy: 1, warning: 2, critical: 3 } as const;
      if (statusWeight[b.status] !== statusWeight[a.status]) {
        return statusWeight[b.status] - statusWeight[a.status];
      }
      if (b.urgentes !== a.urgentes) return b.urgentes - a.urgentes;
      if (b.emAtraso !== a.emAtraso) return b.emAtraso - a.emAtraso;
      return b.score - a.score;
    });
}
