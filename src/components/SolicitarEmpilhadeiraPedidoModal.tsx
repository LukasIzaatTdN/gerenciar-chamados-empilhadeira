import { useRef, useState } from "react";
import type { Chamado, ItemTelevendas, TipoServico } from "../types/chamado";
import type { NovoChamadoInput } from "../hooks/useChamados";
import { TIPOS_SERVICO_OPERACIONAIS } from "../types/chamado";
import { formatQuantidadeComUnidade } from "../utils/televendasItems";
import { submitLinkedPalletCall } from "../utils/linkedTelevendasCall";

interface SolicitarEmpilhadeiraPedidoModalProps {
  pedido: Chamado;
  item: ItemTelevendas;
  itemIndex: number;
  solicitanteNome: string;
  onCreate: (input: NovoChamadoInput) => Promise<unknown>;
  onClose: () => void;
}

export default function SolicitarEmpilhadeiraPedidoModal({
  pedido,
  item,
  itemIndex,
  solicitanteNome,
  onCreate,
  onClose,
}: SolicitarEmpilhadeiraPedidoModalProps) {
  const [quantidade, setQuantidade] = useState(String(item.quantidadeSolicitada));
  const [localizacao, setLocalizacao] = useState("");
  const [tipoServico, setTipoServico] = useState<Exclude<TipoServico, "Atendimento Televendas">>("Movimentação");
  const [observacoes, setObservacoes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLock = useRef(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || success) return;

    const requestedQuantity = Number(quantidade);
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      setError("Informe uma quantidade maior que zero.");
      return;
    }
    if (!localizacao.trim()) {
      setError("Informe a localização do pallet.");
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      await submitLinkedPalletCall(
        {
          pedido,
          item,
          itemIndex,
          solicitanteNome,
          quantidadeSolicitada: requestedQuantity,
          localizacaoPallet: localizacao,
          tipoServico,
          observacoes,
        },
        onCreate
      );
      setSuccess(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : "Não foi possível registrar a solicitação. Tente novamente."
      );
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto overscroll-none bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="solicitar-empilhadeira-title"
        className="flex max-h-[calc(100dvh-0.5rem)] w-full max-w-xl flex-col overflow-y-auto rounded-t-[28px] border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-[28px]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">Pedido {pedido.numero_pedido}</p>
            <h2 id="solicitar-empilhadeira-title" className="mt-1 text-lg font-black text-slate-900">
              Solicitar Empilhadeira
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Fechar formulário"
            className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            Fechar
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Produto do pedido</label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
                {item.produto}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Quantidade original: {formatQuantidadeComUnidade(item.quantidadeSolicitada, item.unidadeMedida)}
              </p>
            </div>

            <div>
              <label htmlFor="pallet-request-quantity" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Quantidade solicitada *
              </label>
              <input
                id="pallet-request-quantity"
                type="number"
                min="0.01"
                step="any"
                inputMode="decimal"
                value={quantidade}
                onChange={(event) => setQuantidade(event.target.value)}
                disabled={isSubmitting || success}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-100"
              />
            </div>

            <div>
              <label htmlFor="pallet-request-type" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Tipo de movimentação *
              </label>
              <select
                id="pallet-request-type"
                value={tipoServico}
                onChange={(event) => setTipoServico(event.target.value as typeof tipoServico)}
                disabled={isSubmitting || success}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-100"
              >
                {TIPOS_SERVICO_OPERACIONAIS.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="pallet-request-location" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Localização do pallet *
              </label>
              <input
                id="pallet-request-location"
                type="text"
                value={localizacao}
                onChange={(event) => setLocalizacao(event.target.value)}
                placeholder="Ex.: Rua 4, módulo 2, nível 1"
                disabled={isSubmitting || success}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="pallet-request-notes" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Observação <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <textarea
                id="pallet-request-notes"
                rows={3}
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                disabled={isSubmitting || success}
                placeholder="Detalhes para o operador"
                className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-100"
              />
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
          {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">Solicitação registrada e enviada à fila operacional.</p>}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="min-h-11 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {success ? "Concluir" : "Cancelar"}
            </button>
            {!success && (
              <button type="submit" disabled={isSubmitting} className="min-h-11 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/15 hover:bg-indigo-600 disabled:cursor-wait disabled:opacity-60">
                {isSubmitting ? "Enviando solicitação..." : "Enviar solicitação"}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
