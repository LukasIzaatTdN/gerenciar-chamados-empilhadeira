import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";

const rules = await readFile(new URL("./individual-order-items.rules", import.meta.url), "utf8");
const projectId = "demo-patio-individual-items";
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 18631, rules },
  });
});
after(async () => environment?.cleanup());

const itemData = (id, product, requested) => ({
  id, pedido_id: "pedido-1", empresa_id: "empresa-1", supermercado_id: "loja-1",
  produto: product, unidade_medida: "Unidade", quantidade_solicitada: requested,
  quantidade_encontrada: 0, quantidade_faltante: requested,
  recebimento_empilhadeira_confirmado: false,
  ultima_confirmacao_id: null, ultima_auditoria_id: null,
});

async function seed({
  suffix = "1", profile = "Separador de Televendas", unitId = "loja-1",
  companyId = "empresa-1", userUnitId = unitId, userCompanyId = companyId,
  status = "Em separação", callStatus = "Finalizado",
  items = [itemData("item-a", "Arroz", 5), itemData("item-b", "Feijão", 3)],
} = {}) {
  const pedidoId = `pedido-${suffix}`;
  const callId = `call-${suffix}`;
  const uid = `user-${suffix}`;
  const mappedItems = items.map((value) => ({
    ...value, pedido_id: pedidoId, empresa_id: companyId, supermercado_id: unitId,
  }));
  await environment.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `empresas/${companyId}`), { status: "Ativa" });
    await setDoc(doc(db, `supermercados/${unitId}`), { empresa_id: companyId, status: "Ativo" });
    await setDoc(doc(db, `usuarios/${uid}`), {
      perfil: profile, status: "Ativo", empresa_id: userCompanyId, supermercado_id: userUnitId,
    });
    await setDoc(doc(db, `chamados/${pedidoId}`), {
      id: pedidoId, categoria: "televendas", status, empresa_id: companyId,
      supermercado_id: unitId, operador_progresso: { status: "Separando" },
    });
    for (const item of mappedItems) await setDoc(doc(db, `chamados/${pedidoId}/itens/${item.id}`), item);
    await setDoc(doc(db, `chamados/${callId}`), {
      id: callId, categoria: "operacional", status: callStatus,
      empresa_id: companyId, supermercado_id: unitId,
      pedido_origem_id: pedidoId, pedido_origem_item_id: mappedItems[0]?.id ?? "legacy-item-0",
    });
  });
  return { pedidoId, callId, uid, unitId, companyId, items: mappedItems };
}

function refs(ctx, data, callId = data.callId, itemId = data.items[0]?.id ?? "legacy-item-0") {
  const db = ctx.firestore();
  return {
    order: doc(db, `chamados/${data.pedidoId}`),
    item: doc(db, `chamados/${data.pedidoId}/itens/${itemId}`),
    call: doc(db, `chamados/${callId}`),
    receipt: doc(db, `chamados/${data.pedidoId}/separacao_confirmacoes/${callId}`),
  };
}

async function confirm(ctx, data, {
  callId = data.callId, itemId = data.items[0].id, quantity = 2,
  justification = "", mutateItem = (value) => value, writeAudit = true, validateClient = true,
} = {}) {
  const db = ctx.firestore();
  const r = refs(ctx, data, callId, itemId);
  const auditRef = doc(collection(db, "auditoria"));
  return runTransaction(db, async (tx) => {
    const [orderSnap, itemSnap, callSnap, receiptSnap] = await Promise.all([
      tx.get(r.order), tx.get(r.item), tx.get(r.call), tx.get(r.receipt),
    ]);
    assert.ok(orderSnap.exists() && itemSnap.exists() && callSnap.exists());
    const item = itemSnap.data();
    const call = callSnap.data();
    if (receiptSnap.exists()) {
      const existing = receiptSnap.data();
      assert.equal(existing.actor_uid, data.uid);
      assert.equal(existing.item_id, itemId);
      assert.equal(existing.quantidade, quantity, "same id cannot be replayed with different quantity");
      assert.equal(existing.justificativa ?? "", justification.trim());
      return "replayed";
    }
    if (validateClient) {
      assert.equal(orderSnap.data().status, "Em separação");
      assert.equal(call.status, "Finalizado");
      assert.equal(call.pedido_origem_id, data.pedidoId);
      assert.equal(call.pedido_origem_item_id, itemId);
      assert.ok(quantity >= 0 && quantity <= item.quantidade_solicitada - item.quantidade_encontrada);
      assert.ok(quantity > 0 || justification.trim().length > 0);
    }
    const next = mutateItem({
      ...item,
      quantidade_encontrada: item.quantidade_encontrada + quantity,
      quantidade_faltante: item.quantidade_solicitada - item.quantidade_encontrada - quantity,
      recebimento_empilhadeira_confirmado: true,
      ultima_confirmacao_id: callId,
      ultima_auditoria_id: auditRef.id,
    });
    tx.update(r.item, next);
    tx.set(r.receipt, {
      id: callId, pedido_id: data.pedidoId, item_id: itemId, chamado_id: callId,
      empresa_id: data.companyId, supermercado_id: data.unitId, actor_uid: data.uid,
      quantidade: quantity, unidade_medida: item.unidade_medida,
      ...(justification.trim() ? { justificativa: justification.trim() } : {}),
      audit_id: auditRef.id, confirmado_em: serverTimestamp(),
    });
    if (writeAudit) tx.set(auditRef, {
      action: "separacao_item_confirmada", actorUid: data.uid, entityType: "pedido_item",
      entityId: itemId, pedido_id: data.pedidoId, confirmacao_id: callId,
      empresa_id: data.companyId, supermercado_id: data.unitId,
      occurredAt: serverTimestamp(),
    });
    return "created";
  });
}

test("allows a valid partial confirmation with receipt and correlated immutable audit", async () => {
  const data = await seed({ suffix: "valid" });
  const ctx = environment.authenticatedContext(data.uid);
  assert.equal(await confirm(ctx, data, { quantity: 2 }), "created");
  const r = refs(ctx, data);
  const item = (await getDoc(r.item)).data();
  assert.equal(item.quantidade_encontrada, 2);
  assert.equal(item.quantidade_faltante, 3);
  assert.equal((await getDoc(r.receipt)).data().quantidade, 2);
  assert.deepEqual((await getDoc(r.order)).data().operador_progresso, { status: "Separando" });
  await assertFails(deleteDoc(r.receipt));
  await assertFails(setDoc(r.receipt, { fake: true }));
});

test("replays an identical operation without duplicate receipt or audit; rejects same id with changed parameters", async () => {
  const data = await seed({ suffix: "idempotent" });
  const ctx = environment.authenticatedContext(data.uid);
  assert.equal(await confirm(ctx, data, { quantity: 2 }), "created");
  assert.equal(await confirm(ctx, data, { quantity: 2 }), "replayed");
  await assert.rejects(confirm(ctx, data, { quantity: 3 }), /same id cannot be replayed/);
  await assertFails(setDoc(refs(ctx, data).receipt, { forged: true }));
  let auditCount = 0;
  await environment.withSecurityRulesDisabled(async (admin) => {
    const snapshot = await admin.firestore().collection("auditoria").where("pedido_id", "==", data.pedidoId).get();
    auditCount = snapshot.size;
  });
  assert.equal(auditCount, 1);
});

test("rules reject an over-balance item update and a mismatched linked call", async () => {
  const data = await seed({ suffix: "over" });
  const ctx = environment.authenticatedContext(data.uid);
  await assertFails(confirm(ctx, data, { quantity: 99, validateClient: false }));
  const wrongCall = "call-wrong-link";
  await environment.withSecurityRulesDisabled((admin) => setDoc(doc(admin.firestore(), `chamados/${wrongCall}`), {
    status: "Finalizado", categoria: "operacional", empresa_id: data.companyId,
    supermercado_id: data.unitId, pedido_origem_id: data.pedidoId, pedido_origem_item_id: "item-b",
  }));
  await assertFails(confirm(ctx, data, { callId: wrongCall, quantity: 1, validateClient: false }));
});

test("zero quantity requires a justification; justified zero preserves numeric balance", async () => {
  const data = await seed({ suffix: "zero" });
  const ctx = environment.authenticatedContext(data.uid);
  await assertFails(confirm(ctx, data, { quantity: 0, validateClient: false }));
  assert.equal(await confirm(ctx, data, { quantity: 0, justification: "Sem estoque" }), "created");
  assert.equal((await getDoc(refs(ctx, data).item)).data().quantidade_encontrada, 0);
});

test("denies wrong order status, inactive unit, wrong company, and unauthorized profile", async () => {
  const closed = await seed({ suffix: "closed", status: "Pronto" });
  await assertFails(confirm(environment.authenticatedContext(closed.uid), closed, { quantity: 1, validateClient: false }));
  const inactive = await seed({ suffix: "inactive" });
  await environment.withSecurityRulesDisabled((admin) =>
    setDoc(doc(admin.firestore(), `supermercados/${inactive.unitId}`), { empresa_id: inactive.companyId, status: "Inativo" }));
  await assertFails(confirm(environment.authenticatedContext(inactive.uid), inactive, { quantity: 1 }));
  const wrongProfile = await seed({ suffix: "operator", profile: "Operador" });
  await assertFails(confirm(environment.authenticatedContext(wrongProfile.uid), wrongProfile, { quantity: 1 }));
  const inactiveUser = await seed({ suffix: "inactive-user" });
  await environment.withSecurityRulesDisabled((admin) => updateDoc(
    doc(admin.firestore(), `usuarios/${inactiveUser.uid}`), { status: "Inativo" },
  ));
  await assertFails(confirm(environment.authenticatedContext(inactiveUser.uid), inactiveUser, { quantity: 1 }));
  const wrongUnit = await seed({ suffix: "wrong-unit", userUnitId: "loja-2" });
  await environment.withSecurityRulesDisabled((admin) => setDoc(doc(admin.firestore(), "supermercados/loja-2"), {
    empresa_id: wrongUnit.companyId, status: "Ativo",
  }));
  await assertFails(confirm(environment.authenticatedContext(wrongUnit.uid), wrongUnit, { quantity: 1 }));
  const wrongCompany = await seed({ suffix: "wrong-company", userCompanyId: "empresa-2" });
  await environment.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await setDoc(doc(db, "empresas/empresa-2"), { status: "Ativa" });
    await setDoc(doc(db, "supermercados/loja-2"), { empresa_id: "empresa-2", status: "Ativo" });
  });
  await assertFails(confirm(environment.authenticatedContext(wrongCompany.uid), wrongCompany, { quantity: 1 }));
  const unfinishedCall = await seed({ suffix: "unfinished-call", callStatus: "Em atendimento" });
  await assertFails(confirm(environment.authenticatedContext(unfinishedCall.uid), unfinishedCall, {
    quantity: 1, validateClient: false,
  }));
});

test("prevents changing a different item or writing aggregates on the parent order", async () => {
  const data = await seed({ suffix: "isolation" });
  const ctx = environment.authenticatedContext(data.uid);
  const unrelated = refs(ctx, data, data.callId, "item-b");
  await assertFails(updateDoc(unrelated.item, { quantidade_encontrada: 1, quantidade_faltante: 2 }));
  await assertFails(updateDoc(unrelated.item, { produto: "Produto adulterado" }));
  await assertFails(updateDoc(refs(ctx, data).order, { total_encontrado: 999, percentual_atendido: 100 }));
});

test("denies missing audit and a forged receipt with unrelated data", async () => {
  const data = await seed({ suffix: "audit" });
  const ctx = environment.authenticatedContext(data.uid);
  await assertFails(confirm(ctx, data, { quantity: 1, writeAudit: false }));
  const r = refs(ctx, data);
  await assertFails(setDoc(r.receipt, {
    id: data.callId, pedido_id: data.pedidoId, item_id: "item-b", chamado_id: data.callId,
    empresa_id: data.companyId, supermercado_id: data.unitId, actor_uid: data.uid,
    quantidade: 1, unidade_medida: "Unidade", audit_id: "forged", confirmado_em: serverTimestamp(),
    extra: "forged",
  }));
});

test("two different calls racing for the same balance cannot over-confirm", async () => {
  const data = await seed({ suffix: "race", items: [itemData("item-a", "Arroz", 3)] });
  const secondCall = "call-race-second";
  await environment.withSecurityRulesDisabled((admin) => setDoc(doc(admin.firestore(), `chamados/${secondCall}`), {
    id: secondCall, categoria: "operacional", status: "Finalizado", empresa_id: data.companyId,
    supermercado_id: data.unitId, pedido_origem_id: data.pedidoId, pedido_origem_item_id: "item-a",
  }));
  const ctx = environment.authenticatedContext(data.uid);
  const outcomes = await Promise.allSettled([
    confirm(ctx, data, { quantity: 3 }),
    confirm(ctx, data, { callId: secondCall, quantity: 3 }),
  ]);
  assert.equal(outcomes.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal((await getDoc(refs(ctx, data).item)).data().quantidade_encontrada, 3);
});

test("legacy array orders remain readable while individual item docs are absent", async () => {
  const data = await seed({ suffix: "legacy", items: [] });
  await environment.withSecurityRulesDisabled((admin) => setDoc(doc(admin.firestore(), `chamados/${data.pedidoId}`), {
    id: data.pedidoId, categoria: "televendas", status: "Em separação",
    empresa_id: data.companyId, supermercado_id: data.unitId,
    itens: [{ produto: "Arroz", quantidadeSolicitada: 5, quantidadeEncontrada: 1 }],
  }));
  const ctx = environment.authenticatedContext(data.uid);
  assert.equal((await getDoc(refs(ctx, data).order)).exists(), true);
  await assert.rejects(confirm(ctx, data, { quantity: 1 }));
});
