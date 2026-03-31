import { useState, useEffect, useMemo, useCallback } from "react";
import Header from "./components/Header";
import Stats from "./components/Stats";
import ChamadoForm from "./components/ChamadoForm";
import ChamadoList from "./components/ChamadoList";
import OperadorPanel, { type OperadorStatus } from "./components/OperadorPanel";
import OperadorLogin, { type PerfilAcesso } from "./components/OperadorLogin";
import NotificationToast from "./components/NotificationToast";
import ProfileSettings from "./components/ProfileSettings";
import { useChamados } from "./hooks/useChamados";
import { useTimeEstimates } from "./hooks/useTimeEstimates";
import { useNotifications } from "./hooks/useNotifications";
import type { Chamado } from "./types/chamado";
import { hasFirebaseConfig } from "./config/firebase";

type View = "geral" | "operador" | "perfil";
type LoginTarget = "general" | "operator";
type ThemeMode = "light" | "dark";

const OPERADOR_KEY = "operador_empilhadeira_nome";
const PERFIL_KEY = "operador_empilhadeira_perfil";
const OPERADOR_STATUS_KEY = "operador_empilhadeira_status";
const SETOR_KEY = "operador_empilhadeira_setor_principal";
const NOTIFICACOES_KEY = "operador_empilhadeira_notificacoes";
const SOM_KEY = "operador_empilhadeira_som";
const THEME_KEY = "operador_empilhadeira_tema";

export default function App() {
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<View>("geral");
  const [operadorNome, setOperadorNome] = useState<string | null>(() => {
    return localStorage.getItem(OPERADOR_KEY);
  });
  const [perfilAcesso, setPerfilAcesso] = useState<PerfilAcesso | null>(() => {
    const perfil = localStorage.getItem(PERFIL_KEY);
    return perfil as PerfilAcesso | null;
  });
  const [operadorStatus, setOperadorStatus] = useState<OperadorStatus>(() => {
    const savedStatus = localStorage.getItem(OPERADOR_STATUS_KEY);
    return savedStatus === "Pausa" ? "Pausa" : "Disponível";
  });
  const [setorPrincipal, setSetorPrincipal] = useState<string>(() => {
    return localStorage.getItem(SETOR_KEY) || "Estoque";
  });
  const [notificacoesAtivas, setNotificacoesAtivas] = useState(() => {
    const saved = localStorage.getItem(NOTIFICACOES_KEY);
    return saved === null ? true : saved === "true";
  });
  const [somAtivo, setSomAtivo] = useState(() => {
    const saved = localStorage.getItem(SOM_KEY);
    return saved === null ? true : saved === "true";
  });
  const [tema, setTema] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "dark" ? "dark" : "light";
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginTarget, setLoginTarget] = useState<LoginTarget>("general");

  // Notification system
  const {
    notifications,
    toasts,
    unreadCount,
    notify,
    markAsRead,
    markAllAsRead,
    dismissToast,
    clearAll,
  } = useNotifications({
    enabled: notificacoesAtivas,
    soundEnabled: somAtivo,
  });

  // Notification callbacks for chamado state changes
  const chamadoCallbacks = useMemo(
    () => ({
      onCriado: (chamado: Chamado) => {
        notify(
          "chamado_criado",
          "Novo Chamado Criado",
          `${chamado.solicitante_nome} solicitou ${chamado.tipo_servico} em ${chamado.setor}${
            chamado.prioridade === "Urgente" ? " 🚨 URGENTE" : ""
          }`,
          chamado.id
        );
      },
      onAssumido: (chamado: Chamado, operador: string) => {
        notify(
          "chamado_assumido",
          "Chamado Assumido",
          `${operador} assumiu o chamado de ${chamado.tipo_servico} em ${chamado.setor}`,
          chamado.id
        );
      },
      onIniciado: (chamado: Chamado) => {
        notify(
          "atendimento_iniciado",
          "Atendimento Iniciado",
          `${chamado.operador_nome || "Operador"} iniciou ${chamado.tipo_servico} em ${chamado.setor}`,
          chamado.id
        );
      },
      onFinalizado: (chamado: Chamado) => {
        notify(
          "atendimento_finalizado",
          "Atendimento Finalizado",
          `${chamado.tipo_servico} em ${chamado.setor} foi concluído por ${chamado.operador_nome || "operador"}`,
          chamado.id
        );
      },
    }),
    [notify]
  );

  const {
    chamados,
    allChamados,
    stats,
    filterStatus,
    setFilterStatus,
    criarChamado,
    assumirChamado,
    iniciarAtendimento,
    finalizarChamado,
    excluirChamado,
  } = useChamados(chamadoCallbacks);

  // Time estimates computed from all chamados
  const timeEstimates = useTimeEstimates(allChamados);

  // Persist operator name
  useEffect(() => {
    if (operadorNome) {
      localStorage.setItem(OPERADOR_KEY, operadorNome);
    } else {
      localStorage.removeItem(OPERADOR_KEY);
    }
  }, [operadorNome]);

  useEffect(() => {
    if (perfilAcesso) {
      localStorage.setItem(PERFIL_KEY, perfilAcesso);
    } else {
      localStorage.removeItem(PERFIL_KEY);
    }
  }, [perfilAcesso]);

  useEffect(() => {
    localStorage.setItem(OPERADOR_STATUS_KEY, operadorStatus);
  }, [operadorStatus]);

  useEffect(() => {
    localStorage.setItem(SETOR_KEY, setorPrincipal);
  }, [setorPrincipal]);

  useEffect(() => {
    localStorage.setItem(NOTIFICACOES_KEY, String(notificacoesAtivas));
  }, [notificacoesAtivas]);

  useEffect(() => {
    localStorage.setItem(SOM_KEY, String(somAtivo));
  }, [somAtivo]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, tema);
    document.documentElement.dataset.theme = tema;
    document.documentElement.classList.toggle("dark", tema === "dark");
  }, [tema]);

  const canCreateChamado =
    perfilAcesso === "Promotor" ||
    perfilAcesso === "Funcionário" ||
    perfilAcesso === "Supervisor";

  const canAccessOperatorPanel =
    perfilAcesso === "Operador" || perfilAcesso === "Supervisor";

  const isAuthenticated = Boolean(operadorNome && perfilAcesso);

  function openLoginModal(target: LoginTarget) {
    setLoginTarget(target);
    setShowLoginModal(true);
  }

  function handleOperadorAccess() {
    if (isAuthenticated && canAccessOperatorPanel) {
      setView("operador");
    } else {
      openLoginModal("operator");
    }
  }

  function handleNovoChamadoAccess() {
    if (isAuthenticated && canCreateChamado) {
      setShowForm(true);
    } else {
      openLoginModal("general");
    }
  }

  function handleOperadorLogin(nome: string, perfil: PerfilAcesso) {
    setOperadorNome(nome);
    setPerfilAcesso(perfil);
    setShowLoginModal(false);

    if (loginTarget === "operator" && (perfil === "Operador" || perfil === "Supervisor")) {
      setView("operador");
      return;
    }

    setView("geral");
  }

  function handleLogout() {
    setOperadorNome(null);
    setPerfilAcesso(null);
    setView("geral");
  }

  function handleAccessProfile() {
    if (isAuthenticated) {
      setView("perfil");
      return;
    }

    openLoginModal("general");
  }

  // Simulate "operator nearby" notification
  const handleSimulateProximo = useCallback(() => {
    // Find the first pending chamado that this operator has assumed or any pending
    const meusChamados = allChamados.filter(
      (c) =>
        c.operador_nome === operadorNome &&
        (c.status === "Aguardando" || c.status === "Em atendimento")
    );

    const target = meusChamados[0];
    if (target) {
      notify(
        "operador_proximo",
        "Operador Próximo!",
        `${operadorNome} está se dirigindo ao setor ${target.setor} para ${target.tipo_servico}`,
        target.id
      );
    } else {
      // General broadcast
      notify(
        "operador_proximo",
        "Operador Disponível",
        `${operadorNome} está disponível e próximo para atender chamados`,
        undefined
      );
    }
  }, [allChamados, operadorNome, notify]);

  // Operator panel view
  if (view === "operador" && operadorNome && canAccessOperatorPanel) {
    return (
      <>
        <OperadorPanel
          chamados={allChamados}
          operadorNome={operadorNome}
          operadorStatus={operadorStatus}
          onStatusChange={setOperadorStatus}
          onAssumir={assumirChamado}
          onIniciar={iniciarAtendimento}
          onFinalizar={finalizarChamado}
          onVoltar={() => setView("geral")}
          onLogout={handleLogout}
          timeEstimates={timeEstimates}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onClearAll={clearAll}
          onSimulateProximo={handleSimulateProximo}
        />
        <NotificationToast toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (view === "perfil" && operadorNome && perfilAcesso) {
    return (
      <>
        <ProfileSettings
          nome={operadorNome}
          perfil={perfilAcesso}
          setorPrincipal={setorPrincipal}
          notificacoesAtivas={notificacoesAtivas}
          somAtivo={somAtivo}
          tema={tema}
          onSetorPrincipalChange={setSetorPrincipal}
          onNotificacoesChange={setNotificacoesAtivas}
          onSomChange={setSomAtivo}
          onTemaChange={setTema}
          onVoltar={() => setView("geral")}
          onLogout={handleLogout}
        />
        <NotificationToast toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // General panel view (promoter)
  return (
    <div className="min-h-screen bg-transparent">
      <Header
        onNovoChamado={handleNovoChamadoAccess}
        onOperadorPanel={handleOperadorAccess}
        onAccessProfile={handleAccessProfile}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onClearAll={clearAll}
        syncMode={hasFirebaseConfig ? "firebase" : "local"}
        perfilAcesso={perfilAcesso}
        usuarioNome={operadorNome}
        canCreateChamado={canCreateChamado}
        canAccessOperatorPanel={canAccessOperatorPanel}
      />

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
        {/* Stats */}
        <div className="mb-5 fade-up">
          <Stats
            stats={stats}
            mediaMin={timeEstimates.mediaMin}
            totalFinalizadosComTempo={timeEstimates.totalFinalizados}
          />
        </div>

        {/* Chamados List */}
        <div className="mb-4 flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/60 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
              Painel de Chamados
              <span className="ml-2 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                {chamados.length}
              </span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Priorizacao automatica por urgencia e ordem de chegada
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 text-xs font-medium text-slate-500">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.5)]" />
            Urgentes sobem para o topo
          </div>
        </div>

        <ChamadoList
          chamados={chamados}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          timeEstimates={timeEstimates}
        />
      </main>

      {/* Footer */}
      <footer className="mt-8 border-t border-white/50 py-4 text-center text-xs text-slate-400">
        Painel Empilhadeira · Sistema de Gerenciamento de Chamados
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/90 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          {isAuthenticated && (
            <button
              onClick={handleAccessProfile}
              className="touch-target flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
              aria-label="Abrir perfil e configurações"
            >
              ⚙️
            </button>
          )}
          <button
            onClick={canAccessOperatorPanel ? handleOperadorAccess : () => openLoginModal("operator")}
            className="touch-target flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            <span>👷</span>
            {canAccessOperatorPanel ? "Operador" : "Entrar"}
          </button>
          <button
            onClick={handleNovoChamadoAccess}
            className="touch-target flex flex-[1.35] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(249,115,22,0.32)]"
          >
            <span className="text-base">＋</span>
            {canCreateChamado ? "Novo Chamado" : "Acesso para Solicitar"}
          </button>
        </div>
      </div>

      {/* New Chamado Modal */}
      {showForm && (
        <ChamadoForm
          solicitanteNome={operadorNome ?? ""}
          solicitantePerfil={perfilAcesso}
          onSubmit={(data) => {
            criarChamado(data);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Operator Login Modal */}
      {showLoginModal && (
        <OperadorLogin
          onLogin={handleOperadorLogin}
          onCancel={() => setShowLoginModal(false)}
        />
      )}

      {/* Toast Notifications */}
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
