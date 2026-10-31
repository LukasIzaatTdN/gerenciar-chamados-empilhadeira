import { useCallback, useEffect, useState } from "react";
import { collection, doc, documentId, getDoc, onSnapshot, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import type { PerfilAcesso, UsuarioSistema, UsuarioStatus } from "../types/usuario";
import { MAX_UNIDADES_POR_USUARIO, normalizeScopedUnitIds, resolveAuthorizedUnitIds, resolveEmpresaId } from "../utils/tenant";
import { assertUserAccess } from "../utils/businessRules";

const USUARIOS_COLLECTION = "usuarios";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function buildUsuarioDocId(usuario: UsuarioSistema) {
  const nome = slugify(usuario.nome);
  const perfil = slugify(usuario.perfil);
  const empresa = slugify(usuario.empresa_id ?? "empresa");
  const unidade = usuario.supermercado_id ?? "all";
  return `usr-${empresa}-${perfil}-${nome}-${unidade}`;
}

function resolveUsuarioDocId(usuario: UsuarioSistema) {
  const authUid = auth?.currentUser?.uid;
  if (typeof authUid === "string" && authUid.trim()) return authUid;
  if (typeof usuario.id === "string" && usuario.id.trim()) return usuario.id.trim();
  return buildUsuarioDocId(usuario);
}

function normalizeUsuario(
  data: Partial<UsuarioSistema>,
  fallbackId: string
): UsuarioSistema {
  const perfil: PerfilAcesso =
    data.perfil === "Promotor" ||
    data.perfil === "Funcionário" ||
    data.perfil === "Operador" ||
    data.perfil === "Supervisor" ||
    data.perfil === "Televendas" ||
    data.perfil === "Separador de Televendas" ||
    data.perfil === "Gerente da Empresa" ||
    data.perfil === "Administrador da Empresa" ||
    data.perfil === "Administrador Geral"
      ? data.perfil
      : "Promotor";

  const status: UsuarioStatus = data.status === "Inativo" ? "Inativo" : "Ativo";

  return {
    id: data.id ?? fallbackId,
    nome: typeof data.nome === "string" && data.nome.trim() ? data.nome.trim() : "Usuário",
    perfil,
    empresa_id: resolveEmpresaId(data.empresa_id, null),
    supermercado_id:
      typeof data.supermercado_id === "string" && data.supermercado_id.trim()
        ? data.supermercado_id.trim()
        : null,
    supermercado_ids: resolveAuthorizedUnitIds(
      typeof data.supermercado_id === "string" ? data.supermercado_id : null,
      data.supermercado_ids
    ),
    vinculos_unidades_v2: data.vinculos_unidades_v2 === true || Array.isArray(data.supermercado_ids),
    status,
    email: typeof data.email === "string" ? data.email : undefined,
    telefone:
      typeof data.telefone === "string" && data.telefone.trim() ? data.telefone.trim() : undefined,
    convite_token:
      typeof data.convite_token === "string" && data.convite_token.trim()
        ? data.convite_token.trim()
        : null,
    criado_em: typeof data.criado_em === "string" ? data.criado_em : undefined,
    atualizado_em: typeof data.atualizado_em === "string" ? data.atualizado_em : undefined,
  };
}

interface UseUsuariosOptions {
  currentUserId?: string | null;
  empresaId?: string | null;
  canViewAllCompanies?: boolean;
  canManageCompanyUsers?: boolean;
  perfil?: string | null;
}

export function useUsuarios(options: UseUsuariosOptions = {}) {
  const {
    currentUserId = null,
    empresaId = null,
    canViewAllCompanies = false,
    canManageCompanyUsers = false,
    perfil = null,
  } = options;
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);

  useEffect(() => {
    if (!db) {
      setUsuarios([]);
      return;
    }

    if (!currentUserId) {
      setUsuarios([]);
      return;
    }

    const usuariosQuery = canViewAllCompanies
      ? collection(db, USUARIOS_COLLECTION)
      : canManageCompanyUsers && empresaId
        ? query(collection(db, USUARIOS_COLLECTION), where("empresa_id", "==", empresaId))
        : query(collection(db, USUARIOS_COLLECTION), where(documentId(), "==", currentUserId));

    return onSnapshot(
      usuariosQuery,
      (snapshot) => {
        const remote = snapshot.docs
          .map((snapshotDoc) =>
            normalizeUsuario(snapshotDoc.data() as Partial<UsuarioSistema>, snapshotDoc.id)
          )
          .sort((a, b) => {
            const aDate = new Date(a.criado_em ?? 0).getTime();
            const bDate = new Date(b.criado_em ?? 0).getTime();
            return bDate - aDate;
          });

        setUsuarios(remote);
      },
      () => {
        setUsuarios([]);
      }
    );
  }, [canManageCompanyUsers, canViewAllCompanies, currentUserId, empresaId]);

  const upsertUsuarioFromLogin = useCallback(async (usuario: UsuarioSistema) => {
    const usuarioNormalizado: UsuarioSistema = {
      ...usuario,
      nome: usuario.nome.trim(),
      id: resolveUsuarioDocId(usuario),
      empresa_id: resolveEmpresaId(usuario.empresa_id, null),
      supermercado_ids: normalizeScopedUnitIds(usuario.supermercado_id, usuario.supermercado_ids),
      status: usuario.status ?? "Ativo",
    };

    if (db) {
      try {
        await setDoc(doc(db, USUARIOS_COLLECTION, usuarioNormalizado.id), usuarioNormalizado, {
          merge: true,
        });
      } catch {
        // Permission may be restricted by Firestore rules for non-admin profiles.
      }
    }

    return usuarioNormalizado;
  }, []);

  const updateUsuarioAdmin = useCallback(
    async (
      id: string,
      input: {
        perfil: PerfilAcesso;
        empresa_id: string | null;
        supermercado_id: string | null;
        supermercado_ids?: string[];
      }
    ) => {
      assertUserAccess({
        isAuthenticated: Boolean(auth?.currentUser),
        userId: auth?.currentUser?.uid ?? null,
        perfil,
        requiredAction: "manage_usuario",
      });

      const supermercado_ids = normalizeScopedUnitIds(
        input.supermercado_id,
        input.supermercado_ids
      );
      if (supermercado_ids.length > MAX_UNIDADES_POR_USUARIO) {
        throw new Error(`Cada usuário pode ter até ${MAX_UNIDADES_POR_USUARIO} unidades atribuídas.`);
      }

      if (db) {
        const userRef = doc(db, USUARIOS_COLLECTION, id);
        const usuarioAtual = usuarios.find((item) => item.id === id);
        const unidadesAnteriores = normalizeScopedUnitIds(
          usuarioAtual?.supermercado_id,
          usuarioAtual?.supermercado_ids
        );
        const unidadesAfetadas = new Set([...unidadesAnteriores, ...supermercado_ids]);
        const linksAnteriores = new Map(
          await Promise.all(
            [...unidadesAfetadas].map(async (supermercadoId) => {
              const snapshot = await getDoc(doc(userRef, "unidades", supermercadoId));
              return [supermercadoId, snapshot.exists() ? snapshot.data() : null] as const;
            })
          )
        );
        const batch = writeBatch(db);
        batch.update(userRef, {
          perfil: input.perfil,
          empresa_id: resolveEmpresaId(input.empresa_id, null),
          supermercado_id: input.supermercado_id,
          supermercado_ids,
          vinculos_unidades_v2: true,
          atualizado_em: new Date().toISOString(),
        });
        for (const supermercadoId of unidadesAfetadas) {
          const unidadeRef = doc(userRef, "unidades", supermercadoId);
          const ativa = supermercado_ids.includes(supermercadoId);
          const linkAnterior = linksAnteriores.get(supermercadoId);
          batch.set(unidadeRef, {
            empresa_id: ativa
              ? resolveEmpresaId(input.empresa_id, null)
              : linkAnterior?.empresa_id ?? usuarioAtual?.empresa_id ?? null,
            supermercado_id: supermercadoId,
            status: ativa ? "Ativo" : "Inativo",
            atualizado_em: new Date().toISOString(),
          });
        }
        await batch.commit();
        return;
      }

      setUsuarios((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                perfil: input.perfil,
                empresa_id: resolveEmpresaId(input.empresa_id, null),
                supermercado_id: input.supermercado_id,
                supermercado_ids,
                vinculos_unidades_v2: true,
                atualizado_em: new Date().toISOString(),
              }
            : item
        )
      );
    },
    []
  );

  const toggleUsuarioStatus = useCallback(async (id: string) => {
    assertUserAccess({
      isAuthenticated: Boolean(auth?.currentUser),
      userId: auth?.currentUser?.uid ?? null,
      perfil,
      requiredAction: "manage_usuario",
    });

    const current = usuarios.find((u) => u.id === id);
    if (!current) return;
    const nextStatus: UsuarioStatus = current.status === "Inativo" ? "Ativo" : "Inativo";

    if (db) {
      await updateDoc(doc(db, USUARIOS_COLLECTION, id), {
        status: nextStatus,
        atualizado_em: new Date().toISOString(),
      });
      return;
    }

    setUsuarios((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: nextStatus,
              atualizado_em: new Date().toISOString(),
            }
          : item
      )
    );
  }, [perfil, usuarios]);

  return {
    usuarios,
    upsertUsuarioFromLogin,
    updateUsuarioAdmin,
    toggleUsuarioStatus,
  };
}
