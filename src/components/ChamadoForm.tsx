import { useEffect, useMemo, useState } from "react";
import type {
  CategoriaChamado,
  ItemTelevendas,
  Prioridade,
  Setor,
  TipoServico,
} from "../types/chamado";
import {
  PRIORIDADES,
  TIPOS_SERVICO_OPERACIONAIS,
  UNIDADES_MEDIDA_TELEVENDAS,
} from "../types/chamado";
import type { NovoChamadoInput } from "../hooks/useChamados";
import type { Supermercado } from "../types/supermercado";
import { normalizeItemTelevendas } from "../utils/televendasItems";

type NovoChamadoFormInput = Omit<NovoChamadoInput, "empresa_id" | "supermercado_id">;

interface ChamadoFormProps {
  solicitanteNome: string;
  solicitantePerfil?: string | null;
  supermercadoNome?: string | null;
  isAdminGeral?: boolean;
  supermercados?: Supermercado[];
  supermercadoSelecionadoId?: string;
  onSupermercadoSelecionadoChange?: (id: string) => void;
  onSubmit: (data: NovoChamadoFormInput) => void | Promise<void>;
  onCancel: () => void;
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
    reader.readAsDataURL(file);
  });
}

export default function ChamadoForm({
  solicitanteNome,
  solicitantePerfil,
  supermercadoNome,
  isAdminGeral = false,
  supermercados = [],
  supermercadoSelecionadoId = "",
  onSupermercadoSelecionadoChange,
  onSubmit,
  onCancel,
}: ChamadoFormProps) {
  const createEmptyItem = (): ItemTelevendas => ({
    produto: "",
    unidadeMedida: "Unidade",
    quantidadeSolicitada: 0,
    quantidadeEncontrada: 0,
    quantidadeFaltante: 0,
  });

  const [nomeSolicitante, setNomeSolicitante] = useState(solicitanteNome || "");
  const [categoria, setCategoria] = useState<CategoriaChamado>("operacional");
  const [setor, setSetor] = useState<Setor>("");
  const [localExato, setLocalExato] = useState("");
  const [tipoServico, setTipoServico] = useState<TipoServico>("Descarga");
  const [numeroPedido, setNumeroPedido] = useState("");
  const [cliente, setCliente] = useState("");
  const [itensTelevendas, setItensTelevendas] = useState<ItemTelevendas[]>([createEmptyItem()]);
  const [localSeparacao, setLocalSeparacao] = useState("");
  const [prazoLimite, setPrazoLimite] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("Normal");
  const [observacoes, setObservacoes] = useState("");
  const [fotoNome, setFotoNome] = useState<string | null>(null);
  const [fotoDataUrl, setFotoDataUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isTelevendas = solicitantePerfil === "Televendas";
  const isModoTelevendas = categoria === "televendas";

  useEffect(() => {
    setNomeSolicitante((prev) => (prev.trim() ? prev : solicitanteNome || ""));
  }, [solicitanteNome]);

  useEffect(() => {
    if (isTelevendas) {
      setCategoria("televendas");
      setTipoServico("Atendimento Televendas");
    }
  }, [isTelevendas]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverscroll = html.style.overscrollBehaviorY;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehaviorY;

    html.style.overscrollBehaviorY = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehaviorY = "none";

    return () => {
      html.style.overscrollBehaviorY = previousHtmlOverscroll;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehaviorY = previousBodyOverscroll;
    };
  }, []);

  const tipoIcons = useMemo<Record<TipoServico, string>>(
    () => ({
      Descarga: "📦",
      Reposição: "🔄",
      Retirada: "📤",
      Movimentação: "🚚",
      "Apoio interno": "🧰",
      "Atendimento Televendas": "📞",
    }),
    []
  );

  async function handleFotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setFotoNome(null);
      setFotoDataUrl(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrors((prev) => ({ ...prev, foto: "Selecione um arquivo de imagem válido." }));
      return;
    }

    try {
      const dataUrl = await toDataUrl(file);
      setFotoNome(file.name);
      setFotoDataUrl(dataUrl);
      setErrors((prev) => ({ ...prev, foto: "" }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível anexar a foto agora.";
      setErrors((prev) => ({ ...prev, foto: message }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!nomeSolicitante.trim()) {
      newErrors.nome = "Informe o nome do solicitante.";
    }
    if (!setor.trim()) {
      newErrors.setor = "Informe o setor.";
    }
    if (!isModoTelevendas && !localExato.trim()) {
      newErrors.local = "Informe o local exato.";
    }
    if (isModoTelevendas && !numeroPedido.trim()) {
      newErrors.numeroPedido = "Informe o número do pedido.";
    }
    if (isModoTelevendas && !cliente.trim()) {
      newErrors.cliente = "Informe o cliente.";
    }
    const itensNormalizados = isModoTelevendas
      ? itensTelevendas
          .map((item) =>
            normalizeItemTelevendas({
              produto: item.produto,
              quantidadeSolicitada: item.quantidadeSolicitada,
              unidadeMedida: item.unidadeMedida,
              quantidadeEncontrada: 0,
            })
          )
          .filter((item): item is ItemTelevendas => Boolean(item))
      : [];

    if (isModoTelevendas && itensNormalizados.length === 0) {
      newErrors.itens = "Adicione ao menos um item com produto e quantidade solicitada.";
    }
    if (isModoTelevendas && !localSeparacao.trim()) {
      newErrors.localSeparacao = "Informe o local de separação.";
    }
    if (isModoTelevendas && !prazoLimite.trim()) {
      newErrors.prazoLimite = "Informe o prazo/horário limite.";
    }
    if (isAdminGeral && !supermercadoSelecionadoId) {
      newErrors.supermercado = "Selecione o supermercado.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors({});
      await onSubmit({
        categoria,
        solicitante_nome: nomeSolicitante.trim(),
        setor: setor.trim(),
        local_exato: isModoTelevendas ? localSeparacao.trim() : localExato.trim(),
        tipo_servico: isModoTelevendas ? "Atendimento Televendas" : tipoServico,
        numero_pedido: isModoTelevendas ? numeroPedido.trim() : null,
        cliente: isModoTelevendas ? cliente.trim() : null,
        produto: null,
        quantidade: null,
        itens: isModoTelevendas ? itensNormalizados : [],
        local_separacao: isModoTelevendas ? localSeparacao.trim() : null,
        prazo_limite: isModoTelevendas ? prazoLimite.trim() : null,
        prioridade,
        observacoes: observacoes.trim() ? observacoes.trim() : null,
        foto_nome: fotoNome,
        foto_data_url: fotoDataUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível abrir o chamado agora.";
      setErrors((prev) => ({ ...prev, submit: message }));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-none bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex w-full max-w-xl animate-in flex-col overflow-hidden overscroll-contain rounded-t-[30px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] shadow-[0_24px_60px_rgba(15,23,42,0.2)] max-h-[calc(100dvh-0.5rem)] sm:rounded-[30px] sm:max-h-[calc(100dvh-2rem)]">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-6">
          <div className="mb-3 block text-center sm:hidden">
            <span className="mx-auto block h-1.5 w-10 rounded-full bg-slate-200" />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0f3d75] to-slate-900 text-xl text-white shadow-[0_10px_22px_rgba(15,23,42,0.22)]">
                🏗️
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black tracking-tight text-slate-900">Novo chamado</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Preencha os dados abaixo para abrir rapidamente uma solicitação de empilhadeira.
                </p>
                {supermercadoNome && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
                    Unidade: {supermercadoNome}
                  </div>
                )}
                {isTelevendas && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                    <span>📞</span>
                    Chamado do setor de Televendas
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-2xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Fechar"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 [-webkit-overflow-scrolling:touch] sm:px-6 sm:pb-6"
        >
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Nome do solicitante *</label>
            <input
              type="text"
              value={nomeSolicitante}
              onChange={(e) => {
                setNomeSolicitante(e.target.value);
                setErrors((prev) => ({ ...prev, nome: "" }));
              }}
              placeholder="Ex.: João Silva"
              className={`touch-target w-full rounded-2xl border ${
                errors.nome ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
              } px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
            />
            {errors.nome && <p className="mt-1 text-xs text-red-500">{errors.nome}</p>}
            {solicitantePerfil && (
              <p className="mt-2 text-xs text-slate-500">Perfil logado: {solicitantePerfil}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Categoria do chamado</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["operacional", "televendas"] as CategoriaChamado[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={isTelevendas}
                  onClick={() => {
                    setCategoria(item);
                    if (item === "televendas") {
                      setTipoServico("Atendimento Televendas");
                    } else {
                      setTipoServico("Descarga");
                    }
                  }}
                  className={`touch-target rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${
                    categoria === item
                      ? item === "televendas"
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-100"
                        : "border-[#0f3d75] bg-blue-50 text-[#0f3d75] ring-4 ring-blue-100"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                  } ${isTelevendas ? "cursor-not-allowed opacity-80" : ""}`}
                >
                  {item === "televendas" ? "📞 Televendas" : "🏗️ Operacional"}
                </button>
              ))}
            </div>
          </div>

          {isAdminGeral && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Supermercado *</label>
              <select
                value={supermercadoSelecionadoId}
                onChange={(e) => {
                  onSupermercadoSelecionadoChange?.(e.target.value);
                  setErrors((prev) => ({ ...prev, supermercado: "" }));
                }}
                className={`touch-target w-full rounded-2xl border ${
                  errors.supermercado ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                } px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
              >
                <option value="">Selecione a unidade</option>
                {supermercados
                  .filter((item) => item.status === "Ativo")
                  .map((supermercado) => (
                    <option key={supermercado.id} value={supermercado.id}>
                      {supermercado.nome} · {supermercado.codigo}
                    </option>
                  ))}
              </select>
              {errors.supermercado && (
                <p className="mt-1 text-xs text-red-500">{errors.supermercado}</p>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Identificação</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">Setor *</label>
                <input
                  type="text"
                  value={setor}
                  onChange={(e) => {
                    setSetor(e.target.value);
                    setErrors((prev) => ({ ...prev, setor: "" }));
                  }}
                  placeholder={isModoTelevendas ? "Ex.: Televendas" : "Ex.: Doca 2"}
                  className={`touch-target w-full rounded-2xl border ${
                    errors.setor ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                  } px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-[#0f3d75] focus:outline-none focus:ring-4 focus:ring-blue-100`}
                />
                {errors.setor && <p className="mt-1 text-xs text-red-500">{errors.setor}</p>}
              </div>
              {!isModoTelevendas && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">Local exato *</label>
                  <input
                    type="text"
                    value={localExato}
                    onChange={(e) => {
                      setLocalExato(e.target.value);
                      setErrors((prev) => ({ ...prev, local: "" }));
                    }}
                    placeholder="Ex.: Corredor 5, perto da rampa"
                    className={`touch-target w-full rounded-2xl border ${
                      errors.local ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                    } px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-[#0f3d75] focus:outline-none focus:ring-4 focus:ring-blue-100`}
                  />
                  {errors.local && <p className="mt-1 text-xs text-red-500">{errors.local}</p>}
                </div>
              )}
            </div>
          </div>

          {isModoTelevendas ? (
            <>
              <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">Dados do pedido</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Número do pedido *</label>
                    <input
                      type="text"
                      value={numeroPedido}
                      onChange={(e) => {
                        setNumeroPedido(e.target.value);
                        setErrors((prev) => ({ ...prev, numeroPedido: "" }));
                      }}
                      placeholder="Ex.: PED-2026-1042"
                      className={`touch-target w-full rounded-2xl border ${
                        errors.numeroPedido ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                      } px-4 py-3.5 text-base text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-100`}
                    />
                    {errors.numeroPedido && <p className="mt-1 text-xs text-red-500">{errors.numeroPedido}</p>}
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Cliente *</label>
                    <input
                      type="text"
                      value={cliente}
                      onChange={(e) => {
                        setCliente(e.target.value);
                        setErrors((prev) => ({ ...prev, cliente: "" }));
                      }}
                      placeholder="Ex.: João Martins"
                      className={`touch-target w-full rounded-2xl border ${
                        errors.cliente ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                      } px-4 py-3.5 text-base text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-100`}
                    />
                    {errors.cliente && <p className="mt-1 text-xs text-red-500">{errors.cliente}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                      Itens do pedido *
                    </label>
                    <div className="space-y-2 rounded-2xl border border-indigo-100 bg-white/90 p-3">
                      {itensTelevendas.map((item, index) => (
                        <div
                          key={`item-${index}`}
                          className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px_150px_auto]"
                        >
                          <input
                            type="text"
                            value={item.produto}
                            onChange={(e) => {
                              const value = e.target.value;
                              setItensTelevendas((prev) =>
                                prev.map((curr, currIndex) =>
                                  currIndex === index ? { ...curr, produto: value } : curr
                                )
                              );
                              setErrors((prev) => ({ ...prev, itens: "" }));
                            }}
                            placeholder="Produto"
                            className="touch-target w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          />
                          <select
                            value={item.unidadeMedida}
                            onChange={(e) => {
                              const value = e.target.value;
                              setItensTelevendas((prev) =>
                                prev.map((curr, currIndex) =>
                                  currIndex === index ? { ...curr, unidadeMedida: value as ItemTelevendas["unidadeMedida"] } : curr
                                )
                              );
                              setErrors((prev) => ({ ...prev, itens: "" }));
                            }}
                            className="touch-target w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          >
                            {UNIDADES_MEDIDA_TELEVENDAS.map((unidade) => (
                              <option key={unidade} value={unidade}>
                                {unidade}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={item.quantidadeSolicitada > 0 ? item.quantidadeSolicitada : ""}
                            onChange={(e) => {
                              const rawValue = e.target.value;
                              const value = rawValue.trim() ? Math.max(1, Number(rawValue) || 0) : 0;
                              setItensTelevendas((prev) =>
                                prev.map((curr, currIndex) =>
                                  currIndex === index
                                    ? {
                                        ...curr,
                                        quantidadeSolicitada: value,
                                        quantidadeEncontrada: 0,
                                        quantidadeFaltante: value,
                                      }
                                    : curr
                                )
                              );
                              setErrors((prev) => ({ ...prev, itens: "" }));
                            }}
                            placeholder="Qtd solicitada"
                            className="touch-target w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setItensTelevendas((prev) =>
                                prev.length > 1 ? prev.filter((_, currIndex) => currIndex !== index) : prev
                              );
                            }}
                            className="touch-target rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                          >
                            Remover
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => setItensTelevendas((prev) => [...prev, createEmptyItem()])}
                        className="touch-target w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                      >
                        + Adicionar item
                      </button>
                    </div>
                    {errors.itens && <p className="mt-1 text-xs text-red-500">{errors.itens}</p>}
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">Execução</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Local de separação *</label>
                    <input
                      type="text"
                      value={localSeparacao}
                      onChange={(e) => {
                        setLocalSeparacao(e.target.value);
                        setErrors((prev) => ({ ...prev, localSeparacao: "" }));
                      }}
                      placeholder="Ex.: Corredor 12 - Ponta A"
                      className={`touch-target w-full rounded-2xl border ${
                        errors.localSeparacao ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                      } px-4 py-3.5 text-base text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-100`}
                    />
                    {errors.localSeparacao && (
                      <p className="mt-1 text-xs text-red-500">{errors.localSeparacao}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Prazo / horário limite *</label>
                    <input
                      type="text"
                      value={prazoLimite}
                      onChange={(e) => {
                        setPrazoLimite(e.target.value);
                        setErrors((prev) => ({ ...prev, prazoLimite: "" }));
                      }}
                      placeholder="Ex.: Hoje 16:30"
                      className={`touch-target w-full rounded-2xl border ${
                        errors.prazoLimite ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                      } px-4 py-3.5 text-base text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-100`}
                    />
                    {errors.prazoLimite && <p className="mt-1 text-xs text-red-500">{errors.prazoLimite}</p>}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Tipo de serviço</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {TIPOS_SERVICO_OPERACIONAIS.map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setTipoServico(tipo)}
                    className={`touch-target flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition-all ${
                      tipoServico === tipo
                        ? "border-[#0f3d75] bg-blue-50 text-[#0f3d75] ring-4 ring-blue-100"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    <span>{tipoIcons[tipo]}</span>
                    {tipo}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Prioridade</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PRIORIDADES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPrioridade(item)}
                  className={`touch-target rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${
                    prioridade === item
                      ? item === "Urgente"
                        ? "border-red-400 bg-red-50 text-red-700 ring-4 ring-red-100 shadow-[0_12px_22px_rgba(239,68,68,0.14)]"
                        : "border-amber-400 bg-amber-50 text-amber-700 ring-4 ring-amber-100"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {item === "Urgente" ? "🚨 Urgente" : "📋 Normal"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Observações</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder={
                isModoTelevendas
                  ? "Informe detalhes do pedido: produto, quantidade, cliente, prazo e observações importantes."
                  : "Informações adicionais para agilizar o atendimento (opcional)."
              }
              rows={3}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Anexar foto (opcional)</label>
            <label className="touch-target flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">
              <span>📷</span>
              <span>{fotoNome ? "Trocar foto" : "Selecionar foto"}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  void handleFotoChange(event);
                }}
                className="hidden"
              />
            </label>
            {fotoNome && (
              <p className="mt-1 text-xs text-slate-500">Arquivo anexado: {fotoNome}</p>
            )}
            {errors.foto && <p className="mt-1 text-xs text-red-500">{errors.foto}</p>}
          </div>

          {errors.submit && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {errors.submit}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="touch-target rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-base font-semibold text-slate-700 transition-all hover:bg-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="touch-target rounded-2xl bg-gradient-to-r from-[#0f3d75] to-slate-900 px-4 py-3 text-base font-bold text-white shadow-[0_16px_28px_rgba(15,23,42,0.24)] transition-all hover:brightness-110 hover:shadow-xl active:scale-[0.98]"
            >
              {isSubmitting ? "Abrindo..." : "Abrir chamado"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
