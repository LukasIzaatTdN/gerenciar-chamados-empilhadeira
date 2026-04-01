import { useState, useEffect, useMemo, useCallback } from "react";
import { getSupermercadoById } from "./data/supermercados";
import Header from "./components/Header";
import AdminScopeSelector from "./components/AdminScopeSelector";
import Stats from "./components/Stats";
import SupermercadoComparison from "./components/SupermercadoComparison";
import SupermercadosAdmin from "./components/SupermercadosAdmin";
import ChamadoForm from "./components/ChamadoForm";
import ChamadoList from "./components/ChamadoList";
import OperadorPanel, { type OperadorStatus } from "./components/OperadorPanel";
import OperadorLogin from "./components/OperadorLogin";
import NotificationToast from "./components/NotificationToast";
import ProfileSettings from "./components/ProfileSettings";
import { useChamados } from "./hooks/useChamados";
import { useTimeEstimates } from "./hooks/useTimeEstimates";
import { useNotifications } from "./hooks/useNotifications";
import { useSupermercados } from "./hooks/useSupermercados";
import { useUsuarios } from "./hooks/useUsuarios";
import {
  createUserWithEmailAndPassword,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { Chamado } from "./types/chamado";
import { auth, db, hasFirebaseConfig } from "./config/firebase";
import type { UsuarioSistema } from "./types/usuario";
import { getPermissions } from "./utils/permissions";

type View = "geral" | "operador" | "perfil" | "dashboard" | "supermercados";
type ThemeMode = "light" | "dark";

const USER_SESSION_KEY = "operador_empilhadeira_usuario";
const OPERADOR_STATUS_KEY = "operador_empilhadeira_status";
const SETOR_KEY = "operador_empilhadeira_setor_principal";
const NOTIFICACOES_KEY = "operador_empilhadeira_notificacoes";
const SOM_KEY = "operador_empilhadeira_som";
const THEME_KEY = "operador_empilhadeira_tema";

function isPerfilAcesso(value: unknown): value is UsuarioSistema["perfil"] {
  return (
    value === "Promotor" ||
    value === "Funcionário" ||
    value === "Operador" ||
    value === "Supervisor" ||
    value === "Administrador Geral"
  );
}

function getViewByPerfil(perfil: UsuarioSistema["perfil"]): View {
  if (perfil === "Operador") return "operador";
  if (perfil === "Supervisor" || perfil === "Administrador Geral") return "dashboard";
  return "geral";
}

export default function App() {
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<View>("geral");
  const [usuarioAtual, setUsuarioAtual] = useState<UsuarioSistema | null>(() => {
    const saved = localStorage.getItem(USER_SESSION_KEY);
    if (!saved) return null;

    try {
      return JSON.parse(saved) as UsuarioSistema;
    } catch {
      return null;
    }
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
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [adminSupermercadoFiltro, setAdminSupermercadoFiltro] = useState<string>("todos");
  const [adminChamadoSupermercadoId, setAdminChamadoSupermercadoId] = useState<string>("");
  const {
    supermercados,
    createSupermercado,
    updateSupermercado,
    toggleSupermercadoStatus,
  } = useSupermercados();
  const { upsertUsuarioFromLogin } = useUsuarios();
  const operadorNome = usuarioAtual?.nome ?? null;
  const perfilAcesso = usuarioAtual?.perfil ?? null;
  const permissions = getPermissions(perfilAcesso);
  const supermercadoId = usuarioAtual?.supermercado_id ?? null;
  const supermercadoNome = getSupermercadoById(supermercadoId, supermercados)?.nome ?? null;
  const canViewAllUnits = permissions.canViewAllUnits;
  const supermercadoSelecionadoId =
    canViewAllUnits && adminSupermercadoFiltro !== "todos"
      ? adminSupermercadoFiltro
      : supermercadoId;
  const unidadeAtualNome =
    canViewAllUnits && adminSupermercadoFiltro === "todos"
      ? "Todas as unidades"
      : getSupermercadoById(supermercadoSelecionadoId, supermercados)?.nome ?? supermercadoNome ?? "Unidade não definida";

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
  } = useChamados(
    {
      supermercadoId: supermercadoSelecionadoId,
      canViewAll: canViewAllUnits && adminSupermercadoFiltro === "todos",
    },
    chamadoCallbacks
  );

  // Time estimates computed from all chamados
  const timeEstimates = useTimeEstimates(allChamados);
  const dashboardSetorMaisAcionado = useMemo(() => {
    if (allChamados.length === 0) return "Sem dados";

    const counts = new Map<string, number>();
    allChamados.forEach((chamado) => {
      counts.set(chamado.setor, (counts.get(chamado.setor) ?? 0) + 1);
    });

    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Sem dados";
  }, [allChamados]);
  const dashboardFinalizadosHoje = useMemo(() => {
    const hoje = new Date().toDateString();
    return allChamados.filter(
      (chamado) =>
        chamado.status === "Finalizado" &&
        chamado.finalizado_em &&
        new Date(chamado.finalizado_em).toDateString() === hoje
    ).length;
  }, [allChamados]);

  useEffect(() => {
    if (hasFirebaseConfig) return;

    if (usuarioAtual) {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(usuarioAtual));
    } else {
      localStorage.removeItem(USER_SESSION_KEY);
    }
  }, [usuarioAtual]);

  useEffect(() => {
    const firebaseAuth = auth;
    if (!hasFirebaseConfig || !firebaseAuth) return;

    return onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUsuarioAtual(null);
          return;
        }

        const tokenResult = await getIdTokenResult(firebaseUser, true);
        const perfilClaim = tokenResult.claims.perfil;
        const supermercadoClaim = tokenResult.claims.supermercado_id;
        const nomeClaim = tokenResult.claims.nome;

        if (isPerfilAcesso(perfilClaim)) {
          const usuarioClaims: UsuarioSistema = {
            id: firebaseUser.uid,
            nome:
              typeof nomeClaim === "string" && nomeClaim.trim()
                ? nomeClaim.trim()
                : firebaseUser.displayName?.trim() ||
                  firebaseUser.email?.trim() ||
                  "Usuário",
            perfil: perfilClaim,
            supermercado_id:
              typeof supermercadoClaim === "string" && supermercadoClaim.trim()
                ? supermercadoClaim.trim()
                : null,
          };

          setAuthNotice(null);
          setUsuarioAtual(usuarioClaims);
          setView((prev) => {
            if (prev === "perfil" || prev === "supermercados") return prev;
            return getViewByPerfil(usuarioClaims.perfil);
          });
          return;
        }

        if (!db) {
          setUsuarioAtual(null);
          return;
        }

        const userDoc = await getDoc(doc(db, "usuarios", firebaseUser.uid));
        if (!userDoc.exists()) {
          setUsuarioAtual(null);
          setAuthNotice("Conta sem cadastro interno. Solicite liberação ao administrador.");
          await signOut(firebaseAuth);
          setShowLoginModal(true);
          return;
        }

        const userData = userDoc.data() as Partial<UsuarioSistema> & {
          status?: string;
        };

        if (userData.status === "Pendente") {
          setUsuarioAtual(null);
          setAuthNotice("Conta criada e aguardando aprovação do administrador.");
          await signOut(firebaseAuth);
          setShowLoginModal(true);
          return;
        }

        if (userData.status === "Inativo") {
          setUsuarioAtual(null);
          setAuthNotice("Conta inativa. Entre em contato com o administrador.");
          await signOut(firebaseAuth);
          setShowLoginModal(true);
          return;
        }

        if (!isPerfilAcesso(userData.perfil)) {
          setUsuarioAtual(null);
          setAuthNotice("Perfil não configurado para esta conta.");
          await signOut(firebaseAuth);
          setShowLoginModal(true);
          return;
        }

        const usuarioFromDoc: UsuarioSistema = {
          id: firebaseUser.uid,
          nome:
            typeof userData.nome === "string" && userData.nome.trim()
              ? userData.nome.trim()
              : firebaseUser.email?.trim() || "Usuário",
          perfil: userData.perfil,
          supermercado_id:
            typeof userData.supermercado_id === "string"
              ? userData.supermercado_id
              : null,
        };

        setAuthNotice(null);
        setUsuarioAtual(usuarioFromDoc);
        setView((prev) => {
          if (prev === "perfil" || prev === "supermercados") return prev;
          return getViewByPerfil(usuarioFromDoc.perfil);
        });
      } catch {
        setUsuarioAtual(null);
      }
    });
  }, []);

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

  useEffect(() => {
    if (!canViewAllUnits) {
      setAdminSupermercadoFiltro("todos");
    }
  }, [canViewAllUnits]);

  const chamadosVisiveis = useMemo(() => {
    if (permissions.canTrackOwnChamados && operadorNome) {
      return chamados.filter((chamado) => chamado.solicitante_nome === operadorNome);
    }

    if (permissions.canViewUnitQueue || permissions.canViewUnitDashboard || permissions.canViewAllUnits) {
      return chamados;
    }

    return [];
  }, [chamados, operadorNome, permissions]);

  const isAuthenticated = Boolean(operadorNome && perfilAcesso);

  function openLoginModal() {
    setAuthNotice(null);
    setShowLoginModal(true);
  }

  function handleOperadorAccess() {
    if (isAuthenticated && permissions.canAccessOperatorPanel) {
      setView("operador");
    } else {
      openLoginModal();
    }
  }

  function handleDashboardAccess() {
    if (isAuthenticated && (permissions.canViewUnitDashboard || permissions.canViewAllUnits)) {
      setView("dashboard");
      return;
    }

    openLoginModal();
  }

  function handleNovoChamadoAccess() {
    if (isAuthenticated && permissions.canCreateChamado) {
      if (permissions.canViewAllUnits) {
        const firstAtivo = supermercados.find((item) => item.status === "Ativo");
        const defaultSupermercadoId =
          adminSupermercadoFiltro !== "todos" ? adminSupermercadoFiltro : firstAtivo?.id ?? "";
        setAdminChamadoSupermercadoId(defaultSupermercadoId);
      }
      setShowForm(true);
    } else {
      openLoginModal();
    }
  }

  async function handleOperadorLogin(usuario: UsuarioSistema) {
    setAuthNotice(null);
    const usuarioPersistido = await upsertUsuarioFromLogin(usuario);
    setUsuarioAtual(usuarioPersistido);
    setShowLoginModal(false);

    if (usuarioPersistido.perfil === "Operador") {
      setView("operador");
      return;
    }

    if (
      usuarioPersistido.perfil === "Supervisor" ||
      usuarioPersistido.perfil === "Administrador Geral"
    ) {
      setView("dashboard");
      return;
    }

    setView("geral");
  }

  async function handleFirebaseEmailLogin(input: {
    email: string;
    password: string;
  }) {
    if (!auth) throw new Error("Firebase Auth não inicializado");
    setAuthNotice(null);
    await signInWithEmailAndPassword(auth, input.email, input.password);
    setShowLoginModal(false);
  }

  async function handleFirebaseRegister(input: {
    nome: string;
    email: string;
    password: string;
    perfil: UsuarioSistema["perfil"];
    supermercado_id: string;
  }) {
    if (!auth || !db) throw new Error("Firebase não inicializado");

    const credential = await createUserWithEmailAndPassword(
      auth,
      input.email,
      input.password
    );

    await setDoc(
      doc(db, "usuarios", credential.user.uid),
      {
        id: credential.user.uid,
        nome: input.nome.trim(),
        perfil: input.perfil,
        supermercado_id: input.supermercado_id,
        status: "Pendente",
        email: input.email.trim().toLowerCase(),
        criado_em: new Date().toISOString(),
      },
      { merge: true }
    );

    await signOut(auth);
    setAuthNotice("Cadastro enviado. Aguarde aprovação do administrador para acessar.");
    setShowLoginModal(true);
  }

  function handleLogout() {
    if (hasFirebaseConfig && auth) {
      void signOut(auth);
    } else {
      setUsuarioAtual(null);
    }
    setView("geral");
  }

  function handleCreateSupermercado(input: {
    nome: string;
    codigo: string;
    endereco: string;
  }) {
    void createSupermercado({
      nome: input.nome.trim(),
      codigo: input.codigo.trim().toUpperCase(),
      endereco: input.endereco.trim(),
    });
  }

  function handleUpdateSupermercado(
    id: string,
    input: { nome: string; codigo: string; endereco: string }
  ) {
    void updateSupermercado(id, {
      nome: input.nome.trim(),
      codigo: input.codigo.trim().toUpperCase(),
      endereco: input.endereco.trim(),
    });
  }

  function handleToggleSupermercadoStatus(id: string) {
    void toggleSupermercadoStatus(id);
  }

  function handleOpenSupermercadosAdmin() {
    if (permissions.canViewAllUnits) {
      setView("supermercados");
    }
  }

  function handleAccessProfile() {
    if (isAuthenticated) {
      setView("perfil");
      return;
    }

    openLoginModal();
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
  if (view === "operador" && operadorNome && permissions.canAccessOperatorPanel) {
    return (
      <>
        <OperadorPanel
          chamados={allChamados}
          operadorNome={operadorNome}
          supermercadoNome={supermercadoNome}
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
          supermercadoNome={supermercadoNome}
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

  if (view === "dashboard" && (permissions.canViewUnitDashboard || permissions.canViewAllUnits)) {
    return (
      <div className="min-h-screen bg-transparent">
        <Header
          onNovoChamado={handleNovoChamadoAccess}
          onOperadorPanel={handleOperadorAccess}
          onDashboard={handleDashboardAccess}
          onAccessProfile={handleAccessProfile}
          onOpenLogin={openLoginModal}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onClearAll={clearAll}
          syncMode={hasFirebaseConfig ? "firebase" : "local"}
          perfilAcesso={perfilAcesso}
          usuarioNome={operadorNome}
          supermercadoNome={supermercadoNome}
          showCreateAction={permissions.canCreateChamado}
          showOperatorAction={permissions.canAccessOperatorPanel}
          showDashboardAction={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
        />

        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
          {canViewAllUnits && (
            <AdminScopeSelector
              value={adminSupermercadoFiltro}
              onChange={setAdminSupermercadoFiltro}
              supermercados={supermercados}
            />
          )}

          <div className="mb-5 rounded-[30px] border border-white/70 bg-white/70 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Dashboard da operação
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                  {unidadeAtualNome}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Painel exclusivo para supervisão e administração com visão de desempenho por unidade.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setView("geral")}
                className="touch-target inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all hover:bg-slate-50"
              >
                <span>📋</span>
                <span>Ir para Fila</span>
              </button>
            </div>
          </div>

          <div className="mb-5 fade-up">
            <Stats
              stats={{
                aguardando: stats.aguardando,
                emAtendimento: stats.emAtendimento,
                finalizadosHoje: dashboardFinalizadosHoje,
                urgentes: stats.urgentes,
                setorMaisAcionado: dashboardSetorMaisAcionado,
              }}
              mediaMin={timeEstimates.mediaMin}
              totalFinalizadosComTempo={timeEstimates.totalFinalizados}
            />
          </div>

          {canViewAllUnits && adminSupermercadoFiltro === "todos" && (
            <div className="mb-5 fade-up">
              <SupermercadoComparison chamados={allChamados} supermercados={supermercados} />
            </div>
          )}
        </main>
      </div>
    );
  }

  if (view === "supermercados" && permissions.canViewAllUnits) {
    return (
      <>
        <Header
          onNovoChamado={handleNovoChamadoAccess}
          onOperadorPanel={handleOperadorAccess}
          onDashboard={handleDashboardAccess}
          onAccessProfile={handleAccessProfile}
          onOpenLogin={openLoginModal}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onClearAll={clearAll}
          syncMode={hasFirebaseConfig ? "firebase" : "local"}
          perfilAcesso={perfilAcesso}
          usuarioNome={operadorNome}
          supermercadoNome={supermercadoNome}
          showCreateAction={permissions.canCreateChamado}
          showOperatorAction={permissions.canAccessOperatorPanel}
          showDashboardAction={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
        />
        <SupermercadosAdmin
          supermercados={supermercados}
          onCreate={handleCreateSupermercado}
          onUpdate={handleUpdateSupermercado}
          onToggleStatus={handleToggleSupermercadoStatus}
          onVoltar={() => setView("geral")}
        />
      </>
    );
  }

  // General panel view (promoter)
  return (
    <div className="min-h-screen bg-transparent">
      <Header
        onNovoChamado={handleNovoChamadoAccess}
        onOperadorPanel={handleOperadorAccess}
        onDashboard={handleDashboardAccess}
        onAccessProfile={handleAccessProfile}
        onOpenLogin={openLoginModal}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onClearAll={clearAll}
        syncMode={hasFirebaseConfig ? "firebase" : "local"}
        perfilAcesso={perfilAcesso}
        usuarioNome={operadorNome}
        supermercadoNome={supermercadoNome}
        showCreateAction={permissions.canCreateChamado}
        showOperatorAction={permissions.canAccessOperatorPanel}
        showDashboardAction={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
      />

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
        {canViewAllUnits && (
          <AdminScopeSelector
            value={adminSupermercadoFiltro}
            onChange={setAdminSupermercadoFiltro}
            supermercados={supermercados}
          />
        )}

        {canViewAllUnits && (
          <div className="mb-5">
            <button
              type="button"
              onClick={handleOpenSupermercadosAdmin}
              className="touch-target inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all hover:bg-slate-50"
            >
              <span>🏬</span>
              <span>Gerenciar Supermercados</span>
            </button>
          </div>
        )}

        {permissions.canTrackOwnChamados && (
          <div className="mb-4 rounded-[28px] border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
            Seu acesso permite abrir chamados e acompanhar apenas as suas solicitações dentro da unidade vinculada.
          </div>
        )}

        {(permissions.canTrackOwnChamados || permissions.canViewUnitQueue || permissions.canViewAllUnits) && (
          <>
        <div className="mb-4 flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/60 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
              {permissions.canTrackOwnChamados ? "Meus Chamados" : "Fila de Atendimento"}
              <span className="ml-2 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                {chamadosVisiveis.length}
              </span>
            </h2>
            <div className="mt-2 flex flex-col gap-2">
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
                Unidade atual: {unidadeAtualNome}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 text-xs font-medium text-slate-500">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.5)]" />
            {permissions.canTrackOwnChamados
              ? "Acompanhamento restrito ao seu usuário"
              : "Fila isolada por supermercado"}
          </div>
        </div>

        <ChamadoList
          chamados={chamadosVisiveis}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          timeEstimates={timeEstimates}
          showSupermercado={canViewAllUnits && adminSupermercadoFiltro === "todos"}
        />
          </>
        )}

        {!permissions.canCreateChamado &&
          !permissions.canAccessOperatorPanel &&
          !permissions.canViewUnitDashboard &&
          !permissions.canTrackOwnChamados && (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
              <p>
                Seu perfil possui acesso restrito. Abra o perfil para revisar
                dados de acesso e unidade vinculada.
              </p>
              <button
                type="button"
                onClick={openLoginModal}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                <span>🔐</span>
                Trocar usuário
              </button>
            </div>
          )}
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
          {(permissions.canViewUnitDashboard || permissions.canViewAllUnits) && (
            <button
              onClick={handleDashboardAccess}
              className="touch-target flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              <span>📈</span>
              Dashboard
            </button>
          )}
          <button
            onClick={permissions.canAccessOperatorPanel ? handleOperadorAccess : handleAccessProfile}
            className="touch-target flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            <span>👷</span>
            {permissions.canAccessOperatorPanel ? "Operador" : "Perfil"}
          </button>
          <button
            onClick={openLoginModal}
            className="touch-target flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
          >
            <span>🔐</span>
            Entrar
          </button>
          {permissions.canCreateChamado && (
            <button
              onClick={handleNovoChamadoAccess}
              className="touch-target flex flex-[1.35] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(249,115,22,0.32)]"
            >
              <span className="text-base">＋</span>
              Novo Chamado
            </button>
          )}
        </div>
      </div>

      {/* New Chamado Modal */}
      {showForm && (
        <ChamadoForm
          solicitanteNome={operadorNome ?? ""}
          solicitantePerfil={perfilAcesso}
          supermercadoNome={
            permissions.canViewAllUnits
              ? getSupermercadoById(adminChamadoSupermercadoId, supermercados)?.nome ?? null
              : supermercadoNome
          }
          isAdminGeral={permissions.canViewAllUnits}
          supermercados={supermercados}
          supermercadoSelecionadoId={adminChamadoSupermercadoId}
          onSupermercadoSelecionadoChange={setAdminChamadoSupermercadoId}
          onSubmit={(data) => {
            const supermercadoChamadoId = permissions.canViewAllUnits
              ? adminChamadoSupermercadoId
              : supermercadoId;

            if (!supermercadoChamadoId) {
              return;
            }

            criarChamado({
              ...data,
              supermercado_id: supermercadoChamadoId,
            });
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Operator Login Modal */}
      {showLoginModal && (
        <OperadorLogin
          onLogin={handleOperadorLogin}
          onFirebaseLogin={handleFirebaseEmailLogin}
          onFirebaseRegister={handleFirebaseRegister}
          noticeMessage={authNotice}
          onDismissNotice={() => setAuthNotice(null)}
          onCancel={() => setShowLoginModal(false)}
          supermercados={supermercados}
          authMode={hasFirebaseConfig ? "firebase" : "local"}
        />
      )}

      {/* Toast Notifications */}
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
