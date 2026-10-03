import type { Chamado } from "../types/chamado";
import type { Supermercado } from "../types/supermercado";

export interface UnitSlaSummary {
  unitId: string;
  unitName: string;
  total: number;
  urgentes: number;
  emAtraso: number;
  mediaAtendimento: number | null;
  slaAchieved: number;
  slaTotal: number;
}

export interface ExportAuditRow {
  action: string;
  actorName: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  details?: Record<string, unknown>;
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

export function getUnitSlaSummary(
  chamados: Chamado[],
  supermercados: Supermercado[]
): UnitSlaSummary[] {
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
      const mediaAtendimento =
        finalizados.length > 0
          ? Math.round(
              finalizados.reduce((sum, item) => {
                const minutes = minutesBetween(item.iniciado_em, item.finalizado_em);
                return sum + (minutes ?? 0);
              }, 0) / finalizados.length
            )
          : null;

      const slaAchieved = finalizados.filter((item) => {
        const minutes = minutesBetween(item.iniciado_em, item.finalizado_em);
        return minutes !== null && minutes <= 90;
      }).length;

      const urgentes = items.filter(
        (item) => item.prioridade === "Urgente" && item.status !== "Finalizado"
      ).length;

      const emAtraso = items.filter((item) => {
        if (item.status === "Finalizado") return false;
        const threshold = item.status === "Em atendimento" ? 90 : 45;
        const reference = item.status === "Em atendimento" ? item.iniciado_em : item.criado_em;
        if (!reference) return false;
        const minutes = minutesBetween(reference, new Date().toISOString());
        return minutes !== null && minutes > threshold;
      }).length;

      return {
        unitId: supermercado.id,
        unitName: supermercado.nome,
        total: items.length,
        urgentes,
        emAtraso,
        mediaAtendimento,
        slaAchieved,
        slaTotal: finalizados.length,
      };
    })
    .sort((a, b) => {
      if (b.urgentes !== a.urgentes) return b.urgentes - a.urgentes;
      if (b.emAtraso !== a.emAtraso) return b.emAtraso - a.emAtraso;
      return b.total - a.total;
    });
}

export function exportAuditCsv(rows: ReadonlyArray<ExportAuditRow>) {
  const headers = ["action", "actorName", "entityType", "entityId", "occurredAt", "details"];
  const values = rows.map((row) => {
    const details = JSON.stringify(row.details ?? {});
    return [
      row.action,
      row.actorName,
      row.entityType,
      row.entityId,
      row.occurredAt,
      details,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",");
  });

  return [headers.join(","), ...values].join("\n");
}
