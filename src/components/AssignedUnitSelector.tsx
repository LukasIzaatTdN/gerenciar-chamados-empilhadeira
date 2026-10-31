import type { Supermercado } from "../types/supermercado";

interface AssignedUnitSelectorProps {
  unidades: Supermercado[];
  valor: string | null;
  permitirConsolidado: boolean;
  onChange: (supermercadoId: string | null) => void;
}

export default function AssignedUnitSelector({
  unidades,
  valor,
  permitirConsolidado,
  onChange,
}: AssignedUnitSelectorProps) {
  if (unidades.length < 2) return null;

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <label htmlFor="assigned-unit-scope" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        Unidade autorizada
      </label>
      <select
        id="assigned-unit-scope"
        value={valor ?? (permitirConsolidado ? "todas-atribuidas" : unidades[0]?.id ?? "")}
        onChange={(event) => onChange(event.target.value === "todas-atribuidas" ? null : event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 focus:border-[#0f3d75] focus:outline-none focus:ring-4 focus:ring-blue-100 sm:max-w-md"
      >
        {permitirConsolidado && <option value="todas-atribuidas">Todas as unidades atribuídas</option>}
        {unidades.filter((unit) => unit.status === "Ativo").map((unit) => (
          <option key={unit.id} value={unit.id}>{unit.nome}</option>
        ))}
      </select>
    </section>
  );
}
