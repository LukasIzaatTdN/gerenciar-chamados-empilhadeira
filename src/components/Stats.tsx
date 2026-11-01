import { formatEstimateMinutes } from "../hooks/useTimeEstimates";
import WorkspaceMetrics from "./WorkspaceMetrics";

interface StatsProps {
  stats: {
    aguardando: number;
    emAtendimento: number;
    finalizadosHoje: number;
    urgentes: number;
    setorMaisAcionado: string;
  };
  mediaMin: number | null;
  totalFinalizadosComTempo: number;
  finalizadosLabel?: string;
}

export default function Stats({ stats, mediaMin, totalFinalizadosComTempo, finalizadosLabel = "Finalizados Hoje" }: StatsProps) {
  return <WorkspaceMetrics items={[
    { label: "Aguardando", value: stats.aguardando, icon: "clock", tone: "waiting" },
    { label: "Em atendimento", value: stats.emAtendimento, icon: "forklift", tone: "primary" },
    { label: finalizadosLabel, value: stats.finalizadosHoje, icon: "check", tone: "success" },
    { label: "Urgentes", value: stats.urgentes, icon: "alert", tone: "urgent" },
    { label: "Setor mais acionado", value: stats.setorMaisAcionado, icon: "location", hint: stats.setorMaisAcionado === "Sem dados" ? "Nenhuma solicitação ainda" : "Maior demanda do período" },
    { label: "Tempo médio", value: mediaMin !== null ? formatEstimateMinutes(mediaMin) : "—", icon: "clock", tone: "primary", hint: totalFinalizadosComTempo > 0 ? `Baseado em ${totalFinalizadosComTempo} atendimento${totalFinalizadosComTempo !== 1 ? "s" : ""}` : "Sem dados ainda" },
  ]} />;
}
