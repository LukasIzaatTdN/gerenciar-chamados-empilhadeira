import type { OperationalHealthSummary } from "../utils/operationalHealth";

interface OperationalHealthPanelProps {
  healthSummary: OperationalHealthSummary[];
}

const statusToneClass: Record<OperationalHealthSummary["status"], string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-900",
};

const statusLabel: Record<OperationalHealthSummary["status"], string> = {
  healthy: "Saudável",
  warning: "Alerta",
  critical: "Crítico",
};

export default function OperationalHealthPanel({ healthSummary }: OperationalHealthPanelProps) {
  const averageScore =
    healthSummary.length > 0
      ? Math.round(
          healthSummary.reduce((sum, item) => sum + item.score, 0) / healthSummary.length
        )
      : 0;

  const criticalUnits = healthSummary.filter((item) => item.status === "critical").length;

  return (
    <section className="mb-5 rounded-[30px] border border-slate-200 bg-[linear-gradient(145deg,rgba(255,255,255,0.97),rgba(241,245,249,0.95))] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.07)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Saúde operacional</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">Indicadores de risco e estabilidade</h3>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
          Score médio: <span className="font-black text-slate-950">{averageScore}</span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Unidades críticas</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{criticalUnits}</p>
          <p className="mt-2 text-sm text-slate-600">com risco operacional imediato</p>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Urgentes ativos</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {healthSummary.reduce((sum, item) => sum + item.urgentes, 0)}
          </p>
          <p className="mt-2 text-sm text-slate-600">prioridades ainda em fila</p>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Atrasados</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {healthSummary.reduce((sum, item) => sum + item.emAtraso, 0)}
          </p>
          <p className="mt-2 text-sm text-slate-600">itens acima do tempo de resposta</p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-bold">Unidade</th>
                <th className="px-4 py-3 font-bold">Score</th>
                <th className="px-4 py-3 font-bold">Urgentes</th>
                <th className="px-4 py-3 font-bold">Atrasados</th>
                <th className="px-4 py-3 font-bold">SLA</th>
                <th className="px-4 py-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {healthSummary.map((item) => (
                <tr key={item.unitId} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-semibold text-slate-900">{item.unitName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.score >= 80
                        ? "bg-emerald-100 text-emerald-800"
                        : item.score >= 60
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                    }`}>
                      {item.score}
                    </span>
                  </td>
                  <td className="px-4 py-3">{item.urgentes}</td>
                  <td className="px-4 py-3">{item.emAtraso}</td>
                  <td className="px-4 py-3">{item.slaPercent}%</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneClass[item.status]}`}>
                      {statusLabel[item.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
