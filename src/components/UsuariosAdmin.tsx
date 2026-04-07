import { useMemo, useState } from "react";
import type { Supermercado } from "../types/supermercado";
import type { PerfilAcesso, UsuarioSistema } from "../types/usuario";

interface UsuariosAdminProps {
  usuarios: UsuarioSistema[];
  supermercados: Supermercado[];
  currentAdminId: string | null;
  onUpdate: (
    id: string,
    input: { perfil: PerfilAcesso; supermercado_id: string | null }
  ) => Promise<void>;
  onToggleStatus: (id: string) => Promise<void>;
  onVoltar: () => void;
}

const PERFIS: PerfilAcesso[] = [
  "Promotor",
  "Funcionário",
  "Operador",
  "Supervisor",
  "Televendas",
  "Administrador Geral",
];

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function UsuariosAdmin({
  usuarios,
  supermercados,
  currentAdminId,
  onUpdate,
  onToggleStatus,
  onVoltar,
}: UsuariosAdminProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerfil, setEditPerfil] = useState<PerfilAcesso>("Promotor");
  const [editSupermercadoId, setEditSupermercadoId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);

  const supermercadosAtivos = useMemo(
    () => supermercados.filter((item) => item.status === "Ativo"),
    [supermercados]
  );

  const usuariosOrdenados = useMemo(
    () =>
      [...usuarios].sort((a, b) => {
        const aDate = new Date(a.criado_em ?? 0).getTime();
        const bDate = new Date(b.criado_em ?? 0).getTime();
        return bDate - aDate;
      }),
    [usuarios]
  );

  function startEdit(usuario: UsuarioSistema) {
    setEditingId(usuario.id);
    setEditPerfil(usuario.perfil);
    setEditSupermercadoId(usuario.supermercado_id ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function handleSave(usuarioId: string) {
    const supermercado_id =
      editPerfil === "Administrador Geral" ? null : editSupermercadoId || null;

    if (editPerfil !== "Administrador Geral" && !supermercado_id) {
      setError("Selecione uma unidade para este perfil.");
      return;
    }

    try {
      setPendingSaveId(usuarioId);
      setError(null);
      await onUpdate(usuarioId, {
        perfil: editPerfil,
        supermercado_id,
      });
      setEditingId(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível atualizar o usuário."
      );
    } finally {
      setPendingSaveId(null);
    }
  }

  async function handleToggleStatus(usuarioId: string) {
    try {
      setPendingStatusId(usuarioId);
      setError(null);
      await onToggleStatus(usuarioId);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Não foi possível alterar status do usuário."
      );
    } finally {
      setPendingStatusId(null);
    }
  }

  return (
    <div className="min-h-screen bg-transparent">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 rounded-[30px] border border-white/70 bg-white/75 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Administração geral
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
              Usuários
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Altere perfil/unidade e inative ou reative acessos do sistema.
            </p>
          </div>
          <button
            type="button"
            onClick={onVoltar}
            className="touch-target inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all hover:bg-slate-50"
          >
            <span>←</span>
            Voltar ao painel
          </button>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
            Usuários cadastrados
          </h2>

          {error && (
            <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <div className="space-y-3">
            {usuariosOrdenados.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nenhum usuário encontrado.
              </p>
            ) : (
              usuariosOrdenados.map((usuario) => {
                const isEditing = editingId === usuario.id;
                const isSelf = currentAdminId === usuario.id;

                return (
                  <div
                    key={usuario.id}
                    className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.8fr_auto]"
                  >
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Nome
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{usuario.nome}</p>
                      {usuario.email && (
                        <p className="mt-0.5 text-xs text-slate-500">{usuario.email}</p>
                      )}
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Perfil
                      </p>
                      {isEditing ? (
                        <select
                          value={editPerfil}
                          onChange={(e) => {
                            const next = e.target.value as PerfilAcesso;
                            setEditPerfil(next);
                            if (next === "Administrador Geral") {
                              setEditSupermercadoId("");
                            }
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                        >
                          {PERFIS.map((perfil) => (
                            <option key={perfil} value={perfil}>
                              {perfil}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-1 text-sm font-semibold text-slate-700">{usuario.perfil}</p>
                      )}
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Unidade
                      </p>
                      {isEditing ? (
                        <select
                          value={editSupermercadoId}
                          disabled={editPerfil === "Administrador Geral"}
                          onChange={(e) => setEditSupermercadoId(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                          <option value="">
                            {editPerfil === "Administrador Geral"
                              ? "Todas as unidades"
                              : "Selecione a unidade"}
                          </option>
                          {supermercadosAtivos.map((supermercado) => (
                            <option key={supermercado.id} value={supermercado.id}>
                              {supermercado.nome} ({supermercado.codigo})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-1 text-sm text-slate-700">
                          {usuario.supermercado_id
                            ? supermercados.find((s) => s.id === usuario.supermercado_id)?.nome ??
                              usuario.supermercado_id
                            : "Todas as unidades"}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Status
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          usuario.status === "Inativo"
                            ? "bg-slate-200 text-slate-600"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {usuario.status ?? "Ativo"}
                      </span>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Criação
                      </p>
                      <p className="mt-1 text-sm text-slate-700">{formatDate(usuario.criado_em)}</p>
                    </div>

                    <div className="flex items-center gap-2 md:justify-end">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              void handleSave(usuario.id);
                            }}
                            disabled={pendingSaveId === usuario.id}
                            className="rounded-xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-3 py-2 text-xs font-semibold text-white"
                          >
                            {pendingSaveId === usuario.id ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(usuario)}
                            disabled={isSelf}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleToggleStatus(usuario.id);
                            }}
                            disabled={pendingStatusId === usuario.id || isSelf}
                            className={`rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                              usuario.status === "Inativo"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {pendingStatusId === usuario.id
                              ? "Atualizando..."
                              : usuario.status === "Inativo"
                                ? "Reativar"
                                : "Inativar"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
