import type { Empresa } from "../types/empresa";
import type { Supermercado } from "../types/supermercado";

interface AdminScopeSelectorProps {
  empresaValue: string;
  supermercadoValue: string;
  onEmpresaChange: (nextValue: string) => void;
  onSupermercadoChange: (nextValue: string) => void;
  empresas: Empresa[];
  supermercados: Supermercado[];
  allowEmpresaSelection?: boolean;
}

export default function AdminScopeSelector({
  empresaValue,
  supermercadoValue,
  onEmpresaChange,
  onSupermercadoChange,
  empresas,
  supermercados,
  allowEmpresaSelection = false,
}: AdminScopeSelectorProps) {
  const supermercadosVisiveis =
    empresaValue === "todas"
      ? supermercados
      : supermercados.filter((supermercado) => supermercado.empresa_id === empresaValue);

  return (
    <section className="mb-5 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Escopo global do administrador
          </p>
          <p className="mt-1 text-sm text-slate-500">
            O mesmo filtro é aplicado automaticamente em dashboard, fila, histórico e gestão administrativa.
          </p>
        </div>
        <div className="grid w-full gap-3 sm:max-w-2xl sm:grid-cols-2">
          {allowEmpresaSelection && (
            <div>
              <label htmlFor="global-empresa-scope" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Empresa selecionada
              </label>
              <select id="global-empresa-scope" value={empresaValue} onChange={(e) => onEmpresaChange(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)] focus:border-[#0f3d75] focus:outline-none focus:ring-4 focus:ring-blue-100">
                <option value="todas">Todas as empresas</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="global-supermercado-scope" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Unidade selecionada
            </label>
            <select id="global-supermercado-scope" value={supermercadoValue} onChange={(e) => onSupermercadoChange(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)] focus:border-[#0f3d75] focus:outline-none focus:ring-4 focus:ring-blue-100">
              <option value="todos">Todas as unidades</option>
              {supermercadosVisiveis.map((supermercado) => (
                <option key={supermercado.id} value={supermercado.id}>
                  {supermercado.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}
