import { useMemo, useState } from "react";
import type { Chamado, TipoServico } from "../types/chamado";
import { formatEstimateMinutes } from "../hooks/useTimeEstimates";

interface DashboardProdutividadeProps {
  chamados: Chamado[];
}

type ChartDatum = {
  label: string;
  value: number;
};

const SERVICE_LABELS: TipoServico[] = [
  "Descarga",
  "Reposição",
  "Retirada",
  "Movimentação",
];

type PeriodoFiltro = "Hoje" | "7 dias" | "30 dias";

function sameDay(iso: string, reference: Date) {
  const date = new Date(iso);
  return (
    date.getDate() === reference.getDate() &&
    date.getMonth() === reference.getMonth() &&
    date.getFullYear() === reference.getFullYear()
  );
}

function isWithinDays(iso: string, reference: Date, days: number) {
  const date = new Date(iso);
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return date >= start && date <= reference;
}

function getDurationMinutes(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function getTopSetor(chamados: Chamado[]) {
  if (chamados.length === 0) return { setor: "Sem dados", total: 0 };

  const counts = new Map<string, number>();
  chamados.forEach((chamado) => {
    counts.set(chamado.setor, (counts.get(chamado.setor) ?? 0) + 1);
  });

  const [setor, total] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { setor, total };
}

function buildHourlySeries(chamados: Chamado[]) {
  const buckets = Array.from({ length: 8 }, (_, index) => {
    const hour = index * 3;
    return {
      label: `${String(hour).padStart(2, "0")}h`,
      value: 0,
    };
  });

  chamados.forEach((chamado) => {
    const source = chamado.finalizado_em ?? chamado.iniciado_em ?? chamado.criado_em;
    const hour = new Date(source).getHours();
    const bucketIndex = Math.min(Math.floor(hour / 3), buckets.length - 1);
    buckets[bucketIndex].value += 1;
  });

  return buckets;
}

function buildSectorData(chamados: Chamado[]): ChartDatum[] {
  const counts = new Map<string, number>();

  chamados.forEach((chamado) => {
    counts.set(chamado.setor, (counts.get(chamado.setor) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function buildServiceData(chamados: Chamado[]): ChartDatum[] {
  return SERVICE_LABELS.map((tipo) => ({
    label: tipo,
    value: chamados.filter((chamado) => chamado.tipo_servico === tipo).length,
  }));
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BarChart({
  title,
  subtitle,
  data,
  tone = "blue",
}: {
  title: string;
  subtitle: string;
  data: ChartDatum[];
  tone?: "blue" | "amber";
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  const barColor = tone === "amber" ? "from-amber-400 to-orange-500" : "from-cyan-400 to-blue-500";

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/60">{title}</h3>
        <p className="mt-1 text-sm text-white/45">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {data.length === 0 ? (
          <p className="text-sm text-white/35">Sem dados para exibir hoje.</p>
        ) : (
          data.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium text-white/80">{item.label}</span>
                <span className="font-semibold text-white/45">{item.value}</span>
              </div>
              <div className="h-2 rounded-full bg-white/8">
                <div
                  className={`h-2 rounded-full bg-gradient-to-r ${barColor}`}
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LineChart({ data }: { data: ChartDatum[] }) {
  const width = 100;
  const height = 44;
  const max = Math.max(...data.map((item) => item.value), 1);
  const points = data
    .map((item, index) => {
      const x = data.length === 1 ? 0 : (index / (data.length - 1)) * width;
      const y = height - (item.value / max) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/60">Atendimentos ao longo do dia</h3>
        <p className="mt-1 text-sm text-white/45">Distribuição das movimentações em blocos de 3 horas.</p>
      </div>

      <div className="rounded-[22px] border border-white/8 bg-slate-950/20 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full overflow-visible">
          {[0, 1, 2, 3].map((line) => {
            const y = 6 + (line * (height - 10)) / 3;
            return (
              <line
                key={line}
                x1="0"
                y1={y}
                x2={width}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="2 2"
              />
            );
          })}
          <polyline
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />
          {data.map((item, index) => {
            const x = data.length === 1 ? 0 : (index / (data.length - 1)) * width;
            const y = height - (item.value / max) * (height - 6) - 3;
            return (
              <g key={item.label}>
                <circle cx={x} cy={y} r="2.5" fill="#38bdf8" />
                <text x={x} y={height + 4} textAnchor="middle" fontSize="4" fill="rgba(255,255,255,0.5)">
                  {item.label}
                </text>
              </g>
            );
          })}
          <defs>
            <linearGradient id="lineGradient" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function DonutChart({ data }: { data: ChartDatum[] }) {
  const total = Math.max(
    data.reduce((sum, item) => sum + item.value, 0),
    1
  );
  const colors = ["#22c55e", "#38bdf8", "#f59e0b", "#a855f7"];
  let currentAngle = -90;

  const segments = data.map((item, index) => {
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    const endAngle = currentAngle;

    const start = polarToCartesian(50, 50, 36, endAngle);
    const end = polarToCartesian(50, 50, 36, startAngle);
    const largeArcFlag = angle > 180 ? 1 : 0;
    const path = [
      "M",
      start.x,
      start.y,
      "A",
      36,
      36,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
    ].join(" ");

    return {
      ...item,
      color: colors[index % colors.length],
      path,
    };
  });

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/60">Tipos de serviço</h3>
        <p className="mt-1 text-sm text-white/45">Participação de cada tipo de chamado no período de hoje.</p>
      </div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-full bg-slate-950/20">
          <svg viewBox="0 0 100 100" className="h-40 w-40">
            <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
            {segments.map((segment) => (
              <path
                key={segment.label}
                d={segment.path}
                fill="none"
                stroke={segment.color}
                strokeWidth="12"
                strokeLinecap="round"
              />
            ))}
            <text x="50" y="48" textAnchor="middle" fontSize="8" fill="white" fontWeight="700">
              {data.reduce((sum, item) => sum + item.value, 0)}
            </text>
            <text x="50" y="57" textAnchor="middle" fontSize="4" fill="rgba(255,255,255,0.5)">
              chamados
            </text>
          </svg>
        </div>
        <div className="space-y-3 lg:flex-1">
          {segments.map((segment) => (
            <div
              key={segment.label}
              className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                <span className="text-sm font-medium text-white/80">{segment.label}</span>
              </div>
              <span className="text-sm font-semibold text-white/55">{segment.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export default function DashboardProdutividade({
  chamados,
}: DashboardProdutividadeProps) {
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("Hoje");

  const {
    chamadosFiltrados,
    urgentesFiltrados,
    setorMaisAcionado,
    setorData,
    lineData,
    serviceData,
    setoresMaisSolicitados,
    ultimosAtendimentos,
    mediaMinPeriodo,
  } = useMemo(() => {
    const now = new Date();
    const inPeriod = (iso: string) =>
      periodo === "Hoje"
        ? sameDay(iso, now)
        : periodo === "7 dias"
        ? isWithinDays(iso, now, 7)
        : isWithinDays(iso, now, 30);

    const chamadosFiltrados = chamados.filter((chamado) => inPeriod(chamado.criado_em));
    const urgentesFiltrados = chamadosFiltrados.filter((chamado) => chamado.prioridade === "Urgente");
    const setorMaisAcionado = getTopSetor(chamadosFiltrados);
    const setorData = buildSectorData(chamadosFiltrados);
    const lineData = buildHourlySeries(
      chamados.filter((chamado) => inPeriod(chamado.finalizado_em ?? chamado.iniciado_em ?? chamado.criado_em))
    );
    const serviceData = buildServiceData(chamadosFiltrados);
    const setoresMaisSolicitados = [...setorData].slice(0, 5);
    const ultimosAtendimentos = chamados
      .filter(
        (chamado) =>
          chamado.status === "Finalizado" &&
          chamado.finalizado_em &&
          chamado.iniciado_em &&
          inPeriod(chamado.finalizado_em)
      )
      .sort((a, b) => new Date(b.finalizado_em!).getTime() - new Date(a.finalizado_em!).getTime())
      .slice(0, 5);

    const finalizadosNoPeriodo = chamados.filter(
      (chamado) =>
        chamado.status === "Finalizado" &&
        chamado.iniciado_em &&
        chamado.finalizado_em &&
        inPeriod(chamado.finalizado_em)
    );

    const mediaMinPeriodo =
      finalizadosNoPeriodo.length > 0
        ? Math.max(
            1,
            Math.round(
              finalizadosNoPeriodo.reduce(
                (sum, chamado) =>
                  sum +
                  (new Date(chamado.finalizado_em!).getTime() -
                    new Date(chamado.iniciado_em!).getTime()),
                0
              ) /
                finalizadosNoPeriodo.length /
                60000
            )
          )
        : null;

    return {
      chamadosFiltrados,
      urgentesFiltrados,
      setorMaisAcionado,
      setorData,
      lineData,
      serviceData,
      setoresMaisSolicitados,
      ultimosAtendimentos,
      mediaMinPeriodo,
    };
  }, [chamados, periodo]);

  const cards = [
    {
      label: "Chamados no período",
      value: String(chamadosFiltrados.length),
      tone: "from-cyan-400/20 to-blue-500/15 border-cyan-400/15",
    },
    {
      label: "Tempo médio",
      value: mediaMinPeriodo !== null ? formatEstimateMinutes(mediaMinPeriodo) : "—",
      tone: "from-emerald-400/20 to-green-500/15 border-emerald-400/15",
    },
    {
      label: "Setor mais acionado",
      value: setorMaisAcionado.total > 0 ? setorMaisAcionado.setor : "Sem dados",
      tone: "from-indigo-400/20 to-violet-500/15 border-indigo-400/15",
      secondary: setorMaisAcionado.total > 0 ? `${setorMaisAcionado.total} chamados` : "nenhuma solicitação hoje",
    },
    {
      label: "Urgentes",
      value: String(urgentesFiltrados.length),
      tone: "from-amber-300/20 to-orange-500/15 border-amber-400/15",
    },
  ];

  return (
    <section className="space-y-6">
      <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.88),rgba(30,41,59,0.78))] p-5 shadow-[0_22px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300/80">
              Dashboard de produtividade
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
              Indicadores da operação logística
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-white/55">
              Acompanhe desempenho, setores com maior demanda e a distribuição dos atendimentos ao longo do dia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["Hoje", "7 dias", "30 dias"] as PeriodoFiltro[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriodo(item)}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${
                  periodo === item
                    ? "bg-cyan-400 text-slate-950 shadow-[0_14px_28px_rgba(34,211,238,0.25)]"
                    : "border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-[28px] border bg-gradient-to-br ${card.tone} p-5 shadow-[0_18px_34px_rgba(15,23,42,0.12)] backdrop-blur-sm`}
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/50">{card.label}</p>
            <p className="mt-3 text-2xl font-black tracking-tight text-white">{card.value}</p>
            {card.secondary && (
              <p className="mt-2 text-sm text-white/50">{card.secondary}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <BarChart
          title="Chamados por setor"
          subtitle="Top setores com mais solicitações no dia."
          data={setorData}
        />
        <LineChart data={lineData} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.1fr]">
        <DonutChart data={serviceData} />

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/60">Setores que mais solicitaram</h3>
            <p className="mt-1 text-sm text-white/45">Ranking rápido dos pontos com maior volume de chamados.</p>
          </div>
          <div className="space-y-3">
            {setoresMaisSolicitados.length === 0 ? (
              <p className="text-sm text-white/35">Sem solicitações registradas hoje.</p>
            ) : (
              setoresMaisSolicitados.map((item, index) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white/10 text-xs font-bold text-white/70">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-white/80">{item.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-white/45">{item.value} chamados</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="mb-4">
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/60">Últimos atendimentos realizados</h3>
          <p className="mt-1 text-sm text-white/45">Histórico recente dos atendimentos concluídos pela equipe.</p>
        </div>
        <div className="space-y-3">
          {ultimosAtendimentos.length === 0 ? (
            <p className="text-sm text-white/35">Nenhum atendimento finalizado ainda.</p>
          ) : (
            ultimosAtendimentos.map((chamado) => (
              <div
                key={chamado.id}
                className="grid gap-3 rounded-[24px] border border-white/8 bg-white/5 px-4 py-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{chamado.tipo_servico}</p>
                  <p className="mt-1 text-sm text-white/55">{chamado.setor}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/35">Solicitante</p>
                  <p className="mt-1 text-sm text-white/75">{chamado.solicitante_nome}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/35">Tempo</p>
                  <p className="mt-1 text-sm text-white/75">
                    {getDurationMinutes(chamado.iniciado_em!, chamado.finalizado_em!)} min
                  </p>
                </div>
                <div className="md:text-right">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/35">Concluído</p>
                  <p className="mt-1 text-sm text-white/75">{formatDateTime(chamado.finalizado_em!)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
