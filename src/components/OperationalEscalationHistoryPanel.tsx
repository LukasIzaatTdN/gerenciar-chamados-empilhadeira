import type { OperationalEscalationRecord } from "../services/operationalEscalation";

interface OperationalEscalationHistoryPanelProps {
  escalations: OperationalEscalationRecord[];
}

const statusTone: Record<OperationalEscalationRecord["status"], string> = {
  active: "border-red-200 bg-red-50 text-red-900",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

const severityTone: Record<OperationalEscalationRecord["severity"], string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-900",
};

const severityLabel: Record<OperationalEscalationRecord["severity"], string> = {
  low: "Baixo",
  medium: "Médio",
  critical: "Crítico",
};

function formatRelativeTime(value: string | null) {
  if (!value) return "sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";

  const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min atrás`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h atrás`;
  return `${Math.round(diffHours / 24)} d atrás`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OperationalEscalationHistoryPanel({
  escalations,
}: OperationalEscalationHistoryPanelProps) {
  return (
    <section className="mb-5 rounded-[30px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Histórico de escalas</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">Timeline por unidade e supervisão</h3>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {escalations.filter((item) => item.status === "active").length} ativas
        </span>
      </div>

      {escalations.length === 0 && (
        <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Nenhuma escala registrada até o momento.
        </div>
      )}

      <div className="mt-5 space-y-3">
        {escalations.map((item) => (
          <div key={item.id} className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusTone[item.status]}`}>
                    {item.status === "active" ? "Ativa" : "Resolvida"}
                  </span>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${severityTone[item.severity]}`}>
                    {severityLabel[item.severity]}
                  </span>
                </div>
                <p className="mt-3 text-lg font-black tracking-tight text-slate-950">{item.unitName}</p>
                <p className="mt-1 text-xs text-slate-500">Supervisor da unidade · Última atualização {formatRelativeTime(item.updatedAt)}</p>
              </div>

              <div className="grid min-w-[180px] grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-700">
                <div className="rounded-xl bg-white px-2 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Abertos</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{item.openCalls}</div>
                </div>
                <div className="rounded-xl bg-white px-2 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Urg.</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{item.urgentCalls}</div>
                </div>
                <div className="rounded-xl bg-white px-2 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Atras.</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{item.delayedCalls}</div>
                </div>
              </div>
            </div>

            <p className="mt-3 text-sm font-medium text-slate-700">{item.action}</p>

            <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-3 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>Início: {formatDate(item.createdAt)}</span>
              <span>
                {item.status === "active"
                  ? "Status: em vigência"
                  : `Resolvido em: ${formatDate(item.resolvedAt)}`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
