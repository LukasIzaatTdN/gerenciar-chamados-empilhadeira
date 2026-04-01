import { useCallback } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import type { UsuarioSistema } from "../types/usuario";

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
  const unidade = usuario.supermercado_id ?? "all";
  return `usr-${perfil}-${nome}-${unidade}`;
}

export function useUsuarios() {
  const upsertUsuarioFromLogin = useCallback(async (usuario: UsuarioSistema) => {
    const usuarioNormalizado: UsuarioSistema = {
      ...usuario,
      nome: usuario.nome.trim(),
      id: buildUsuarioDocId(usuario),
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

  return {
    upsertUsuarioFromLogin,
  };
}
