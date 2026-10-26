import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const environment = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "8080"),
    rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});
const stamp = "2026-10-25T10:00:00.000Z";

async function seed({ orderId = "pedido-a", callIds = ["call-a"], requested = 5, found = 0, userId = "separator-a", company = "empresa-a", unit = "loja-a", orderStatus = "Em separação", callStatus = "Finalizado", profile = "Separador de Televendas", userStatus = "Ativo" } = {}) {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const userRef = doc(db, `usuarios/${userId}`);
    if (!(await getDoc(userRef)).exists()) await setDoc(userRef, {
      perfil: profile, status: userStatus, nome: "Separador A", empresa_id: company, supermercado_id: unit,
    });
    await setDoc(doc(db, `empresas/${company}`), { nome: company, status: "Ativa" });
    await setDoc(doc(db, `supermercados/${unit}`), { empresa_id: company, status: "Ativo", nome: unit });
    await setDoc(doc(db, `chamados/${orderId}`), {
      id: orderId, categoria: "televendas", tipo_servico: "Atendimento Televendas", status: orderStatus,
      empresa_id: company, supermercado_id: unit, solicitante_nome: "Separador A", solicitante_uid: userId,
      operador_nome: "Operador A", atualizado_em: stamp, atualizado_por: "Operador A", criado_em: stamp,
      numero_pedido: `P-${orderId}`,
      itens: [{ produto: "Produto A", unidadeMedida: "Caixa", quantidadeSolicitada: requested, quantidadeEncontrada: found, quantidadeFaltante: requested - found }],
      total_solicitado: requested, total_encontrado: found, percentual_atendido: requested ? Math.round(found / requested * 100) : 0,
      confirmacoes_empilhadeira: {},
    });
    for (const callId of callIds) {
      await setDoc(doc(db, `chamados/${callId}`), {
        id: callId, categoria: "operacional", tipo_servico: "Movimentação", status: callStatus,
        empresa_id: company, supermercado_id: unit, solicitante_uid: userId, solicitante_nome: "Separador A",
        operador_nome: "Operador B", criado_em: stamp, finalizado_em: stamp,
        pedido_origem_id: orderId, pedido_origem_item_index: 0, pedido_origem_produto: "Produto A",
        localizacao_pallet: "Pallet A", empilhadeira_id: null, empilhadeira_identificacao: null,
      });
    }
  });
}

function buildReceipt(order, call, uid, quantity, reason, itemIndex = 0) {
  const current = order.itens[itemIndex];
  const next = current.quantidadeEncontrada + quantity;
  const orderId = order.id;
  const callId = call.id;
  const auditId = `audit-${callId}`;
  const updatedAt = new Date().toISOString();
  const receipt = {
    id: callId, pedido_id: orderId, chamado_id: callId, item_index: itemIndex,
    produto: current.produto, empresa_id: order.empresa_id, supermercado_id: order.supermercado_id,
    actor_uid: uid, actor_nome: "Separador A", quantidade: quantity, unidade_medida: current.unidadeMedida,
    justificativa: reason || null, confirmado_em: serverTimestamp(),
  };
  const confirmationMap = {
    ...(order.confirmacoes_empilhadeira ?? {}),
    [callId]: { item_index: itemIndex, quantidade: quantity, unidade_medida: current.unidadeMedida },
  };
  const updatedOrder = {
    itens: order.itens.map((item, index) => index === itemIndex ? {
      ...item, quantidadeEncontrada: next, quantidadeFaltante: item.quantidadeSolicitada - next,
    } : item),
    total_encontrado: order.total_encontrado - current.quantidadeEncontrada + next,
    percentual_atendido: Math.round((order.total_encontrado - current.quantidadeEncontrada + next) / order.total_solicitado * 100),
    confirmacoes_empilhadeira: confirmationMap, ultima_separacao_confirmacao_id: callId,
    ultima_auditoria_atualizacao_id: auditId, atualizado_em: updatedAt,
    atualizado_por: "Separador A", operador_nome: "Separador A",
  };
  const audit = {
    action: "chamado_atualizado", actorUid: uid, actorName: "Separador A",
    entityType: "chamado", entityId: orderId, empresa_id: order.empresa_id,
    supermercado_id: order.supermercado_id, occurredAt: updatedAt,
    details: {
      empresa_id: order.empresa_id, supermercado_id: order.supermercado_id,
      statusAnterior: order.status, statusAtual: order.status,
      operador_nome: "Separador A", atualizado_em: updatedAt, categoria: "televendas",
      separacao_confirmacao_id: callId, item_index: itemIndex, quantidade: quantity, unidade_medida: current.unidadeMedida,
    },
  };
  return { receipt, updatedOrder, audit, auditId };
}

async function confirm(db, orderId, callId, quantity, reason = "") {
  const orderRef = doc(db, `chamados/${orderId}`);
  const callRef = doc(db, `chamados/${callId}`);
  const receiptRef = doc(db, `chamados/${orderId}/separacao_confirmacoes/${callId}`);
  const auditRef = doc(collection(db, "auditoria"), `audit-${callId}`);
  return runTransaction(db, async transaction => {
    const [orderSnapshot, callSnapshot, receiptSnapshot] = await Promise.all([
      transaction.get(orderRef), transaction.get(callRef), transaction.get(receiptRef),
    ]);
    if (!orderSnapshot.exists() || !callSnapshot.exists() || receiptSnapshot.exists()) throw new Error("invalid or duplicate");
    const order = { ...orderSnapshot.data(), id: orderSnapshot.id };
    const call = { ...callSnapshot.data(), id: callSnapshot.id };
    const { receipt, updatedOrder, audit } = buildReceipt(order, call, "separator-a", quantity, reason);
    transaction.update(orderRef, updatedOrder);
    transaction.set(receiptRef, receipt);
    transaction.set(auditRef, audit);
  });
}

before(async () => {
  await seed({ callIds: ["call-a", "call-b", "call-race-a", "call-race-b"] });
  await seed({ orderId: "pedido-foreign", callIds: ["call-foreign"], company: "empresa-b", unit: "loja-b" });
  await seed({ orderId: "pedido-other-unit", callIds: ["call-other-unit"], unit: "loja-other" });
  await seed({ orderId: "pedido-operator", callIds: ["call-operator"], userId: "operator-test", profile: "Operador" });
  await seed({ orderId: "pedido-inactive", callIds: ["call-inactive"], userId: "separator-inactive", userStatus: "Inativo" });
  await seed({ orderId: "pedido-active-call", callIds: ["call-active"], callStatus: "Em atendimento" });
  await seed({ orderId: "pedido-race", callIds: ["call-race-a", "call-race-b"], requested: 5, found: 0 });
});
after(async () => environment.cleanup());

test("a scoped Separador atomically confirms a partial quantity, immutable receipt and audit", async () => {
  const db = environment.authenticatedContext("separator-a").firestore();
  await assertSucceeds(confirm(db, "pedido-a", "call-a", 3));
  const order = (await getDoc(doc(db, "chamados/pedido-a"))).data();
  assert.equal(order.itens[0].quantidadeEncontrada, 3);
  assert.equal(order.itens[0].quantidadeFaltante, 2);
  assert.equal(order.status, "Em separação");
  assert.equal(order.confirmacoes_empilhadeira["call-a"].quantidade, 3);
  const receipt = (await getDoc(doc(db, "chamados/pedido-a/separacao_confirmacoes/call-a"))).data();
  assert.equal(receipt.actor_uid, "separator-a");
  assert.equal(receipt.unidade_medida, "Caixa");
  assert.ok(receipt.confirmado_em.toDate());
  await assert.rejects(confirm(db, "pedido-a", "call-a", 1), /invalid or duplicate/);
});

test("zero quantity requires a reason and can be confirmed", async () => {
  const db = environment.authenticatedContext("separator-a").firestore();
  await assertFails(confirm(db, "pedido-a", "call-b", 0));
  await assertSucceeds(confirm(db, "pedido-a", "call-b", 0, "Pallet não recebido"));
  assert.equal((await getDoc(doc(db, "chamados/pedido-a"))).data().itens[0].quantidadeEncontrada, 3);
});

test("foreign company, other unit, inactive user, Operator and non-final call are denied", async () => {
  await assertFails(confirm(environment.authenticatedContext("separator-a").firestore(), "pedido-foreign", "call-foreign", 1));
  await assertFails(confirm(environment.authenticatedContext("separator-a").firestore(), "pedido-other-unit", "call-other-unit", 1));
  await assertFails(confirm(environment.authenticatedContext("separator-inactive").firestore(), "pedido-inactive", "call-inactive", 1));
  await assertFails(confirm(environment.authenticatedContext("operator-test").firestore(), "pedido-operator", "call-operator", 1));
  await assertFails(confirm(environment.authenticatedContext("separator-a").firestore(), "pedido-a", "call-active", 1));
});

test("the transaction prevents exceeding requested quantity and serializes concurrent calls", async () => {
  const db = environment.authenticatedContext("separator-a").firestore();
  const results = await Promise.allSettled([
    confirm(db, "pedido-race", "call-race-a", 4),
    confirm(db, "pedido-race", "call-race-b", 4),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await getDoc(doc(db, "chamados/pedido-race"))).data().itens[0].quantidadeEncontrada, 4);
});

test("manual edits cannot reduce quantity below already confirmed totals", async () => {
  const db = environment.authenticatedContext("separator-a").firestore();
  const orderRef = doc(db, "chamados/pedido-a");
  const snapshot = await getDoc(orderRef);
  const order = snapshot.data();
  const updated = [{ ...order.itens[0], quantidadeEncontrada: 1, quantidadeFaltante: 4 }];
  await assertFails((async () => {
    const { writeBatch } = await import("firebase/firestore");
    const batch = writeBatch(db);
    batch.update(orderRef, { itens: updated, status: "Pronto" });
    await batch.commit();
  })());
});

test("confirmation markers are append-only and prior marker values cannot be altered", async () => {
  await seed({ orderId: "pedido-markers", callIds: ["call-markers"] });
  const db = environment.authenticatedContext("separator-a").firestore();
  await assertSucceeds(confirm(db, "pedido-markers", "call-markers", 3));
  const orderRef = doc(db, "chamados/pedido-markers");
  const confirmed = (await getDoc(orderRef)).data();
  const marker = confirmed.confirmacoes_empilhadeira["call-markers"];
  await assertFails(updateDoc(orderRef, { confirmacoes_empilhadeira: {} }));
  await assertFails(updateDoc(orderRef, { confirmacoes_empilhadeira: { "call-markers": { ...marker, quantidade: 2 } } }));
});

test("a receipt cannot be forged, detached from item quantities, or paired with altered aggregates", async () => {
  const db = environment.authenticatedContext("separator-a").firestore();
  const orderRef = doc(db, "chamados/pedido-a");
  const callRef = doc(db, "chamados/call-a");
  const receiptRef = doc(db, "chamados/pedido-a/separacao_confirmacoes/call-a");
  const snapshot = await getDoc(orderRef);
  const order = snapshot.data();
  const { receipt, updatedOrder, audit } = buildReceipt(order, { id: "call-a" }, "separator-a", 1, "");
  const forged = { ...receipt, quantidade: 4 };
  const batch = writeBatch(db);
  batch.update(orderRef, { ...updatedOrder, total_encontrado: 999 });
  batch.set(receiptRef, forged);
  batch.set(doc(collection(db, "auditoria"), "audit-call-a"), audit);
  await assertFails(batch.commit());
});

test("a completed order cannot receive a new separation confirmation", async () => {
  await seed({ orderId: "pedido-pronto", callIds: ["call-pronto"], orderStatus: "Pronto" });
  const db = environment.authenticatedContext("separator-a").firestore();
  await assertFails(confirm(db, "pedido-pronto", "call-pronto", 1));
});
