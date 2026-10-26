const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  assertPlatformAdmin,
  assertSubscriptionTransition,
  validatePlan,
  addCycle,
} = require("./subscriptions-policy");

initializeApp();
const db = getFirestore();

const PLAN_ID_RE = /^[a-z0-9-]{2,50}$/;
const OPERATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["savePlan", "assignPlan", "activate", "renew"]);
const HttpsErrorCodes = new Set([
  "unauthenticated", "permission-denied", "invalid-argument", "failed-precondition", "not-found",
]);

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requirePlanId(value) {
  if (typeof value !== "string" || !PLAN_ID_RE.test(value)) {
    throw new HttpsError("invalid-argument", "Código de plano inválido.");
  }
  return value;
}

function requireOperationId(value) {
  if (typeof value !== "string" || !OPERATION_ID_RE.test(value)) {
    throw new HttpsError("invalid-argument", "Identificador de operação inválido.");
  }
  return value;
}

function checkReplay(snapshot, { actorUid, action, requestFingerprint }) {
  if (!snapshot.exists) return null;
  const prior = snapshot.data();
  if (prior.actor_uid !== actorUid || prior.action !== action || prior.request_fingerprint !== requestFingerprint) {
    throw new HttpsError("failed-precondition", "Este identificador já foi usado em outra operação.");
  }
  return prior.result;
}

function recordOperation(tx, ref, { operationId, actorUid, action, requestFingerprint, nowIso, result }) {
  tx.create(ref, {
    operation_id: operationId,
    actor_uid: actorUid,
    action,
    request_fingerprint: requestFingerprint,
    processed_at: nowIso,
    result,
  });
}

exports.manageSubscription = onCall({ region: "us-central1" }, async (request) => {
  const action = request.data && request.data.action;
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para continuar.");
    const actorUid = request.auth.uid;
    const actorSnap = await db.doc(`usuarios/${actorUid}`).get();
    assertPlatformAdmin(actorSnap.exists ? actorSnap.data() : null);
    const actorName = actorSnap.data().nome || request.auth.token.name || "Administrador da Plataforma";
    const input = request.data && typeof request.data === "object" ? request.data : {};
    if (!ACTIONS.has(input.action)) throw new HttpsError("invalid-argument", "Operação administrativa desconhecida.");

    const operationId = requireOperationId(input.operationId);
    const operationRef = db.doc(`assinatura_operacoes/${operationId}`);
    const now = new Date();
    const nowIso = now.toISOString();

    if (input.action === "savePlan") {
      const plan = validatePlan(input.plan);
      const planId = input.planId == null
        ? plan.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : input.planId;
      requirePlanId(planId);
      const requestFingerprint = fingerprint({ action: input.action, planId, plan });
      const planRef = db.doc(`planos/${planId}`);
      const eventRef = db.collection("auditoria_assinaturas").doc();
      return await db.runTransaction(async (tx) => {
        const opSnap = await tx.get(operationRef);
        const replay = checkReplay(opSnap, { actorUid, action: input.action, requestFingerprint });
        if (replay) return replay;
        const previousSnap = await tx.get(planRef);
        const previous = previousSnap.exists ? previousSnap.data() : null;
        const result = { planId };
        tx.set(planRef, {
          ...plan,
          id: planId,
          criado_em: previous?.criado_em || nowIso,
          atualizado_em: nowIso,
        });
        tx.create(eventRef, {
          acao: previous ? "plano_editado" : "plano_criado",
          plano_id: planId,
          operation_id: operationId,
          ator_uid: actorUid,
          ator_nome: actorName,
          ocorrido_em: nowIso,
          detalhes: { nome: plan.nome, valor_centavos: plan.valor_centavos, ciclo: plan.ciclo },
        });
        recordOperation(tx, operationRef, { operationId, actorUid, action: input.action, requestFingerprint, nowIso, result });
        return result;
      });
    }

    const empresaId = typeof input.empresaId === "string" ? input.empresaId.trim() : "";
    if (!empresaId || empresaId.includes("/")) throw new HttpsError("invalid-argument", "Empresa inválida.");
    const planId = requirePlanId(input.planId);
    const requestFingerprint = fingerprint({ action: input.action, empresaId, planId });
    const companyRef = db.doc(`empresas/${empresaId}`);
    const planRef = db.doc(`planos/${planId}`);
    const subscriptionRef = db.doc(`empresas/${empresaId}/assinaturas/atual`);
    const historyRef = db.collection(`empresas/${empresaId}/historico_assinatura`).doc();

    return await db.runTransaction(async (tx) => {
      const opSnap = await tx.get(operationRef);
      const replay = checkReplay(opSnap, { actorUid, action: input.action, requestFingerprint });
      if (replay) return replay;

      const [companySnap, planSnap, subscriptionSnap] = await Promise.all([
        tx.get(companyRef), tx.get(planRef), tx.get(subscriptionRef),
      ]);
      if (!companySnap.exists) throw new HttpsError("not-found", "Empresa não encontrada.");
      if (!planSnap.exists || planSnap.data().status !== "Ativo") {
        throw new HttpsError("failed-precondition", "Selecione um plano ativo.");
      }
      const plan = planSnap.data();
      const old = subscriptionSnap.exists ? subscriptionSnap.data() : null;
      const nextStatus = assertSubscriptionTransition(input.action, old?.status ?? null);

      if (input.action === "assignPlan") {
        if (old?.plano_id !== planId) {
          tx.set(subscriptionRef, {
            empresa_id: empresaId,
            plano_id: planId,
            plano_nome: plan.nome,
            status: nextStatus,
            ciclo: plan.ciclo,
            valor_centavos: plan.valor_centavos,
            inicio_em: old?.inicio_em || null,
            vence_em: old?.vence_em || null,
            renovacao_manual: true,
            cobranca_automatica: false,
            provedor_pagamento: null,
            criado_em: old?.criado_em || nowIso,
            atualizado_em: nowIso,
            atualizado_por: actorUid,
          });
          tx.create(historyRef, {
            acao: "plano_vinculado", empresa_id: empresaId, plano_id: planId,
            operation_id: operationId, ator_uid: actorUid, ator_nome: actorName, ocorrido_em: nowIso,
            detalhes: { plano_anterior: old?.plano_id || null, plano_nome: plan.nome, valor_centavos: plan.valor_centavos, filial_independente: true },
          });
        }
        const result = { ok: true, empresaId, planId, status: nextStatus, noOp: old?.plano_id === planId };
        recordOperation(tx, operationRef, { operationId, actorUid, action: input.action, requestFingerprint, nowIso, result });
        return result;
      }

      if (!old || old.plano_id !== planId) {
        throw new HttpsError("failed-precondition", "Vincule o plano escolhido antes de ativar ou renovar.");
      }
      const start = input.action === "renew" && old.vence_em && new Date(old.vence_em) > now
        ? new Date(old.vence_em)
        : now;
      const end = addCycle(start, plan.ciclo).toISOString();
      const startIso = start.toISOString();
      const result = {
        ok: true,
        empresaId,
        planId,
        status: nextStatus,
        inicio_em: input.action === "activate" ? nowIso : (old.inicio_em || nowIso),
        vence_em: end,
      };
      tx.set(subscriptionRef, {
        ...old,
        empresa_id: empresaId,
        plano_id: planId,
        plano_nome: plan.nome,
        status: nextStatus,
        ciclo: plan.ciclo,
        valor_centavos: plan.valor_centavos,
        inicio_em: result.inicio_em,
        vence_em: end,
        renovacao_manual: true,
        cobranca_automatica: false,
        provedor_pagamento: null,
        atualizado_em: nowIso,
        atualizado_por: actorUid,
      });
      tx.create(historyRef, {
        acao: input.action === "activate" ? "assinatura_ativada" : "assinatura_renovada",
        empresa_id: empresaId,
        plano_id: planId,
        operation_id: operationId,
        ator_uid: actorUid,
        ator_nome: actorName,
        ocorrido_em: nowIso,
        detalhes: { valor_centavos: plan.valor_centavos, ciclo: plan.ciclo, inicio_em: startIso, vence_em: end, pagamento: "manual" },
      });
      recordOperation(tx, operationRef, { operationId, actorUid, action: input.action, requestFingerprint, nowIso, result });
      return result;
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error && HttpsErrorCodes.has(error.code)) throw new HttpsError(error.code, error.message);
    console.error("manageSubscription failed", {
      uid: request.auth?.uid ?? null,
      action: typeof action === "string" ? action : "unknown",
      code: error && typeof error.code === "string" ? error.code : null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    throw new HttpsError("internal", "Falha interna em manageSubscription. Consulte os logs da função para ver os detalhes.", {
      action: typeof action === "string" ? action : "unknown",
    });
  }
});

const MANUAL_SEPARATION_OPERATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.confirmManualTelevendasItem = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const input = request.data && typeof request.data === "object" ? request.data : {};
  const pedidoId = input.pedidoId;
  const operationId = input.operationId;
  const itemIndex = input.itemIndex;
  const targetQuantity = input.targetQuantity;
  if (typeof pedidoId !== "string" || !pedidoId.trim() || pedidoId.includes("/")) {
    throw new HttpsError("invalid-argument", "Pedido inválido.");
  }
  if (typeof operationId !== "string" || !MANUAL_SEPARATION_OPERATION_ID_RE.test(operationId)) {
    throw new HttpsError("invalid-argument", "Identificador da confirmação inválido.");
  }
  if (!Number.isSafeInteger(itemIndex) || itemIndex < 0 ||
      !Number.isSafeInteger(targetQuantity) || targetQuantity < 0) {
    throw new HttpsError("invalid-argument", "Item ou quantidade inválida.");
  }

  const actorUid = request.auth.uid;
  const orderRef = db.doc(`chamados/${pedidoId}`);
  const userRef = db.doc(`usuarios/${actorUid}`);
  const receiptId = `manual-${operationId}`;
  const receiptRef = orderRef.collection("separacao_confirmacoes").doc(receiptId);
  const auditRef = db.collection("auditoria").doc();
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    return await db.runTransaction(async (tx) => {
      const [userSnap, orderSnap, receiptSnap] = await Promise.all([
        tx.get(userRef), tx.get(orderRef), tx.get(receiptRef),
      ]);
      if (!userSnap.exists || userSnap.get("status") !== "Ativo" ||
          userSnap.get("perfil") !== "Separador de Televendas") {
        throw new HttpsError("permission-denied", "Somente um Separador de Televendas ativo pode confirmar itens manualmente.");
      }
      const user = userSnap.data();
      if (!orderSnap.exists) throw new HttpsError("not-found", "Pedido não encontrado.");
      const order = orderSnap.data();
      if (user.empresa_id !== order.empresa_id || user.supermercado_id !== order.supermercado_id) {
        throw new HttpsError("permission-denied", "Pedido fora do escopo autorizado.");
      }
      if (!(order.categoria === "televendas" || order.tipo_servico === "Atendimento Televendas") || order.status !== "Em separação") {
        throw new HttpsError("failed-precondition", "O pedido não está aceitando confirmações de separação.");
      }
      if (receiptSnap.exists) {
        const oldReceipt = receiptSnap.data();
        if (oldReceipt.actor_uid !== actorUid || oldReceipt.pedido_id !== pedidoId ||
            oldReceipt.item_index !== itemIndex || oldReceipt.quantidade_nova !== targetQuantity) {
          throw new HttpsError("failed-precondition", "Este identificador já foi usado em outra confirmação.");
        }
        return { ok: true, replayed: true, itemIndex, quantidadeEncontrada: targetQuantity };
      }

      const items = Array.isArray(order.itens) ? order.itens : [];
      if (itemIndex >= items.length) throw new HttpsError("not-found", "Item do pedido não encontrado.");
      const item = items[itemIndex];
      const requested = item?.quantidadeSolicitada;
      const previous = item?.quantidadeEncontrada;
      if (!Number.isSafeInteger(requested) || requested < 0 ||
          !Number.isSafeInteger(previous) || previous < 0 || previous > requested) {
        throw new HttpsError("failed-precondition", "O item tem quantidades inválidas.");
      }
      const forkliftMarkers = order.confirmacoes_empilhadeira && typeof order.confirmacoes_empilhadeira === "object"
        ? Object.values(order.confirmacoes_empilhadeira) : [];
      const alreadyReceivedByForklift = forkliftMarkers.some((marker) =>
        marker && typeof marker === "object" && marker.item_index === itemIndex
      );
      if (alreadyReceivedByForklift || item.recebimentoEmpilhadeiraConfirmado === true) {
        throw new HttpsError("failed-precondition", "Este item já teve o recebimento da empilhadeira confirmado.");
      }
      if (targetQuantity <= previous || targetQuantity > requested) {
        throw new HttpsError("failed-precondition", "Informe uma quantidade maior que a já registrada e até o total solicitado.");
      }

      const quantityDelta = targetQuantity - previous;
      const nextItems = items.map((current, index) => index === itemIndex
        ? { ...current, quantidadeEncontrada: targetQuantity, quantidadeFaltante: requested - targetQuantity }
        : current);
      const totalRequested = nextItems.reduce((sum, current) => sum + current.quantidadeSolicitada, 0);
      const totalFound = nextItems.reduce((sum, current) => sum + current.quantidadeEncontrada, 0);
      const markerMap = order.confirmacoes_manuais && typeof order.confirmacoes_manuais === "object"
        ? order.confirmacoes_manuais : {};
      if (Object.hasOwn(markerMap, receiptId)) {
        throw new HttpsError("failed-precondition", "Esta confirmação já foi registrada.");
      }
      const actorName = user.nome || request.auth.token.name || "Separador";
      const unit = item.unidadeMedida || "Unidade";
      const marker = { item_index: itemIndex, quantidade: quantityDelta, unidade_medida: unit };
      tx.update(orderRef, {
        itens: nextItems,
        total_solicitado: totalRequested,
        total_encontrado: totalFound,
        percentual_atendido: totalRequested > 0 ? Math.round((totalFound / totalRequested) * 100) : 0,
        confirmacoes_manuais: { ...markerMap, [receiptId]: marker },
        ultima_separacao_manual_id: receiptId,
        ultima_auditoria_atualizacao_id: auditRef.id,
        atualizado_em: nowIso,
        atualizado_por: actorName,
        operador_nome: actorName,
      });
      tx.create(receiptRef, {
        id: receiptId,
        tipo: "manual",
        pedido_id: pedidoId,
        item_index: itemIndex,
        produto: item.produto,
        empresa_id: order.empresa_id,
        supermercado_id: order.supermercado_id,
        actor_uid: actorUid,
        actor_nome: actorName,
        quantidade: quantityDelta,
        quantidade_anterior: previous,
        quantidade_nova: targetQuantity,
        unidade_medida: unit,
        confirmado_em: now,
      });
      tx.create(auditRef, {
        action: "chamado_atualizado", actorUid, actorName,
        entityType: "chamado", entityId: pedidoId,
        empresa_id: order.empresa_id, supermercado_id: order.supermercado_id,
        occurredAt: nowIso,
        details: {
          empresa_id: order.empresa_id, supermercado_id: order.supermercado_id,
          statusAnterior: order.status, statusAtual: order.status,
          operador_nome: actorName, atualizado_em: nowIso, categoria: "televendas",
          separacao_confirmacao_manual_id: receiptId, item_index: itemIndex,
          quantidade: quantityDelta, unidade_medida: unit,
        },
      });
      return { ok: true, replayed: false, itemIndex, quantidadeEncontrada: targetQuantity };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error && HttpsErrorCodes.has(error.code)) throw new HttpsError(error.code, error.message);
    console.error("confirmManualTelevendasItem failed", {
      uid: actorUid, pedidoId, itemIndex,
      code: error && typeof error.code === "string" ? error.code : null,
    });
    throw new HttpsError("internal", "Não foi possível confirmar a separação manual.");
  }
});
