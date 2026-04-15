import { useState, useEffect, useMemo } from "react";
import { getEmpresaById } from "./data/empresas";
import { getUnidadeById } from "./data/unidades";
import Header from "./components/Header";
import AdminScopeSelector from "./components/AdminScopeSelector";
import AdminExecutiveSummary from "./components/AdminExecutiveSummary";
import ChamadoTimeMetricsPanel from "./components/ChamadoTimeMetricsPanel";
import Stats from "./components/Stats";
import SupermercadoComparison from "./components/SupermercadoComparison";
import EmpresasAdmin from "./components/EmpresasAdmin";
import UnidadesAdmin from "./components/UnidadesAdmin";
import UsuariosAdmin from "./components/UsuariosAdmin";
import EmpilhadeirasAdmin from "./components/EmpilhadeirasAdmin";
import ManutencoesAdmin from "./components/ManutencoesAdmin";
import ChamadoForm from "./components/ChamadoForm";
import ChamadoList from "./components/ChamadoList";
import OperadorPanel, { type OperadorStatus } from "./components/OperadorPanel";
import OperadorLogin from "./components/OperadorLogin";
import NotificationToast from "./components/NotificationToast";
import ProfileSettings from "./components/ProfileSettings";
import { isEmAtendimentoStatus, isPendenteStatus } from "./utils/chamadoStatus";
import { useChamados } from "./hooks/useChamados";
import { useTimeEstimates } from "./hooks/useTimeEstimates";
import { useNotifications } from "./hooks/useNotifications";
import { useUnidades } from "./hooks/useUnidades";
import { useEmpresas } from "./hooks/useEmpresas";
import { useUsuarios } from "./hooks/useUsuarios";
import { useEmpilhadeiras } from "./hooks/useEmpilhadeiras";
import { useChecklistsEmpilhadeira } from "./hooks/useChecklistsEmpilhadeira";
import { useManutencoes } from "./hooks/useManutencoes";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import type { Chamado } from "./types/chamado";
import type { EmpilhadeiraStatus } from "./types/empilhadeira";
import type {
  ManutencaoPrioridade,
  ManutencaoStatus,
  ManutencaoTipo,
  NovaManutencaoInput,
} from "./types/manutencao";
import { auth, db, hasFirebaseConfig } from "./config/firebase";
import type { UsuarioSistema } from "./types/usuario";
import { getPermissions } from "./utils/permissions";
import { LEGACY_EMPRESA_ID } from "./utils/tenant";

type View =
  | "geral"
  | "operador"
  | "perfil"
  | "dashboard"
  | "empresas"
  | "unidades"
  | "usuarios"
  | "empilhadeiras"
  | "manutencoes";
type ThemeMode = "light" | "dark";
type DashboardPeriod = "hoje" | "7d" | "30d";

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
    value === "Televendas" ||
    value === "Administrador da Empresa" ||
    value === "Administrador Geral"
  );
}

function getViewByPerfil(perfil: UsuarioSistema["perfil"]): View {
  if (perfil === "Operador") return "operador";
  if (
    perfil === "Supervisor" ||
    perfil === "Administrador da Empresa" ||
    perfil === "Administrador Geral"
  ) {
    return "dashboard";
  }
  return "geral";
}

function canAccessViewByPerfil(view: View, perfil: UsuarioSistema["perfil"]) {
  const nextPermissions = getPermissions(perfil);

  if (view === "empresas") return nextPermissions.canViewAllCompanies;
  if (view === "unidades") return nextPermissions.canViewAllUnits;
  if (view === "usuarios") return nextPermissions.canViewAllUnits;
  if (view === "dashboard") {
    return nextPermissions.canViewUnitDashboard || nextPermissions.canViewAllUnits;
  }
  if (view === "operador") return nextPermissions.canAccessOperatorPanel;
  return true;
}

export default function App() {
  const [authHydrated, setAuthHydrated] = useState(!hasFirebaseConfig);
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<View>("geral");
  const [previousView, setPreviousView] = useState<View>("geral");
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
  const [adminEmpresaFiltro, setAdminEmpresaFiltro] = useState<string>("todas");
  const [adminSupermercadoFiltro, setAdminSupermercadoFiltro] = useState<string>("todos");
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>("7d");
  const [adminChamadoSupermercadoId, setAdminChamadoSupermercadoId] = useState<string>("");
  const {
    empresas,
    createEmpresa,
    updateEmpresa,
    toggleEmpresaStatus,
  } = useEmpresas();
  const {
    unidades: supermercados,
    createUnidade: createSupermercado,
    updateUnidade: updateSupermercado,
    toggleUnidadeStatus: toggleSupermercadoStatus,
  } = useUnidades();
  const {
    usuarios,
    upsertUsuarioFromLogin,
    updateUsuarioAdmin,
    toggleUsuarioStatus,
  } = useUsuarios();
  const operadorId = usuarioAtual?.id ?? null;
  const operadorNome = usuarioAtual?.nome ?? null;
  const perfilAcesso = usuarioAtual?.perfil ?? null;
  const isPlatformAdmin = perfilAcesso === "Administrador Geral";
  const permissions = getPermissions(perfilAcesso);
  const linkedEmpresaId =
    usuarioAtual?.empresa_id ??
    getUnidadeById(usuarioAtual?.supermercado_id, supermercados)?.empresa_id ??
    (perfilAcesso === "Administrador Geral" ? null : LEGACY_EMPRESA_ID);
  const empresaId = linkedEmpresaId;
  const supermercadoId = usuarioAtual?.supermercado_id ?? null;
  const empresaNome = getEmpresaById(empresaId, empresas)?.nome ?? null;
  const supermercadoNome = getUnidadeById(supermercadoId, supermercados)?.nome ?? null;
  const canViewAllUnits = permissions.canViewAllUnits;
  const canViewAllCompanies = permissions.canViewAllCompanies;
  const empresaSelecionadaId =
    canViewAllCompanies && adminEmpresaFiltro !== "todas"
      ? adminEmpresaFiltro
      : empresaId;
  const supermercadosDoEscopo = useMemo(
    () =>
      empresaSelecionadaId
        ? supermercados.filter((item) => item.empresa_id === empresaSelecionadaId)
        : supermercados,
    [empresaSelecionadaId, supermercados]
  );
  const supermercadoSelecionadoId =
    canViewAllUnits && adminSupermercadoFiltro !== "todos"
      ? adminSupermercadoFiltro
      : supermercadoId;
  const unidadeAtualNome =
    canViewAllUnits && adminSupermercadoFiltro === "todos"
      ? "Todas as unidades"
      : getUnidadeById(supermercadoSelecionadoId, supermercados)?.nome ?? supermercadoNome ?? "Unidade não definida";
  const nomeEscopoAtual =
    canViewAllCompanies && adminEmpresaFiltro === "todas"
      ? "Todas as empresas"
      : adminSupermercadoFiltro === "todos"
      ? empresaNome ?? getEmpresaById(empresaSelecionadaId, empresas)?.nome ?? "Empresa não definida"
      : unidadeAtualNome;
  const platformSummary = useMemo(
    () => ({
      empresasAtivas: empresas.filter((empresa) => empresa.status === "Ativa").length,
      empresasTotais: empresas.length,
      unidadesAtivas: supermercados.filter((supermercado) => supermercado.status === "Ativo").length,
      unidadesTotais: supermercados.length,
    }),
    [empresas, supermercados]
  );
  const {
    empilhadeiras,
    createEmpilhadeira,
    updateEmpilhadeira,
    updateEmpilhadeiraStatus,
  } = useEmpilhadeiras({
    empresaId: empresaSelecionadaId,
    supermercadoId: supermercadoSelecionadoId,
    canViewAllUnits: canViewAllUnits && adminSupermercadoFiltro === "todos",
    canViewAllCompanies,
  });
  const { checklists, createChecklist } = useChecklistsEmpilhadeira({
    empresaId: empresaSelecionadaId,
    supermercadoId: supermercadoSelecionadoId,
    canViewAllUnits: canViewAllUnits && adminSupermercadoFiltro === "todos",
    canViewAllCompanies,
  });
  const { manutencoes, createManutencao, updateManutencao } = useManutencoes({
    empresaId: empresaSelecionadaId,
    supermercadoId: supermercadoSelecionadoId,
    canViewAllUnits: canViewAllUnits && adminSupermercadoFiltro === "todos",
    canViewAllCompanies,
  });

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
    syncError,
    isRemoteSyncEnabled: chamadosRemoteSyncEnabled,
    filterStatus,
    setFilterStatus,
    criarChamado,
    assumirChamado,
    marcarACaminho,
    marcarChegada,
    atualizarItensTelevendas,
    iniciarAtendimento,
    finalizarChamado,
  } = useChamados(
    {
      empresaId: empresaSelecionadaId,
      supermercadoId: supermercadoSelecionadoId,
      canViewAllUnits: canViewAllUnits && adminSupermercadoFiltro === "todos",
      canViewAllCompanies,
    },
    chamadoCallbacks
  );

  // Time estimates computed from all chamados
  const timeEstimates = useTimeEstimates(allChamados);
  const dashboardChamados = useMemo(() => {
    const now = new Date();
    const start = new Date(now);

    if (dashboardPeriod === "hoje") {
      start.setHours(0, 0, 0, 0);
    } else if (dashboardPeriod === "7d") {
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
    }

    return allChamados.filter((chamado) => new Date(chamado.criado_em).getTime() >= start.getTime());
  }, [allChamados, dashboardPeriod]);
  const dashboardTimeEstimates = useTimeEstimates(dashboardChamados);
  const dashboardStats = useMemo(
    () => ({
      aguardando: dashboardChamados.filter((c) => isPendenteStatus(c.status)).length,
      emAtendimento: dashboardChamados.filter((c) => isEmAtendimentoStatus(c.status)).length,
      finalizadosHoje: dashboardChamados.filter((c) => c.status === "Finalizado").length,
      urgentes: dashboardChamados.filter((c) => c.prioridade === "Urgente" && c.status !== "Finalizado").length,
      setorMaisAcionado: (() => {
        if (dashboardChamados.length === 0) return "Sem dados";
        const counts = new Map<string, number>();
        dashboardChamados.forEach((chamado) => {
          counts.set(chamado.setor, (counts.get(chamado.setor) ?? 0) + 1);
        });
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Sem dados";
      })(),
    }),
    [dashboardChamados]
  );
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
  const dashboardPeriodLabel =
    dashboardPeriod === "hoje"
      ? "Finalizados hoje"
      : dashboardPeriod === "7d"
      ? "Finalizados em 7 dias"
      : "Finalizados em 30 dias";
  const dashboardPeriodHint =
    dashboardPeriod === "hoje"
      ? "retrato operacional do dia"
      : dashboardPeriod === "7d"
      ? "janela curta para ajustes táticos"
      : "janela ampliada para tendência e ritmo";

  useEffect(() => {
    if (usuarioAtual) {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(usuarioAtual));
    } else {
      localStorage.removeItem(USER_SESSION_KEY);
    }
  }, [usuarioAtual]);

  useEffect(() => {
    const firebaseAuth = auth;
    if (!hasFirebaseConfig || !firebaseAuth) return;

    let unsubscribeUserDoc: (() => void) | undefined;

    return onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      try {
        if (unsubscribeUserDoc) {
          unsubscribeUserDoc();
          unsubscribeUserDoc = undefined;
        }

        if (!firebaseUser) {
          setUsuarioAtual(null);
          setAuthHydrated(true);
          return;
        }

        const tokenResult = await getIdTokenResult(firebaseUser, true);
        const perfilClaim = tokenResult.claims.perfil;
        const empresaClaim = tokenResult.claims.empresa_id;
        const supermercadoClaim = tokenResult.claims.supermercado_id;
        const nomeClaim = tokenResult.claims.nome;

        let usuarioResolved: UsuarioSistema | null = null;

        const applyUsuarioResolved = async (
          nextUsuario: UsuarioSistema | null,
          shouldOpenLogin = false
        ) => {
          if (!nextUsuario) {
            setUsuarioAtual(null);
            if (shouldOpenLogin) {
              await signOut(firebaseAuth);
              setShowLoginModal(true);
            }
            return;
          }

          setUsuarioAtual(nextUsuario);
          setView((prev) => {
            if (prev === "perfil") {
              return prev;
            }
            if (canAccessViewByPerfil(prev, nextUsuario.perfil)) {
              return prev;
            }
            return getViewByPerfil(nextUsuario.perfil);
          });
        };

        const buildFallbackUsuario = () =>
          isPerfilAcesso(perfilClaim)
            ? {
                id: firebaseUser.uid,
                nome:
                  typeof nomeClaim === "string" && nomeClaim.trim()
                    ? nomeClaim.trim()
                    : firebaseUser.displayName?.trim() ||
                      firebaseUser.email?.trim() ||
                      "Usuário",
                perfil: perfilClaim,
                empresa_id:
                  typeof empresaClaim === "string" && empresaClaim.trim()
                    ? empresaClaim.trim()
                    : perfilClaim === "Administrador Geral"
                    ? null
                    : LEGACY_EMPRESA_ID,
                supermercado_id:
                  typeof supermercadoClaim === "string" && supermercadoClaim.trim()
                    ? supermercadoClaim.trim()
                    : null,
                supermercado_ids:
                  typeof supermercadoClaim === "string" && supermercadoClaim.trim()
                    ? [supermercadoClaim.trim()]
                    : [],
              }
            : null;

        if (db) {
          unsubscribeUserDoc = onSnapshot(
            doc(db, "usuarios", firebaseUser.uid),
            async (userDoc) => {
              if (userDoc.exists()) {
                const userData = userDoc.data() as Partial<UsuarioSistema> & { status?: string };
                if (userData.status === "Inativo") {
                  await applyUsuarioResolved(null, true);
                  setAuthHydrated(true);
                  return;
                }

                if (isPerfilAcesso(userData.perfil)) {
                  usuarioResolved = {
                    id: firebaseUser.uid,
                    nome:
                      typeof userData.nome === "string" && userData.nome.trim()
                        ? userData.nome.trim()
                        : firebaseUser.email?.trim() || "Usuário",
                    perfil: userData.perfil,
                    empresa_id:
                      typeof userData.empresa_id === "string" && userData.empresa_id.trim()
                        ? userData.empresa_id
                        : userData.perfil === "Administrador Geral"
                        ? null
                        : LEGACY_EMPRESA_ID,
                    supermercado_id:
                      typeof userData.supermercado_id === "string"
                        ? userData.supermercado_id
                        : null,
                    supermercado_ids:
                      Array.isArray(userData.supermercado_ids)
                        ? userData.supermercado_ids.filter(
                            (item): item is string =>
                              typeof item === "string" && item.trim().length > 0
                          )
                        : typeof userData.supermercado_id === "string"
                        ? [userData.supermercado_id]
                        : [],
                  };
                  await applyUsuarioResolved(usuarioResolved);
                  setAuthHydrated(true);
                  return;
                }
              }

              await applyUsuarioResolved(buildFallbackUsuario());
              setAuthHydrated(true);
            },
            async () => {
              await applyUsuarioResolved(buildFallbackUsuario());
              setAuthHydrated(true);
            }
          );
          return;
        }

        usuarioResolved = buildFallbackUsuario();
        await applyUsuarioResolved(usuarioResolved);
        setAuthHydrated(true);
      } catch {
        setUsuarioAtual(null);
        setAuthHydrated(true);
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
    if (!canViewAllCompanies) {
      setAdminEmpresaFiltro("todas");
    }
  }, [canViewAllCompanies]);

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
  const defaultViewForCurrentUser = perfilAcesso ? getViewByPerfil(perfilAcesso) : "geral";

  function renderGlobalOverlays() {
    return (
      <>
        {showForm && (
          <ChamadoForm
            solicitanteNome={operadorNome ?? ""}
            solicitantePerfil={perfilAcesso}
            supermercadoNome={
              permissions.canViewAllUnits
                ? getUnidadeById(adminChamadoSupermercadoId, supermercados)?.nome ?? null
                : supermercadoNome
            }
            isAdminGeral={permissions.canViewAllUnits}
            supermercados={supermercadosDoEscopo}
            supermercadoSelecionadoId={adminChamadoSupermercadoId}
            onSupermercadoSelecionadoChange={setAdminChamadoSupermercadoId}
            onSubmit={async (data) => {
              const supermercadoChamadoId = permissions.canViewAllUnits
                ? adminChamadoSupermercadoId
                : supermercadoId;
              const empresaChamadoId =
                getUnidadeById(supermercadoChamadoId, supermercados)?.empresa_id ?? empresaId;

              if (!supermercadoChamadoId || !empresaChamadoId) {
                throw new Error("Empresa ou unidade não definida");
              }

              await criarChamado({
                ...data,
                empresa_id: empresaChamadoId,
                supermercado_id: supermercadoChamadoId,
              });
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {showLoginModal && (
          <OperadorLogin
            onLogin={handleOperadorLogin}
            onFirebaseLogin={handleFirebaseEmailLogin}
            onFirebaseGoogleLogin={handleFirebaseGoogleLogin}
            onFirebaseRegister={handleFirebaseRegister}
            onCancel={() => setShowLoginModal(false)}
            empresas={empresas}
            supermercados={supermercados}
            authMode={hasFirebaseConfig ? "firebase" : "local"}
          />
        )}

        <NotificationToast toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  function navigateTo(nextView: View) {
    setPreviousView(view);
    setView(nextView);
  }

  function goBackToPreviousView() {
    setView(previousView === view ? defaultViewForCurrentUser : previousView);
  }

  function openLoginModal() {
    setShowLoginModal(true);
  }

  function handleOperadorAccess() {
    if (isAuthenticated && permissions.canAccessOperatorPanel) {
      navigateTo("operador");
    } else {
      openLoginModal();
    }
  }

  function handleDashboardAccess() {
    if (isAuthenticated && (permissions.canViewUnitDashboard || permissions.canViewAllUnits)) {
      navigateTo("dashboard");
      return;
    }

    openLoginModal();
  }

  function handleNovoChamadoAccess() {
    if (isAuthenticated && permissions.canCreateChamado) {
      if (permissions.canViewAllUnits) {
        const firstAtivo = supermercadosDoEscopo.find((item) => item.status === "Ativo");
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
    const usuarioPersistido = await upsertUsuarioFromLogin(usuario);
    setUsuarioAtual(usuarioPersistido);
    setShowLoginModal(false);

    if (usuarioPersistido.perfil === "Operador") {
      setPreviousView(view);
      setView("operador");
      return;
    }

    if (
      usuarioPersistido.perfil === "Supervisor" ||
      usuarioPersistido.perfil === "Administrador da Empresa" ||
      usuarioPersistido.perfil === "Administrador Geral"
    ) {
      setPreviousView(view);
      setView("dashboard");
      return;
    }

    setPreviousView(view);
    setView("geral");
  }

  async function handleFirebaseEmailLogin(input: {
    email: string;
    password: string;
  }) {
    if (!auth) throw new Error("Firebase Auth não inicializado");
    await signInWithEmailAndPassword(auth, input.email, input.password);
    setShowLoginModal(false);
  }

  async function handleFirebaseGoogleLogin() {
    if (!auth) throw new Error("Firebase Auth não inicializado");

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    const credential = await signInWithPopup(auth, provider);

    if (!db) {
      setShowLoginModal(false);
      return;
    }

    const userRef = doc(db, "usuarios", credential.user.uid);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      await signOut(auth);
      throw new Error(
        "Conta Google sem cadastro no sistema. Crie a conta por e-mail/senha ou peça liberação ao administrador."
      );
    }

    const data = userDoc.data() as Partial<UsuarioSistema> & { status?: string };
    if (data.status === "Inativo") {
      await signOut(auth);
      throw new Error("Conta inativa. Solicite ativação ao administrador.");
    }

    if (!isPerfilAcesso(data.perfil)) {
      await signOut(auth);
      throw new Error("Perfil de acesso não configurado para esta conta.");
    }

    setShowLoginModal(false);
  }

  async function handleFirebaseRegister(input: {
    nome: string;
    email: string;
    password: string;
    perfil: UsuarioSistema["perfil"];
    empresa_id: string | null;
    supermercado_id: string | null;
  }) {
    if (!auth || !db) throw new Error("Firebase não inicializado");

    let credential;
    try {
      credential = await createUserWithEmailAndPassword(
        auth,
        input.email,
        input.password
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Não foi possível criar o usuário no Firebase Auth.";
      throw new Error(`Falha ao criar autenticação: ${message}`);
    }

    try {
      await setDoc(
        doc(db, "usuarios", credential.user.uid),
        {
          id: credential.user.uid,
          nome: input.nome.trim(),
          perfil: input.perfil,
          empresa_id: input.empresa_id,
          supermercado_id: input.supermercado_id,
          supermercado_ids: input.supermercado_id ? [input.supermercado_id] : [],
          status: "Ativo",
          email: input.email.trim().toLowerCase(),
          criado_em: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Não foi possível gravar o cadastro do usuário.";
      try {
        await deleteUser(credential.user);
      } catch {
        // Best-effort rollback; if this fails, user may need manual cleanup.
      }
      throw new Error(`Falha ao salvar perfil/unidade no Firestore: ${message}`);
    }

    setShowLoginModal(false);
  }

  function handleLogout() {
    if (hasFirebaseConfig && auth) {
      void signOut(auth);
    } else {
      setUsuarioAtual(null);
    }
    setView("geral");
  }

  function handleLogoutToLogin() {
    handleLogout();
    setShowLoginModal(true);
  }

  async function handleCreateEmpresa(input: {
    nome: string;
    codigo: string;
    cnpj?: string;
    plano_codigo: string;
    plano_nome: string;
    plano_status: "Ativo" | "Teste" | "Suspenso" | "Cancelado";
    plano_ciclo: "Mensal" | "Trimestral" | "Semestral" | "Anual";
    max_usuarios?: number | null;
    max_unidades?: number | null;
    contrato_inicio?: string | null;
    contrato_fim?: string | null;
  }) {
    await createEmpresa(input);
  }

  async function handleUpdateEmpresa(
    id: string,
    input: {
      nome: string;
      codigo: string;
      cnpj?: string;
      plano_codigo: string;
      plano_nome: string;
      plano_status: "Ativo" | "Teste" | "Suspenso" | "Cancelado";
      plano_ciclo: "Mensal" | "Trimestral" | "Semestral" | "Anual";
      max_usuarios?: number | null;
      max_unidades?: number | null;
      contrato_inicio?: string | null;
      contrato_fim?: string | null;
    }
  ) {
    await updateEmpresa(id, input);
  }

  async function handleToggleEmpresaStatus(id: string) {
    await toggleEmpresaStatus(id);
  }

  async function handleCreateSupermercado(input: {
    empresa_id: string;
    nome: string;
    codigo: string;
    endereco: string;
  }) {
    await createSupermercado({
      empresa_id: input.empresa_id,
      nome: input.nome.trim(),
      codigo: input.codigo.trim().toUpperCase(),
      endereco: input.endereco.trim(),
    });
  }

  async function handleUpdateSupermercado(
    id: string,
    input: { empresa_id: string; nome: string; codigo: string; endereco: string }
  ) {
    await updateSupermercado(id, {
      empresa_id: input.empresa_id,
      nome: input.nome.trim(),
      codigo: input.codigo.trim().toUpperCase(),
      endereco: input.endereco.trim(),
    });
  }

  async function handleToggleSupermercadoStatus(id: string) {
    await toggleSupermercadoStatus(id);
  }

  async function handleCreateEmpilhadeira(input: {
    empresa_id: string;
    supermercado_id: string;
    identificacao: string;
    modelo: string;
    numero_interno: string;
    status: EmpilhadeiraStatus;
    observacoes: string;
  }) {
    await createEmpilhadeira(input);
  }

  async function handleUpdateEmpilhadeira(
    id: string,
    input: {
      empresa_id: string;
      supermercado_id: string;
      identificacao: string;
      modelo: string;
      numero_interno: string;
      status: EmpilhadeiraStatus;
      observacoes: string;
    }
  ) {
    await updateEmpilhadeira(id, input);
  }

  async function handleUpdateEmpilhadeiraStatus(
    id: string,
    status: EmpilhadeiraStatus
  ) {
    await updateEmpilhadeiraStatus(id, status);
  }

  async function handleCreateChecklistEmpilhadeira(input: {
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
  }) {
    const empilhadeira = empilhadeiras.find((item) => item.id === input.empilhadeira_id);
    if (!empilhadeira) {
      throw new Error("Empilhadeira não encontrada para registrar o checklist.");
    }

    await createChecklist(input, empilhadeira);
  }

  async function handleReportarProblemaEmpilhadeira(input: {
    empilhadeira_id: string;
    descricao: string;
    prioridade: ManutencaoPrioridade;
    statusEmpilhadeira: "Necessita atenção" | "Em manutenção";
  }) {
    if (!usuarioAtual) {
      throw new Error("Faça login novamente para reportar o problema.");
    }

    const empilhadeira = empilhadeiras.find((item) => item.id === input.empilhadeira_id);
    if (!empilhadeira) {
      throw new Error("Empilhadeira não encontrada.");
    }

    if (!canViewAllUnits && supermercadoId !== empilhadeira.supermercado_id) {
      throw new Error("Você só pode reportar problemas da sua própria unidade.");
    }

    await createManutencao(
      {
        empresa_id: empilhadeira.empresa_id,
        supermercado_id: empilhadeira.supermercado_id,
        empilhadeira_id: empilhadeira.id,
        tipo: "Corretiva",
        descricao: input.descricao,
        prioridade: input.prioridade,
        status: "Aberta",
        responsavel: null,
        data_abertura: new Date().toISOString(),
        criado_por: usuarioAtual.nome,
        observacoes: `Ocorrência aberta via painel do operador. Status sugerido: ${input.statusEmpilhadeira}.`,
      },
      empilhadeira
    );

    await updateEmpilhadeiraStatus(empilhadeira.id, input.statusEmpilhadeira);
  }

  async function handleCreateManutencao(input: {
    empresa_id: string;
    supermercado_id: string;
    empilhadeira_id: string;
    tipo: ManutencaoTipo;
    descricao: string;
    prioridade: ManutencaoPrioridade;
    status: ManutencaoStatus;
    responsavel?: string | null;
    data_abertura: string;
    data_prevista?: string | null;
    data_conclusao?: string | null;
    criado_por: string;
    observacoes?: string | null;
  }) {
    const empilhadeira = empilhadeiras.find((item) => item.id === input.empilhadeira_id);
    if (!empilhadeira) {
      throw new Error("Empilhadeira não encontrada para abrir a manutenção.");
    }

    await createManutencao(input, empilhadeira);
  }

  async function handleUpdateManutencao(
    id: string,
    input: Partial<NovaManutencaoInput>
  ) {
    await updateManutencao(id, input);
  }

  function handleOpenEmpresasAdmin() {
    if (permissions.canViewAllCompanies) {
      navigateTo("empresas");
    }
  }

  function handleOpenUnidadesAdmin() {
    if (permissions.canViewAllUnits) {
      navigateTo("unidades");
    }
  }

  function handleOpenUsuariosAdmin() {
    if (permissions.canViewAllUnits) {
      navigateTo("usuarios");
    }
  }

  function handleOpenEmpilhadeirasAdmin() {
    if (isAuthenticated && permissions.canAccessOperatorPanel) {
      navigateTo("empilhadeiras");
    }
  }

  function handleOpenManutencoes() {
    if (isAuthenticated && permissions.canAccessOperatorPanel) {
      navigateTo("manutencoes");
    }
  }

  function handleAccessProfile() {
    if (isAuthenticated) {
      navigateTo("perfil");
      return;
    }

    openLoginModal();
  }

  async function handleOperadorSupermercadoChange(nextSupermercadoId: string) {
    if (!usuarioAtual) return;
    if (!nextSupermercadoId || nextSupermercadoId === usuarioAtual.supermercado_id) return;

    const unidadeAtiva = supermercados.find(
      (item) => item.id === nextSupermercadoId && item.status === "Ativo"
    );
    if (!unidadeAtiva) return;

    try {
      if (hasFirebaseConfig && db && auth?.currentUser?.uid === usuarioAtual.id) {
        await updateDoc(doc(db, "usuarios", usuarioAtual.id), {
          empresa_id: unidadeAtiva.empresa_id,
          supermercado_id: nextSupermercadoId,
          supermercado_ids: [nextSupermercadoId],
          atualizado_em: new Date().toISOString(),
        });
      }

      setUsuarioAtual((prev) =>
        prev
          ? {
              ...prev,
              empresa_id: unidadeAtiva.empresa_id,
              supermercado_id: nextSupermercadoId,
              supermercado_ids: [nextSupermercadoId],
            }
          : prev
      );
      notify(
        "perfil_atualizado",
        "Unidade atualizada",
        `Operação alterada para ${unidadeAtiva.nome}`
      );
    } catch {
      notify(
        "erro_perfil",
        "Não foi possível trocar unidade",
        "Verifique login do usuário e regras do Firestore."
      );
    }
  }

  async function handleUpdateUsuarioAdmin(
    id: string,
    input: {
      perfil: UsuarioSistema["perfil"];
      empresa_id: string | null;
      supermercado_id: string | null;
    }
  ) {
    await updateUsuarioAdmin(id, input);
    notify("perfil_atualizado", "Usuário atualizado", "Perfil, empresa e unidade alterados com sucesso.");
  }

  async function handleToggleUsuarioStatus(id: string) {
    await toggleUsuarioStatus(id);
    notify("perfil_atualizado", "Status atualizado", "Status do usuário alterado com sucesso.");
  }

  if (hasFirebaseConfig && !authHydrated) {
    return (
      <div className="app-page min-h-screen bg-transparent">
        <main className="app-main px-4 py-10 sm:px-0">
          <div className="mx-auto max-w-xl rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              Autenticação
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
              Restaurando sua sessão
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Aguarde um instante enquanto conectamos seu perfil.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Operator panel view
  if (view === "operador" && operadorNome && permissions.canAccessOperatorPanel) {
    return (
      <>
        <OperadorPanel
          chamados={allChamados}
          empilhadeiras={empilhadeiras}
          checklists={checklists}
          manutencoes={manutencoes}
          operadorId={operadorId ?? ""}
          operadorNome={operadorNome}
          supermercadoId={supermercadoId}
          supermercadoNome={supermercadoNome}
          operadorStatus={operadorStatus}
          onStatusChange={setOperadorStatus}
          onAssumir={assumirChamado}
          onMarcarACaminho={marcarACaminho}
          onMarcarChegada={marcarChegada}
          onAtualizarItensTelevendas={atualizarItensTelevendas}
          onIniciar={iniciarAtendimento}
          onFinalizar={finalizarChamado}
          onCreateChecklist={handleCreateChecklistEmpilhadeira}
          onReportarProblema={handleReportarProblemaEmpilhadeira}
          onAccessProfile={handleAccessProfile}
          onTrocarUsuario={openLoginModal}
          onLogout={handleLogoutToLogin}
          timeEstimates={timeEstimates}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onClearAll={clearAll}
          syncError={syncError}
        />
        {renderGlobalOverlays()}
      </>
    );
  }

  if (view === "perfil" && operadorNome && perfilAcesso) {
    return (
      <>
        <ProfileSettings
          nome={operadorNome}
          perfil={perfilAcesso}
          supermercadoId={supermercadoId}
          supermercadoNome={supermercadoNome}
          supermercados={supermercados}
          setorPrincipal={setorPrincipal}
          notificacoesAtivas={notificacoesAtivas}
          somAtivo={somAtivo}
          tema={tema}
          onSupermercadoChange={handleOperadorSupermercadoChange}
          onSetorPrincipalChange={setSetorPrincipal}
          onNotificacoesChange={setNotificacoesAtivas}
          onSomChange={setSomAtivo}
          onTemaChange={setTema}
          onVoltar={goBackToPreviousView}
          backLabel="Voltar"
          showManageUnidadesAction={canViewAllUnits}
          onManageUnidades={handleOpenUnidadesAdmin}
          onLogout={handleLogoutToLogin}
        />
        {renderGlobalOverlays()}
      </>
    );
  }

  if (view === "dashboard" && (permissions.canViewUnitDashboard || permissions.canViewAllUnits)) {
    return (
      <>
        <div className="app-page min-h-screen bg-transparent">
          <Header
          onNovoChamado={handleNovoChamadoAccess}
          onOperadorPanel={handleOperadorAccess}
          onDashboard={handleDashboardAccess}
          onOpenEmpresasAdmin={handleOpenEmpresasAdmin}
          onOpenUnidadesAdmin={handleOpenUnidadesAdmin}
          onOpenEmpilhadeiras={handleOpenEmpilhadeirasAdmin}
          onOpenManutencoes={handleOpenManutencoes}
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
          showCreateAction={!isPlatformAdmin && permissions.canCreateChamado}
          showOperatorAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showDashboardAction={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
          showEmpresasAction={canViewAllCompanies}
          showUnidadesAction={canViewAllUnits}
          showEmpilhadeirasAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showManutencoesAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
        />

          <main className="app-main px-2 py-4 sm:px-0 sm:py-6">
          {canViewAllUnits && (
            <AdminScopeSelector
              empresaValue={adminEmpresaFiltro}
              supermercadoValue={adminSupermercadoFiltro}
              onEmpresaChange={setAdminEmpresaFiltro}
              onSupermercadoChange={setAdminSupermercadoFiltro}
              empresas={empresas}
              supermercados={supermercados}
              allowEmpresaSelection={canViewAllCompanies}
            />
          )}

          {canViewAllUnits && (
            <AdminExecutiveSummary
              chamados={dashboardChamados}
              supermercados={supermercadosDoEscopo}
              selectedSupermercadoId={adminSupermercadoFiltro === "todos" ? null : adminSupermercadoFiltro}
              isConsolidated={adminSupermercadoFiltro === "todos"}
            />
          )}

          <div className="professional-panel mb-5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  {isPlatformAdmin
                    ? "Gestão da plataforma"
                    : canViewAllUnits
                    ? "Dashboard executivo"
                    : "Dashboard da operação"}
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                  {isPlatformAdmin ? "Administração geral da plataforma" : nomeEscopoAtual}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  {isPlatformAdmin
                    ? "Use este espaço para gerenciar a estrutura SaaS, cadastrar empresas clientes e organizar as unidades de cada operação."
                    : canViewAllCompanies && adminEmpresaFiltro === "todas"
                    ? "Painel consolidado da plataforma para acompanhar empresas clientes, comparar unidades e priorizar operação."
                    : canViewAllUnits && adminSupermercadoFiltro === "todos"
                    ? "Painel consolidado da empresa com foco em desempenho entre unidades e priorização operacional."
                    : "Painel gerencial com foco em desempenho, fila e ritmo de atendimento."}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:items-end">
                {canViewAllUnits && (
                  <div className="flex flex-wrap gap-2 rounded-[22px] border border-slate-200 bg-slate-50/90 p-2">
                    {([
                      { value: "hoje", label: "Hoje" },
                      { value: "7d", label: "7 dias" },
                      { value: "30d", label: "30 dias" },
                    ] as const).map((option) => {
                      const isActive = dashboardPeriod === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setDashboardPeriod(option.value)}
                          className={`touch-target rounded-2xl px-4 py-2 text-sm font-semibold transition-all ${
                            isActive
                              ? "bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]"
                              : "bg-white text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Recorte ativo
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{dashboardPeriodHint}</p>
                </div>
              </div>
            </div>
          </div>
          {isPlatformAdmin ? (
            <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Estrutura SaaS
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      label: "Empresas ativas",
                      value: String(platformSummary.empresasAtivas),
                      hint: `${platformSummary.empresasTotais} cadastradas na plataforma`,
                    },
                    {
                      label: "Unidades ativas",
                      value: String(platformSummary.unidadesAtivas),
                      hint: `${platformSummary.unidadesTotais} cadastradas no total`,
                    },
                    {
                      label: "Recorte atual",
                      value: adminEmpresaFiltro === "todas" ? "Plataforma" : "Empresa",
                      hint: nomeEscopoAtual,
                    },
                    {
                      label: "Sincronização",
                      value: hasFirebaseConfig ? "Firebase" : "Local",
                      hint: "modo operacional da plataforma",
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        {item.label}
                      </p>
                      <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{item.value}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.hint}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Atalhos administrativos
                </p>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={handleOpenEmpresasAdmin}
                    className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-all hover:bg-slate-100"
                  >
                    <span>
                      <span className="block text-sm font-bold text-slate-900">Empresas</span>
                      <span className="mt-1 block text-sm text-slate-500">
                        Cadastre clientes, planos e status da conta.
                      </span>
                    </span>
                    <span className="text-xl">🏢</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenUnidadesAdmin}
                    className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-all hover:bg-slate-100"
                  >
                    <span>
                      <span className="block text-sm font-bold text-slate-900">Unidades</span>
                      <span className="mt-1 block text-sm text-slate-500">
                        Organize as unidades operacionais de cada empresa cliente.
                      </span>
                    </span>
                    <span className="text-xl">🏬</span>
                  </button>
                </div>
              </section>
            </div>
          ) : (
            <>
              <div className="mb-5 fade-up">
                <Stats
                  stats={{
                    aguardando: canViewAllUnits ? dashboardStats.aguardando : stats.aguardando,
                    emAtendimento: canViewAllUnits ? dashboardStats.emAtendimento : stats.emAtendimento,
                    finalizadosHoje: canViewAllUnits ? dashboardStats.finalizadosHoje : dashboardFinalizadosHoje,
                    urgentes: canViewAllUnits ? dashboardStats.urgentes : stats.urgentes,
                    setorMaisAcionado: canViewAllUnits ? dashboardStats.setorMaisAcionado : dashboardSetorMaisAcionado,
                  }}
                  mediaMin={canViewAllUnits ? dashboardTimeEstimates.mediaMin : timeEstimates.mediaMin}
                  totalFinalizadosComTempo={
                    canViewAllUnits ? dashboardTimeEstimates.totalFinalizados : timeEstimates.totalFinalizados
                  }
                  finalizadosLabel={canViewAllUnits ? dashboardPeriodLabel : "Finalizados Hoje"}
                />
              </div>

              <div className="mb-5 fade-up">
                <ChamadoTimeMetricsPanel
                  chamados={canViewAllUnits ? dashboardChamados : allChamados}
                  title="Tempos por etapa do atendimento"
                  subtitle="Use estes tempos para localizar gargalos desde a abertura até a conclusão."
                />
              </div>

              {canViewAllUnits && adminSupermercadoFiltro === "todos" && (
                <div className="mb-5 fade-up">
                  <SupermercadoComparison chamados={dashboardChamados} supermercados={supermercadosDoEscopo} />
                </div>
              )}
            </>
          )}
          </main>
        </div>
        {renderGlobalOverlays()}
      </>
    );
  }

  if (view === "unidades" && permissions.canViewAllUnits) {
    return (
      <>
        <Header
          onNovoChamado={handleNovoChamadoAccess}
          onOperadorPanel={handleOperadorAccess}
          onDashboard={handleDashboardAccess}
          onOpenEmpresasAdmin={handleOpenEmpresasAdmin}
          onOpenUnidadesAdmin={handleOpenUnidadesAdmin}
          onOpenEmpilhadeiras={handleOpenEmpilhadeirasAdmin}
          onOpenManutencoes={handleOpenManutencoes}
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
          showCreateAction={!isPlatformAdmin && permissions.canCreateChamado}
          showOperatorAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showDashboardAction={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
          showEmpresasAction={canViewAllCompanies}
          showUnidadesAction={canViewAllUnits}
          showEmpilhadeirasAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showManutencoesAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
        />
        <UnidadesAdmin
          empresas={empresas}
          unidades={supermercadosDoEscopo}
          onCreate={handleCreateSupermercado}
          onUpdate={handleUpdateSupermercado}
          onToggleStatus={handleToggleSupermercadoStatus}
          onVoltar={goBackToPreviousView}
          canSelectEmpresa={canViewAllCompanies}
          currentEmpresaId={empresaSelecionadaId}
        />
        {renderGlobalOverlays()}
      </>
    );
  }

  if (view === "empresas" && permissions.canViewAllCompanies) {
    return (
      <>
        <Header
          onNovoChamado={handleNovoChamadoAccess}
          onOperadorPanel={handleOperadorAccess}
          onDashboard={handleDashboardAccess}
          onOpenEmpresasAdmin={handleOpenEmpresasAdmin}
          onOpenUnidadesAdmin={handleOpenUnidadesAdmin}
          onOpenEmpilhadeiras={handleOpenEmpilhadeirasAdmin}
          onOpenManutencoes={handleOpenManutencoes}
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
          showCreateAction={!isPlatformAdmin && permissions.canCreateChamado}
          showOperatorAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showDashboardAction={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
          showEmpresasAction={canViewAllCompanies}
          showUnidadesAction={canViewAllUnits}
          showEmpilhadeirasAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showManutencoesAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
        />
        <EmpresasAdmin
          empresas={empresas}
          onCreate={handleCreateEmpresa}
          onUpdate={handleUpdateEmpresa}
          onToggleStatus={handleToggleEmpresaStatus}
          onVoltar={goBackToPreviousView}
        />
        {renderGlobalOverlays()}
      </>
    );
  }

  if (view === "usuarios" && permissions.canViewAllUnits) {
    return (
      <>
        <Header
          onNovoChamado={handleNovoChamadoAccess}
          onOperadorPanel={handleOperadorAccess}
          onDashboard={handleDashboardAccess}
          onOpenEmpresasAdmin={handleOpenEmpresasAdmin}
          onOpenUnidadesAdmin={handleOpenUnidadesAdmin}
          onOpenEmpilhadeiras={handleOpenEmpilhadeirasAdmin}
          onOpenManutencoes={handleOpenManutencoes}
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
          showCreateAction={!isPlatformAdmin && permissions.canCreateChamado}
          showOperatorAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showDashboardAction={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
          showEmpresasAction={canViewAllCompanies}
          showUnidadesAction={canViewAllUnits}
          showEmpilhadeirasAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showManutencoesAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
        />
        <UsuariosAdmin
          empresas={empresas}
          usuarios={
            canViewAllCompanies
              ? usuarios
              : usuarios.filter((usuario) => usuario.empresa_id === empresaSelecionadaId)
          }
          supermercados={supermercadosDoEscopo}
          currentAdminId={usuarioAtual?.id ?? null}
          onUpdate={handleUpdateUsuarioAdmin}
          onToggleStatus={handleToggleUsuarioStatus}
          onVoltar={goBackToPreviousView}
          canSelectEmpresa={canViewAllCompanies}
          currentEmpresaId={empresaSelecionadaId}
        />
        {renderGlobalOverlays()}
      </>
    );
  }

  if (view === "empilhadeiras" && isAuthenticated && permissions.canAccessOperatorPanel) {
    return (
      <>
        <Header
          onNovoChamado={handleNovoChamadoAccess}
          onOperadorPanel={handleOperadorAccess}
          onDashboard={handleDashboardAccess}
          onOpenEmpresasAdmin={handleOpenEmpresasAdmin}
          onOpenUnidadesAdmin={handleOpenUnidadesAdmin}
          onOpenEmpilhadeiras={handleOpenEmpilhadeirasAdmin}
          onOpenManutencoes={handleOpenManutencoes}
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
          showCreateAction={!isPlatformAdmin && permissions.canCreateChamado}
          showOperatorAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showDashboardAction={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
          showEmpresasAction={canViewAllCompanies}
          showUnidadesAction={canViewAllUnits}
          showEmpilhadeirasAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showManutencoesAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
        />
        {canViewAllUnits && (
          <div className="app-main px-2 pt-4 sm:px-0 sm:pt-6">
            <AdminScopeSelector
              empresaValue={adminEmpresaFiltro}
              supermercadoValue={adminSupermercadoFiltro}
              onEmpresaChange={setAdminEmpresaFiltro}
              onSupermercadoChange={setAdminSupermercadoFiltro}
              empresas={empresas}
              supermercados={supermercados}
              allowEmpresaSelection={canViewAllCompanies}
            />
          </div>
        )}
        <EmpilhadeirasAdmin
          empilhadeiras={empilhadeiras}
          chamados={allChamados}
          checklists={checklists}
          manutencoes={manutencoes}
          supermercados={supermercadosDoEscopo}
          isAdminGeral={canViewAllUnits}
          canManage={canViewAllUnits}
          canManageStatus={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
          currentSupermercadoId={supermercadoSelecionadoId}
          currentSupermercadoNome={unidadeAtualNome}
          onCreate={handleCreateEmpilhadeira}
          onUpdate={handleUpdateEmpilhadeira}
          onUpdateStatus={handleUpdateEmpilhadeiraStatus}
          onVoltar={goBackToPreviousView}
        />
        {renderGlobalOverlays()}
      </>
    );
  }

  if (view === "manutencoes" && isAuthenticated && permissions.canAccessOperatorPanel) {
    return (
      <>
        <Header
          onNovoChamado={handleNovoChamadoAccess}
          onOperadorPanel={handleOperadorAccess}
          onDashboard={handleDashboardAccess}
          onOpenEmpresasAdmin={handleOpenEmpresasAdmin}
          onOpenUnidadesAdmin={handleOpenUnidadesAdmin}
          onOpenEmpilhadeiras={handleOpenEmpilhadeirasAdmin}
          onOpenManutencoes={handleOpenManutencoes}
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
          showCreateAction={!isPlatformAdmin && permissions.canCreateChamado}
          showOperatorAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showDashboardAction={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
          showEmpresasAction={canViewAllCompanies}
          showUnidadesAction={canViewAllUnits}
          showEmpilhadeirasAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
          showManutencoesAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
        />
        {canViewAllUnits && (
          <div className="app-main px-2 pt-4 sm:px-0 sm:pt-6">
            <AdminScopeSelector
              empresaValue={adminEmpresaFiltro}
              supermercadoValue={adminSupermercadoFiltro}
              onEmpresaChange={setAdminEmpresaFiltro}
              onSupermercadoChange={setAdminSupermercadoFiltro}
              empresas={empresas}
              supermercados={supermercados}
              allowEmpresaSelection={canViewAllCompanies}
            />
          </div>
        )}
        <ManutencoesAdmin
          manutencoes={manutencoes}
          empilhadeiras={empilhadeiras}
          supermercados={supermercadosDoEscopo}
          isAdminGeral={canViewAllUnits}
          canCreate={permissions.canAccessOperatorPanel}
          canEdit={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
          currentSupermercadoId={supermercadoSelecionadoId}
          currentSupermercadoNome={unidadeAtualNome}
          createdByName={operadorNome ?? "Sistema"}
          onCreate={handleCreateManutencao}
          onUpdate={handleUpdateManutencao}
          onVoltar={goBackToPreviousView}
        />
        {renderGlobalOverlays()}
      </>
    );
  }

  // General panel view (promoter)
  return (
    <div className="app-page min-h-screen bg-transparent">
      <Header
        onNovoChamado={handleNovoChamadoAccess}
        onOperadorPanel={handleOperadorAccess}
        onDashboard={handleDashboardAccess}
        onOpenEmpresasAdmin={handleOpenEmpresasAdmin}
        onOpenUnidadesAdmin={handleOpenUnidadesAdmin}
        onOpenEmpilhadeiras={handleOpenEmpilhadeirasAdmin}
        onOpenManutencoes={handleOpenManutencoes}
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
        showCreateAction={!isPlatformAdmin && permissions.canCreateChamado}
        showOperatorAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
        showDashboardAction={permissions.canViewUnitDashboard || permissions.canViewAllUnits}
        showEmpresasAction={canViewAllCompanies}
        showUnidadesAction={canViewAllUnits}
        showEmpilhadeirasAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
        showManutencoesAction={!isPlatformAdmin && permissions.canAccessOperatorPanel}
      />

      <main className="app-main px-2 py-4 sm:px-0 sm:py-6">
        {!isAuthenticated && (
          <section className="mb-6 overflow-hidden rounded-[34px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,245,249,0.96))] shadow-[0_22px_54px_rgba(15,23,42,0.08)]">
            <div className="grid gap-0 lg:grid-cols-[1.18fr_0.82fr]">
              <div className="relative overflow-hidden p-6 sm:p-8">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,61,117,0.1),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.08),transparent_30%)]" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                    Sessão encerrada com segurança
                  </div>

                  <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
                    Retome a operação em poucos segundos
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                    Entre novamente para abrir chamados, acompanhar pedidos de televendas,
                    operar a fila da unidade e acessar a gestão conforme o seu perfil.
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={openLoginModal}
                      className="touch-target inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_32px_rgba(15,23,42,0.22)] transition hover:brightness-110"
                    >
                      <span>🔐</span>
                      Entrar no sistema
                    </button>
                    <button
                      type="button"
                      onClick={openLoginModal}
                      className="touch-target inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_22px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
                    >
                      <span>👤</span>
                      Criar conta ou trocar usuário
                    </button>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Fluxo operacional", value: "Fila por unidade" },
                      { label: "Televendas", value: "Pedidos com itens e faltas" },
                      { label: "Gestão", value: "Dashboard e administração" },
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="rounded-[24px] border border-white/70 bg-white/82 px-4 py-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)] backdrop-blur-sm"
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          {card.label}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{card.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-[linear-gradient(180deg,rgba(15,61,117,0.06),rgba(249,250,251,0.78))] p-6 sm:p-8 lg:border-l lg:border-t-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Perfis e acessos
                </p>
                <div className="mt-4 grid gap-3">
                  {[
                    {
                      icon: "📝",
                      title: "Promotor e Funcionário",
                      description: "Abertura e acompanhamento das próprias solicitações da unidade.",
                    },
                    {
                      icon: "📞",
                      title: "Televendas",
                      description: "Pedidos com itens, separação parcial, faltas e acompanhamento dedicado.",
                    },
                    {
                      icon: "👷",
                      title: "Operador",
                      description: "Fila operacional, execução do atendimento e conferência de itens.",
                    },
                    {
                      icon: "📈",
                      title: "Supervisão e Administração",
                      description: "Visão gerencial, dashboards, usuários, empresas e unidades.",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="rounded-[24px] border border-white/70 bg-white/88 px-4 py-4 shadow-[0_10px_22px_rgba(15,23,42,0.05)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f3d75,#1e3a5f)] text-lg text-white shadow-[0_10px_20px_rgba(15,23,42,0.16)]">
                          {item.icon}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {canViewAllUnits && (
          <AdminScopeSelector
            empresaValue={adminEmpresaFiltro}
            supermercadoValue={adminSupermercadoFiltro}
            onEmpresaChange={setAdminEmpresaFiltro}
            onSupermercadoChange={setAdminSupermercadoFiltro}
            empresas={empresas}
            supermercados={supermercados}
            allowEmpresaSelection={canViewAllCompanies}
          />
        )}

        {canViewAllUnits && (
          <div className="mb-5">
            <div className="flex flex-wrap gap-2">
              {canViewAllCompanies && (
                <button
                  type="button"
                  onClick={handleOpenEmpresasAdmin}
                  className="touch-target inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all hover:bg-slate-50"
                >
                  <span>🏢</span>
                  <span>Gerenciar Empresas</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenUnidadesAdmin}
                className="touch-target inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all hover:bg-slate-50"
              >
                <span>🏬</span>
                <span>Gerenciar Unidades</span>
              </button>
              {!isPlatformAdmin && (
                <button
                  type="button"
                  onClick={handleOpenUsuariosAdmin}
                  className="touch-target inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all hover:bg-slate-50"
                >
                  <span>👥</span>
                  <span>Gerenciar Usuários</span>
                </button>
              )}
              {!isPlatformAdmin && (
                <button
                  type="button"
                  onClick={handleOpenEmpilhadeirasAdmin}
                  className="touch-target inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all hover:bg-slate-50"
                >
                  <span>🚜</span>
                  <span>Empilhadeiras</span>
                </button>
              )}
              {!isPlatformAdmin && (
                <button
                  type="button"
                  onClick={handleOpenManutencoes}
                  className="touch-target inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all hover:bg-slate-50"
                >
                  <span>🛠️</span>
                  <span>Manutenções</span>
                </button>
              )}
            </div>
          </div>
        )}

        {permissions.canTrackOwnChamados && (
          <div className="mb-4 rounded-[28px] border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
            Seu acesso permite abrir chamados e acompanhar apenas as suas solicitações dentro da unidade vinculada.
          </div>
        )}

        {(permissions.canTrackOwnChamados || permissions.canViewUnitQueue || permissions.canViewAllUnits) && (
          <>
        {syncError && (
          <div className="mb-4 rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-[0_10px_24px_rgba(239,68,68,0.08)]">
            {syncError}
          </div>
        )}
        {!syncError && !chamadosRemoteSyncEnabled && (
          <div className="mb-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 shadow-[0_10px_24px_rgba(245,158,11,0.08)]">
            Você está em modo local. Para sincronizar entre dispositivos, configure Firebase neste dispositivo.
          </div>
        )}
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
              : "Fila isolada por unidade"}
          </div>
        </div>

        <ChamadoList
          chamados={chamadosVisiveis}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          timeEstimates={timeEstimates}
          showSupermercado={canViewAllUnits && adminSupermercadoFiltro === "todos"}
          supermercados={supermercados}
        />
          </>
        )}

        {isAuthenticated &&
          !permissions.canCreateChamado &&
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/92 px-3 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:hidden">
        <div className="app-main overflow-x-auto pb-0.5">
          <div className="flex min-w-max items-center gap-2">
          {(permissions.canViewUnitDashboard || permissions.canViewAllUnits) && (
            <button
              onClick={handleDashboardAccess}
              className="touch-target flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              <span>📈</span>
              Dashboard
            </button>
          )}
          {permissions.canAccessOperatorPanel && (
            <button
              onClick={handleOperadorAccess}
              className="touch-target flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              <span>👷</span>
              Operador
            </button>
          )}
          <button
            onClick={isAuthenticated ? handleAccessProfile : openLoginModal}
            className="touch-target flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
          >
            <span>{isAuthenticated ? "⚙️" : "🔐"}</span>
            {isAuthenticated ? "Conta" : "Entrar"}
          </button>
          {permissions.canCreateChamado && (
            <button
              onClick={handleNovoChamadoAccess}
              className="touch-target flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(249,115,22,0.32)]"
            >
              <span className="text-base">＋</span>
              Novo Chamado
            </button>
          )}
          </div>
        </div>
      </div>

      {renderGlobalOverlays()}
    </div>
  );
}
