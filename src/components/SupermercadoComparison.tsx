import { formatEstimateMinutes } from "../hooks/useTimeEstimates";
import type { Chamado } from "../types/chamado";
import type { Supermercado } from "../types/supermercado";

interface SupermercadoComparisonProps {
  chamados: Chamado[];
  supermercados: Supermercado[];
}

function getMediaMin(chamados: Chamado[]) {
  const finalizados = chamados.filter(
    (chamado) => chamado.status === "Finalizado" && chamado.iniciado_em && chamado.finalizado_em
  );

  if (finalizados.length === 0) return null;

  const total = finalizados.reduce((acc, chamado) => {
    return (
      acc +
      (new Date(chamado.finalizado_em!).getTime() - new Date(chamado.iniciado_em!).getTime())
    );
  }, 0);

  return Math.max(1, Math.round(total / finalizados.length / 60000));
}

export default function SupermercadoComparison({
  chamados,
  supermercados,
}: SupermercadoComparisonProps) {
  const comparativo = supermercados.map((supermercado) => {
    const chamadosUnidade = chamados.filter(
      (chamado) => chamado.supermercado_id === supermercado.id
    );

    return {
      supermercado,
      aguardando: chamadosUnidade.filter((chamado) => chamado.status === "Aguardando").length,
      emAtendimento: chamadosUnidade.filter((chamado) => chamado.status === "Em atendimento").length,
      urgentes: chamadosUnidade.filter(
        (chamado) => chamado.prioridade === "Urgente" && chamado.status !== "Finalizado"
      ).length,
      mediaMin: getMediaMin(chamadosUnidade),
      total: chamadosUnidade.length,
    };
  }).sort((a, b) => b.total - a.total);

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Comparativo entre supermercados
          </p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">
            Desempenho por unidade
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Visão consolidada para comparar demanda e ritmo operacional entre lojas.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {comparativo.map((item) => (
          <div
            key={item.supermercado.id}
            className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.supermercado.nome}</p>
              <p className="mt-1 text-xs text-slate-500">
                {item.supermercado.endereco} · {item.supermercado.codigo}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Aguardando
              </p>
              <p className="mt-1 text-lg font-black text-amber-700">{item.aguardando}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Em atendimento
              </p>
              <p className="mt-1 text-lg font-black text-emerald-700">{item.emAtendimento}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Urgentes
              </p>
              <p className="mt-1 text-lg font-black text-red-700">{item.urgentes}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Tempo médio
              </p>
              <p className="mt-1 text-lg font-black text-slate-900">
                {item.mediaMin !== null ? formatEstimateMinutes(item.mediaMin) : "—"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
