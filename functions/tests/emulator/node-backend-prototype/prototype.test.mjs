import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";

const projectId = "demo-patio-confirmation";
const serverPort = 19995;
const serverApp = initializeApp({ projectId }, "prototype-tests");
const adminAuth = getAuth(serverApp);
const adminDb = getFirestore(serverApp);
const rulesSource = await readFile(new URL("../../../../firestore.rules", import.meta.url), "utf8");
let rulesEnv;
let serverProcess;
let readyPromise;
const fixtures = new Map();
const tokens = new Map();

function uuid() {
  return crypto.randomUUID();
}

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch(`http://127.0.0.1:${serverPort}/healthz`);
      if (response.ok) return;
    } catch { /* server ainda iniciando */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Servidor de protótipo não iniciou.");
}

async function emulatorToken(uid) {
  if (tokens.has(uid)) return tokens.get(uid);
  const email = `${uid}@example.test`;
  await adminAuth.createUser({ uid, email, password: "LocalOnly!12345" });
  const response = await fetch("http://127.0.0.1:19991/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-api-key", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "LocalOnly!12345", returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  tokens.set(uid, body.idToken);
  return body.idToken;
}

async function fixture(label, profile = "Separador de Televendas", overrides = {}) {
  const uid = `user-${label}`;
  const pedidoId = `pedido-${label}`;
  const itemId = `item-${label}`;
  const callId = `call-${label}`;
  const empresaId = overrides.empresaId || "empresa-a";
  const unitId = overrides.unitId || "unidade-a";
  const user = {
    id: uid, nome: "Separador sintético", perfil: profile, status: "Ativo", empresa_id: empresaId,
    vinculos_unidades_v2: true, ...overrides.user,
  };
  await adminDb.doc(`usuarios/${uid}`).set(user);
  await adminDb.doc(`usuarios/${uid}/unidades/${unitId}`).set({
    empresa_id: empresaId, supermercado_id: unitId, status: "Ativo", ...overrides.assignment,
  });
  await adminDb.doc(`supermercados/${unitId}`).set({ id: unitId, empresa_id: empresaId, status: "Ativo" });
  await adminDb.doc(`chamados/${pedidoId}`).set({
    id: pedidoId, categoria: "televendas", status: "Em separação", empresa_id: empresaId,
    supermercado_id: unitId, modelo_itens: "individual", itens: [{ produto: "legado sintético", quantidadeSolicitada: 10 }],
  });
  await adminDb.doc(`chamados/${pedidoId}/itens/${itemId}`).set({
    id: itemId, pedido_id: pedidoId, empresa_id: empresaId, supermercado_id: unitId,
    produto: "Produto sintético", unidade_medida: "Unidade", quantidade_solicitada: 10,
    quantidade_encontrada: 0, quantidade_faltante: 10, recebimento_empilhadeira_confirmado: false,
  });
  await adminDb.doc(`empilhadeiras/empilhadeira-${label}`).set({ empresa_id: empresaId, supermercado_id: unitId });
  await adminDb.doc(`chamados/${callId}`).set({
    id: callId, categoria: "operacional", tipo_servico: "Solicitar Empilhadeira", status: "Finalizado",
    empresa_id: empresaId, supermercado_id: unitId, empilhadeira_id: `empilhadeira-${label}`,
    pedido_origem_id: pedidoId, pedido_origem_item_id: itemId,
  });
  const value = { uid, pedidoId, itemId, callId, empresaId, unitId };
  fixtures.set(label, value);
  return value;
}

function payload(f, values = {}) {
  return {
    operationId: uuid(), pedidoId: f.pedidoId, itemId: f.itemId,
    origem: "direta", quantidade: 1, justificativa: "", ...values,
  };
}

async function post(body, token, headers = {}) {
  return fetch(`http://127.0.0.1:${serverPort}/v1/separation-confirmations`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
}

async function dbState(f, operationId) {
  const [item, receipt, audit, operation] = await Promise.all([
    adminDb.doc(`chamados/${f.pedidoId}/itens/${f.itemId}`).get(),
    adminDb.doc(`chamados/${f.pedidoId}/separacao_confirmacoes/${operationId}`).get(),
    adminDb.doc(`auditoria/${operationId}`).get(),
    adminDb.doc(`separacao_operacoes/${operationId}`).get(),
  ]);
  return { item: item.data(), receipt: receipt.exists, audit: audit.exists, operation: operation.exists };
}

async function operationMetrics(operationId) {
  const response = await fetch(`http://127.0.0.1:${serverPort}/__test/metrics/${operationId}`);
  assert.equal(response.ok, true);
  return response.json();
}

before(async () => {
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith("127.0.0.1:"), true);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:"), true);
  rulesEnv = await initializeTestEnvironment({
    projectId, firestore: { host: "127.0.0.1", port: 19993, rules: rulesSource },
  });
  serverProcess = spawn(process.execPath, [fileURLToPath(new URL("./index.js", import.meta.url))], {
    env: {
      ...process.env, PORT: String(serverPort), HOST: "127.0.0.1", PATIO_DEMO_PROJECT_ID: projectId,
      PATIO_PROTOTYPE_TEST_MODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  serverProcess.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  serverProcess.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  readyPromise = waitForHealth().catch((error) => { throw new Error(`${error.message}\n${logs}`); });
  await readyPromise;
});

after(async () => {
  serverProcess?.kill("SIGTERM");
  await rulesEnv?.cleanup();
  await deleteApp(serverApp);
});

test("token inválido é rejeitado antes de qualquer transação", async () => {
  const f = await fixture("invalid-token");
  const response = await post(payload(f), "token-falso");
  assert.equal(response.status, 401);
});

test("ID token revogado é rejeitado pela verificação de revogação do Admin SDK", async () => {
  const f = await fixture("revoked-token");
  const token = await emulatorToken(f.uid);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await adminAuth.revokeRefreshTokens(f.uid);
  const response = await post(payload(f), token);
  assert.equal(response.status, 401);
});

test("usuário inativo e perfis não Separador são recusados", async () => {
  for (const [label, profile, user] of [
    ["inactive", "Separador de Televendas", { status: "Inativo" }],
    ["manager", "Gerente da Empresa", {}], ["operator", "Operador", {}], ["televendas", "Televendas", {}],
  ]) {
    const f = await fixture(label, profile, { user });
    const response = await post(payload(f), await emulatorToken(f.uid));
    assert.equal(response.status, 403, `${label}: ${await response.text()}`);
  }
});

test("separador ativo com vínculo V2 confirma e grava quatro documentos atomicamente", async () => {
  const f = await fixture("direct-ok");
  const request = payload(f, { quantidade: 3 });
  const response = await post(request, await emulatorToken(f.uid));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.result.quantidadeEncontrada, 3);
  const state = await dbState(f, request.operationId);
  assert.equal(state.item.quantidade_encontrada, 3);
  assert.equal(state.receipt && state.audit && state.operation, true);
  assert.equal(body.testMetrics.firestoreDocumentReads, 8);
  assert.equal(body.testMetrics.committedWrites, 4);
  console.log(JSON.stringify({ event: "measured.successful-confirmation", ...body.testMetrics }));
});

test("vínculo removido, empresa diferente e unidade de outra empresa são recusados", async () => {
  const removed = await fixture("removed-link", "Separador de Televendas", { assignment: { status: "Inativo" } });
  const otherCompany = await fixture("other-company", "Separador de Televendas", {
    user: { empresa_id: "empresa-b" }, assignment: { empresa_id: "empresa-b" },
  });
  for (const f of [removed, otherCompany]) {
    const response = await post(payload(f), await emulatorToken(f.uid));
    assert.equal(response.status, 403);
  }
});

test("caminho por empilhadeira exige chamado finalizado e correspondência exata", async () => {
  const f = await fixture("forklift-ok");
  const request = payload(f, { origem: "empilhadeira", chamadoId: f.callId, quantidade: 2 });
  const response = await post(request, await emulatorToken(f.uid));
  assert.equal(response.status, 200, await response.text());
  assert.equal((await adminDb.doc(`chamados/${f.pedidoId}/itens/${f.itemId}`).get()).data().quantidade_encontrada, 2);
  await adminDb.doc(`chamados/${f.callId}`).update({ status: "Pronto" });
  const invalid = payload(f, { origem: "empilhadeira", chamadoId: f.callId, quantidade: 1 });
  assert.equal((await post(invalid, await emulatorToken(f.uid))).status, 409);
});

test("repetição idempotente não duplica recibo/auditoria e fingerprint diferente é recusado", async () => {
  const f = await fixture("idempotency");
  const request = payload(f, { quantidade: 2 });
  const token = await emulatorToken(f.uid);
  assert.equal((await post(request, token)).status, 200);
  const replay = await post(request, token);
  const replayBody = await replay.json();
  assert.equal(replay.status, 200);
  assert.equal(replayBody.testMetrics.replayed, true);
  assert.equal(replayBody.testMetrics.committedWrites, 0);
  const changed = await post({ ...request, quantidade: 3 }, token);
  assert.equal(changed.status, 409);
  const state = await dbState(f, request.operationId);
  assert.equal(state.item.quantidade_encontrada, 2);
  assert.equal(state.receipt && state.audit && state.operation, true);
});

test("duas confirmações concorrentes em caminhos diferentes não excedem saldo", async () => {
  const f = await fixture("race", "Separador de Televendas");
  const token = await emulatorToken(f.uid);
  const direct = payload(f, { quantidade: 6 });
  const forklift = payload(f, { origem: "empilhadeira", chamadoId: f.callId, quantidade: 6 });
  const [a, b] = await Promise.all([
    post(direct, token, { "x-test-concurrency-barrier": "race-cross-path" }),
    post(forklift, token, { "x-test-concurrency-barrier": "race-cross-path" }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const stateA = await dbState(f, direct.operationId);
  const stateB = await dbState(f, forklift.operationId);
  assert.equal(stateA.item.quantidade_encontrada, 6);
  assert.equal(stateA.receipt || stateB.receipt, true);
  assert.equal(Number(stateA.receipt) + Number(stateB.receipt), 1);
  console.log(JSON.stringify({
    event: "measured.direct-forklift-race",
    attempts: await Promise.all([direct, forklift].map((request) => operationMetrics(request.operationId))),
  }));
});

test("duas confirmações diretas simultâneas não excedem o saldo", async () => {
  const f = await fixture("race-direct");
  const token = await emulatorToken(f.uid);
  const first = payload(f, { quantidade: 7 });
  const second = payload(f, { quantidade: 7 });
  const [a, b] = await Promise.all([
    post(first, token, { "x-test-concurrency-barrier": "race-direct-only" }),
    post(second, token, { "x-test-concurrency-barrier": "race-direct-only" }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const firstState = await dbState(f, first.operationId);
  const secondState = await dbState(f, second.operationId);
  assert.equal(firstState.item.quantidade_encontrada, 7);
  assert.equal(Number(firstState.receipt) + Number(secondState.receipt), 1);
  console.log(JSON.stringify({
    event: "measured.direct-direct-race",
    attempts: await Promise.all([first, second].map((request) => operationMetrics(request.operationId))),
  }));
});

test("resposta perdida após commit recupera o resultado com mesmo operationId", async () => {
  const f = await fixture("lost-response");
  const request = payload(f, { quantidade: 4 });
  const token = await emulatorToken(f.uid);
  await assert.rejects(post(request, token, { "x-test-drop-response": "once" }));
  const retry = await post(request, token);
  const body = await retry.json();
  assert.equal(retry.status, 200);
  assert.equal(body.testMetrics.replayed, true);
  assert.equal((await dbState(f, request.operationId)).item.quantidade_encontrada, 4);
});

test("cliente comum não pode alterar saldo, array legado, recibo ou auditoria pelas Rules atuais", async () => {
  const f = await fixture("rules-client");
  await rulesEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`usuarios/${f.uid}`).set({
      id: f.uid, perfil: "Separador de Televendas", status: "Ativo", empresa_id: f.empresaId,
      supermercado_id: f.unitId, supermercado_ids: [f.unitId], vinculos_unidades_v2: true,
    });
    await db.doc(`usuarios/${f.uid}/unidades/${f.unitId}`).set({
      empresa_id: f.empresaId, supermercado_id: f.unitId, status: "Ativo",
    });
  });
  const seedReceiptId = uuid();
  const seedAuditId = uuid();
  await adminDb.doc(`chamados/${f.pedidoId}/separacao_confirmacoes/${seedReceiptId}`).set({
    id: seedReceiptId, operation_id: seedReceiptId, pedido_id: f.pedidoId, item_id: f.itemId,
    actor_uid: f.uid, empresa_id: f.empresaId, supermercado_id: f.unitId, quantidade: 1,
  });
  await adminDb.doc(`auditoria/${seedAuditId}`).set({
    action: "separacao_item_confirmada", operation_id: seedReceiptId, actorUid: f.uid,
    entityType: "pedido_item", entityId: f.itemId, empresa_id: f.empresaId,
    supermercado_id: f.unitId, details: { pedido_id: f.pedidoId, item_id: f.itemId },
  });
  const client = rulesEnv.authenticatedContext(f.uid).firestore();
  const receiptId = uuid();
  const auditId = uuid();
  const attempts = [
    updateDoc(doc(client, `chamados/${f.pedidoId}`), { itens: [{ produto: "forjado" }] }),
    updateDoc(doc(client, `chamados/${f.pedidoId}`), { total_encontrado: 10 }),
    updateDoc(doc(client, `chamados/${f.pedidoId}/itens/${f.itemId}`), { quantidade_encontrada: 10 }),
    setDoc(doc(client, `chamados/${f.pedidoId}/separacao_confirmacoes/${receiptId}`), { id: receiptId }),
    updateDoc(doc(client, `chamados/${f.pedidoId}/separacao_confirmacoes/${seedReceiptId}`), { quantidade: 2 }),
    deleteDoc(doc(client, `chamados/${f.pedidoId}/separacao_confirmacoes/${seedReceiptId}`)),
    setDoc(doc(client, `auditoria/${auditId}`), { action: "adulterada" }),
    updateDoc(doc(client, `auditoria/${auditId}`), { action: "adulterada" }),
    updateDoc(doc(client, `auditoria/${seedAuditId}`), { action: "adulterada" }),
    deleteDoc(doc(client, `auditoria/${seedAuditId}`)),
  ];
  const results = await Promise.all(attempts.map((promise) => assertFails(promise)));
  assert.equal(results.length, 10);
});
