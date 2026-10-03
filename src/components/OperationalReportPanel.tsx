import { exportAuditCsv, type UnitSlaSummary } from "../utils/operationalReports";

interface OperationalReportPanelProps {
  slaSummary: UnitSlaSummary[];
  auditRows: Array<{
    id: string;
    action: string;
    actorName: string;
    entityType: string;
    entityId: string;
    occurredAt: string;
    details?: Record<string, unknown>;
  }>;
}

const toneClassName = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-900",
};

export default function OperationalReportPanel({
  slaSummary,
  auditRows,
}: OperationalReportPanelProps) {
  const bestUnit = slaSummary.reduce<UnitSlaSummary | null>((current, item) => {
    if (!current) return item;
    const currentScore = current.slaAchieved + current.urgentes * -2;
    const itemScore = item.slaAchieved + item.urgentes * -2;
    return itemScore > currentScore ? item : current;
  }, null);

  const exportAudit = () => {
    const csv = exportAuditCsv(auditRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "auditoria-operacional.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const overviewCards = [
    {
      label: "SLA melhor unidade",
      value: bestUnit ? bestUnit.unitName : "—",
      meta: bestUnit ? `${bestUnit.slaAchieved}/${Math.max(1, bestUnit.slaTotal)} atendimentos sob SLA` : "sem dados",
      tone: toneClassName.healthy,
    },
    {
      label: "Total monitorado",
      value: String(slaSummary.reduce((sum, item) => sum + item.total, 0)),
      meta: `${slaSummary.length} unidades no recorte`,
      tone: toneClassName.warning,
    },
    {
      label: "Urgentes ativos",
      value: String(slaSummary.reduce((sum, item) => sum + item.urgentes, 0)),
      meta: "chamados ainda abertos prioritários",
      tone: toneClassName.critical,
    },
  ];

  return (
    <section className="mb-5 rounded-[30px] border border-slate-200 bg-[linear-gradient(145deg,rgba(255,255,255,0.97),rgba(248,250,252,0.95))] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Relatório executivo</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">SLA e acompanhamento operacional</h3>
        </div>

        <button
          type="button"
          onClick={exportAudit}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Exportar auditoria CSV
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {overviewCards.map((card) => (
          <div key={card.label} className={`rounded-[24px] border p-4 ${card.tone}`}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-75">{card.label}</p>
            <p className="mt-2 text-2xl font-black tracking-tight">{card.value}</p>
            <p className="mt-2 text-sm opacity-80">{card.meta}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-bold">Unidade</th>
                <th className="px-4 py-3 font-bold">Total</th>
                <th className="px-4 py-3 font-bold">Urgentes</th>
                <th className="px-4 py-3 font-bold">Atraso</th>
                <th className="px-4 py-3 font-bold">Média atendimento</th>
                <th className="px-4 py-3 font-bold">SLA</th>
              </tr>
            </thead>
            <tbody>
              {slaSummary.map((item) => {
                const slaPercent = item.slaTotal > 0 ? Math.round((item.slaAchieved / item.slaTotal) * 100) : 0;
                return (
                  <tr key={item.unitId} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-semibold text-slate-900">{item.unitName}</td>
                    <td className="px-4 py-3">{item.total}</td>
                    <td className="px-4 py-3">{item.urgentes}</td>
                    <td className="px-4 py-3">{item.emAtraso}</td>
                    <td className="px-4 py-3">{item.mediaAtendimento !== null ? `${item.mediaAtendimento} min` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        slaPercent >= 80
                          ? "bg-emerald-100 text-emerald-800"
                          : slaPercent >= 60
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                      }`}>
                        {slaPercent}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
