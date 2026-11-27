// Prévia isolada: não integra consultas nem garante autorização no servidor.
// Antes de conectar ao painel, proteger leitura e regras no backend/Firestore.
import type { ReactNode } from "react";

type Item = {
  produto: string;
  unidadeMedida: string;
  quantidadeSolicitada: number;
  quantidadeEncontrada: number;
  quantidadeFaltante: number;
};

type Pedido = {
  id: string;
  solicitante_uid?: string | null;
  empresa_id: string;
  supermercado_id: string;
  categoria: string;
  status: string;
  numero_pedido: string | null;
  cliente: string | null;
  itens?: Item[] | null;
  motivo_incompleto?: string | null;
};

type Props = {
  pedidos: Pedido[];
  usuarioUid: string | null;
  empresaId: string | null;
  supermercadoId: string | null;
};

// Defesa em profundidade, não substitui as regras de acesso no banco.
export function filtrarPedidosProprios({ pedidos, usuarioUid, empresaId, supermercadoId }: Props): Pedido[] {
  if (!usuarioUid || !empresaId || !supermercadoId) return [];
  return pedidos.filter((p) =>
    p.solicitante_uid === usuarioUid && p.empresa_id === empresaId &&
    p.supermercado_id === supermercadoId && p.categoria === "televendas" &&
    ["Pronto", "Incompleto", "Finalizado"].includes(p.status)
  );
}

export function PedidosSeparadosPreview(props: Props): ReactNode {
  const pedidos = filtrarPedidosProprios(props);
  return (
    <section aria-labelledby="pedidos-separados-titulo" className="mb-6 space-y-4">
      <h2 id="pedidos-separados-titulo" className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Meus pedidos separados</h2>
      {pedidos.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-600">Nenhum pedido para mostrar.</p>}
      {pedidos.map((pedido) => (
        <article key={pedido.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">Pedido {pedido.numero_pedido || "sem número"}</h3>
            <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-800">{pedido.status}</span>
          </div>
          {pedido.cliente && <p className="mt-3 text-sm text-slate-700">Cliente: {pedido.cliente}</p>}
          {pedido.itens?.length ? (
            <ul className="mt-3 space-y-2">
              {pedido.itens.map((item, index) => (
                <li key={index} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
                  <p className="font-bold text-slate-900">{item.produto}</p>
                  <p>Solicitado: {item.quantidadeSolicitada} {item.unidadeMedida} · Encontrado: {item.quantidadeEncontrada} · Falta: {item.quantidadeFaltante}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-600">Itens não disponíveis.</p>}
          {pedido.motivo_incompleto && <p className="mt-3 text-sm">Motivo: {pedido.motivo_incompleto}</p>}
        </article>
      ))}
    </section>
  );
}
