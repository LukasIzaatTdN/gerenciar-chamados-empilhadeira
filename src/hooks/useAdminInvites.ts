import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "../config/firebase";
import type { AdminInvite } from "../types/adminInvite";

const ADMIN_INVITES_COLLECTION = "convites_admin_empresa";

function normalizeInvite(data: Partial<AdminInvite>, fallbackId: string): AdminInvite {
  const now = new Date();
  const fallbackExpire = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3);
  return {
    id: data.id ?? fallbackId,
    empresa_id: typeof data.empresa_id === "string" ? data.empresa_id : "",
    perfil: "Administrador da Empresa",
    status:
      data.status === "Usado" || data.status === "Expirado" || data.status === "Cancelado"
        ? data.status
        : "Pendente",
    criado_em: typeof data.criado_em === "string" ? data.criado_em : now.toISOString(),
    expira_em: typeof data.expira_em === "string" ? data.expira_em : fallbackExpire.toISOString(),
    expira_em_ms:
      typeof data.expira_em_ms === "number" && Number.isFinite(data.expira_em_ms)
        ? data.expira_em_ms
        : fallbackExpire.getTime(),
    criado_por_uid: typeof data.criado_por_uid === "string" ? data.criado_por_uid : null,
    criado_por_nome: typeof data.criado_por_nome === "string" ? data.criado_por_nome : null,
    usado_em: typeof data.usado_em === "string" ? data.usado_em : null,
    usado_por_uid: typeof data.usado_por_uid === "string" ? data.usado_por_uid : null,
    usado_por_nome: typeof data.usado_por_nome === "string" ? data.usado_por_nome : null,
  };
}

function createInviteToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `inv${Date.now().toString(16)}`;
}

function mapFirestoreInviteError(error: unknown, fallback: string): Error {
  const firestoreError = error as FirestoreError | undefined;
  if (firestoreError?.code === "permission-denied") {
    return new Error(`${fallback} (permission-denied)`);
  }
  if (firestoreError?.code === "unauthenticated") {
    return new Error(`${fallback} (unauthenticated)`);
  }
  return new Error(fallback);
}

interface AdminInvitesScope {
  empresaId: string | null;
  canViewAllCompanies: boolean;
}

export function useAdminInvites(scope: AdminInvitesScope) {
  const [invites, setInvites] = useState<AdminInvite[]>([]);

  useEffect(() => {
    if (!db) {
      setInvites([]);
      return;
    }

    if (!scope.canViewAllCompanies && !scope.empresaId) {
      setInvites([]);
      return;
    }

    const invitesQuery = scope.canViewAllCompanies
      ? query(collection(db, ADMIN_INVITES_COLLECTION))
      : query(collection(db, ADMIN_INVITES_COLLECTION), where("empresa_id", "==", scope.empresaId));

    return onSnapshot(
      invitesQuery,
      (snapshot) => {
        const remote = snapshot.docs
          .map((snapshotDoc) =>
            normalizeInvite(snapshotDoc.data() as Partial<AdminInvite>, snapshotDoc.id)
          )
          .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
        setInvites(remote);
      },
      () => {
        setInvites([]);
      }
    );
  }, [scope.canViewAllCompanies, scope.empresaId]);

  const createAdminInvite = useCallback(
    async (input: {
      empresa_id: string;
      expiresInDays: number;
      criado_por_uid: string | null;
      criado_por_nome: string | null;
    }) => {
      if (!db) throw new Error("Firebase indisponível para gerar convite.");

      const token = createInviteToken();
      const now = new Date();
      const expiresInMs = Math.max(1, Math.min(30, input.expiresInDays)) * 24 * 60 * 60 * 1000;
      const expiraEm = new Date(now.getTime() + expiresInMs);

      const invite: AdminInvite = {
        id: token,
        empresa_id: input.empresa_id,
        perfil: "Administrador da Empresa",
        status: "Pendente",
        criado_em: now.toISOString(),
        expira_em: expiraEm.toISOString(),
        expira_em_ms: expiraEm.getTime(),
        criado_por_uid: input.criado_por_uid,
        criado_por_nome: input.criado_por_nome,
        usado_em: null,
        usado_por_uid: null,
        usado_por_nome: null,
      };

      try {
        await setDoc(doc(db, ADMIN_INVITES_COLLECTION, token), invite);
      } catch (error) {
        throw mapFirestoreInviteError(error, "Não foi possível criar convite de administrador.");
      }

      return token;
    },
    []
  );

  const consumeInvite = useCallback(
    async (input: { token: string; usedByUid: string; usedByName: string }) => {
      if (!db) throw new Error("Firebase indisponível para validar convite.");
      const token = input.token.trim();
      if (!token) {
        throw new Error("Informe o token de convite.");
      }

      const ref = doc(db, ADMIN_INVITES_COLLECTION, token);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        throw new Error("Convite inválido ou não encontrado.");
      }

      const invite = normalizeInvite(snap.data() as Partial<AdminInvite>, snap.id);
      const nowMs = Date.now();
      if (invite.status !== "Pendente") {
        throw new Error("Este convite já foi utilizado ou está inativo.");
      }
      if (invite.expira_em_ms <= nowMs) {
        try {
          await updateDoc(ref, { status: "Expirado" });
        } catch {
          // best-effort status update
        }
        throw new Error("Este convite expirou. Solicite um novo convite.");
      }

      try {
        await updateDoc(ref, {
          status: "Usado",
          usado_em: new Date().toISOString(),
          usado_por_uid: input.usedByUid,
          usado_por_nome: input.usedByName,
        });
      } catch (error) {
        throw mapFirestoreInviteError(error, "Não foi possível consumir o convite.");
      }

      return invite;
    },
    []
  );

  const validateInviteToken = useCallback(async (tokenInput: string) => {
    if (!db) throw new Error("Firebase indisponível para validar convite.");
    const token = tokenInput.trim();
    if (!token) throw new Error("Informe o token de convite.");

    const ref = doc(db, ADMIN_INVITES_COLLECTION, token);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error("Convite inválido ou não encontrado.");
    }
    const invite = normalizeInvite(snap.data() as Partial<AdminInvite>, snap.id);
    if (invite.status !== "Pendente") {
      throw new Error("Este convite já foi utilizado ou está inativo.");
    }
    if (invite.expira_em_ms <= Date.now()) {
      throw new Error("Este convite expirou. Solicite um novo convite.");
    }
    return invite;
  }, []);

  return {
    invites,
    createAdminInvite,
    validateInviteToken,
    consumeInvite,
  };
}
