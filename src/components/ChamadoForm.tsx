import { useEffect, useMemo, useState } from "react";
import type { Prioridade, Setor, TipoServico } from "../types/chamado";
import { PRIORIDADES, TIPOS_SERVICO } from "../types/chamado";
import type { NovoChamadoInput } from "../hooks/useChamados";
import type { Supermercado } from "../types/supermercado";

type NovoChamadoFormInput = Omit<NovoChamadoInput, "supermercado_id">;

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
  const [nomeSolicitante, setNomeSolicitante] = useState(solicitanteNome || "");
  const [setor, setSetor] = useState<Setor>("");
  const [localExato, setLocalExato] = useState("");
  const [tipoServico, setTipoServico] = useState<TipoServico>("Descarga");
  const [prioridade, setPrioridade] = useState<Prioridade>("Normal");
  const [observacoes, setObservacoes] = useState("");
  const [fotoNome, setFotoNome] = useState<string | null>(null);
  const [fotoDataUrl, setFotoDataUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setNomeSolicitante((prev) => (prev.trim() ? prev : solicitanteNome || ""));
  }, [solicitanteNome]);

  const tipoIcons = useMemo<Record<TipoServico, string>>(
    () => ({
      Descarga: "📦",
      Reposição: "🔄",
      Retirada: "📤",
      Movimentação: "🚚",
      "Apoio interno": "🧰",
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
    if (!localExato.trim()) {
      newErrors.local = "Informe o local exato.";
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
        solicitante_nome: nomeSolicitante.trim(),
        setor: setor.trim(),
        local_exato: localExato.trim(),
        tipo_servico: tipoServico,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-xl animate-in overflow-y-auto rounded-t-[30px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] shadow-[0_24px_60px_rgba(15,23,42,0.2)] max-h-[calc(100dvh-0.5rem)] sm:rounded-[30px] sm:max-h-[calc(100dvh-2rem)]">
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

        <form onSubmit={handleSubmit} className="space-y-5 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-6">
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
                placeholder="Ex.: Doca 2"
                className={`touch-target w-full rounded-2xl border ${
                  errors.setor ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                } px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
              />
              {errors.setor && <p className="mt-1 text-xs text-red-500">{errors.setor}</p>}
            </div>
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
                  errors.local ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                } px-4 py-3.5 text-base text-slate-900 transition-colors focus:border-[#0f3d75] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100`}
              />
              {errors.local && <p className="mt-1 text-xs text-red-500">{errors.local}</p>}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Tipo de serviço</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TIPOS_SERVICO.map((tipo) => (
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
              placeholder="Informações adicionais para agilizar o atendimento (opcional)."
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
