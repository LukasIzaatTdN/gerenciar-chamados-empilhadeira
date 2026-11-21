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
    <section aria-labelledby="pedidos-separados-titulo" className="space-y-3">
      <h2 id="pedidos-separados-titulo" className="text-lg font-semibold">Meus pedidos separados</h2>
      {pedidos.length === 0 && <p className="text-sm text-slate-600">Nenhum pedido para mostrar.</p>}
      {pedidos.map((pedido) => (
        <article key={pedido.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Pedido {pedido.numero_pedido || "sem número"}</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">{pedido.status}</span>
          </div>
          {pedido.cliente && <p className="mt-1 text-sm">Cliente: {pedido.cliente}</p>}
          {pedido.itens?.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {pedido.itens.map((item, index) => (
                <li key={index} className="py-2 text-sm">
                  <p className="font-medium">{item.produto}</p>
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
