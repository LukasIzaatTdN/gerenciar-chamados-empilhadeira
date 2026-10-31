import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
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
    const firestore = db;
    if (!userId || !usuario || perfil === "Administrador Geral") {
      setState({ ownerId: userId, unitIds: [], error: null });
      return;
    }

    if (!firestore) {
      setState({ ownerId: userId, unitIds: candidates, error: null });
      return;
    }

    if (!requiresAssignmentDocs) {
      setState({ ownerId: userId, unitIds: candidates, error: null });
      return;
    }

    setState({ ownerId: userId, unitIds: [], error: null });
    if (!empresaId || candidates.length === 0) return;

    // Read only the declared links; do not require collection-wide list access.
    const validated = new Set<string>();
    const failures = new Map<string, string>();
    const publish = () => setState({
      ownerId: userId,
      unitIds: candidates.filter((id) => validated.has(id)),
      error: failures.size
        ? `Falha ao validar os vínculos de unidade (${[...new Set(failures.values())].join(", ")}).`
        : null,
    });
    const unsubscribers = candidates.slice(0, MAX_UNIDADES_POR_USUARIO).map((unitId) => onSnapshot(
      doc(firestore, "usuarios", userId, "unidades", unitId),
      (snapshot) => {
        const data = snapshot.data();
        if (data?.supermercado_id === unitId && data.empresa_id === empresaId && data.status === "Ativo") {
          validated.add(unitId);
        } else {
          validated.delete(unitId);
        }
        failures.delete(unitId);
        publish();
      },
      (error) => {
        console.warn("[firestore] unit assignments listen failed", {
          operation: "usuarios.unidades.listen",
          collection: "usuarios/{uid}/unidades",
          code: error.code || "unknown",
        });
        validated.delete(unitId);
        failures.set(unitId, error.code || "unknown");
        publish();
      }
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [userId, empresaId, perfil, requiresAssignmentDocs, candidates.join("|")]);

  return {
    unitIds: state.ownerId === userId ? state.unitIds : [],
    syncError: state.ownerId === userId ? state.error : null,
  };
}
