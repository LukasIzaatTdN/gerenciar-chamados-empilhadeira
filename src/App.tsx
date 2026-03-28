import { useState, useEffect, useMemo, useCallback } from "react";
import Header from "./components/Header";
import Stats from "./components/Stats";
import ChamadoForm from "./components/ChamadoForm";
import ChamadoList from "./components/ChamadoList";
import OperadorPanel from "./components/OperadorPanel";
import OperadorLogin from "./components/OperadorLogin";
import NotificationToast from "./components/NotificationToast";
import { useChamados } from "./hooks/useChamados";
import { useTimeEstimates } from "./hooks/useTimeEstimates";
import { useNotifications } from "./hooks/useNotifications";
import type { Chamado } from "./types/chamado";

type View = "geral" | "operador";

const OPERADOR_KEY = "operador_empilhadeira_nome";

export default function App() {
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<View>("geral");
  const [operadorNome, setOperadorNome] = useState<string | null>(() => {
    return localStorage.getItem(OPERADOR_KEY);
  });
  const [showLoginModal, setShowLoginModal] = useState(false);

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
  } = useNotifications();

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

  function handleOperadorAccess() {
    if (operadorNome) {
      setView("operador");
    } else {
      setShowLoginModal(true);
    }
  }

  function handleOperadorLogin(nome: string) {
    setOperadorNome(nome);
    setShowLoginModal(false);
    setView("operador");
  }

  function handleLogout() {
    setOperadorNome(null);
    setView("geral");
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
  if (view === "operador" && operadorNome) {
    return (
      <>
        <OperadorPanel
          chamados={allChamados}
          operadorNome={operadorNome}
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

  // General panel view (promoter)
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-orange-50/30">
      <Header
        onNovoChamado={() => setShowForm(true)}
        onOperadorPanel={handleOperadorAccess}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onClearAll={clearAll}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Stats */}
        <div className="mb-6">
          <Stats
            stats={stats}
            mediaMin={timeEstimates.mediaMin}
            totalFinalizadosComTempo={timeEstimates.totalFinalizados}
          />
        </div>

        {/* Chamados List */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">
            📋 Chamados
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({chamados.length})
            </span>
          </h2>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
            Urgentes primeiro · Mais antigos no topo
          </div>
        </div>

        <ChamadoList
          chamados={chamados}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          onIniciar={iniciarAtendimento}
          onFinalizar={finalizarChamado}
          onExcluir={excluirChamado}
          timeEstimates={timeEstimates}
        />
      </main>

      {/* Footer */}
      <footer className="mt-8 border-t border-gray-100 py-4 text-center text-xs text-gray-300">
        Painel Empilhadeira · Sistema de Gerenciamento de Chamados
      </footer>

      {/* New Chamado Modal */}
      {showForm && (
        <ChamadoForm
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
