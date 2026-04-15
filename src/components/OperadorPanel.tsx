import { useState, useMemo, useRef, useEffect } from "react";
import type { Chamado, ItemTelevendas, Setor } from "../types/chamado";
import type { ChecklistEmpilhadeira } from "../types/checklistEmpilhadeira";
import type { Empilhadeira } from "../types/empilhadeira";
import type { Manutencao, ManutencaoPrioridade } from "../types/manutencao";
import { isEmpilhadeiraSelecionavelParaChamado } from "../types/empilhadeira";
import type { AppNotification } from "../types/notification";
import type { TimeEstimatesResult } from "../hooks/useTimeEstimates";
import { formatEstimateMinutes } from "../hooks/useTimeEstimates";
import { cn } from "../utils/cn";
import TimeEstimateBadge from "./TimeEstimateBadge";
import NotificationCenter from "./NotificationCenter";
import SectionErrorBoundary from "./SectionErrorBoundary";
import { recordAppActivity } from "../utils/appActivity";
import { getCategoriaChamado, isTelevendasChamado } from "../utils/chamadoStatus";
import { getEmpilhadeiraStatusEfetivo } from "../utils/empilhadeiraStatus";
import { isChecklistEmpilhadeiraAprovado } from "../utils/checklistEmpilhadeira";
import {
  formatQuantidadeComUnidade,
  getTotaisItensTelevendas,
  hasItemFaltante,
  normalizeItensTelevendas,
} from "../utils/televendasItems";

export type OperadorStatus = "Disponível" | "Pausa";

interface OperadorPanelProps {
  chamados: Chamado[];
  empilhadeiras: Empilhadeira[];
  checklists: ChecklistEmpilhadeira[];
  manutencoes: Manutencao[];
  operadorId: string;
  operadorNome: string;
  supermercadoId: string | null;
  supermercadoNome: string | null;
  operadorStatus: OperadorStatus;
  onStatusChange: (status: OperadorStatus) => void;
  onAssumir: (
    id: string,
    operadorNome: string,
    equipamento?: {
      id: string;
      identificacao: string;
      empresa_id: string;
      supermercado_id: string;
      status: Empilhadeira["status"];
    } | null
  ) => void | Promise<void>;
  onMarcarACaminho: (id: string, operadorNome: string) => void | Promise<void>;
  onMarcarChegada: (id: string, operadorNome: string) => void | Promise<void>;
  onAtualizarItensTelevendas: (inputId: string, input: {
    itens: ItemTelevendas[];
    operadorNome: string;
    status: "Pronto" | "Incompleto" | "Cancelado";
    motivoIncompleto?: string | null;
    observacaoOperador?: string | null;
  }) => void | Promise<void>;
  onIniciar: (
    id: string,
    operadorNome: string,
    equipamento?: {
      id: string;
      identificacao: string;
      empresa_id: string;
      supermercado_id: string;
      status: Empilhadeira["status"];
    } | null
  ) => void | Promise<void>;
  onFinalizar: (id: string, operadorNome: string) => void | Promise<void>;
  onCreateChecklist: (input: {
    empresa_id: string;
    supermercado_id: string;
    empilhadeira_id: string;
    operador_id: string;
    operador_nome: string;
    data: string;
    bateria_ok: boolean;
    garfo_ok: boolean;
    pneus_ok: boolean;
    freio_ok: boolean;
    sem_avaria: boolean;
    observacoes?: string | null;
  }) => void | Promise<void>;
  onReportarProblema: (input: {
    empilhadeira_id: string;
    descricao: string;
    prioridade: ManutencaoPrioridade;
    statusEmpilhadeira: "Necessita atenção" | "Em manutenção";
  }) => void | Promise<void>;
  onAccessProfile: () => void;
  onTrocarUsuario: () => void;
  onLogout: () => void;
  timeEstimates: TimeEstimatesResult;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  syncError?: string | null;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimeSince(iso: string): string {
  const now = new Date().getTime();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}min`;
  return `${Math.floor(diff / 86400)}d`;
}

function getDuration(start: string, end: string): string {
  const diff = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}min`;
}

function parseListaProdutos(produto: string | null | undefined): string[] {
  if (!produto) return [];
  return produto
    .split(/\r?\n|[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type FilterTab = "pendentes" | "meus" | "finalizados";
type TechnicalTab = "checklist" | "problema";

function normalizeOperatorName(value: string | null | undefined) {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isSameOperatorName(a: string | null | undefined, b: string | null | undefined) {
  const na = normalizeOperatorName(a);
  const nb = normalizeOperatorName(b);
  if (!na || !nb) return false;
  return na === nb;
}

export default function OperadorPanel({
  chamados,
  empilhadeiras,
  checklists,
  manutencoes,
  operadorId,
  operadorNome,
  supermercadoId,
  supermercadoNome,
  operadorStatus,
  onStatusChange,
  onAssumir,
  onMarcarACaminho,
  onMarcarChegada,
  onAtualizarItensTelevendas,
  onIniciar,
  onFinalizar,
  onCreateChecklist,
  onReportarProblema,
  onAccessProfile,
  onTrocarUsuario,
  onLogout,
  timeEstimates,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  syncError = null,
}: OperadorPanelProps) {
  const [filterSetor, setFilterSetor] = useState<"Todos" | Setor>("Todos");
  const [filterCategoria, setFilterCategoria] = useState<"Todos" | "operacional" | "televendas">("Todos");
  const [activeTab, setActiveTab] = useState<FilterTab>("pendentes");
  const [activeTechnicalTab, setActiveTechnicalTab] = useState<TechnicalTab>("checklist");
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [selectedEmpilhadeiras, setSelectedEmpilhadeiras] = useState<Record<string, string>>({});
  const [checklistForm, setChecklistForm] = useState({
    empilhadeira_id: "",
    bateria_ok: true,
    garfo_ok: true,
    pneus_ok: true,
    freio_ok: true,
    sem_avaria: true,
    observacoes: "",
  });
  const [problemaForm, setProblemaForm] = useState({
    empilhadeira_id: "",
    descricao: "",
    prioridade: "Media" as ManutencaoPrioridade,
    statusEmpilhadeira: "Necessita atenção" as "Necessita atenção" | "Em manutenção",
  });
  const [televendasDrafts, setTelevendasDrafts] = useState<
    Record<
      string,
      {
        itens: ItemTelevendas[];
        motivoIncompleto: string;
        observacaoOperador: string;
      }
    >
  >({});
  const isMountedRef = useRef(true);
  const runningActionRef = useRef<string | null>(null);
  const isDisponivel = operadorStatus === "Disponível";

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function runAction(actionId: string, action: () => void | Promise<void>) {
    if (runningActionRef.current) return;
    try {
      if (!isMountedRef.current) return;
      runningActionRef.current = actionId;
      setActionError(null);
      setLoadingActionId(actionId);
      recordAppActivity(`operador:${actionId}`);
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      await action();
      recordAppActivity(`operador:concluido:${actionId}`);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível concluir esta ação agora.";
      if (isMountedRef.current) {
        setActionError(message);
      }
      recordAppActivity(`operador:erro:${actionId}`);
    } finally {
      runningActionRef.current = null;
      if (isMountedRef.current) {
        setLoadingActionId(null);
      }
    }
  }

  const setoresDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(
          chamados
            .map((c) => (typeof c.setor === "string" ? c.setor.trim() : ""))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "pt-BR"))
        )
      ),
    [chamados]
  );

  const pendentes = useMemo(
    () =>
      chamados
        .filter((c) => c.status === "Aguardando" || c.status === "Aberto" || c.status === "Em separação" || c.status === "Pronto")
        .sort((a, b) => {
          if (a.prioridade === "Urgente" && b.prioridade !== "Urgente") return -1;
          if (a.prioridade !== "Urgente" && b.prioridade === "Urgente") return 1;
          return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
        }),
    [chamados]
  );

  const pendentesNaoAssumidos = useMemo(
    () =>
      chamados
        .filter((c) => (c.status === "Aguardando" || c.status === "Aberto") && !c.operador_nome)
        .sort((a, b) => {
          if (a.prioridade === "Urgente" && b.prioridade !== "Urgente") return -1;
          if (a.prioridade !== "Urgente" && b.prioridade === "Urgente") return 1;
          return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
        }),
    [chamados]
  );

  const meusChamados = useMemo(
    () =>
      chamados
        .filter((c) => isSameOperatorName(c.operador_nome, operadorNome) && c.status !== "Finalizado")
        .sort((a, b) => {
          if (a.status === "Em atendimento" && b.status !== "Em atendimento") return -1;
          if (a.status !== "Em atendimento" && b.status === "Em atendimento") return 1;
          if (a.prioridade === "Urgente" && b.prioridade !== "Urgente") return -1;
          if (a.prioridade !== "Urgente" && b.prioridade === "Urgente") return 1;
          return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
        }),
    [chamados, operadorNome]
  );

  const finalizados = useMemo(
    () =>
      chamados
        .filter((c) => isSameOperatorName(c.operador_nome, operadorNome) && c.status === "Finalizado")
        .sort((a, b) => new Date(b.finalizado_em!).getTime() - new Date(a.finalizado_em!).getTime()),
    [chamados, operadorNome]
  );

  const applySetorFilter = (list: Chamado[]) =>
    filterSetor === "Todos" ? list : list.filter((c) => c.setor === filterSetor);
  const applyCategoriaFilter = (list: Chamado[]) =>
    filterCategoria === "Todos"
      ? list
      : list.filter((c) => getCategoriaChamado(c) === filterCategoria);

  const currentList =
    activeTab === "pendentes"
      ? applyCategoriaFilter(applySetorFilter(pendentes))
      : activeTab === "meus"
      ? applyCategoriaFilter(applySetorFilter(meusChamados))
      : applyCategoriaFilter(applySetorFilter(finalizados));

  const tipoIcons: Record<string, string> = {
    Descarga: "📦",
    Reposição: "🔄",
    Retirada: "📤",
    Movimentação: "🚚",
    "Apoio interno": "🧰",
    "Atendimento Televendas": "📞",
  };

  const tabs: { key: FilterTab; label: string; count: number; icon: string }[] = [
    { key: "pendentes", label: "Pendentes", count: pendentes.length, icon: "📋" },
    { key: "meus", label: "Meus Chamados", count: meusChamados.length, icon: "👷" },
    { key: "finalizados", label: "Finalizados", count: finalizados.length, icon: "✅" },
  ];

  const totalHojeFinalizados = finalizados.filter((c) => {
    const hoje = new Date().toDateString();
    return c.finalizado_em && new Date(c.finalizado_em).toDateString() === hoje;
  }).length;

  const emAtendimentoAtual = meusChamados.filter(
    (c) => c.status === "Em atendimento" || c.status === "Em separação" || c.status === "Pronto"
  ).length;
  const chamadoRecomendado = pendentesNaoAssumidos[0] ?? pendentes[0] ?? null;
  const empilhadeirasChecklist = useMemo(
    () =>
      empilhadeiras.filter(
        (item) => !supermercadoId || item.supermercado_id === supermercadoId
      ),
    [empilhadeiras, supermercadoId]
  );
  const checklistsHojeOperador = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return checklists.filter(
      (item) => item.operador_id === operadorId && item.data === hoje
    );
  }, [checklists, operadorId]);

  async function handleChecklistSubmit() {
    const empilhadeira = empilhadeiras.find((item) => item.id === checklistForm.empilhadeira_id);
    if (!empilhadeira) {
      throw new Error("Selecione uma empilhadeira da sua unidade para registrar o checklist.");
    }

    await onCreateChecklist({
      empresa_id: empilhadeira.empresa_id,
      supermercado_id: empilhadeira.supermercado_id,
      empilhadeira_id: empilhadeira.id,
      operador_id: operadorId,
      operador_nome: operadorNome,
      data: new Date().toISOString().slice(0, 10),
      bateria_ok: checklistForm.bateria_ok,
      garfo_ok: checklistForm.garfo_ok,
      pneus_ok: checklistForm.pneus_ok,
      freio_ok: checklistForm.freio_ok,
      sem_avaria: checklistForm.sem_avaria,
      observacoes: checklistForm.observacoes,
    });

    setChecklistForm({
      empilhadeira_id: "",
      bateria_ok: true,
      garfo_ok: true,
      pneus_ok: true,
      freio_ok: true,
      sem_avaria: true,
      observacoes: "",
    });
  }

  async function handleProblemaSubmit() {
    if (!problemaForm.empilhadeira_id) {
      throw new Error("Selecione a empilhadeira da sua unidade.");
    }
    if (!problemaForm.descricao.trim()) {
      throw new Error("Descreva o problema encontrado na empilhadeira.");
    }

    await onReportarProblema({
      empilhadeira_id: problemaForm.empilhadeira_id,
      descricao: problemaForm.descricao.trim(),
      prioridade: problemaForm.prioridade,
      statusEmpilhadeira: problemaForm.statusEmpilhadeira,
    });

    setProblemaForm({
      empilhadeira_id: "",
      descricao: "",
      prioridade: "Media",
      statusEmpilhadeira: "Necessita atenção",
    });
  }

  function getTelevendasDraft(chamado: Chamado) {
    const fromState = televendasDrafts[chamado.id];
    if (fromState) return fromState;

    return {
      itens: normalizeItensTelevendas(chamado.itens ?? []),
      motivoIncompleto: chamado.motivo_incompleto ?? "",
      observacaoOperador: chamado.observacao_operador ?? "",
    };
  }

  function updateTelevendasItemQuantidade(
    chamado: Chamado,
    itemIndex: number,
    quantidadeEncontrada: number
  ) {
    const current = getTelevendasDraft(chamado);
    const nextItens = current.itens.map((item, index) => {
      if (index !== itemIndex) return item;
      const qtdEncontrada = Math.max(
        0,
        Math.min(Number.isFinite(quantidadeEncontrada) ? Math.floor(quantidadeEncontrada) : 0, item.quantidadeSolicitada)
      );
      return {
        ...item,
        quantidadeEncontrada: qtdEncontrada,
        quantidadeFaltante: Math.max(0, item.quantidadeSolicitada - qtdEncontrada),
      };
    });

    setTelevendasDrafts((prev) => ({
      ...prev,
      [chamado.id]: {
        ...current,
        itens: nextItens,
      },
    }));
  }

  function updateTelevendasDraftText(chamado: Chamado, key: "motivoIncompleto" | "observacaoOperador", value: string) {
    const current = getTelevendasDraft(chamado);
    setTelevendasDrafts((prev) => ({
      ...prev,
      [chamado.id]: {
        ...current,
        [key]: value,
      },
    }));
  }

  function getEmpilhadeiraSelecionada(chamado: Chamado) {
    const selectedId = selectedEmpilhadeiras[chamado.id] ?? chamado.empilhadeira_id ?? "";
    if (!selectedId) return null;
    return (
      empilhadeiras.find(
        (item) =>
          item.id === selectedId &&
          item.supermercado_id === chamado.supermercado_id &&
          (
            isEmpilhadeiraSelecionavelParaChamado(
              getEmpilhadeiraStatusEfetivo(item, chamados, checklists, manutencoes)
            ) ||
            item.id === chamado.empilhadeira_id
          )
      ) ?? null
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <header className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(15,61,117,0.97),rgba(15,23,42,0.95))] shadow-[0_16px_34px_rgba(15,23,42,0.16)]">
        <div className="app-main px-2 py-4 sm:px-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <span className="text-2xl">👷</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white sm:text-2xl">Painel do Operador</h1>
                <p className="text-xs text-slate-200 sm:text-sm">
                  Olá, <span className="font-semibold text-white">{operadorNome}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/85">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-300" />
                    Unidade: {supermercadoNome ?? "Unidade não identificada"}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/85">
                    <span
                      className={cn(
                        "inline-block h-2.5 w-2.5 rounded-full",
                        isDisponivel ? "bg-emerald-400" : "bg-amber-300"
                      )}
                    />
                    Status: {operadorStatus}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/85">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-300" />
                    Pendentes da unidade: {pendentes.length}
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:w-auto">
              <div className="flex min-w-max items-center gap-2 lg:justify-end">
              <NotificationCenter
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAsRead={onMarkAsRead}
                onMarkAllAsRead={onMarkAllAsRead}
                onClearAll={onClearAll}
                variant="light"
              />

              <button
                onClick={onAccessProfile}
                className="touch-target inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/8 px-4 py-3 text-xs font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/14 hover:border-white/35 active:scale-95 sm:text-sm"
              >
                <span>⚙️</span>
                <span>Perfil</span>
              </button>

              <button
                onClick={onTrocarUsuario}
                className="touch-target inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/8 px-4 py-3 text-xs font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/14 hover:border-white/35 active:scale-95 sm:text-sm"
              >
                <span>🔐</span>
                <span>Trocar usuário</span>
              </button>

              <button
                onClick={onLogout}
                className="touch-target inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-100 transition-all hover:bg-red-500/16 active:scale-95 sm:text-sm"
              >
                <span>⎋</span>
                <span>Sair</span>
              </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main px-2 py-4 sm:px-0 sm:py-6">
        {syncError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {syncError}
          </div>
        )}

        <div className="mb-4 rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Central da unidade
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">
                {supermercadoNome ?? "Unidade não identificada"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Este painel mostra apenas chamados da loja vinculada ao seu usuário.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
                  Pendentes
                </p>
                <p className="mt-2 text-2xl font-black text-amber-700">{pendentes.length}</p>
              </div>
              <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                  Em andamento
                </p>
                <p className="mt-2 text-2xl font-black text-emerald-700">{emAtendimentoAtual}</p>
              </div>
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Status atual
                </p>
                <p className="mt-2 text-lg font-black text-slate-900">{operadorStatus}</p>
              </div>
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {actionError}
          </div>
        )}

        <div className="mb-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Chamado recomendado agora
              </p>
              {chamadoRecomendado ? (
                <>
                  <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900">
                    {chamadoRecomendado.tipo_servico} · {chamadoRecomendado.setor}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Solicitante: {chamadoRecomendado.solicitante_nome}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900">
                    Nenhum chamado aguardando nesta unidade
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Quando surgir uma nova solicitação da loja, ela aparecerá aqui.
                  </p>
                </>
              )}
            </div>

            {chamadoRecomendado && (
              <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[320px]">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">Prioridade:</span>{" "}
                  {chamadoRecomendado.prioridade}
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">Tempo de espera:</span>{" "}
                  {getTimeSince(chamadoRecomendado.criado_em)}
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:col-span-2">
                  <span className="font-semibold text-slate-900">Abertura:</span>{" "}
                  {formatDateTime(chamadoRecomendado.criado_em)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                Status do operador
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Defina rapidamente se você está disponível para assumir novos chamados da sua unidade.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {(["Disponível", "Pausa"] as OperadorStatus[]).map((status) => {
                const active = operadorStatus === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => onStatusChange(status)}
                    className={cn(
                      "touch-target rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
                      active
                        ? status === "Disponível"
                          ? "bg-emerald-500 text-white shadow-[0_14px_28px_rgba(16,185,129,0.28)]"
                          : "bg-amber-400 text-slate-950 shadow-[0_14px_28px_rgba(245,158,11,0.28)]"
                        : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>
          {!isDisponivel && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Em pausa: você continua vendo os chamados, mas não pode assumir novos atendimentos.
            </div>
          )}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
            { label: "Pendentes", value: pendentes.length, icon: "📋", border: "border-amber-200", text: "text-amber-700", valueText: "text-amber-600" },
            { label: "Atendendo", value: emAtendimentoAtual, icon: "🔧", border: "border-emerald-200", text: "text-emerald-700", valueText: "text-emerald-600" },
            { label: "Hoje", value: totalHojeFinalizados, icon: "✅", border: "border-blue-200", text: "text-blue-800", valueText: "text-blue-700" },
            {
              label: "Tempo Médio",
              value: timeEstimates.mediaMin !== null ? formatEstimateMinutes(timeEstimates.mediaMin) : "—",
              icon: "⏱️",
              border: "border-blue-200",
              text: "text-blue-800",
              valueText: "text-blue-700",
              subtitle:
                timeEstimates.totalFinalizados > 0
                  ? `${timeEstimates.totalFinalizados} atendimento${timeEstimates.totalFinalizados !== 1 ? "s" : ""}`
                  : "sem dados",
            },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                "rounded-[24px] border bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.06)]",
                item.border
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{item.icon}</span>
                <span className={cn("text-xs font-semibold sm:text-sm", item.text)}>{item.label}</span>
              </div>
              <p className={cn("mt-1 text-2xl font-bold sm:text-3xl", item.valueText)}>{item.value}</p>
              {"subtitle" in item && item.subtitle && (
                <p className="mt-0.5 text-[10px] text-slate-400">{item.subtitle}</p>
              )}
            </div>
          ))}
        </div>

        <div className="mb-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                Rotina técnica da unidade
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Separe a inspeção antes do turno da abertura de falhas para ganhar agilidade no dia a dia.
              </p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setActiveTechnicalTab("checklist")}
                className={cn(
                  "touch-target inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold transition-all sm:text-sm",
                  activeTechnicalTab === "checklist"
                    ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)]"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                )}
              >
                <span>📝</span>
                <span>Checklist antes do turno</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTechnicalTab("problema")}
                className={cn(
                  "touch-target inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold transition-all sm:text-sm",
                  activeTechnicalTab === "problema"
                    ? "bg-[linear-gradient(135deg,#7f1d1d,#dc2626)] text-white shadow-[0_12px_24px_rgba(127,29,29,0.18)]"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                )}
              >
                <span>🛠️</span>
                <span>Reportar problema</span>
              </button>
            </div>
          </div>

          {activeTechnicalTab === "checklist" ? (
            <div className="mt-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                    Checklist antes do turno
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Registre a inspeção básica diária da empilhadeira da sua unidade antes do uso operacional.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Checklists de hoje: <span className="font-bold text-slate-900">{checklistsHojeOperador.length}</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
                <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                  <select
                    value={checklistForm.empilhadeira_id}
                    onChange={(event) =>
                      setChecklistForm((prev) => ({ ...prev, empilhadeira_id: event.target.value }))
                    }
                    className="touch-target rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 focus:border-[#0f3d75] focus:outline-none focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="">Selecione a empilhadeira da unidade</option>
                    {empilhadeirasChecklist.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.identificacao} · {item.modelo}
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      ["bateria_ok", "Bateria OK"],
                      ["garfo_ok", "Garfo OK"],
                      ["pneus_ok", "Pneus OK"],
                      ["freio_ok", "Freio OK"],
                      ["sem_avaria", "Sem avaria"],
                    ].map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(checklistForm[key as keyof typeof checklistForm])}
                          onChange={(event) =>
                            setChecklistForm((prev) => ({
                              ...prev,
                              [key]: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300 text-[#0f3d75] focus:ring-[#0f3d75]"
                        />
                      </label>
                    ))}
                  </div>

                  <textarea
                    value={checklistForm.observacoes}
                    onChange={(event) =>
                      setChecklistForm((prev) => ({ ...prev, observacoes: event.target.value }))
                    }
                    rows={3}
                    placeholder="Observações do checklist, avarias, ruídos ou alertas identificados."
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-[#0f3d75] focus:outline-none focus:ring-4 focus:ring-blue-100"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      void runAction("checklist-turno", handleChecklistSubmit);
                    }}
                    disabled={loadingActionId === "checklist-turno"}
                    className="touch-target rounded-2xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,23,42,0.2)]"
                  >
                    {loadingActionId === "checklist-turno" ? "Registrando..." : "Registrar checklist"}
                  </button>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
                    Últimos checklists do dia
                  </p>
                  <div className="mt-3 space-y-2">
                    {checklistsHojeOperador.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                        Nenhum checklist registrado hoje.
                      </p>
                    ) : (
                      checklistsHojeOperador.slice(0, 4).map((checklist) => {
                        const equipamento = empilhadeiras.find((item) => item.id === checklist.empilhadeira_id);
                        const aprovado = isChecklistEmpilhadeiraAprovado(checklist);

                        return (
                          <div
                            key={checklist.id}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {equipamento?.identificacao ?? "Empilhadeira"}
                                </p>
                                <p className="text-xs text-slate-500">{checklist.data}</p>
                              </div>
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                                  aprovado
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-rose-100 text-rose-700"
                                )}
                              >
                                {aprovado ? "Aprovado" : "Necessita atenção"}
                              </span>
                            </div>
                            {checklist.observacoes && (
                              <p className="mt-2 text-xs text-slate-600">{checklist.observacoes}</p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-rose-500">
                    Reportar problema
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Abra rapidamente uma ocorrência corretiva para a empilhadeira da sua unidade e sinalize o status operacional da máquina.
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                  Falhas abertas ficam vinculadas à unidade atual.
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <select
                  value={problemaForm.empilhadeira_id}
                  onChange={(event) =>
                    setProblemaForm((prev) => ({ ...prev, empilhadeira_id: event.target.value }))
                  }
                  className="touch-target rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 focus:border-rose-500 focus:outline-none focus:ring-4 focus:ring-rose-100"
                >
                  <option value="">Selecione a empilhadeira da unidade</option>
                  {empilhadeirasChecklist.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.identificacao} · {item.modelo}
                    </option>
                  ))}
                </select>

                <select
                  value={problemaForm.prioridade}
                  onChange={(event) =>
                    setProblemaForm((prev) => ({
                      ...prev,
                      prioridade: event.target.value as ManutencaoPrioridade,
                    }))
                  }
                  className="touch-target rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 focus:border-rose-500 focus:outline-none focus:ring-4 focus:ring-rose-100"
                >
                  <option value="Baixa">Baixa</option>
                  <option value="Media">Media</option>
                  <option value="Alta">Alta</option>
                  <option value="Critica">Critica</option>
                </select>

                <textarea
                  value={problemaForm.descricao}
                  onChange={(event) =>
                    setProblemaForm((prev) => ({ ...prev, descricao: event.target.value }))
                  }
                  rows={3}
                  placeholder="Descreva a falha encontrada, sintomas, risco e impacto na operação."
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-rose-500 focus:outline-none focus:ring-4 focus:ring-rose-100 md:col-span-2"
                />

                <select
                  value={problemaForm.statusEmpilhadeira}
                  onChange={(event) =>
                    setProblemaForm((prev) => ({
                      ...prev,
                      statusEmpilhadeira: event.target.value as "Necessita atenção" | "Em manutenção",
                    }))
                  }
                  className="touch-target rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 focus:border-rose-500 focus:outline-none focus:ring-4 focus:ring-rose-100"
                >
                  <option value="Necessita atenção">Sinalizar como Necessita atenção</option>
                  <option value="Em manutenção">Sinalizar como Em manutenção</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    void runAction("reportar-problema", handleProblemaSubmit);
                  }}
                  disabled={loadingActionId === "reportar-problema"}
                  className="touch-target rounded-2xl bg-[linear-gradient(135deg,#dc2626,#7f1d1d)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(127,29,29,0.28)]"
                >
                  {loadingActionId === "reportar-problema" ? "Registrando..." : "Abrir ocorrência corretiva"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
          <span className="text-xs font-medium text-slate-500">Indicadores:</span>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-xs text-red-600">Urgente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="text-xs text-amber-700">Aguardando</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-700">Em atendimento</span>
          </div>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "touch-target flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold transition-all sm:text-sm",
                activeTab === tab.key
                  ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white shadow-lg shadow-slate-900/20"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <span>{tab.icon}</span>
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-bold",
                  activeTab === tab.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-xs font-medium text-slate-500">Categoria:</span>
            <button
              onClick={() => setFilterCategoria("Todos")}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                filterCategoria === "Todos"
                  ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white"
                  : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              )}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterCategoria("operacional")}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                filterCategoria === "operacional"
                  ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white"
                  : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              )}
            >
              Operacionais
            </button>
            <button
              onClick={() => setFilterCategoria("televendas")}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                filterCategoria === "televendas"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              )}
            >
              Televendas
            </button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-xs font-medium text-slate-500">Filtrar setor:</span>
            <button
              onClick={() => setFilterSetor("Todos")}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                filterSetor === "Todos"
                  ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white"
                  : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              )}
            >
              Todos
            </button>
            {setoresDisponiveis.map((setor) => (
              <button
                key={setor}
                onClick={() => setFilterSetor(setor)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  filterSetor === setor
                    ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white"
                    : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                )}
              >
                {setor}
              </button>
            ))}
          </div>
        </div>

        <SectionErrorBoundary title="A lista de chamados encontrou um erro, mas o painel continua ativo.">
          {currentList.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-slate-200 bg-white py-16 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
              <span className="text-5xl">
                {activeTab === "pendentes" ? "✨" : activeTab === "meus" ? "👷" : "📊"}
              </span>
              <p className="mt-4 text-sm font-semibold text-slate-600">
                {activeTab === "pendentes"
                  ? "Nenhum chamado pendente"
                  : activeTab === "meus"
                  ? "Nenhum chamado assumido"
                  : "Nenhum chamado finalizado"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {activeTab === "pendentes"
                  ? "Todos os chamados foram atendidos!"
                  : activeTab === "meus"
                  ? "Assuma chamados na aba Pendentes"
                  : "Seus chamados finalizados aparecerão aqui"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentList.map((chamado) => {
              const isUrgente = chamado.prioridade === "Urgente";
              const isTelevendas = isTelevendasChamado(chamado);
              const isAguardandoOperacional = chamado.status === "Aguardando";
              const isAbertoTelevendas = chamado.status === "Aberto";
              const isEmSeparacaoTelevendas = chamado.status === "Em separação";
              const isIncompletoTelevendas = chamado.status === "Incompleto";
              const isProntoTelevendas = chamado.status === "Pronto";
              const isEmAtendimentoOperacional = chamado.status === "Em atendimento";
              const isEmAtendimento = isEmAtendimentoOperacional || isEmSeparacaoTelevendas;
              const isFinalizado = chamado.status === "Finalizado";
              const isAssumido = isSameOperatorName(chamado.operador_nome, operadorNome);
              const estimate = timeEstimates.estimates[chamado.id];
              const remainingMin = timeEstimates.tempoRestanteEmAtendimento[chamado.id];
              const listaProdutosTelevendas = isTelevendas ? parseListaProdutos(chamado.produto) : [];

              let indicatorColor = "bg-amber-400";
              if (isTelevendas) indicatorColor = "bg-indigo-500";
              if (isUrgente && !isFinalizado) indicatorColor = "bg-red-500";
              if (isIncompletoTelevendas) indicatorColor = "bg-rose-500";
              else if (isEmAtendimento) indicatorColor = "bg-emerald-500";
              else if (isFinalizado) indicatorColor = "bg-slate-400";

              let cardBorder = "border-slate-200";
              let cardBg = "bg-white";
              if (isUrgente && !isFinalizado) {
                cardBorder = "border-red-200";
                cardBg = "bg-red-50/60";
              } else if (isIncompletoTelevendas) {
                cardBorder = "border-rose-200";
                cardBg = "bg-rose-50/60";
              } else if (isTelevendas) {
                cardBorder = "border-indigo-200";
                cardBg = "bg-indigo-50/60";
              } else if (isEmAtendimento) {
                cardBorder = "border-emerald-200";
                cardBg = "bg-emerald-50/60";
              } else if (isFinalizado) {
                cardBorder = "border-slate-200";
                cardBg = "bg-slate-50/70";
              }

              const televendasDraft = isTelevendas ? getTelevendasDraft(chamado) : null;
              const empilhadeirasDaUnidade = empilhadeiras.filter(
                (item) => {
                  if (item.supermercado_id !== chamado.supermercado_id) return false;

                  const statusEfetivo = getEmpilhadeiraStatusEfetivo(item, chamados, checklists, manutencoes);
                  const isEmpilhadeiraJaVinculada = item.id === chamado.empilhadeira_id;

                  return (
                    isEmpilhadeiraSelecionavelParaChamado(statusEfetivo) ||
                    isEmpilhadeiraJaVinculada
                  );
                }
              );
              const empilhadeiraSelecionada = getEmpilhadeiraSelecionada(chamado);
              const televendasTotais = televendasDraft
                ? getTotaisItensTelevendas(televendasDraft.itens)
                : null;
              const televendasComFalta = televendasDraft
                ? hasItemFaltante(televendasDraft.itens)
                : false;

              return (
                <div
                  key={chamado.id}
                  className={cn(
                    "group relative overflow-hidden rounded-[26px] border shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.1)]",
                    cardBorder,
                    cardBg
                  )}
                >
                  <div className={cn("absolute left-0 top-0 h-full w-1.5", indicatorColor)} />

                  {isUrgente && !isFinalizado && (
                    <div className="absolute right-3 top-3">
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                      </span>
                    </div>
                  )}

                  <div className="p-4 pl-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                          isEmAtendimento
                            ? "bg-emerald-100 text-emerald-700"
                            : isFinalizado
                            ? "bg-slate-100 text-slate-500"
                            : isIncompletoTelevendas
                            ? "bg-rose-100 text-rose-700"
                            : isUrgente
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                              isEmAtendimento
                              ? "bg-emerald-500"
                              : isFinalizado
                              ? "bg-slate-400"
                              : isIncompletoTelevendas
                              ? "bg-rose-500"
                              : isUrgente
                              ? "bg-red-500"
                              : "bg-amber-500"
                          )}
                        />
                        {chamado.status}
                      </span>

                      {isUrgente && !isFinalizado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                          🚨 URGENTE
                        </span>
                      )}

                      {isAssumido && !isFinalizado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          👷 Assumido
                        </span>
                      )}
                      {isTelevendas && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          📞 Televendas
                        </span>
                      )}

                      <span className="w-full text-xs text-slate-400 sm:ml-auto sm:w-auto">
                        {formatDateTime(chamado.criado_em)} · {getTimeSince(chamado.criado_em)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg">{tipoIcons[chamado.tipo_servico]}</span>
                          <h3 className={cn("text-sm font-bold", isFinalizado ? "text-slate-500" : "text-slate-900")}>
                            {chamado.tipo_servico}
                          </h3>
                          <span className="hidden text-slate-300 sm:inline">•</span>
                          <span
                            className={cn(
                              "rounded-lg px-2 py-0.5 text-xs font-medium",
                              isFinalizado ? "bg-slate-100 text-slate-500" : "bg-slate-100 text-slate-700"
                            )}
                          >
                            📍 {chamado.setor}
                          </span>
                        </div>

                        <p className={cn("mt-1.5 text-xs", isFinalizado ? "text-slate-400" : "text-slate-500")}>
                          Solicitante: <span className="font-medium text-slate-700">{chamado.solicitante_nome}</span>
                        </p>

                        {isTelevendas && (
                          <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-700">
                              Itens para separação
                            </p>
                            <div className="mt-2 grid gap-1.5 text-xs text-slate-700 sm:grid-cols-2">
                              {chamado.numero_pedido && (
                                <p>
                                  <span className="font-semibold text-indigo-700">Pedido:</span>{" "}
                                  {chamado.numero_pedido}
                                </p>
                              )}
                              {chamado.cliente && (
                                <p>
                                  <span className="font-semibold text-indigo-700">Cliente:</span>{" "}
                                  {chamado.cliente}
                                </p>
                              )}
                              {chamado.local_separacao && (
                                <p>
                                  <span className="font-semibold text-indigo-700">Separação:</span>{" "}
                                  {chamado.local_separacao}
                                </p>
                              )}
                              {chamado.prazo_limite && (
                                <p>
                                  <span className="font-semibold text-indigo-700">Prazo:</span>{" "}
                                  {chamado.prazo_limite}
                                </p>
                              )}
                            </div>
                            {listaProdutosTelevendas.length > 0 && (
                              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                                {listaProdutosTelevendas.map((item, index) => (
                                  <li key={`${item}-${index}`} className="flex items-start gap-2">
                                    <span className="mt-0.5 text-indigo-600">•</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {chamado.quantidade && (
                              <p className="mt-2 text-xs text-slate-700">
                                <span className="font-semibold text-indigo-700">Quantidade:</span>{" "}
                                {chamado.quantidade}
                              </p>
                            )}
                          </div>
                        )}

                        {isTelevendas && televendasDraft && (
                          <div className="mt-2 rounded-xl border border-slate-200 bg-white/90 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                              Conferência de itens
                            </p>
                            <div className="mt-2 space-y-2">
                              {televendasDraft.itens.map((item, index) => (
                                <div
                                  key={`${chamado.id}-item-${index}`}
                                  className={cn(
                                    "grid grid-cols-1 gap-2 rounded-lg border px-3 py-2 sm:grid-cols-[1fr_130px_130px]",
                                    item.quantidadeFaltante > 0
                                      ? "border-rose-200 bg-rose-50/70"
                                      : "border-slate-200 bg-slate-50/80"
                                  )}
                                >
                                  <div className="text-xs font-semibold text-slate-800">{item.produto}</div>
                                  <div className="text-xs text-slate-600">
                                    Solicitado:{" "}
                                    <span className="font-semibold text-slate-900">
                                      {formatQuantidadeComUnidade(
                                        item.quantidadeSolicitada,
                                        item.unidadeMedida
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                    <label className="text-slate-600">Encontrado:</label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={item.quantidadeSolicitada}
                                      value={item.quantidadeEncontrada}
                                      onChange={(event) =>
                                        updateTelevendasItemQuantidade(
                                          chamado,
                                          index,
                                          Number(event.target.value)
                                        )
                                      }
                                      className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                    />
                                    <span
                                      className={cn(
                                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                        item.quantidadeFaltante > 0
                                          ? "bg-rose-100 text-rose-700"
                                          : "bg-emerald-100 text-emerald-700"
                                      )}
                                    >
                                      Falta:{" "}
                                      {formatQuantidadeComUnidade(
                                        item.quantidadeFaltante,
                                        item.unidadeMedida
                                      )}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                                Total solicitado: {televendasTotais?.totalSolicitado ?? 0}
                              </span>
                              <span className="rounded-full bg-blue-100 px-2 py-1 font-semibold text-blue-700">
                                Total encontrado: {televendasTotais?.totalEncontrado ?? 0}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-1 font-semibold",
                                  televendasComFalta ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                                )}
                              >
                                Atendido: {televendasTotais?.percentualAtendido ?? 0}%
                              </span>
                            </div>

                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                value={televendasDraft.motivoIncompleto}
                                onChange={(event) =>
                                  updateTelevendasDraftText(chamado, "motivoIncompleto", event.target.value)
                                }
                                placeholder="Motivo do incompleto (ex.: estoque insuficiente)"
                                className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
                              />
                              <input
                                type="text"
                                value={televendasDraft.observacaoOperador}
                                onChange={(event) =>
                                  updateTelevendasDraftText(chamado, "observacaoOperador", event.target.value)
                                }
                                placeholder="Observação do operador"
                                className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                              />
                            </div>
                          </div>
                        )}

                        {chamado.iniciado_em && (
                          <p className="mt-1 text-xs text-emerald-700">
                            ▶ Iniciado: {formatDateTime(chamado.iniciado_em)}
                          </p>
                        )}

                        {chamado.assumido_em && (
                          <p className="mt-1 text-xs text-indigo-700">
                            👷 Assumido: {formatDateTime(chamado.assumido_em)}
                          </p>
                        )}

                        {chamado.empilhadeira_identificacao && (
                          <p className="mt-1 text-xs text-sky-700">
                            🚜 Empilhadeira: {chamado.empilhadeira_identificacao}
                          </p>
                        )}

                        {chamado.a_caminho_em && (
                          <p className="mt-1 text-xs text-blue-700">
                            🚚 A caminho: {formatDateTime(chamado.a_caminho_em)}
                          </p>
                        )}

                        {chamado.cheguei_em && (
                          <p className="mt-1 text-xs text-cyan-700">
                            📍 Chegada: {formatDateTime(chamado.cheguei_em)}
                          </p>
                        )}

                        {chamado.finalizado_em && chamado.iniciado_em && (
                          <p className="mt-0.5 text-xs text-blue-700">
                            ✓ Finalizado: {formatDateTime(chamado.finalizado_em)} · Duração:{" "}
                            {getDuration(chamado.iniciado_em, chamado.finalizado_em)}
                          </p>
                        )}

                        {!isFinalizado && (
                          <TimeEstimateBadge
                            estimate={estimate}
                            remainingMin={isEmAtendimento ? remainingMin : undefined}
                            variant="dark"
                          />
                        )}
                      </div>

                      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                        {!isFinalizado && (
                          <div className="w-full sm:w-[220px]">
                            {empilhadeirasDaUnidade.length > 0 ? (
                              <select
                                value={selectedEmpilhadeiras[chamado.id] ?? chamado.empilhadeira_id ?? ""}
                                onChange={(event) =>
                                  setSelectedEmpilhadeiras((prev) => ({
                                    ...prev,
                                    [chamado.id]: event.target.value,
                                  }))
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 focus:border-[#0f3d75] focus:outline-none focus:ring-2 focus:ring-blue-100 sm:text-sm"
                              >
                                <option value="">Selecionar empilhadeira</option>
                                {empilhadeirasDaUnidade.map((empilhadeira) => (
                                <option key={empilhadeira.id} value={empilhadeira.id}>
                                    {empilhadeira.identificacao} · {getEmpilhadeiraStatusEfetivo(empilhadeira, chamados, checklists, manutencoes)}
                                </option>
                                ))}
                              </select>
                            ) : (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 sm:text-xs">
                                Nenhuma empilhadeira disponível nesta unidade.
                              </div>
                            )}
                          </div>
                        )}

                        {(isAguardandoOperacional || isAbertoTelevendas) && !chamado.operador_nome && (
                          <button
                            onClick={() => {
                              void runAction(`assumir-${chamado.id}`, () =>
                                onAssumir(
                                  chamado.id,
                                  operadorNome,
                                  empilhadeiraSelecionada
                                    ? {
                                        id: empilhadeiraSelecionada.id,
                                        identificacao: empilhadeiraSelecionada.identificacao,
                                        empresa_id: empilhadeiraSelecionada.empresa_id,
                                        supermercado_id: empilhadeiraSelecionada.supermercado_id,
                                        status: empilhadeiraSelecionada.status,
                                      }
                                    : null
                                )
                              );
                            }}
                            disabled={!isDisponivel || loadingActionId === `assumir-${chamado.id}`}
                            className={cn(
                              "w-full rounded-xl px-4 py-2.5 text-xs font-bold transition-all active:scale-95 sm:w-auto sm:text-sm",
                              isDisponivel
                                ? "bg-[linear-gradient(135deg,#0f3d75,#0f172a)] text-white shadow-lg shadow-slate-900/20 hover:brightness-110"
                                : "cursor-not-allowed bg-slate-100 text-slate-400"
                            )}
                          >
                            {loadingActionId === `assumir-${chamado.id}`
                              ? "Assumindo..."
                              : isDisponivel
                                ? "Assumir"
                                : "Em pausa"}
                          </button>
                        )}

                        {isAguardandoOperacional && Boolean(chamado.operador_nome) && !isTelevendas && (
                          <>
                            {!chamado.a_caminho_em && (
                              <button
                                onClick={() => {
                                  void runAction(`caminho-${chamado.id}`, () =>
                                    onMarcarACaminho(chamado.id, operadorNome)
                                  );
                                }}
                                disabled={loadingActionId === `caminho-${chamado.id}`}
                                className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 transition-all hover:bg-blue-100 active:scale-95 sm:w-auto sm:text-sm"
                              >
                                {loadingActionId === `caminho-${chamado.id}` ? "Salvando..." : "A caminho"}
                              </button>
                            )}

                            {chamado.a_caminho_em && !chamado.cheguei_em && (
                              <button
                                onClick={() => {
                                  void runAction(`chegada-${chamado.id}`, () =>
                                    onMarcarChegada(chamado.id, operadorNome)
                                  );
                                }}
                                disabled={loadingActionId === `chegada-${chamado.id}`}
                                className="w-full rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-xs font-bold text-cyan-700 transition-all hover:bg-cyan-100 active:scale-95 sm:w-auto sm:text-sm"
                              >
                                {loadingActionId === `chegada-${chamado.id}` ? "Salvando..." : "Cheguei"}
                              </button>
                            )}

                          </>
                        )}

                        {(isAguardandoOperacional || isEmSeparacaoTelevendas) && Boolean(chamado.operador_nome) && (
                          <button
                            onClick={() => {
                              if (isTelevendas && televendasDraft) {
                                void runAction(`pronto-${chamado.id}`, () =>
                                  onAtualizarItensTelevendas(chamado.id, {
                                    itens: televendasDraft.itens,
                                    operadorNome,
                                    status: televendasComFalta ? "Incompleto" : "Pronto",
                                    motivoIncompleto: televendasComFalta
                                      ? televendasDraft.motivoIncompleto
                                      : null,
                                    observacaoOperador: televendasDraft.observacaoOperador,
                                  })
                                );
                                return;
                              }

                              void runAction(`iniciar-${chamado.id}`, () =>
                                onIniciar(
                                  chamado.id,
                                  operadorNome,
                                  empilhadeiraSelecionada
                                    ? {
                                        id: empilhadeiraSelecionada.id,
                                        identificacao: empilhadeiraSelecionada.identificacao,
                                        empresa_id: empilhadeiraSelecionada.empresa_id,
                                        supermercado_id: empilhadeiraSelecionada.supermercado_id,
                                        status: empilhadeiraSelecionada.status,
                                      }
                                    : null
                                )
                              );
                            }}
                            disabled={
                              loadingActionId === `iniciar-${chamado.id}` ||
                              loadingActionId === `pronto-${chamado.id}`
                            }
                            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 active:scale-95 sm:w-auto sm:text-sm"
                          >
                            {loadingActionId === `iniciar-${chamado.id}` || loadingActionId === `pronto-${chamado.id}`
                              ? "Salvando..."
                              : isTelevendas
                              ? televendasComFalta
                                ? "Salvar como incompleto"
                              : "Marcar pronto"
                              : "Iniciar"}
                          </button>
                        )}

                        {(isEmSeparacaoTelevendas || isIncompletoTelevendas) &&
                          Boolean(chamado.operador_nome) &&
                          televendasDraft && (
                            <>
                              <button
                                onClick={() => {
                                  void runAction(`incompleto-${chamado.id}`, () =>
                                    onAtualizarItensTelevendas(chamado.id, {
                                      itens: televendasDraft.itens,
                                      operadorNome,
                                      status: "Incompleto",
                                      motivoIncompleto: televendasDraft.motivoIncompleto || "Estoque insuficiente",
                                      observacaoOperador: televendasDraft.observacaoOperador,
                                    })
                                  );
                                }}
                                disabled={loadingActionId === `incompleto-${chamado.id}`}
                                className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 transition-all hover:bg-rose-100 active:scale-95 sm:w-auto sm:text-sm"
                              >
                                {loadingActionId === `incompleto-${chamado.id}`
                                  ? "Salvando..."
                                  : "Marcar incompleto"}
                              </button>

                              <button
                                onClick={() => {
                                  void runAction(`cancelar-${chamado.id}`, () =>
                                    onAtualizarItensTelevendas(chamado.id, {
                                      itens: televendasDraft.itens,
                                      operadorNome,
                                      status: "Cancelado",
                                      observacaoOperador: televendasDraft.observacaoOperador,
                                    })
                                  );
                                }}
                                disabled={loadingActionId === `cancelar-${chamado.id}`}
                                className="w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 transition-all hover:bg-slate-200 active:scale-95 sm:w-auto sm:text-sm"
                              >
                                {loadingActionId === `cancelar-${chamado.id}`
                                  ? "Cancelando..."
                                  : "Cancelar pedido"}
                              </button>
                            </>
                          )}

                        {(isEmAtendimentoOperacional || isProntoTelevendas) && Boolean(chamado.operador_nome) && (
                          <button
                            onClick={() => {
                              void runAction(`finalizar-${chamado.id}`, () =>
                                onFinalizar(chamado.id, operadorNome)
                              );
                            }}
                            disabled={loadingActionId === `finalizar-${chamado.id}`}
                            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:brightness-105 active:scale-95 sm:w-auto sm:text-sm"
                          >
                            {loadingActionId === `finalizar-${chamado.id}` ? "Finalizando..." : "Finalizar"}
                          </button>
                        )}

                        {isFinalizado && (
                          <span className="w-full rounded-lg bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-500 sm:w-auto">
                            Concluído
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </SectionErrorBoundary>
      </main>

      <footer className="mt-8 border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        Painel do Operador · Sistema de Gerenciamento de Chamados
      </footer>
    </div>
  );
}
