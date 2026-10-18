import { doc, getDoc, runTransaction, serverTimestamp, Timestamp, type Firestore } from "firebase/firestore";
import type { User } from "firebase/auth";
import { auth, db } from "../config/firebase.ts";
import type { AssinaturaCiclo, PlanoComercialStatus } from "../types/empresa.ts";
import { clearSubscriptionOperationId, getOrCreateSubscriptionOperationId } from "../utils/subscriptionOperationId.ts";

export type SubscriptionPlanInput = {
  nome: string;
  descricao: string;
  valor_centavos: number;
  ciclo: AssinaturaCiclo;
  limite_usuarios: number | null;
  limite_filiais: number | null;
  status: PlanoComercialStatus;
};

export type SubscriptionAdminOperation =
  | { action: "savePlan"; planId: string | null; plan: SubscriptionPlanInput }
  | { action: "assignPlan" | "activate" | "renew"; empresaId: string; planId: string };

const PLAN_ID_RE = /^[a-z0-9-]{2,50}$/;
type SubscriptionFirestoreSdk = Pick<typeof import("firebase/firestore"), "doc" | "getDoc" | "runTransaction" | "serverTimestamp" | "Timestamp">;

function makePlanId(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function addCycle(start: Date, cycle: AssinaturaCiclo) {
  const months = { Mensal: 1, Trimestral: 3, Semestral: 6, Anual: 12 }[cycle];
  const result = new Date(start);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function operationResult(snapshot: { exists(): boolean; data(): Record<string, unknown> | undefined }, actorUid: string, action: string, requestData: Record<string, unknown>) {
  if (!snapshot.exists()) return null;
  const prior = snapshot.data()!;
  const stable = (value: unknown): string => value && typeof value === "object"
    ? Array.isArray(value)
      ? `[${value.map(stable).join(",")}]`
      : `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`
    : JSON.stringify(value);
  if (prior.actor_uid !== actorUid || prior.action !== action || stable(prior.request_data) !== stable(requestData)) {
    throw new Error("Este identificador de operação já foi usado com outros dados. Recarregue a tela e tente novamente.");
  }
  return prior.result as Record<string, unknown>;
}

export async function runSubscriptionAdminOperation(
  payload: SubscriptionAdminOperation,
  testContext?: { firestore: Firestore; currentUser: Pick<User, "uid" | "displayName">; operationId: string; firestoreSdk?: SubscriptionFirestoreSdk },
) {
  const firestore = testContext?.firestore ?? db;
  const currentUser = testContext?.currentUser ?? auth?.currentUser;
  const sdk = testContext?.firestoreSdk ?? { doc, getDoc, runTransaction, serverTimestamp, Timestamp };
  if (!firestore || !currentUser) throw new Error("Entre com uma conta autorizada para continuar.");
  const actorUid = currentUser.uid;
  const operationId = testContext?.operationId ?? getOrCreateSubscriptionOperationId(actorUid, payload);
  const operationRef = sdk.doc(firestore, "assinatura_operacoes", operationId);
  const actorRef = sdk.doc(firestore, "usuarios", actorUid);
  const subscriptionRef = payload.action === "savePlan" ? null : sdk.doc(firestore, "empresas", payload.empresaId, "assinaturas", "atual");
  let observedSubscriptionUpdatedAt: unknown;

  try {
    const executeTransaction = () => sdk.runTransaction(firestore, async (transaction) => {
      const operationSnapshot = await transaction.get(operationRef);
      const replay = operationResult(operationSnapshot, actorUid, payload.action, payload);
      if (replay) return replay;
      const actorSnapshot = await transaction.get(actorRef);
      if (!actorSnapshot.exists() || actorSnapshot.data().perfil !== "Administrador Geral" || actorSnapshot.data().status !== "Ativo") {
        throw new Error("Somente um Administrador Geral ativo pode realizar esta operação.");
      }
      const actorName = typeof actorSnapshot.data().nome === "string" ? actorSnapshot.data().nome : currentUser.displayName || "Administrador Geral";
      const now = new Date();

      if (payload.action === "savePlan") {
        const planId = payload.planId ?? makePlanId(payload.plan.nome);
        if (!PLAN_ID_RE.test(planId)) throw new Error("Código de plano inválido.");
        const planRef = sdk.doc(firestore, "planos", planId);
        const previousSnapshot = await transaction.get(planRef);
        const previous = previousSnapshot.exists() ? previousSnapshot.data() : null;
        const result = { planId };
        transaction.set(planRef, {
          ...payload.plan,
          nome: payload.plan.nome.trim(),
          descricao: payload.plan.descricao.trim(),
          id: planId,
          criado_em: previous?.criado_em ?? sdk.serverTimestamp(),
          atualizado_em: sdk.serverTimestamp(),
          ultima_operacao_id: operationId,
        });
        transaction.set(sdk.doc(firestore, "auditoria_assinaturas", operationId), {
          acao: previous ? "plano_editado" : "plano_criado",
          plano_id: planId,
          operation_id: operationId,
          ator_uid: actorUid,
          ator_nome: actorName,
          ocorrido_em: sdk.serverTimestamp(),
          detalhes: { nome: payload.plan.nome.trim(), valor_centavos: payload.plan.valor_centavos, ciclo: payload.plan.ciclo },
        });
        transaction.set(operationRef, {
          operation_id: operationId,
          actor_uid: actorUid,
          action: payload.action,
          request_data: payload,
          target_id: planId,
          result,
          processed_at: sdk.serverTimestamp(),
        });
        return result;
      }

      const companyRef = sdk.doc(firestore, "empresas", payload.empresaId);
      const planRef = sdk.doc(firestore, "planos", payload.planId);
      const [companySnapshot, planSnapshot, subscriptionSnapshot] = await Promise.all([
        transaction.get(companyRef), transaction.get(planRef), transaction.get(subscriptionRef!),
      ]);
      if (!companySnapshot.exists()) throw new Error("Empresa não encontrada.");
      if (!planSnapshot.exists() || planSnapshot.data().status !== "Ativo") throw new Error("Selecione um plano ativo.");
      const plan = planSnapshot.data();
      const old = subscriptionSnapshot.exists() ? subscriptionSnapshot.data() : null;
      observedSubscriptionUpdatedAt = old?.atualizado_em;
      const allowedStatuses = ["Pendente", "Ativa", "Expirada"];
      if (old && !allowedStatuses.includes(old.status)) throw new Error(`Não é permitida operação para assinatura ${String(old.status)}.`);
      let status: string;
      if (payload.action === "assignPlan") {
        if (old && !allowedStatuses.includes(old.status)) throw new Error("Transição de status não permitida.");
        status = old?.status ?? "Pendente";
      } else {
        if (!old || old.plano_id !== payload.planId) throw new Error("Vincule o plano escolhido antes de ativar ou renovar.");
        if (payload.action === "activate" && old.status !== "Pendente") throw new Error("Somente uma assinatura pendente pode ser ativada.");
        if (payload.action === "renew" && !["Ativa", "Expirada"].includes(old.status)) throw new Error("Somente uma assinatura ativa ou expirada pode ser renovada.");
        status = "Ativa";
      }

      const startDate = payload.action === "renew" && old?.vence_em instanceof sdk.Timestamp && old.vence_em.toDate() > now
        ? old.vence_em.toDate()
        : now;
      const useExistingFutureExpiry = payload.action === "renew" && old?.vence_em instanceof sdk.Timestamp && old.vence_em.toDate() > now;
      const operationStart = payload.action === "activate" || (payload.action === "renew" && !useExistingFutureExpiry)
        ? sdk.serverTimestamp()
        : old?.vence_em ?? sdk.serverTimestamp();
      const subscription = {
        empresa_id: payload.empresaId,
        plano_id: payload.planId,
        plano_nome: plan.nome,
        status,
        ciclo: plan.ciclo,
        valor_centavos: plan.valor_centavos,
        inicio_em: payload.action === "activate" ? sdk.serverTimestamp() : (old?.inicio_em ?? null),
        vence_em: payload.action === "assignPlan" ? (old?.vence_em ?? null) : sdk.Timestamp.fromDate(addCycle(startDate, plan.ciclo)),
        renovacao_manual: true,
        cobranca_automatica: false,
        provedor_pagamento: null,
        criado_em: old?.criado_em ?? sdk.serverTimestamp(),
        atualizado_em: sdk.serverTimestamp(),
        atualizado_por: actorUid,
        ultima_operacao_id: operationId,
      };
      const eventAction = payload.action === "assignPlan" ? "plano_vinculado" : payload.action === "activate" ? "assinatura_ativada" : "assinatura_renovada";
      const details = payload.action === "assignPlan"
        ? { plano_anterior: old?.plano_id ?? null, plano_nome: plan.nome, valor_centavos: plan.valor_centavos, filial_independente: true }
        : { valor_centavos: plan.valor_centavos, ciclo: plan.ciclo, inicio_em: operationStart, vence_em: subscription.vence_em, pagamento: "manual" };
      const result = { ok: true, empresaId: payload.empresaId, planId: payload.planId, status, vence_em: subscription.vence_em };
      transaction.set(subscriptionRef!, subscription);
      transaction.set(sdk.doc(firestore, "empresas", payload.empresaId, "historico_assinatura", operationId), {
        acao: eventAction,
        empresa_id: payload.empresaId,
        plano_id: payload.planId,
        operation_id: operationId,
        ator_uid: actorUid,
        ator_nome: actorName,
        ocorrido_em: sdk.serverTimestamp(),
        detalhes: details,
      });
      transaction.set(operationRef, {
        operation_id: operationId,
        actor_uid: actorUid,
        action: payload.action,
        request_data: payload,
        target_id: payload.empresaId,
        result,
        processed_at: sdk.serverTimestamp(),
      });
      return result;
    });

    let result: Record<string, unknown>;
    for (let attempt = 0; ; attempt += 1) {
      try {
        result = await executeTransaction();
        break;
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (attempt >= 2 || code !== "permission-denied" || !subscriptionRef || observedSubscriptionUpdatedAt == null) throw error;
        const replaySnapshot = await sdk.getDoc(operationRef);
        const replay = operationResult(replaySnapshot, actorUid, payload.action, payload);
        if (replay) { result = replay; break; }
        const latestSnapshot = await sdk.getDoc(subscriptionRef);
        const latestUpdatedAt = latestSnapshot.exists() ? latestSnapshot.data().atualizado_em : null;
        const toComparable = (value: unknown) => value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function"
          ? value.toMillis()
          : value;
        if (toComparable(latestUpdatedAt) === toComparable(observedSubscriptionUpdatedAt)) throw error;
      }
    }
    if (!testContext) clearSubscriptionOperationId(actorUid, payload);
    return result;
  } catch (error) {
    // Keep the operation ID after network/permission failures so a retry cannot create another logical operation.
    throw error;
  }
}
