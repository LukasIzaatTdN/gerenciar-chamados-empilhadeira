"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.PATIO_DEMO_PROJECT_ID || "demo-patio-confirmation";
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!PROJECT_ID.startsWith("demo-")) throw new Error("Este protótipo aceita somente projectId demo-*.");
if (!AUTH_EMULATOR_HOST || !FIRESTORE_EMULATOR_HOST) {
  throw new Error("Defina FIREBASE_AUTH_EMULATOR_HOST e FIRESTORE_EMULATOR_HOST; sem Emulator o servidor não inicia.");
}

const app = initializeApp({ projectId: PROJECT_ID }, "node-backend-prototype");
const auth = getAuth(app);
const db = getFirestore(app);
const OPERATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_RE = /^[^/]{1,180}$/;
const INPUT_KEYS = new Set([
  "operationId", "pedidoId", "itemId", "origem", "chamadoId", "quantidade", "justificativa",
]);
const testMode = process.env.PATIO_PROTOTYPE_TEST_MODE === "1";
const metricsByOperation = new Map();
const droppedResponses = new Set();
const barriers = new Map();

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new ApiError(status, code, message);
}

function requiredId(value, field) {
  if (typeof value !== "string" || !ID_RE.test(value.trim())) {
    fail(400, "invalid-argument", `${field} inválido.`);
  }
  return value.trim();
}

function parseInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some((key) => !INPUT_KEYS.has(key))) {
    fail(400, "invalid-argument", "Contrato de confirmação inválido.");
  }
  const input = {
    operationId: requiredId(value.operationId, "operationId"),
    pedidoId: requiredId(value.pedidoId, "pedidoId"),
    itemId: requiredId(value.itemId, "itemId"),
    origem: value.origem,
    chamadoId: value.chamadoId == null ? null : requiredId(value.chamadoId, "chamadoId"),
    quantidade: value.quantidade,
    justificativa: typeof value.justificativa === "string" ? value.justificativa.trim() : "",
  };
  if (!OPERATION_ID_RE.test(input.operationId)) fail(400, "invalid-argument", "operationId deve ser UUID.");
  if (input.origem !== "direta" && input.origem !== "empilhadeira") {
    fail(400, "invalid-argument", "Origem de confirmação inválida.");
  }
  if (input.origem === "empilhadeira" && !input.chamadoId) {
    fail(400, "invalid-argument", "chamadoId é obrigatório para confirmação por empilhadeira.");
  }
  if (input.origem === "direta" && input.chamadoId) {
    fail(400, "invalid-argument", "Confirmação direta não aceita chamadoId.");
  }
  if (!Number.isSafeInteger(input.quantidade) || input.quantidade < 0) {
    fail(400, "invalid-argument", "Quantidade deve ser um inteiro não negativo.");
  }
  if (input.quantidade === 0 && !input.justificativa) {
    fail(400, "invalid-argument", "Quantidade zero exige justificativa.");
  }
  if (input.justificativa.length > 500) fail(400, "invalid-argument", "Justificativa excede 500 caracteres.");
  return input;
}

function buildFingerprint(actorUid, input) {
  const canonical = JSON.stringify({
    version: 1,
    actorUid,
    pedidoId: input.pedidoId,
    itemId: input.itemId,
    origem: input.origem,
    chamadoId: input.chamadoId,
    quantidade: input.quantidade,
    justificativa: input.justificativa,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function metricState(operationId) {
  return {
    operationId,
    outcome: "pending",
    transactionAttempts: 0,
    firestoreDocumentReads: 0,
    stagedWrites: 0,
    committedWrites: 0,
    elapsedMs: 0,
  };
}

async function getInTransaction(tx, ref, metrics) {
  metrics.firestoreDocumentReads += 1;
  return tx.get(ref);
}

function assertCurrentSeparator(user, order, assignment, unit) {
  if (!user || user.status !== "Ativo" || user.perfil !== "Separador de Televendas") {
    fail(403, "permission-denied", "Somente Separador de Televendas ativo pode confirmar itens.");
  }
  if (user.vinculos_unidades_v2 !== true) {
    fail(403, "permission-denied", "Usuário sem vínculos de unidade V2 ativos.");
  }
  if (!order || order.categoria !== "televendas" || order.modelo_itens !== "individual"
      || order.status !== "Em separação") {
    fail(409, "failed-precondition", "Pedido não está disponível para confirmação individual.");
  }
  if (!user.empresa_id || user.empresa_id !== order.empresa_id
      || !assignment || assignment.status !== "Ativo"
      || assignment.supermercado_id !== order.supermercado_id
      || assignment.empresa_id !== order.empresa_id
      || !unit || unit.status !== "Ativo" || unit.empresa_id !== order.empresa_id) {
    fail(403, "permission-denied", "Pedido fora dos vínculos ativos de empresa/unidade.");
  }
}

async function performConfirmation(actorUid, input, metrics) {
  const fingerprint = buildFingerprint(actorUid, input);
  const operationRef = db.doc(`separacao_operacoes/${input.operationId}`);
  const userRef = db.doc(`usuarios/${actorUid}`);
  const orderRef = db.doc(`chamados/${input.pedidoId}`);
  const itemRef = db.doc(`chamados/${input.pedidoId}/itens/${input.itemId}`);
  const receiptRef = db.doc(`chamados/${input.pedidoId}/separacao_confirmacoes/${input.operationId}`);
  const auditRef = db.doc(`auditoria/${input.operationId}`);

  const outcome = await db.runTransaction(async (tx) => {
    metrics.transactionAttempts += 1;
    const [userSnap, orderSnap, operationSnap, receiptSnap, auditSnap] = await Promise.all([
      getInTransaction(tx, userRef, metrics),
      getInTransaction(tx, orderRef, metrics),
      getInTransaction(tx, operationRef, metrics),
      getInTransaction(tx, receiptRef, metrics),
      getInTransaction(tx, auditRef, metrics),
    ]);
    if (!orderSnap.exists) fail(404, "not-found", "Pedido não encontrado.");
    const user = userSnap.exists ? userSnap.data() : null;
    const order = orderSnap.data();
    if (!user || user.status !== "Ativo" || user.perfil !== "Separador de Televendas") {
      fail(403, "permission-denied", "Somente Separador de Televendas ativo pode confirmar itens.");
    }
    if (user.vinculos_unidades_v2 !== true || !user.empresa_id
        || user.empresa_id !== order.empresa_id) {
      fail(403, "permission-denied", "Usuário sem vínculo V2 autorizado para esta empresa.");
    }

    const assignmentRef = db.doc(`usuarios/${actorUid}/unidades/${order.supermercado_id}`);
    const unitRef = db.doc(`supermercados/${order.supermercado_id}`);
    const [assignmentSnap, unitSnap] = await Promise.all([
      getInTransaction(tx, assignmentRef, metrics),
      getInTransaction(tx, unitRef, metrics),
    ]);
    const assignment = assignmentSnap.exists ? assignmentSnap.data() : null;
    const unit = unitSnap.exists ? unitSnap.data() : null;
    assertCurrentSeparator(user, order, assignment, unit);

    if (operationSnap.exists) {
      const prior = operationSnap.data();
      if (prior.actor_uid !== actorUid || prior.request_fingerprint !== fingerprint
          || prior.pedido_id !== input.pedidoId || prior.item_id !== input.itemId
          || prior.receipt_path !== receiptRef.path || prior.audit_path !== auditRef.path) {
        fail(409, "failed-precondition", "operationId já utilizado com parâmetros diferentes.");
      }
      if (!receiptSnap.exists || !auditSnap.exists
          || receiptSnap.data().operation_id !== input.operationId
          || auditSnap.data().operation_id !== input.operationId) {
        fail(500, "data-loss", "Recibo ou auditoria da operação anterior está inconsistente.");
      }
      metrics.outcome = "replayed";
      metrics.committedWrites = 0;
      return { result: prior.result, replayed: true };
    }
    if (receiptSnap.exists || auditSnap.exists) {
      fail(409, "already-exists", "Identificador de confirmação já existe sem operação correspondente.");
    }
    if (order.empresa_id !== unit.empresa_id || order.supermercado_id !== unit.id) {
      fail(403, "permission-denied", "Empresa ou unidade do pedido não corresponde ao cadastro atual.");
    }

    const callRef = input.origem === "empilhadeira" ? db.doc(`chamados/${input.chamadoId}`) : null;
    const forkliftRef = input.origem === "empilhadeira" ? db.doc(`empilhadeiras/${input.chamadoId}`) : null;
    const reads = [getInTransaction(tx, itemRef, metrics)];
    if (callRef) reads.push(getInTransaction(tx, callRef, metrics));
    const [itemSnap, callSnap] = await Promise.all(reads);
    if (!itemSnap.exists) fail(404, "not-found", "Item individualizado não encontrado.");
    const item = itemSnap.data();
    if (item.id !== input.itemId || item.pedido_id !== input.pedidoId
        || item.empresa_id !== order.empresa_id || item.supermercado_id !== order.supermercado_id) {
      fail(409, "failed-precondition", "Item não pertence ao pedido e escopo informados.");
    }

    if (callRef) {
      if (!callSnap.exists) fail(404, "not-found", "Chamado operacional não encontrado.");
      const call = callSnap.data();
      if (call.categoria !== "operacional" || call.status !== "Finalizado"
          || call.pedido_origem_id !== input.pedidoId || call.pedido_origem_item_id !== input.itemId
          || call.empresa_id !== order.empresa_id || call.supermercado_id !== order.supermercado_id
          || typeof call.empilhadeira_id !== "string" || !call.empilhadeira_id) {
        fail(409, "failed-precondition", "Chamado não está finalizado e vinculado ao pedido/item.");
      }
      const actualForkliftRef = db.doc(`empilhadeiras/${call.empilhadeira_id}`);
      const actualForkliftSnap = await getInTransaction(tx, actualForkliftRef, metrics);
      if (!actualForkliftSnap.exists) fail(404, "not-found", "Empilhadeira vinculada não encontrada.");
      const forklift = actualForkliftSnap.data();
      if (forklift.empresa_id !== order.empresa_id || forklift.supermercado_id !== order.supermercado_id) {
        fail(409, "failed-precondition", "Empilhadeira não pertence à empresa/unidade do pedido.");
      }
      if (input.chamadoId !== callRef.id) fail(409, "failed-precondition", "Chamado informado inválido.");
    }

    const requested = item.quantidade_solicitada;
    const found = item.quantidade_encontrada;
    if (!Number.isSafeInteger(requested) || requested <= 0
        || !Number.isSafeInteger(found) || found < 0 || found > requested) {
      fail(500, "data-loss", "Saldo individualizado do item inválido.");
    }
    const nextFound = found + input.quantidade;
    if (!Number.isSafeInteger(nextFound) || nextFound > requested) {
      fail(409, "failed-precondition", "Quantidade excede o saldo disponível.");
    }

    const now = FieldValue.serverTimestamp();
    const result = {
      operationId: input.operationId,
      pedidoId: input.pedidoId,
      itemId: input.itemId,
      chamadoId: input.chamadoId,
      origem: input.origem,
      quantidadeConfirmada: input.quantidade,
      quantidadeEncontrada: nextFound,
      quantidadeFaltante: requested - nextFound,
    };
    metrics.stagedWrites += 4;
    tx.update(itemRef, {
      quantidade_encontrada: nextFound,
      quantidade_faltante: requested - nextFound,
      recebimento_empilhadeira_confirmado: input.origem === "empilhadeira"
        ? true
        : item.recebimento_empilhadeira_confirmado === true,
      ultima_confirmacao_id: input.operationId,
      ultima_auditoria_id: input.operationId,
      atualizado_em: now,
    });
    tx.create(receiptRef, {
      id: input.operationId,
      operation_id: input.operationId,
      request_fingerprint: fingerprint,
      pedido_id: input.pedidoId,
      item_id: input.itemId,
      chamado_id: input.chamadoId,
      origem: input.origem,
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
      actorName: user.nome || "Separador de Televendas",
      entityType: "pedido_item",
      entityId: input.itemId,
      empresa_id: order.empresa_id,
      supermercado_id: order.supermercado_id,
      occurredAt: now,
      details: {
        pedido_id: input.pedidoId,
        item_id: input.itemId,
        chamado_id: input.chamadoId,
        origem: input.origem,
        confirmacao_id: input.operationId,
        quantidade: input.quantidade,
        unidade_medida: item.unidade_medida,
      },
    });
    tx.create(operationRef, {
      operation_id: input.operationId,
      actor_uid: actorUid,
      request_fingerprint: fingerprint,
      pedido_id: input.pedidoId,
      item_id: input.itemId,
      chamado_id: input.chamadoId,
      origem: input.origem,
      receipt_path: receiptRef.path,
      audit_path: auditRef.path,
      result,
      created_at: now,
    });
    metrics.outcome = "created";
    return { result, replayed: false };
  });
  metrics.committedWrites = outcome.replayed ? 0 : 4;
  return outcome;
}

function sendJson(response, status, value) {
  if (response.destroyed || response.writableEnded) return;
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 16 * 1024) {
        reject(new ApiError(413, "payload-too-large", "Payload excede 16 KiB."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new ApiError(400, "invalid-json", "JSON inválido."));
      }
    });
    request.on("error", reject);
  });
}

async function waitForTestBarrier(key) {
  if (!testMode || typeof key !== "string" || !key) return;
  let barrier = barriers.get(key);
  if (!barrier) {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    barrier = { arrivals: 0, promise, release };
    barriers.set(key, barrier);
  }
  barrier.arrivals += 1;
  if (barrier.arrivals >= 2) {
    barrier.release();
    barriers.delete(key);
  }
  await Promise.race([
    barrier.promise,
    new Promise((_, reject) => setTimeout(() => reject(new ApiError(503, "test-barrier-timeout", "Barreira de concorrência local expirou.")), 5000)),
  ]);
}

function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/healthz") {
      return sendJson(response, 200, { ok: true, projectId: PROJECT_ID, emulatorOnly: true });
    }
    if (testMode && request.method === "GET" && url.pathname.startsWith("/__test/metrics/")) {
      const operationId = decodeURIComponent(url.pathname.slice("/__test/metrics/".length));
      const metrics = metricsByOperation.get(operationId);
      return metrics
        ? sendJson(response, 200, metrics)
        : sendJson(response, 404, { error: { code: "not-found", message: "Métrica não encontrada." } });
    }
    if (request.method !== "POST" || url.pathname !== "/v1/separation-confirmations") {
      return sendJson(response, 404, { error: { code: "not-found", message: "Rota não encontrada." } });
    }

    let operationId = null;
    let metrics = null;
    const started = Date.now();
    try {
      const authorization = request.headers.authorization;
      const tokenMatch = typeof authorization === "string" ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
      if (!tokenMatch) fail(401, "unauthenticated", "Bearer token Firebase necessário.");
      const decoded = await auth.verifyIdToken(tokenMatch[1], true);
      const payload = await readJson(request);
      const input = parseInput(payload);
      operationId = input.operationId;
      metrics = metricState(operationId);
      await waitForTestBarrier(request.headers["x-test-concurrency-barrier"]);
      const outcome = await performConfirmation(decoded.uid, input, metrics);
      metrics.elapsedMs = Date.now() - started;
      metricsByOperation.set(operationId, { ...metrics, replayed: outcome.replayed });
      console.info(JSON.stringify({
        event: "confirmation.completed",
        operationId,
        outcome: metrics.outcome,
        transactionAttempts: metrics.transactionAttempts,
        firestoreDocumentReads: metrics.firestoreDocumentReads,
        committedWrites: metrics.committedWrites,
        elapsedMs: metrics.elapsedMs,
      }));
      if (testMode && request.headers["x-test-drop-response"] === "once" && !droppedResponses.has(operationId)) {
        droppedResponses.add(operationId);
        console.warn(JSON.stringify({ event: "confirmation.test_response_lost", operationId }));
        response.destroy();
        return;
      }
      const responseBody = { result: outcome.result };
      if (testMode) responseBody.testMetrics = { ...metrics, replayed: outcome.replayed };
      return sendJson(response, 200, responseBody);
    } catch (error) {
      if (metrics) {
        metrics.outcome = "rejected";
        metrics.elapsedMs = Date.now() - started;
        metricsByOperation.set(operationId, { ...metrics });
      }
      const isAuthError = typeof error?.code === "string" && error.code.startsWith("auth/");
      const status = error instanceof ApiError ? error.status : isAuthError ? 401 : 500;
      const code = error instanceof ApiError ? error.code : isAuthError ? "unauthenticated" : "internal";
      const message = error instanceof ApiError
        ? error.message
        : isAuthError ? "Token Firebase inválido, expirado, revogado ou desativado." : "Falha interna ao confirmar operação.";
      console.warn(JSON.stringify({
        event: "confirmation.rejected",
        operationId,
        code,
        transactionAttempts: metrics?.transactionAttempts ?? 0,
        firestoreDocumentReads: metrics?.firestoreDocumentReads ?? 0,
        committedWrites: metrics?.committedWrites ?? 0,
        elapsedMs: Date.now() - started,
      }));
      return sendJson(response, status, { error: { code, message } });
    }
  });
}

module.exports = {
  createServer,
  __test: { db, auth, getMetrics: (operationId) => metricsByOperation.get(operationId) || null },
};

if (require.main === module) {
  const port = Number(process.env.PORT || "19995");
  const host = process.env.HOST || "127.0.0.1";
  createServer().listen(port, host, () => {
    console.info(JSON.stringify({ event: "prototype.started", host, port, projectId: PROJECT_ID, emulatorOnly: true }));
  });
}
