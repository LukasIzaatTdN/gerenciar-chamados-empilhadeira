import type { CSSProperties } from "react";
import AdminIcon, { type AdminIconName } from "./AdminIcon";

export type WorkspaceMetric = {
  label: string;
  value: string | number;
  icon: AdminIconName;
  tone?: "primary" | "waiting" | "success" | "urgent" | "neutral";
  hint?: string;
};

export default function WorkspaceMetrics({ items, label = "Resumo da operação" }: {
  items: readonly WorkspaceMetric[];
  label?: string;
}) {
  return (
    <section className="workspace-metrics" aria-label={label} style={{ "--metric-columns": items.length } as CSSProperties}>
      {items.map(({ label: title, value, icon, tone = "neutral", hint }) => (
        <article key={title} className="workspace-metric" data-tone={tone}>
          <div className="workspace-metric-heading">
            <h2>{title}</h2>
            <span className="workspace-metric-icon"><AdminIcon name={icon} width={18} height={18} /></span>
          </div>
          <p className="workspace-metric-value">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</p>
          {hint && <p className="workspace-metric-hint">{hint}</p>}
        </article>
      ))}
    </section>
  );
}
