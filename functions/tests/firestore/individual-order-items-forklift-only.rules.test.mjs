import { readFile, writeFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const root = new URL("../../../", import.meta.url);
const base = await readFile(new URL("firestore.rules", root), "utf8");
const prototype = await readFile(new URL("./individual-order-items.rules", import.meta.url), "utf8");
const integratedRulesPath = new URL("./individual-order-items-forklift-only.rules", import.meta.url);
const integratedRules = buildIntegratedRules(base, prototype);
await writeFile(integratedRulesPath, integratedRules);

function buildIntegratedRules(source, isolated) {
  const replaceOnce = (text, before, after, label) => {
    const count = text.split(before).length - 1;
    if (count !== 1) throw new Error(`Expected one ${label} anchor; found ${count}`);
    return text.replace(before, after);
  };
  const helperStart = isolated.indexOf("    function signedIn()");
  const helperEnd = isolated.indexOf("    match /chamados/{pedidoId}");
  let helpers = isolated.slice(helperStart, helperEnd);
  const scopeStart = helpers.indexOf("    function inScope(pedidoId)");
  const scopeEnd = helpers.indexOf("    function callData(callId)", scopeStart);
  helpers = helpers.slice(0, scopeStart) + `    function inScope(pedidoId) {
      let order = parentOrder(pedidoId);
      let actor = get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data;
      return isSignedIn()
        && actor.get("status", "Ativo") == "Ativo"
        && actor.perfil == "Separador de Televendas"
        && actor.get("empresa_id", null) == order.empresa_id
        && canAccessAssignedUnit(actor, order.supermercado_id, order.empresa_id)
        && isSupermercadoDaEmpresaAtivo(order.empresa_id, order.supermercado_id)
        && isChamadoTelevendas(order);
    }
    function canReadIndividualOrder(pedidoId) {
      let order = parentOrder(pedidoId);
      let actor = get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data;
      return isSignedIn() && actor.get("status", "Ativo") == "Ativo"
        && (actor.perfil == "Administrador Geral"
          || (actor.perfil in ["Gerente da Empresa", "Operador", "Televendas", "Separador de Televendas"]
            && actor.get("empresa_id", null) == order.empresa_id
            && canAccessAssignedUnit(actor, order.supermercado_id, order.empresa_id)
            && isSupermercadoDaEmpresaAtivo(order.empresa_id, order.supermercado_id)
            && isChamadoTelevendas(order)));
    }
    function linkedCallOrderMatches(data) {
      let order = get(/databases/$(database)/documents/chamados/$(data.pedido_origem_id)).data;
      let actor = get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data;
      return order.categoria == "televendas"
        && order.status == "Em separação"
        && order.empresa_id == data.empresa_id
        && order.supermercado_id == data.supermercado_id
        && actor.get("status", "Ativo") == "Ativo"
        && actor.perfil == "Separador de Televendas"
        && actor.get("empresa_id", null) == order.empresa_id
        && canAccessAssignedUnit(actor, order.supermercado_id, order.empresa_id)
        && isSupermercadoDaEmpresaAtivo(order.empresa_id, order.supermercado_id);
    }
    function linkedCallItemMatches(data) {
      let item = get(/databases/$(database)/documents/chamados/$(data.pedido_origem_id)/itens/$(data.pedido_origem_item_id)).data;
      return item.id == data.pedido_origem_item_id
        && item.pedido_id == data.pedido_origem_id
        && item.empresa_id == data.empresa_id
        && item.supermercado_id == data.supermercado_id;
    }
    function canSeparatorReadLinkedCall(data) {
      return isCurrentUserActive()
        && currentUserPerfil() == "Separador de Televendas"
        && data.categoria == "operacional"
        && data.status == "Finalizado"
        && data.pedido_origem_id is string
        && data.pedido_origem_item_id is string
        && linkedCallOrderMatches(data)
        && linkedCallItemMatches(data);
    }
` + helpers.slice(scopeEnd);
  helpers = helpers.replaceAll("audit.pedido_id", "audit.details.pedido_id")
    .replaceAll("audit.confirmacao_id", "audit.details.confirmacao_id");
  helpers = helpers.replace("&& receipt.item_id == itemId", `&& receipt.item_id == itemId
        && receipt.origem == "empilhadeira"
        && receipt.operation_id == confirmationId
        && receipt.chamado_id is string`);
  const manualCheckStart = helpers.indexOf('        && (receipt.origem == "manual"');
  if (manualCheckStart >= 0) {
    const manualCheckEnd = helpers.indexOf("        && next.quantidade_encontrada", manualCheckStart);
    helpers = helpers.slice(0, manualCheckStart) + helpers.slice(manualCheckEnd);
  }

  const nestedStart = isolated.indexOf("      match /itens/{itemId}");
  const nestedEnd = isolated.indexOf("\n    }\n    match /auditoria/{auditId}", nestedStart);
  let nested = isolated.slice(nestedStart, nestedEnd);
  nested = nested.replaceAll("allow get, list: if inScope(pedidoId)", "allow get, list: if canReadIndividualOrder(pedidoId)")
    .replaceAll("pedidoId", "id");
  const receiptStart = nested.indexOf("      match /separacao_confirmacoes/{confirmationId}");
  if (receiptStart < 0) throw new Error("Could not locate receipt rules");
  const forkliftReceiptRule = `      match /separacao_confirmacoes/{operationId} {
        allow get: if inScope(id);
        allow list: if false;
        allow create: if inScope(id)
          && request.resource.data.keys().hasOnly([
            "id", "operation_id", "request_fingerprint", "pedido_id", "item_id", "chamado_id", "origem",
            "empresa_id", "supermercado_id", "actor_uid", "quantidade", "unidade_medida",
            "justificativa", "audit_id", "confirmado_em"
          ])
          && request.resource.data.keys().hasAll([
            "id", "operation_id", "request_fingerprint", "pedido_id", "item_id", "chamado_id", "origem",
            "empresa_id", "supermercado_id", "actor_uid", "quantidade", "unidade_medida", "audit_id", "confirmado_em"
          ])
          && request.resource.data.id == operationId
          && request.resource.data.operation_id == operationId
          && request.resource.data.request_fingerprint is string
          && request.resource.data.request_fingerprint.size() == 64
          && request.resource.data.pedido_id == id
          && request.resource.data.origem == "empilhadeira"
          && request.resource.data.actor_uid == request.auth.uid
          && request.resource.data.confirmado_em == request.time
          && parentOrder(id).status == "Em separação"
          && isChamadoTelevendas(parentOrder(id))
          && request.resource.data.empresa_id == parentOrder(id).empresa_id
          && request.resource.data.supermercado_id == parentOrder(id).supermercado_id
          && request.resource.data.quantidade is int
          && request.resource.data.quantidade >= 0
          && (request.resource.data.quantidade > 0
            || (request.resource.data.justificativa is string && request.resource.data.justificativa.size() > 0))
          && callData(request.resource.data.chamado_id).status == "Finalizado"
          && callData(request.resource.data.chamado_id).categoria == "operacional"
          && callData(request.resource.data.chamado_id).pedido_origem_id == id
          && callData(request.resource.data.chamado_id).pedido_origem_item_id == request.resource.data.item_id
          && callData(request.resource.data.chamado_id).empresa_id == request.resource.data.empresa_id
          && callData(request.resource.data.chamado_id).supermercado_id == request.resource.data.supermercado_id
          && itemAfter(id, request.resource.data.item_id).id == request.resource.data.item_id
          && itemAfter(id, request.resource.data.item_id).ultima_confirmacao_id == operationId
          && itemAfter(id, request.resource.data.item_id).ultima_auditoria_id == request.resource.data.audit_id;
        allow update, delete: if false;
      }
`;
  nested = nested.slice(0, receiptStart) + forkliftReceiptRule;

  const orderAnchor = `      allow delete: if isAdminGeral();\n    }\n\n    match /auditoria/{id}`;
  const oldSeparatorRead = `    function canSeparatorReadChamado(data) {
      return isCurrentUserActive()
        && currentUserPerfil() == "Separador de Televendas"
        && data.get("supermercado_id", null) is string
        && data.get("supermercado_id", "").size() > 0
        && data.get("empresa_id", null) == currentUserEmpresaId()
        && canAccessCurrentSupermercado(data.get("supermercado_id", null))
        && isChamadoTelevendas(data);
    }`;
  const optimizedSeparatorRead = `    function canSeparatorReadChamado(data) {
      let actor = get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data;
      let empresaId = data.get("empresa_id", null);
      let supermercadoId = data.get("supermercado_id", null);
      return isSignedIn() && actor.get("status", "Ativo") == "Ativo"
        && actor.perfil == "Separador de Televendas"
        && supermercadoId is string && supermercadoId.size() > 0
        && empresaId is string && empresaId.size() > 0
        && actor.get("empresa_id", null) == empresaId
        && canAccessAssignedUnit(actor, supermercadoId, empresaId)
        && isSupermercadoDaEmpresaAtivo(empresaId, supermercadoId)
        && isChamadoTelevendas(data);
    }`;
  source = replaceOnce(source, oldSeparatorRead, optimizedSeparatorRead, "shared separator read optimization");
  source = replaceOnce(source, "    match /chamados/{id} {", `    match /chamados/{id} {\n${helpers}`, "global experimental helpers");
  source = replaceOnce(source, orderAnchor,
    `      allow delete: if isAdminGeral();\n${nested}    }\n\n    match /auditoria/{id}`, "nested item rules");
  source = replaceOnce(source, `      allow create: if isSignedIn()\n        && canCreateChamado()`, `      allow get: if resource.data.get("categoria", null) == "operacional"\n        && canSeparatorReadLinkedCall(resource.data);\n\n      allow create: if isSignedIn()\n        && canCreateChamado()`, "narrow linked call get");
  const updateAnchor = `      allow update: if isSignedIn()\n        && (currentUserPerfil() == "Separador de Televendas"`;
  source = replaceOnce(source, updateAnchor, `      allow update: if isSignedIn()
        && (resource.data.get("modelo_itens", "array") != "individual"
          || (request.resource.data.get("modelo_itens", null) == resource.data.get("modelo_itens", null)
            && !request.resource.data.diff(resource.data).affectedKeys().hasAny([
            "itens", "total_solicitado", "total_encontrado", "percentual_atendido"
            ])))
        && (currentUserPerfil() == "Separador de Televendas"`, "individual model parent aggregate lock");
  source = replaceOnce(source, `          "chamado_finalizado",\n          "empilhadeira_criada",`,
    `          "chamado_finalizado",\n          "separacao_item_confirmada",\n          "empilhadeira_criada",`, "audit action allowlist");
  const auditAnchor = `        && request.resource.data.details is map\n        && (\n          !("empresa_id" in request.resource.data)`;
  source = replaceOnce(source, auditAnchor, `        && request.resource.data.details is map
        && (request.resource.data.action != "separacao_item_confirmada"
          || (request.resource.data.entityType == "pedido_item"
            && request.resource.data.details.pedido_id is string
            && request.resource.data.details.item_id == request.resource.data.entityId
            && request.resource.data.details.confirmacao_id is string
            && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.details.pedido_id)/itens/$(request.resource.data.details.item_id)).data.ultima_auditoria_id == id
            && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.details.pedido_id)/itens/$(request.resource.data.details.item_id)).data.ultima_confirmacao_id == request.resource.data.details.confirmacao_id
            && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.details.pedido_id)/separacao_confirmacoes/$(request.resource.data.details.confirmacao_id)).data.audit_id == id))
        && (
          !("empresa_id" in request.resource.data)`, "correlated integrated audit");
  const auditMatch = `    match /auditoria/{id} {\n      allow read:`;
  const compactAuditCreate = `    match /auditoria/{id} {
      allow create: if request.resource.data.action == "separacao_item_confirmada"
        && request.resource.data.keys().hasOnly(["action", "actorUid", "actorName", "entityType", "entityId", "details", "occurredAt", "empresa_id", "supermercado_id"])
        && request.resource.data.actorUid == request.auth.uid
        && request.resource.data.actorName is string
        && request.resource.data.occurredAt == request.time
        && request.resource.data.entityType == "pedido_item"
        && request.resource.data.details.pedido_id is string
        && request.resource.data.details.item_id == request.resource.data.entityId
        && request.resource.data.details.confirmacao_id is string
        && request.resource.data.details.empresa_id == request.resource.data.empresa_id
        && request.resource.data.details.supermercado_id == request.resource.data.supermercado_id
        && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.details.pedido_id)/itens/$(request.resource.data.entityId)).ultima_auditoria_id == id
        && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.details.pedido_id)/itens/$(request.resource.data.entityId)).ultima_confirmacao_id == request.resource.data.details.confirmacao_id
        && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.details.pedido_id)/separacao_confirmacoes/$(request.resource.data.details.confirmacao_id)).audit_id == id
        && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.details.pedido_id)/separacao_confirmacoes/$(request.resource.data.details.confirmacao_id)).actor_uid == request.auth.uid
        && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.details.pedido_id)/separacao_confirmacoes/$(request.resource.data.details.confirmacao_id)).empresa_id == request.resource.data.empresa_id
        && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.details.pedido_id)/separacao_confirmacoes/$(request.resource.data.details.confirmacao_id)).supermercado_id == request.resource.data.supermercado_id;
      allow read:`;
  source = replaceOnce(source, auditMatch, compactAuditCreate, "compact correlated audit branch");
  return source;
}

const projectId = "demo-patio-forklift-only";
let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 18851, rules: integratedRules },
  });
});
after(async () => environment?.cleanup());

async function fixture(suffix, profile = "Separador de Televendas", {
  unitId = "unidade-a", companyId = "empresa-a", isManager = false, status = "Em separação",
  callStatus = "Finalizado", callCompanyId = companyId, callUnitId = unitId,
  linkedOrderId = `pedido-${suffix}`, linkedItemId = "item-stavel-1",
} = {}) {
  const uid = `${profile.replaceAll(" ", "_")}-${suffix}`;
  const pedidoId = `pedido-${suffix}`;
  const itemId = "item-stavel-1";
  const callId = `call-${suffix}`;
  await environment.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `empresas/${companyId}`), { status: "Ativa" });
    await setDoc(doc(db, `supermercados/${unitId}`), { status: "Ativo", empresa_id: companyId });
    const user = profile == "Administrador Geral"
      ? { id: uid, perfil: profile, status: "Ativo", empresa_id: null, supermercado_id: null }
      : { id: uid, perfil: profile, status: "Ativo", empresa_id: companyId, supermercado_id: unitId,
        supermercado_ids: isManager ? [unitId] : [], vinculos_unidades_v2: isManager };
    await setDoc(doc(db, `usuarios/${uid}`), user);
    if (isManager) await setDoc(doc(db, `usuarios/${uid}/unidades/${unitId}`), {
      empresa_id: companyId, supermercado_id: unitId, status: "Ativo", atualizado_em: "2026-10-30T12:00:00.000Z",
    });
    await setDoc(doc(db, `chamados/${pedidoId}`), {
      id: pedidoId, categoria: "televendas", tipo_servico: "Atendimento Televendas",
      status, empresa_id: companyId, supermercado_id: unitId,
      modelo_itens: "individual",
      operador_progresso: { status: "A caminho", atualizado_por: "Operador" },
      operador_nome: "Separador", assumido_em: "2026-10-30T12:00:00.000Z",
      cancelado_em: null, motivo_incompleto: null,
    });
    await setDoc(doc(db, `chamados/${pedidoId}/itens/${itemId}`), {
      id: itemId, pedido_id: pedidoId, empresa_id: companyId, supermercado_id: unitId,
      produto: "Arroz", unidade_medida: "Unidade", quantidade_solicitada: 5,
      quantidade_encontrada: 0, quantidade_faltante: 5, recebimento_empilhadeira_confirmado: false,
      ultima_confirmacao_id: null, ultima_auditoria_id: null,
    });
    await setDoc(doc(db, `chamados/${pedidoId}/itens/item-nao-relacionado`), {
      id: "item-nao-relacionado", pedido_id: pedidoId, empresa_id: companyId, supermercado_id: unitId,
      produto: "Feijão", unidade_medida: "Unidade", quantidade_solicitada: 2,
      quantidade_encontrada: 0, quantidade_faltante: 2, recebimento_empilhadeira_confirmado: false,
      ultima_confirmacao_id: null, ultima_auditoria_id: null,
    });
    await setDoc(doc(db, `chamados/${callId}`), {
      id: callId, categoria: "operacional", status: callStatus, empresa_id: callCompanyId,
      supermercado_id: callUnitId, pedido_origem_id: linkedOrderId, pedido_origem_item_id: linkedItemId,
    });
  });
  return { uid, pedidoId, itemId, callId, operationId: `op-${suffix}`, companyId, unitId };
}

function docRefs(ctx, f) {
  const db = ctx.firestore();
  return {
    order: doc(db, `chamados/${f.pedidoId}`),
    item: doc(db, `chamados/${f.pedidoId}/itens/${f.itemId}`),
    receipt: doc(db, `chamados/${f.pedidoId}/separacao_confirmacoes/${f.operationId}`),
    call: doc(db, `chamados/${f.callId}`),
  };
}

function requestFingerprint(f, callId, quantity, justification) {
  return createHash("sha256").update(JSON.stringify({ uid: f.uid, pedido: f.pedidoId, item: f.itemId, callId, quantity, justification: justification.trim() })).digest("hex");
}

async function writeConfirmation(ctx, f, {
  callId = f.callId, operationId = f.operationId, itemId = f.itemId, origin = "empilhadeira",
  quantity = 1, justification = "", writeAudit = true, skipClientValidation = false,
  omitItemUpdate = false, receiptCompanyId = f.companyId, receiptUnitId = f.unitId,
  auditOverrides = {}, afterCommit,
} = {}) {
  const db = ctx.firestore();
  const r = docRefs(ctx, f);
  const itemRef = doc(db, `chamados/${f.pedidoId}/itens/${itemId}`);
  const fingerprint = requestFingerprint({ ...f, itemId }, callId, quantity, justification);
  const receiptRef = doc(db, `chamados/${f.pedidoId}/separacao_confirmacoes/${operationId}`);
  const auditRef = doc(collection(db, "auditoria"));
  const result = await runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(r.order);
    const itemSnap = await tx.get(itemRef);
    const callSnap = await tx.get(doc(db, `chamados/${callId}`));
    const priorReceipt = await tx.get(receiptRef);
    if (!skipClientValidation && (!orderSnap.exists() || !itemSnap.exists() || !callSnap.exists())) throw new Error("fixture document missing");
    if (priorReceipt.exists()) {
      const prior = priorReceipt.data();
      if (prior.operation_id !== operationId || prior.request_fingerprint !== fingerprint) throw new Error("operationId replay fingerprint mismatch");
      return { replay: true, found: itemSnap.data().quantidade_encontrada };
    }
    const item = itemSnap.exists() ? itemSnap.data() : {
      quantidade_encontrada: 0, quantidade_solicitada: 5, unidade_medida: "Unidade",
    };
    const nextFound = item.quantidade_encontrada + quantity;
    const receipt = {
      id: operationId, operation_id: operationId, request_fingerprint: fingerprint,
      pedido_id: f.pedidoId, item_id: itemId, chamado_id: callId, origem: origin,
      empresa_id: receiptCompanyId, supermercado_id: receiptUnitId, actor_uid: f.uid,
      quantidade: quantity, unidade_medida: item.unidade_medida,
      ...(justification ? { justificativa: justification } : {}),
      audit_id: auditRef.id, confirmado_em: serverTimestamp(),
    };
    if (!skipClientValidation && (callSnap.data().status !== "Finalizado" || quantity < 0 || item.quantidade_encontrada + quantity > item.quantidade_solicitada)) throw new Error("client validation failed");
    if (!omitItemUpdate) tx.update(itemRef, {
      ...item, quantidade_encontrada: nextFound,
      quantidade_faltante: item.quantidade_solicitada - nextFound,
      recebimento_empilhadeira_confirmado: origin == "empilhadeira",
      ultima_confirmacao_id: operationId, ultima_auditoria_id: auditRef.id,
    });
    tx.set(receiptRef, receipt);
    if (writeAudit) tx.set(auditRef, {
      action: "separacao_item_confirmada", actorUid: f.uid, actorName: "Separador Teste",
      entityType: "pedido_item", entityId: itemId, details: {
        pedido_id: f.pedidoId, item_id: itemId, confirmacao_id: operationId,
        chamado_id: callId, quantidade: quantity, empresa_id: receiptCompanyId, supermercado_id: receiptUnitId,
        ...auditOverrides.details,
      }, empresa_id: receiptCompanyId, supermercado_id: receiptUnitId,
      occurredAt: serverTimestamp(), ...auditOverrides.root,
    });
    return { replay: false, found: nextFound };
  });
  if (afterCommit) await afterCommit(result);
  return result;
}

async function expectBusinessDenial(promise) {
  let error;
  try { await promise; } catch (caught) { error = caught; }
  assert.ok(error, "operation should be denied");
  assert.equal(error.code, "permission-denied", error.message);
  assert.doesNotMatch(error.message ?? "", /maximum of 1000 expressions/i, "expression-limit failure is not a business-rule pass");
}

async function adminUpdate(path, data) {
  return environment.withSecurityRulesDisabled((admin) => updateDoc(doc(admin.firestore(), path), data));
}

async function makeOtherLinkedItem(f, otherItemId = "item-de-outro-pedido") {
  const otherOrderId = `pedido-paralelo-${f.pedidoId}`;
  await environment.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await setDoc(doc(db, `chamados/${otherOrderId}`), {
      id: otherOrderId, categoria: "televendas", tipo_servico: "Atendimento Televendas",
      status: "Em separação", empresa_id: f.companyId, supermercado_id: f.unitId,
    });
    await setDoc(doc(db, `chamados/${otherOrderId}/itens/${otherItemId}`), {
      id: otherItemId, pedido_id: otherOrderId, empresa_id: f.companyId, supermercado_id: f.unitId,
      produto: "Produto paralelo", unidade_medida: "Unidade", quantidade_solicitada: 3,
      quantidade_encontrada: 0, quantidade_faltante: 3, recebimento_empilhadeira_confirmado: false,
      ultima_confirmacao_id: null, ultima_auditoria_id: null,
    });
    await updateDoc(doc(db, `chamados/${f.callId}`), { pedido_origem_id: otherOrderId, pedido_origem_item_id: otherItemId });
  });
  return { otherOrderId, otherItemId };
}

test("01 valid finalized linked-call confirmation writes item, immutable receipt and audit", async () => {
  const f = await fixture("valid");
  const ctx = environment.authenticatedContext(f.uid);
  const result = await assertSucceeds(writeConfirmation(ctx, f, { quantity: 2 }));
  assert.equal(result.found, 2);
  assert.equal((await getDoc(docRefs(ctx, f).item)).data().quantidade_faltante, 3);
  const receipt = (await getDoc(docRefs(ctx, f).receipt)).data();
  assert.equal(receipt.origem, "empilhadeira");
  assert.equal(receipt.operation_id, f.operationId);
  assert.equal(receipt.request_fingerprint.length, 64);
});

test("02 rejects a parent order outside Em separação", async () => {
  const f = await fixture("wrong-order-state");
  await adminUpdate(`chamados/${f.pedidoId}`, { status: "Pronto" });
  await expectBusinessDenial(writeConfirmation(environment.authenticatedContext(f.uid), f, { skipClientValidation: true }));
});

test("03 rejects a linked call that is not Finalizado", async () => {
  const f = await fixture("call-open", "Separador de Televendas", { callStatus: "Em atendimento" });
  await expectBusinessDenial(writeConfirmation(environment.authenticatedContext(f.uid), f, { skipClientValidation: true }));
});

test("04 rejects a linked call from another company", async () => {
  const f = await fixture("other-company-call", "Separador de Televendas", { callCompanyId: "empresa-b" });
  await expectBusinessDenial(writeConfirmation(environment.authenticatedContext(f.uid), f, { skipClientValidation: true }));
});

test("05 rejects a linked call from another unit", async () => {
  const f = await fixture("other-unit-call", "Separador de Televendas", { callUnitId: "unidade-b" });
  await environment.withSecurityRulesDisabled((admin) => setDoc(doc(admin.firestore(), "supermercados/unidade-b"), { status: "Ativo", empresa_id: f.companyId }));
  await expectBusinessDenial(writeConfirmation(environment.authenticatedContext(f.uid), f, { skipClientValidation: true }));
});

test("06 rejects a call linked to an item in another order", async () => {
  const f = await fixture("other-pedido-item");
  await makeOtherLinkedItem(f);
  await expectBusinessDenial(writeConfirmation(environment.authenticatedContext(f.uid), f, { skipClientValidation: true }));
});

test("07 rejects receipt and audit when the referenced item does not exist", async () => {
  const f = await fixture("missing-item");
  await expectBusinessDenial(writeConfirmation(environment.authenticatedContext(f.uid), f, {
    itemId: "item-inexistente", skipClientValidation: true, omitItemUpdate: true,
  }));
});

test("08 rejects a quantity above the current item balance", async () => {
  const f = await fixture("quantity-over");
  await expectBusinessDenial(writeConfirmation(environment.authenticatedContext(f.uid), f, { quantity: 6, skipClientValidation: true }));
});

test("09 requires a reason for zero and permits zero with a reason", async () => {
  const f = await fixture("zero-no-reason");
  await expectBusinessDenial(writeConfirmation(environment.authenticatedContext(f.uid), f, { quantity: 0, skipClientValidation: true }));
  const permitted = await fixture("zero-with-reason");
  const result = await assertSucceeds(writeConfirmation(environment.authenticatedContext(permitted.uid), permitted, { quantity: 0, justification: "Item não localizado" }));
  assert.equal(result.found, 0);
});

test("10 duplicate operation receipt cannot be created or overwritten", async () => {
  const f = await fixture("duplicate-receipt");
  const ctx = environment.authenticatedContext(f.uid);
  await assertSucceeds(writeConfirmation(ctx, f));
  await expectBusinessDenial(updateDoc(docRefs(ctx, f).receipt, { quantidade: 4 }));
});

test("11 operationId replay with different parameters is rejected", async () => {
  const f = await fixture("fingerprint-replay");
  const ctx = environment.authenticatedContext(f.uid);
  await assertSucceeds(writeConfirmation(ctx, f, { quantity: 1 }));
  await assert.rejects(writeConfirmation(ctx, f, { quantity: 2 }), /fingerprint mismatch/);
  await expectBusinessDenial(updateDoc(docRefs(ctx, f).receipt, { request_fingerprint: "f".repeat(64), quantidade: 2 }));
});

test("12 missing or adulterated audit prevents confirmation", async () => {
  const missing = await fixture("audit-missing");
  await expectBusinessDenial(writeConfirmation(environment.authenticatedContext(missing.uid), missing, { writeAudit: false }));
  const forged = await fixture("audit-forged");
  await expectBusinessDenial(writeConfirmation(environment.authenticatedContext(forged.uid), forged, { auditOverrides: { details: { item_id: "item-forjado" } } }));
});

test("13 updating an unrelated item is denied", async () => {
  const f = await fixture("unrelated-item");
  const db = environment.authenticatedContext(f.uid).firestore();
  await expectBusinessDenial(updateDoc(doc(db, `chamados/${f.pedidoId}/itens/item-nao-relacionado`), { quantidade_encontrada: 1 }));
});

test("14 receipts are append-only", async () => {
  const f = await fixture("receipt-immutable");
  const ctx = environment.authenticatedContext(f.uid);
  await assertSucceeds(writeConfirmation(ctx, f));
  await expectBusinessDenial(updateDoc(docRefs(ctx, f).receipt, { quantidade: 3 }));
  await expectBusinessDenial(deleteDoc(docRefs(ctx, f).receipt));
});

test("15 two different finalized calls race against the same item balance", async () => {
  const f = await fixture("cross-call-race");
  const secondCallId = "call-race-two";
  await environment.withSecurityRulesDisabled((admin) => setDoc(doc(admin.firestore(), `chamados/${secondCallId}`), {
    id: secondCallId, categoria: "operacional", status: "Finalizado", empresa_id: f.companyId,
    supermercado_id: f.unitId, pedido_origem_id: f.pedidoId, pedido_origem_item_id: f.itemId,
  }));
  const ctx = environment.authenticatedContext(f.uid);
  const results = await Promise.allSettled([
    writeConfirmation(ctx, f, { operationId: "race-op-1", callId: f.callId, quantity: 4 }),
    writeConfirmation(ctx, f, { operationId: "race-op-2", callId: secondCallId, quantity: 4 }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal((await getDoc(docRefs(ctx, f).item)).data().quantidade_encontrada, 4);
});

test("16 retry after an unknown response returns the committed receipt without double-counting", async () => {
  const f = await fixture("retry-unknown");
  const ctx = environment.authenticatedContext(f.uid);
  await assert.rejects(writeConfirmation(ctx, f, { quantity: 2, afterCommit: () => { throw new Error("simulated lost response"); } }), /simulated lost response/);
  const retry = await assertSucceeds(writeConfirmation(ctx, f, { quantity: 2 }));
  assert.equal(retry.replay, true);
  assert.equal((await getDoc(docRefs(ctx, f).item)).data().quantidade_encontrada, 2);
});

test("17 the five official profiles retain read and write boundaries", async () => {
  const matrix = [
    ["Administrador Geral", true, false], ["Gerente da Empresa", true, false],
    ["Operador", true, false], ["Televendas", true, false],
    ["Separador de Televendas", true, true], ["Administrador da Empresa", false, false],
  ];
  for (const [profile, canRead, canConfirm] of matrix) {
    const f = await fixture(`profile-${profile.replaceAll(" ", "-")}`, profile, { isManager: profile === "Gerente da Empresa" });
    const ctx = environment.authenticatedContext(f.uid);
    if (canRead) await assertSucceeds(getDoc(docRefs(ctx, f).item));
    else await expectBusinessDenial(getDoc(docRefs(ctx, f).item));
    if (canConfirm) await assertSucceeds(writeConfirmation(ctx, f));
    else await expectBusinessDenial(writeConfirmation(ctx, f, { skipClientValidation: true }));
  }
});

test("18 item confirmation preserves the independent Operator progress and parent totals", async () => {
  const f = await fixture("operator-independent");
  const ctx = environment.authenticatedContext(f.uid);
  await assertSucceeds(writeConfirmation(ctx, f, { quantity: 2 }));
  const order = (await getDoc(docRefs(ctx, f).order)).data();
  assert.deepEqual(order.operador_progresso, { status: "A caminho", atualizado_por: "Operador" });
  assert.equal("total_encontrado" in order, false);
  assert.equal("percentual_atendido" in order, false);
  await expectBusinessDenial(updateDoc(docRefs(ctx, f).order, { total_encontrado: 500, percentual_atendido: 100 }));
});
