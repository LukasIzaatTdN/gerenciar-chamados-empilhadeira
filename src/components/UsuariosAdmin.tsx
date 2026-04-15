import { useEffect, useMemo, useState } from "react";
import type { Empresa } from "../types/empresa";
import type { Supermercado } from "../types/supermercado";
import type { PerfilAcesso, UsuarioSistema } from "../types/usuario";
import type { AdminInvite } from "../types/adminInvite";

interface UsuariosAdminProps {
  empresas: Empresa[];
  usuarios: UsuarioSistema[];
  supermercados: Supermercado[];
  currentAdminId: string | null;
  onUpdate: (
    id: string,
    input: { perfil: PerfilAcesso; empresa_id: string | null; supermercado_id: string | null }
  ) => Promise<void>;
  onToggleStatus: (id: string) => Promise<void>;
  onCreateAdminInvite?: (input: { empresa_id: string; expiresInDays: number }) => Promise<string>;
  adminInvites?: AdminInvite[];
  canCreateAdminInvite?: boolean;
  onVoltar: () => void;
  canSelectEmpresa?: boolean;
  currentEmpresaId?: string | null;
}

const PERFIS: PerfilAcesso[] = [
  "Promotor",
  "Funcionário",
  "Operador",
  "Supervisor",
  "Televendas",
  "Administrador da Empresa",
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
  empresas,
  usuarios,
  supermercados,
  currentAdminId,
  onUpdate,
  onToggleStatus,
  onCreateAdminInvite,
  adminInvites = [],
  canCreateAdminInvite = false,
  onVoltar,
  canSelectEmpresa = false,
  currentEmpresaId = null,
}: UsuariosAdminProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerfil, setEditPerfil] = useState<PerfilAcesso>("Promotor");
  const [editEmpresaId, setEditEmpresaId] = useState<string>("");
  const [editSupermercadoId, setEditSupermercadoId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [inviteEmpresaId, setInviteEmpresaId] = useState<string>(currentEmpresaId ?? "");
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState<number>(7);
  const [inviteTokenCreated, setInviteTokenCreated] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState(false);

  const empresasAtivas = useMemo(
    () => empresas.filter((empresa) => empresa.status === "Ativa"),
    [empresas]
  );
  const supermercadosAtivos = useMemo(
    () => supermercados.filter((item) => item.status === "Ativo"),
    [supermercados]
  );
  const supermercadosDisponiveis = useMemo(
    () =>
      supermercadosAtivos.filter((item) =>
        (canSelectEmpresa ? editEmpresaId : currentEmpresaId)
          ? item.empresa_id === (canSelectEmpresa ? editEmpresaId : currentEmpresaId)
          : true
      ),
    [canSelectEmpresa, currentEmpresaId, editEmpresaId, supermercadosAtivos]
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
  const convitesRecentes = useMemo(
    () =>
      [...adminInvites]
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
        .slice(0, 8),
    [adminInvites]
  );

  useEffect(() => {
    if (!canSelectEmpresa) {
      setInviteEmpresaId(currentEmpresaId ?? "");
    }
  }, [canSelectEmpresa, currentEmpresaId]);

  function startEdit(usuario: UsuarioSistema) {
    setEditingId(usuario.id);
    setEditPerfil(usuario.perfil);
    setEditEmpresaId(usuario.empresa_id ?? "");
    setEditSupermercadoId(usuario.supermercado_id ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function handleSave(usuarioId: string) {
    const empresa_id =
      editPerfil === "Administrador Geral"
        ? null
        : (canSelectEmpresa ? editEmpresaId : currentEmpresaId) || null;
    const supermercado_id =
      editPerfil === "Administrador Geral" || editPerfil === "Administrador da Empresa"
        ? null
        : editSupermercadoId || null;

    if (editPerfil !== "Administrador Geral" && !empresa_id) {
      setError("Selecione a empresa para este perfil.");
      return;
    }

    if (
      editPerfil !== "Administrador Geral" &&
      editPerfil !== "Administrador da Empresa" &&
      !supermercado_id
    ) {
      setError("Selecione uma unidade para este perfil.");
      return;
    }

    try {
      setPendingSaveId(usuarioId);
      setError(null);
      await onUpdate(usuarioId, {
        perfil: editPerfil,
        empresa_id,
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

  async function handleCreateInvite() {
    if (!onCreateAdminInvite) return;
    const targetEmpresaId = canSelectEmpresa ? inviteEmpresaId : currentEmpresaId;
    if (!targetEmpresaId) {
      setInviteError("Selecione a empresa para gerar o convite.");
      return;
    }
    try {
      setPendingInvite(true);
      setInviteError(null);
      const token = await onCreateAdminInvite({
        empresa_id: targetEmpresaId,
        expiresInDays: inviteExpiresInDays,
      });
      setInviteTokenCreated(token);
    } catch (inviteErr) {
      setInviteError(
        inviteErr instanceof Error ? inviteErr.message : "Não foi possível gerar convite."
      );
    } finally {
      setPendingInvite(false);
    }
  }

  return (
    <div className="min-h-screen bg-transparent">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 rounded-[30px] border border-white/70 bg-white/75 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Administração de acesso
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
              Usuários
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Altere perfil, empresa, unidade e status de acesso mantendo isolamento por cliente.
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

        {canCreateAdminInvite && (
          <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
              Convite Admin da Empresa
            </h2>
            <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
              {canSelectEmpresa ? (
                <select
                  value={inviteEmpresaId}
                  onChange={(e) => setInviteEmpresaId(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                >
                  <option value="">Selecione a empresa</option>
                  {empresasAtivas.map((empresa) => (
                    <option key={empresa.id} value={empresa.id}>
                      {empresa.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  Empresa do escopo:{" "}
                  {empresas.find((empresa) => empresa.id === currentEmpresaId)?.nome ?? "Não definida"}
                </div>
              )}

              <select
                value={String(inviteExpiresInDays)}
                onChange={(e) => setInviteExpiresInDays(Number(e.target.value))}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
              >
                <option value="1">Expira em 1 dia</option>
                <option value="3">Expira em 3 dias</option>
                <option value="7">Expira em 7 dias</option>
                <option value="15">Expira em 15 dias</option>
                <option value="30">Expira em 30 dias</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  void handleCreateInvite();
                }}
                disabled={pendingInvite}
                className="rounded-2xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-4 py-3 text-sm font-semibold text-white"
              >
                {pendingInvite ? "Gerando..." : "Gerar token"}
              </button>
            </div>
            {inviteError && (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {inviteError}
              </p>
            )}
            {inviteTokenCreated && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Token criado: <span className="font-bold">{inviteTokenCreated}</span>
              </div>
            )}
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                Convites recentes
              </p>
              <div className="mt-2 space-y-2">
                {convitesRecentes.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Nenhum convite gerado.
                  </p>
                ) : (
                  convitesRecentes.map((invite) => (
                    <div
                      key={invite.id}
                      className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs md:grid-cols-[1fr_1fr_auto]"
                    >
                      <p className="text-slate-700">
                        Token: <span className="font-semibold">{invite.id}</span>
                      </p>
                      <p className="text-slate-600">Status: {invite.status}</p>
                      <p className="text-slate-600">Expira: {formatDate(invite.expira_em)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

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
                    className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_0.8fr_0.8fr_auto]"
                  >
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Nome</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{usuario.nome}</p>
                      {usuario.email && <p className="mt-0.5 text-xs text-slate-500">{usuario.email}</p>}
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Perfil</p>
                      {isEditing ? (
                        <select
                          value={editPerfil}
                          onChange={(e) => {
                            const next = e.target.value as PerfilAcesso;
                            setEditPerfil(next);
                            if (next === "Administrador Geral") {
                              setEditEmpresaId("");
                              setEditSupermercadoId("");
                            }
                            if (next === "Administrador da Empresa") {
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
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Empresa</p>
                      {isEditing ? (
                        <select
                          value={editEmpresaId}
                          disabled={!canSelectEmpresa || editPerfil === "Administrador Geral"}
                          onChange={(e) => {
                            setEditEmpresaId(e.target.value);
                            setEditSupermercadoId("");
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                          <option value="">
                            {editPerfil === "Administrador Geral" ? "Todas as empresas" : "Selecione a empresa"}
                          </option>
                          {empresasAtivas.map((empresa) => (
                            <option key={empresa.id} value={empresa.id}>
                              {empresa.nome}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-1 text-sm text-slate-700">
                          {usuario.empresa_id
                            ? empresas.find((empresa) => empresa.id === usuario.empresa_id)?.nome ??
                              usuario.empresa_id
                            : "Todas as empresas"}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Unidade</p>
                      {isEditing ? (
                        <select
                          value={editSupermercadoId}
                          disabled={
                            editPerfil === "Administrador Geral" ||
                            editPerfil === "Administrador da Empresa"
                          }
                          onChange={(e) => setEditSupermercadoId(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                          <option value="">
                            {editPerfil === "Administrador da Empresa"
                              ? "Todas as unidades da empresa"
                              : editPerfil === "Administrador Geral"
                                ? "Todas as unidades"
                                : "Selecione a unidade"}
                          </option>
                          {supermercadosDisponiveis.map((supermercado) => (
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
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Status</p>
                      <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${usuario.status === "Inativo" ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                        {usuario.status ?? "Ativo"}
                      </span>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Criação</p>
                      <p className="mt-1 text-sm text-slate-700">{formatDate(usuario.criado_em)}</p>
                    </div>

                    <div className="flex items-center gap-2 md:justify-end">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={() => { void handleSave(usuario.id); }} disabled={pendingSaveId === usuario.id} className="rounded-xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-3 py-2 text-xs font-semibold text-white">
                            {pendingSaveId === usuario.id ? "Salvando..." : "Salvar"}
                          </button>
                          <button type="button" onClick={cancelEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEdit(usuario)} disabled={isSelf} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                            Editar
                          </button>
                          <button type="button" onClick={() => { void handleToggleStatus(usuario.id); }} disabled={pendingStatusId === usuario.id || isSelf} className={`rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${usuario.status === "Inativo" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {pendingStatusId === usuario.id ? "Atualizando..." : usuario.status === "Inativo" ? "Reativar" : "Inativar"}
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
