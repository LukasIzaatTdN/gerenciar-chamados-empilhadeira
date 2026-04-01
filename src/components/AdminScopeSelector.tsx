import type { Supermercado } from "../types/supermercado";

interface AdminScopeSelectorProps {
  value: string;
  onChange: (nextValue: string) => void;
  supermercados: Supermercado[];
}

export default function AdminScopeSelector({
  value,
  onChange,
  supermercados,
}: AdminScopeSelectorProps) {
  return (
    <section className="mb-5 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Escopo global do administrador
          </p>
          <p className="mt-1 text-sm text-slate-500">
            O mesmo filtro é aplicado automaticamente em dashboard, fila, histórico e relatórios.
          </p>
        </div>
        <div className="w-full sm:max-w-sm">
          <label
            htmlFor="global-supermercado-scope"
            className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
          >
            Supermercado selecionado
          </label>
          <select
            id="global-supermercado-scope"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)] focus:border-[#0f3d75] focus:outline-none focus:ring-4 focus:ring-blue-100"
          >
            <option value="todos">Todas as unidades</option>
            {supermercados.map((supermercado) => (
              <option key={supermercado.id} value={supermercado.id}>
                {supermercado.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
