"use strict";

const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

initializeApp();
const db = getFirestore();
const OPERATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INPUT_KEYS = new Set(["operationId", "pedidoId", "itemId", "chamadoId", "quantidade", "justificativa"]);

function fail(code, message) {
  throw new HttpsError(code, message);
}

function requiredId(value, field) {
  if (typeof value !== "string" || value.trim() === "" || value.includes("/")) {
    fail("invalid-argument", `${field} inválido.`);
  }
  return value.trim();
}

function fingerprint(input) {
  const canonical = JSON.stringify({
    pedidoId: input.pedidoId,
    itemId: input.itemId,
    chamadoId: input.chamadoId,
    quantidade: input.quantidade,
    justificativa: input.justificativa,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function authorizedUnitIds(user) {
  const ids = [];
  if (Array.isArray(user.supermercado_ids)) {
    if (user.supermercado_ids.length > 8 || user.supermercado_ids.some((id) => typeof id !== "string" || !id.trim())) {
      fail("permission-denied", "Vínculos de unidades inválidos.");
    }
    ids.push(...user.supermercado_ids);
  }
  if (typeof user.supermercado_id === "string" && user.supermercado_id.trim()) ids.push(user.supermercado_id);
  return new Set(ids);
}

function parseInput(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)
      || Object.keys(data).some((key) => !INPUT_KEYS.has(key))) {
    fail("invalid-argument", "Contrato de confirmação inválido.");
  }
  const input = {
    operationId: requiredId(data.operationId, "operationId"),
    pedidoId: requiredId(data.pedidoId, "pedidoId"),
    itemId: requiredId(data.itemId, "itemId"),
    chamadoId: requiredId(data.chamadoId, "chamadoId"),
    quantidade: data.quantidade,
    justificativa: typeof data.justificativa === "string" ? data.justificativa.trim() : "",
  };
  if (!OPERATION_ID_RE.test(input.operationId)) fail("invalid-argument", "operationId deve ser UUID.");
  if (!Number.isSafeInteger(input.quantidade) || input.quantidade < 0) fail("invalid-argument", "Quantidade inválida.");
  if (input.quantidade === 0 && input.justificativa.length === 0) {
    fail("invalid-argument", "Informe a justificativa para confirmar quantidade zero.");
  }
  if (input.justificativa.length > 500) fail("invalid-argument", "Justificativa excede 500 caracteres.");
  return input;
}

function assertSeparator(auth, user, order, unit) {
  if (!auth) fail("unauthenticated", "Autenticação necessária.");
  if (!user || user.status !== "Ativo" || user.perfil !== "Separador de Televendas") {
    fail("permission-denied", "Somente Separador de Televendas ativo pode confirmar itens.");
  }
  if (!order || !unit || !user.empresa_id || user.empresa_id !== order.empresa_id
      || unit.empresa_id !== order.empresa_id || unit.status !== "Ativo") {
    fail("permission-denied", "Pedido fora do escopo de empresa/unidade autorizado.");
  }
  if (!authorizedUnitIds(user).has(order.supermercado_id)) {
    fail("permission-denied", "Unidade não atribuída ao usuário.");
  }
}

exports.confirmTelevendasItem = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) fail("unauthenticated", "Autenticação necessária.");
  const input = parseInput(request.data);
  const actorUid = request.auth.uid;
  const fingerprintValue = fingerprint(input);
  const operationRef = db.doc(`separacao_operacoes/${input.operationId}`);
  const orderRef = db.doc(`chamados/${input.pedidoId}`);
  const itemRef = db.doc(`chamados/${input.pedidoId}/itens/${input.itemId}`);
  const callRef = db.doc(`chamados/${input.chamadoId}`);
  const receiptRef = db.doc(`chamados/${input.pedidoId}/separacao_confirmacoes/${input.operationId}`);
  const auditRef = db.doc(`auditoria/${input.operationId}`);
  const userRef = db.doc(`usuarios/${actorUid}`);

  return db.runTransaction(async (tx) => {
    const [operationSnap, userSnap, orderSnap, itemSnap, callSnap, receiptSnap, auditSnap] = await Promise.all([
      tx.get(operationRef), tx.get(userRef), tx.get(orderRef), tx.get(itemRef), tx.get(callRef), tx.get(receiptRef), tx.get(auditRef),
    ]);
    if (!orderSnap.exists) fail("not-found", "Pedido não encontrado.");
    const order = orderSnap.data();
    const unitRef = db.doc(`supermercados/${order.supermercado_id}`);
    const unitSnap = await tx.get(unitRef);
    const unit = unitSnap.exists ? unitSnap.data() : null;
    const user = userSnap.exists ? userSnap.data() : null;
    assertSeparator(request.auth, user, order, unit);

    if (operationSnap.exists) {
      const prior = operationSnap.data();
      if (prior.actor_uid !== actorUid || prior.request_fingerprint !== fingerprintValue
          || prior.pedido_id !== input.pedidoId || prior.receipt_path !== receiptRef.path) {
        fail("failed-precondition", "operationId já utilizado com parâmetros diferentes.");
      }
      if (!receiptSnap.exists || !auditSnap.exists
          || receiptSnap.data().operation_id !== input.operationId
          || auditSnap.data().operation_id !== input.operationId) {
        fail("data-loss", "Recibo ou auditoria da operação anterior está inconsistente.");
      }
      return prior.result;
    }
    if (receiptSnap.exists || auditSnap.exists) fail("already-exists", "Identificador de confirmação já existe.");
    if (order.categoria !== "televendas" || order.modelo_itens !== "individual" || order.status !== "Em separação") {
      fail("failed-precondition", "Pedido não está disponível para confirmação.");
    }
    if (!itemSnap.exists) fail("not-found", "Item individualizado não encontrado.");
    const item = itemSnap.data();
    if (item.id !== input.itemId || item.pedido_id !== input.pedidoId
        || item.empresa_id !== order.empresa_id || item.supermercado_id !== order.supermercado_id) {
      fail("failed-precondition", "Item não pertence ao pedido e escopo informados.");
    }
    if (!callSnap.exists) fail("not-found", "Chamado operacional não encontrado.");
    const call = callSnap.data();
    if (call.categoria !== "operacional" || call.status !== "Finalizado"
        || call.pedido_origem_id !== input.pedidoId || call.pedido_origem_item_id !== input.itemId
        || call.empresa_id !== order.empresa_id || call.supermercado_id !== order.supermercado_id) {
      fail("failed-precondition", "Chamado não está finalizado e vinculado a este item.");
    }
    const requested = item.quantidade_solicitada;
    const found = item.quantidade_encontrada;
    if (!Number.isSafeInteger(requested) || !Number.isSafeInteger(found) || requested < 0 || found < 0 || found > requested) {
      fail("data-loss", "Saldo do item inválido.");
    }
    const nextFound = found + input.quantidade;
    if (!Number.isSafeInteger(nextFound) || nextFound > requested) fail("failed-precondition", "Quantidade excede o saldo disponível.");

    const now = FieldValue.serverTimestamp();
    const result = {
      operationId: input.operationId,
      pedidoId: input.pedidoId,
      itemId: input.itemId,
      chamadoId: input.chamadoId,
      quantidadeConfirmada: input.quantidade,
      quantidadeEncontrada: nextFound,
      quantidadeFaltante: requested - nextFound,
    };
    tx.update(itemRef, {
      quantidade_encontrada: nextFound,
      quantidade_faltante: requested - nextFound,
      recebimento_empilhadeira_confirmado: true,
      ultima_confirmacao_id: input.operationId,
      ultima_auditoria_id: input.operationId,
      atualizado_em: now,
    });
    tx.create(receiptRef, {
      id: input.operationId,
      operation_id: input.operationId,
      request_fingerprint: fingerprintValue,
      pedido_id: input.pedidoId,
      item_id: input.itemId,
      chamado_id: input.chamadoId,
      origem: "empilhadeira",
      empresa_id: order.empresa_id,
      supermercado_id: order.supermercado_id,
      actor_uid: actorUid,
      quantidade: input.quantidade,
      unidade_medida: item.unidade_medida,
      justificativa: input.justificativa || null,
      audit_id: input.operationId,
      confirmado_em: now,
    });
    tx.create(auditRef, {
      action: "separacao_item_confirmada",
      operation_id: input.operationId,
      actorUid,
      entityType: "pedido_item",
      entityId: input.itemId,
      empresa_id: order.empresa_id,
      supermercado_id: order.supermercado_id,
      occurredAt: now,
      details: {
        pedido_id: input.pedidoId,
        item_id: input.itemId,
        chamado_id: input.chamadoId,
        confirmacao_id: input.operationId,
        quantidade: input.quantidade,
        unidade_medida: item.unidade_medida,
      },
    });
    tx.create(operationRef, {
      operation_id: input.operationId,
      actor_uid: actorUid,
      request_fingerprint: fingerprintValue,
      pedido_id: input.pedidoId,
      item_id: input.itemId,
      chamado_id: input.chamadoId,
      receipt_path: receiptRef.path,
      result,
      created_at: now,
    });
    return result;
  });
});
