import { useCallback, useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import type { PerfilAcesso, UsuarioSistema, UsuarioStatus } from "../types/usuario";
import { normalizeScopedUnitIds, resolveEmpresaId } from "../utils/tenant";

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
    supermercado_ids: normalizeScopedUnitIds(
      typeof data.supermercado_id === "string" ? data.supermercado_id : null,
      data.supermercado_ids
    ),
    status,
    email: typeof data.email === "string" ? data.email : undefined,
    criado_em: typeof data.criado_em === "string" ? data.criado_em : undefined,
    atualizado_em: typeof data.atualizado_em === "string" ? data.atualizado_em : undefined,
  };
}

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);

  useEffect(() => {
    if (!db) {
      setUsuarios([]);
      return;
    }

    return onSnapshot(
      collection(db, USUARIOS_COLLECTION),
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
  }, []);

  const upsertUsuarioFromLogin = useCallback(async (usuario: UsuarioSistema) => {
    const usuarioNormalizado: UsuarioSistema = {
      ...usuario,
      nome: usuario.nome.trim(),
      id: buildUsuarioDocId(usuario),
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
      const supermercado_ids = normalizeScopedUnitIds(
        input.supermercado_id,
        input.supermercado_ids
      );

      if (db) {
        await updateDoc(doc(db, USUARIOS_COLLECTION, id), {
          perfil: input.perfil,
          empresa_id: resolveEmpresaId(input.empresa_id, null),
          supermercado_id: input.supermercado_id,
          supermercado_ids,
          atualizado_em: new Date().toISOString(),
        });
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
                atualizado_em: new Date().toISOString(),
              }
            : item
        )
      );
    },
    []
  );

  const toggleUsuarioStatus = useCallback(async (id: string) => {
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
  }, [usuarios]);

  return {
    usuarios,
    upsertUsuarioFromLogin,
    updateUsuarioAdmin,
    toggleUsuarioStatus,
  };
}
