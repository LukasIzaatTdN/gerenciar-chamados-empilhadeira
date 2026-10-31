import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import type { UsuarioSistema } from "../types/usuario";
import { MAX_UNIDADES_POR_USUARIO, resolveAuthorizedUnitIds } from "../utils/tenant";

interface UnitAssignmentState {
  ownerId: string | null;
  unitIds: string[];
  error: string | null;
}

export function useUnidadesAtribuidas(usuario: UsuarioSistema | null) {
  const userId = usuario?.id ?? null;
  const empresaId = usuario?.empresa_id ?? null;
  const perfil = usuario?.perfil ?? null;
  const candidates = resolveAuthorizedUnitIds(usuario?.supermercado_id, usuario?.supermercado_ids);
  const requiresAssignmentDocs = usuario?.vinculos_unidades_v2 === true;
  const [state, setState] = useState<UnitAssignmentState>({ ownerId: null, unitIds: [], error: null });

  useEffect(() => {
    if (!userId || !usuario || perfil === "Administrador Geral") {
      setState({ ownerId: userId, unitIds: [], error: null });
      return;
    }

    if (!db) {
      setState({ ownerId: userId, unitIds: candidates, error: null });
      return;
    }

    if (!requiresAssignmentDocs) {
      setState({ ownerId: userId, unitIds: candidates, error: null });
      return;
    }

    setState({ ownerId: userId, unitIds: [], error: null });
    if (!empresaId || candidates.length === 0) return;

    const candidateSet = new Set(candidates);
    return onSnapshot(
      collection(db, "usuarios", userId, "unidades"),
      (snapshot) => {
        const unitIds = snapshot.docs
          .filter((assignment) => {
            const data = assignment.data();
            return candidateSet.has(assignment.id)
              && data.supermercado_id === assignment.id
              && data.empresa_id === empresaId
              && data.status === "Ativo";
          })
          .map((assignment) => assignment.id)
          .slice(0, MAX_UNIDADES_POR_USUARIO);
        setState({ ownerId: userId, unitIds, error: null });
      },
      (error) => {
        console.warn("[firestore] unit assignments listen failed", {
          operation: "usuarios.unidades.listen",
          collection: "usuarios/{uid}/unidades",
          code: error.code || "unknown",
        });
        setState({
          ownerId: userId,
          unitIds: [],
          error: `Falha ao validar os vínculos de unidade (${error.code || "unknown"}).`,
        });
      }
    );
  }, [userId, empresaId, perfil, requiresAssignmentDocs, candidates.join("|")]);

  return {
    unitIds: state.ownerId === userId ? state.unitIds : [],
    syncError: state.ownerId === userId ? state.error : null,
  };
}
