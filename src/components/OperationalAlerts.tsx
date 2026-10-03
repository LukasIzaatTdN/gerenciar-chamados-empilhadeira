import type { AuditoriaItem } from "../hooks/useAuditoria";
import type { OperationalAlert } from "../utils/operationalAlerts";

interface OperationalAlertsProps {
  alerts: OperationalAlert[];
  recentActivity: AuditoriaItem[];
}

const severityClassName: Record<OperationalAlert["severity"], string> = {
  high: "border-red-200 bg-red-50 text-red-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";

  const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));

  if (diffMinutes < 60) return `${diffMinutes} min atrás`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours} h atrás`;
  return `${Math.round(hours / 24)} d atrás`;
}

export default function OperationalAlerts({ alerts, recentActivity }: OperationalAlertsProps) {
  return (
    <section className="mb-5 rounded-[30px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Alertas operacionais</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">
            Situação em tempo real
          </h3>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {alerts.length} foco{alerts.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-[22px] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] ${severityClassName[alert.severity]}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-75">{alert.type}</p>
                <span className="rounded-full bg-white/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                  {alert.count}
                </span>
              </div>

              <p className="mt-2 text-lg font-black tracking-tight">{alert.title}</p>
              <p className="mt-1 text-sm opacity-80">{alert.description}</p>
            </div>
          ))}

          {alerts.length === 0 && (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Sem alertas críticos no momento.
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Atividades recentes</p>
              <p className="text-xs text-slate-500">Ações que impactaram operação e governança.</p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">
              {recentActivity.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {recentActivity.length === 0 && (
              <div className="rounded-[18px] border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-500">
                Nenhuma atividade recente registrada.
              </div>
            )}

            {recentActivity.slice(0, 5).map((activity) => (
              <div key={activity.id} className="rounded-[18px] border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{activity.action}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {activity.actorName} · {activity.entityType}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {formatActivityTime(activity.occurredAt)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {typeof activity.details?.statusAtual === "string"
                    ? `Status atual: ${activity.details.statusAtual}`
                    : activity.entityId}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
