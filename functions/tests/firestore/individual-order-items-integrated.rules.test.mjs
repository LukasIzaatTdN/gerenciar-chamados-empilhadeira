import { readFile, writeFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const root = new URL("../../../", import.meta.url);
const base = await readFile(new URL("firestore.rules", root), "utf8");
const prototype = await readFile(new URL("./individual-order-items.rules", import.meta.url), "utf8");
const integratedRulesPath = new URL("./individual-order-items.integrated.rules", import.meta.url);
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
      return isCurrentUserActive()
        && currentUserPerfil() == "Separador de Televendas"
        && currentUserEmpresaId() == order.empresa_id
        && canAccessCurrentSupermercado(order.supermercado_id)
        && isChamadoTelevendas(order);
    }
    function canReadIndividualOrder(pedidoId) {
      let order = parentOrder(pedidoId);
      return isCurrentUserActive()
        && (isAdminGeral()
          || (currentUserPerfil() in ["Gerente da Empresa", "Operador", "Televendas", "Separador de Televendas"]
            && currentUserEmpresaId() == order.empresa_id
            && canAccessCurrentSupermercado(order.supermercado_id)
            && isChamadoTelevendas(order)));
    }
    function linkedCallOrderMatches(data) {
      let order = get(/databases/$(database)/documents/chamados/$(data.pedido_origem_id)).data;
      return order.categoria == "televendas"
        && order.status == "Em separação"
        && order.empresa_id == data.empresa_id
        && order.supermercado_id == data.supermercado_id
        && currentUserEmpresaId() == order.empresa_id
        && canAccessCurrentSupermercado(order.supermercado_id)
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
    function manualPolicyValid(pedidoId, itemId, empresaId, supermercadoId) {
      let policy = get(/databases/$(database)/documents/chamados/$(pedidoId)/itens/$(itemId)/politica_separacao/config).data;
      return policy.pedido_id == pedidoId
        && policy.item_id == itemId
        && policy.empresa_id == empresaId
        && policy.supermercado_id == supermercadoId
        && policy.exige_empilhadeira == false
        && policy.ativo == true;
    }
` + helpers.slice(scopeEnd);
  helpers = helpers.replaceAll("audit.pedido_id", "audit.details.pedido_id")
    .replaceAll("audit.confirmacao_id", "audit.details.confirmacao_id");
  helpers = helpers.replaceAll("'recebimento_empilhadeira_confirmado', 'ultima_confirmacao_id', 'ultima_auditoria_id'", "'recebimento_empilhadeira_confirmado', 'ultima_confirmacao_id', 'ultima_auditoria_id', 'politica_id'");
  helpers = helpers.replace("&& next.quantidade_solicitada == old.quantidade_solicitada", "&& next.quantidade_solicitada == old.quantidade_solicitada\n        && next.politica_id == old.politica_id");
  helpers = helpers.replace("&& next.recebimento_empilhadeira_confirmado == true", "&& next.recebimento_empilhadeira_confirmado == (receipt.origem == 'empilhadeira')");
  // The receipt create rule is the single authorization point for the manual
  // policy. The item update is atomically bound to that immutable receipt via
  // getAfter(), so re-reading/re-evaluating policy here adds expressions but
  // no additional invariant.
  helpers = helpers.replace("&& receipt.chamado_id == null\n            && manualPolicyValid(pedidoId, itemId, old.empresa_id, old.supermercado_id)", "&& receipt.chamado_id == null");
  helpers = helpers.replace("&& receipt.item_id == itemId", `&& receipt.item_id == itemId
        && (receipt.origem == "manual"
          ? receipt.chamado_id == null
            && manualPolicyValid(pedidoId, itemId, old.empresa_id, old.supermercado_id)
          : receipt.origem == "empilhadeira" && receipt.chamado_id == receipt.id)`);

  const nestedStart = isolated.indexOf("      match /itens/{itemId}");
  const nestedEnd = isolated.indexOf("\n    }\n    match /auditoria/{auditId}", nestedStart);
  let nested = isolated.slice(nestedStart, nestedEnd);
  nested = nested.replaceAll("allow get, list: if inScope(pedidoId)", "allow get, list: if canReadIndividualOrder(pedidoId)")
    .replaceAll("pedidoId", "id")
    .replace("'id', 'pedido_id', 'item_id', 'chamado_id', 'empresa_id', 'supermercado_id',\n            'actor_uid', 'quantidade', 'unidade_medida', 'justificativa', 'audit_id', 'confirmado_em'", "'id', 'pedido_id', 'item_id', 'chamado_id', 'origem', 'operation_id', 'empresa_id', 'supermercado_id',\n            'actor_uid', 'quantidade', 'unidade_medida', 'justificativa', 'audit_id', 'confirmado_em'")
    .replace("&& request.resource.data.chamado_id == confirmationId", `&& (request.resource.data.origem == "manual"
            ? request.resource.data.chamado_id == null
            : request.resource.data.chamado_id == confirmationId)`)
    .replace("&& callData(confirmationId).status == 'Finalizado'", `&& request.resource.data.origem in ["manual", "empilhadeira"]
          && request.resource.data.operation_id == confirmationId
          && (request.resource.data.origem == "manual"
            ? request.resource.data.chamado_id == null
              && manualPolicyValid(pedidoId, request.resource.data.item_id, request.resource.data.empresa_id, request.resource.data.supermercado_id)
            : request.resource.data.chamado_id == confirmationId
              && callData(confirmationId).status == 'Finalizado'`)
    .replace("&& callData(confirmationId).supermercado_id == request.resource.data.supermercado_id\n          && itemAfter", `&& callData(confirmationId).supermercado_id == request.resource.data.supermercado_id)
          && itemAfter`);

  const orderAnchor = `      allow delete: if isAdminGeral();\n    }\n\n    match /auditoria/{id}`;
  const policyRule = `      match /itens/{itemId}/politica_separacao/{policyId} {
        allow get: if isAdminGeral();
        allow list: if false;
        allow create: if isAdminGeral()
          && request.resource.data.keys().hasOnly(["pedido_id", "item_id", "empresa_id", "supermercado_id", "exige_empilhadeira", "ativo"])
          && request.resource.data.pedido_id == id
          && request.resource.data.item_id == itemId
          && request.resource.data.empresa_id == get(/databases/$(database)/documents/chamados/$(id)).data.empresa_id
          && request.resource.data.supermercado_id == get(/databases/$(database)/documents/chamados/$(id)).data.supermercado_id
          && request.resource.data.exige_empilhadeira is bool
          && request.resource.data.ativo == true;
        allow update, delete: if false;
      }
`;
  nested += `\n${policyRule}`;
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

const projectId = "demo-patio-integrated-items";
let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 18741, rules: integratedRules },
  });
});
after(async () => environment?.cleanup());

async function fixture(suffix, profile, { unitId = "unidade-a", companyId = "empresa-a", isManager = false } = {}) {
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
      status: "Em separação", empresa_id: companyId, supermercado_id: unitId,
      modelo_itens: "individual", itens: [{ produto: "Arroz", quantidadeSolicitada: 5, quantidadeEncontrada: 0 }],
      total_solicitado: 5, total_encontrado: 0, percentual_atendido: 0,
      operador_progresso: { status: "A caminho", atualizado_por: "Operador" },
      operador_nome: "Separador", assumido_em: "2026-10-30T12:00:00.000Z",
      cancelado_em: null, motivo_incompleto: null,
    });
    await setDoc(doc(db, `chamados/${pedidoId}/itens/${itemId}`), {
      id: itemId, pedido_id: pedidoId, empresa_id: companyId, supermercado_id: unitId,
      produto: "Arroz", unidade_medida: "Unidade", quantidade_solicitada: 5,
      quantidade_encontrada: 0, quantidade_faltante: 5, recebimento_empilhadeira_confirmado: false,
      ultima_confirmacao_id: null, ultima_auditoria_id: null, politica_id: "politica-1",
    });
    await setDoc(doc(db, `chamados/${pedidoId}/itens/item-nao-relacionado`), {
      id: "item-nao-relacionado", pedido_id: pedidoId, empresa_id: companyId, supermercado_id: unitId,
      produto: "Feijão", unidade_medida: "Unidade", quantidade_solicitada: 2,
      quantidade_encontrada: 0, quantidade_faltante: 2, recebimento_empilhadeira_confirmado: false,
      ultima_confirmacao_id: null, ultima_auditoria_id: null, politica_id: "politica-other",
    });
    await setDoc(doc(db, `chamados/${pedidoId}/itens/${itemId}/politica_separacao/config`), {
      pedido_id: pedidoId, item_id: itemId, empresa_id: companyId, supermercado_id: unitId,
      exige_empilhadeira: false, ativo: true,
    });
    await setDoc(doc(db, `chamados/${callId}`), {
      id: callId, categoria: "operacional", status: "Finalizado", empresa_id: companyId,
      supermercado_id: unitId, pedido_origem_id: pedidoId, pedido_origem_item_id: itemId,
    });
  });
  return { uid, pedidoId, itemId, callId, companyId, unitId };
}

function docRefs(ctx, f) {
  const db = ctx.firestore();
  return {
    order: doc(db, `chamados/${f.pedidoId}`),
    item: doc(db, `chamados/${f.pedidoId}/itens/${f.itemId}`),
    receipt: doc(db, `chamados/${f.pedidoId}/separacao_confirmacoes/${f.callId}`),
    call: doc(db, `chamados/${f.callId}`),
  };
}

async function writeConfirmation(ctx, f, { origin = "empilhadeira", callId = f.callId, quantity = 1, justification = "", writeAudit = true } = {}) {
  const db = ctx.firestore();
  const r = docRefs(ctx, f);
  const confirmId = origin == "manual" ? `manual-op-${f.uid}` : callId;
  const receiptRef = doc(db, `chamados/${f.pedidoId}/separacao_confirmacoes/${confirmId}`);
  const auditRef = doc(collection(db, "auditoria"));
  return runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(r.order);
    const itemSnap = await tx.get(r.item);
    const callSnap = origin == "empilhadeira" ? await tx.get(doc(db, `chamados/${callId}`)) : null;
    const priorReceipt = await tx.get(receiptRef);
    assert.ok(orderSnap.exists() && itemSnap.exists());
    assert.equal(priorReceipt.exists(), false);
    const item = itemSnap.data();
    const nextFound = item.quantidade_encontrada + quantity;
    const receipt = {
      id: confirmId, operation_id: confirmId, pedido_id: f.pedidoId, item_id: f.itemId,
      chamado_id: origin == "manual" ? null : callId, origem: origin,
      empresa_id: f.companyId, supermercado_id: f.unitId, actor_uid: f.uid,
      quantidade: quantity, unidade_medida: item.unidade_medida,
      ...(justification ? { justificativa: justification } : {}),
      audit_id: auditRef.id, confirmado_em: serverTimestamp(),
    };
    if (origin == "empilhadeira") {
      assert.ok(callSnap?.exists());
      assert.equal(callSnap.data().status, "Finalizado");
    }
    tx.update(r.item, {
      ...item, quantidade_encontrada: nextFound,
      quantidade_faltante: item.quantidade_solicitada - nextFound,
      recebimento_empilhadeira_confirmado: origin == "empilhadeira",
      ultima_confirmacao_id: confirmId, ultima_auditoria_id: auditRef.id,
    });
    tx.set(receiptRef, receipt);
    if (writeAudit) tx.set(auditRef, {
      action: "separacao_item_confirmada", actorUid: f.uid, actorName: "Separador Teste",
      entityType: "pedido_item", entityId: f.itemId, details: {
        pedido_id: f.pedidoId, item_id: f.itemId, confirmacao_id: confirmId,
        origem: origin, quantidade: quantity, empresa_id: f.companyId, supermercado_id: f.unitId,
      }, empresa_id: f.companyId, supermercado_id: f.unitId,
      occurredAt: new Date().toISOString(),
    });
  });
}

test("integrated prototype retains expected item reads across the five profiles and denies legacy admin", async () => {
  const profiles = [
    ["Administrador Geral", true, false],
    ["Gerente da Empresa", true, false],
    ["Operador", true, false],
    ["Televendas", true, false],
    ["Separador de Televendas", true, true],
    ["Administrador da Empresa", false, false],
  ];
  for (const [profile, expectedRead] of profiles) {
    const f = await fixture(`matrix-${profile.replaceAll(" ", "-")}`, profile, { isManager: profile == "Gerente da Empresa" });
    const ctx = environment.authenticatedContext(f.uid);
    const item = docRefs(ctx, f).item;
    if (expectedRead) await assertSucceeds(getDoc(item));
    else await assertFails(getDoc(item));
    if (profile == "Administrador Geral") {
      await assertSucceeds(updateDoc(doc(ctx.firestore(), `empresas/${f.companyId}`), { admin_reviewed: true }));
    }
    if (!expectedRead || !["Separador de Televendas"].includes(profile)) {
      await assertFails(updateDoc(item, { quantidade_encontrada: 1 }));
    }
  }
});

test("separator can confirm by finalized linked call; operator progress and parent aggregates stay protected", async () => {
  const f = await fixture("forklift", "Separador de Televendas");
  const ctx = environment.authenticatedContext(f.uid);
  const refs = docRefs(ctx, f);
  await assertSucceeds(getDoc(refs.order));
  await assertSucceeds(getDoc(refs.item));
  await assertSucceeds(getDoc(refs.call));
  await assertSucceeds(writeConfirmation(ctx, f, { origin: "empilhadeira", quantity: 2 }));
  const order = (await getDoc(docRefs(ctx, f).order)).data();
  assert.deepEqual(order.operador_progresso, { status: "A caminho", atualizado_por: "Operador" });
  assert.equal(order.total_encontrado, 0);
  await assertFails(updateDoc(docRefs(ctx, f).order, {
    status: "Incompleto", motivo_incompleto: "teste", total_encontrado: 99,
    percentual_atendido: 100, itens: [{ produto: "adulterado" }],
  }));
  await assertFails(updateDoc(docRefs(ctx, f).receipt, { quantidade: 99 }));
  await assertFails(deleteDoc(docRefs(ctx, f).receipt));
  await assertFails(updateDoc(doc(ctx.firestore(), `chamados/${f.pedidoId}/itens/item-nao-relacionado`), {
    quantidade_encontrada: 1,
  }));
  await environment.withSecurityRulesDisabled((admin) => setDoc(doc(admin.firestore(), "chamados/call-sem-auditoria"), {
    id: "call-sem-auditoria", categoria: "operacional", status: "Finalizado",
    empresa_id: f.companyId, supermercado_id: f.unitId,
    pedido_origem_id: f.pedidoId, pedido_origem_item_id: f.itemId,
  }));
  await assertFails(writeConfirmation(ctx, f, { callId: "call-sem-auditoria", writeAudit: false }));
});

test("operator cannot turn off individual-item mode to restore array or aggregate writes", async () => {
  const f = await fixture("operator-parent-mode", "Operador");
  const ctx = environment.authenticatedContext(f.uid);
  const orderRef = docRefs(ctx, f).order;
  await assertFails(updateDoc(orderRef, { modelo_itens: "array" }));
  await assertFails(updateDoc(orderRef, {
    modelo_itens: "array", itens: [{ produto: "forjado" }],
    total_encontrado: 500, percentual_atendido: 100,
  }));
});

test("manual confirmation succeeds only with the trusted item policy and records origin", async () => {
  const f = await fixture("manual-forklift-policy", "Separador de Televendas");
  const ctx = environment.authenticatedContext(f.uid);
  await assertSucceeds(writeConfirmation(ctx, f, { origin: "manual", quantity: 1 }));
  const manualReceipt = await getDoc(doc(ctx.firestore(), `chamados/${f.pedidoId}/separacao_confirmacoes/manual-op-${f.uid}`));
  assert.equal(manualReceipt.data().origem, "manual");
  assert.equal(manualReceipt.data().chamado_id, null);
});

test("manual origin is denied for forklift-required items and cannot attach an invalid call", async () => {
  const f = await fixture("manual-forklift-policy-deny", "Separador de Televendas");
  await environment.withSecurityRulesDisabled((admin) => updateDoc(
    doc(admin.firestore(), `chamados/${f.pedidoId}/itens/${f.itemId}/politica_separacao/config`),
    { exige_empilhadeira: true },
  ));
  const ctx = environment.authenticatedContext(f.uid);
  const db = ctx.firestore();
  const manualRef = doc(db, `chamados/${f.pedidoId}/separacao_confirmacoes/manual-op-${f.uid}`);
  await assertFails(setDoc(manualRef, {
    id: `manual-op-${f.uid}`, operation_id: `manual-op-${f.uid}`, pedido_id: f.pedidoId,
    item_id: f.itemId, chamado_id: null, origem: "manual", empresa_id: f.companyId,
    supermercado_id: f.unitId, actor_uid: f.uid, quantidade: 1, unidade_medida: "Unidade",
    audit_id: "fake", confirmado_em: serverTimestamp(),
  }));
  const forgedCallReceipt = doc(db, `chamados/${f.pedidoId}/separacao_confirmacoes/manual-with-call-${f.uid}`);
  await assertFails(setDoc(forgedCallReceipt, {
    id: `manual-with-call-${f.uid}`, operation_id: `manual-with-call-${f.uid}`, pedido_id: f.pedidoId,
    item_id: f.itemId, chamado_id: "chamado-inexistente", origem: "manual", empresa_id: f.companyId,
    supermercado_id: f.unitId, actor_uid: f.uid, quantidade: 1, unidade_medida: "Unidade",
    audit_id: "fake", confirmado_em: serverTimestamp(),
  }));
});

test("unassigned manager, operator, televendas, legacy admin, and wrong-unit call cannot confirm", async () => {
  const f = await fixture("unauthorized", "Separador de Televendas");
  const manager = await fixture("manager-other", "Gerente da Empresa", { unitId: "unidade-b", isManager: true });
  await environment.withSecurityRulesDisabled(async (admin) => {
    await setDoc(doc(admin.firestore(), "supermercados/unidade-b"), { empresa_id: f.companyId, status: "Ativo" });
  });
  await assertFails(getDoc(docRefs(environment.authenticatedContext(manager.uid), f).item));
  for (const profile of ["Operador", "Televendas", "Administrador da Empresa"]) {
    const u = await fixture(`cannot-confirm-${profile.replaceAll(" ", "-")}`, profile);
    await assertFails(writeConfirmation(environment.authenticatedContext(u.uid), u, { origin: "empilhadeira" }));
  }
  await environment.withSecurityRulesDisabled((admin) => updateDoc(doc(admin.firestore(), `chamados/${f.callId}`), {
    supermercado_id: "unidade-b",
  }));
  await assertFails(writeConfirmation(environment.authenticatedContext(f.uid), f, { origin: "empilhadeira" }));
});
