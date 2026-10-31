import { readFile, writeFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc,
} from "firebase/firestore";

const experimentRulesPath = new URL("./experimental-separation-confirmation.rules", import.meta.url);
const baseRules = await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8");

function buildExperimentalRules(source) {
  let rules = source;
  const replaceOnce = (before, after, label) => {
    const count = rules.split(before).length - 1;
    if (count !== 1) throw new Error(`Expected one ${label} anchor, found ${count}`);
    rules = rules.replace(before, after);
  };

  const helper = `
    function confirmationReceipt(orderId, receiptId) {
      return getAfter(/databases/$(database)/documents/chamados/$(orderId)/separacao_confirmacoes/$(receiptId)).data;
    }

    function confirmationCall(callId) {
      return get(/databases/$(database)/documents/chamados/$(callId)).data;
    }

    function isValidOrderItem(item) {
      return item is map
        && item.keys().hasOnly([
          "produto", "unidadeMedida", "quantidadeSolicitada", "quantidadeEncontrada",
          "quantidadeFaltante", "recebimentoEmpilhadeiraConfirmado"
        ])
        && item.produto is string && item.produto.size() > 0
        && item.unidadeMedida in ["Unidade", "Caixa", "Palete", "Fardo"]
        && item.quantidadeSolicitada is int && item.quantidadeSolicitada > 0
        && item.quantidadeEncontrada is int && item.quantidadeEncontrada >= 0
        && item.quantidadeEncontrada <= item.quantidadeSolicitada
        && item.quantidadeFaltante is int
        && item.quantidadeFaltante == item.quantidadeSolicitada - item.quantidadeEncontrada
        && item.recebimentoEmpilhadeiraConfirmado is bool;
    }

    function hasValidBoundedItems(items) {
      return items is list && items.size() > 0 && items.size() <= 4
        && (items.size() < 1 || isValidOrderItem(items[0]))
        && (items.size() < 2 || isValidOrderItem(items[1]))
        && (items.size() < 3 || isValidOrderItem(items[2]))
        && (items.size() < 4 || isValidOrderItem(items[3]));
    }

    function otherItemsUnchanged(oldItems, newItems, changedIndex) {
      return oldItems.size() == newItems.size()
        && (oldItems.size() < 1 || changedIndex == 0 || oldItems[0] == newItems[0])
        && (oldItems.size() < 2 || changedIndex == 1 || oldItems[1] == newItems[1])
        && (oldItems.size() < 3 || changedIndex == 2 || oldItems[2] == newItems[2])
        && (oldItems.size() < 4 || changedIndex == 3 || oldItems[3] == newItems[3]);
    }

    function itemRequestedAt(items, index) {
      return items.size() > index ? items[index].get("quantidadeSolicitada", 0) : 0;
    }

    function itemFoundAt(items, index) {
      return items.size() > index ? items[index].get("quantidadeEncontrada", 0) : 0;
    }

    function itemMissingAt(items, index) {
      return items.size() > index ? items[index].get("quantidadeFaltante", 0) : 0;
    }

    function requestedTotal(items) {
      return itemRequestedAt(items, 0) + itemRequestedAt(items, 1)
        + itemRequestedAt(items, 2) + itemRequestedAt(items, 3);
    }

    function foundTotal(items) {
      return itemFoundAt(items, 0) + itemFoundAt(items, 1)
        + itemFoundAt(items, 2) + itemFoundAt(items, 3);
    }

    function missingTotal(items) {
      return itemMissingAt(items, 0) + itemMissingAt(items, 1)
        + itemMissingAt(items, 2) + itemMissingAt(items, 3);
    }

    function aggregatesMatch(data, items) {
      let requested = requestedTotal(items);
      let found = foundTotal(items);
      return data.total_solicitado == requested
        && data.total_encontrado == found
        && data.percentual_atendido == math.round(found * 100 / requested);
    }

    function finalStatusMatches(data, items) {
      return (data.status == "Pronto" && missingTotal(items) == 0)
        || (data.status == "Incompleto" && missingTotal(items) > 0
          && data.get("motivo_incompleto", null) is string
          && data.motivo_incompleto.size() > 0);
    }

    function canSeparatorReadLinkedCall(data) {
      let actor = get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data;
      let order = get(/databases/$(database)/documents/chamados/$(data.pedido_origem_id)).data;
      let items = order.get("itens", []);
      let itemIndex = data.get("pedido_origem_item_index", -1);
      let item = itemIndex is int && itemIndex >= 0 && itemIndex < items.size()
        ? items[itemIndex]
        : {};
      return actor.get("status", "Ativo") == "Ativo"
        && actor.get("perfil", null) == "Separador de Televendas"
        && actor.get("empresa_id", null) == order.get("empresa_id", null)
        && canAccessAssignedUnit(actor, order.get("supermercado_id", null), order.get("empresa_id", null))
        && isSupermercadoDaEmpresaAtivo(order.get("empresa_id", null), order.get("supermercado_id", null))
        && isChamadoTelevendas(order)
        && order.status == "Em separação"
        && data.get("categoria", null) == "operacional"
        && data.get("status", null) == "Finalizado"
        && data.get("empresa_id", null) == order.get("empresa_id", null)
        && data.get("supermercado_id", null) == order.get("supermercado_id", null)
        && data.get("pedido_origem_id", null) == order.get("id", null)
        && data.get("pedido_origem_produto", null) == item.get("produto", null);
    }

    function confirmationAudit(auditId) {
      return getAfter(/databases/$(database)/documents/auditoria/$(auditId)).data;
    }

    function confirmationItemIsConsistent(oldData, newData, receipt) {
      let oldItems = oldData.get("itens", []);
      let newItems = newData.get("itens", []);
      let itemIndex = receipt.get("item_index", -1);
      let quantity = receipt.get("quantidade", -1);
      let oldItem = itemIndex is int && itemIndex >= 0 && itemIndex < oldItems.size() ? oldItems[itemIndex] : {};
      let newItem = itemIndex is int && itemIndex >= 0 && itemIndex < newItems.size() ? newItems[itemIndex] : {};
      return itemIndex is int && itemIndex >= 0 && itemIndex < oldItems.size()
        && hasValidBoundedItems(oldItems)
        && hasValidBoundedItems(newItems)
        && otherItemsUnchanged(oldItems, newItems, itemIndex)
        && receipt.produto == oldItem.produto
        && newItem.produto == oldItem.produto
        && newItem.unidadeMedida == oldItem.unidadeMedida
        && newItem.quantidadeSolicitada == oldItem.quantidadeSolicitada
        && quantity is int && quantity >= 0
        && quantity <= oldItem.quantidadeSolicitada - oldItem.quantidadeEncontrada
        && newItem.quantidadeEncontrada == oldItem.quantidadeEncontrada + quantity
        && newItem.quantidadeFaltante == newItem.quantidadeSolicitada - newItem.quantidadeEncontrada
        && newItem.recebimentoEmpilhadeiraConfirmado == true
        && aggregatesMatch(oldData, oldItems)
        && aggregatesMatch(newData, newItems);
    }

    function confirmationMarkerIsConsistent(newData, callId, receipt) {
      let confirmationMap = newData.get("confirmacoes_empilhadeira", {});
      let marker = confirmationMap is map ? confirmationMap.get(callId, {}) : {};
      return marker.item_index == receipt.item_index
        && marker.quantidade == receipt.quantidade
        && marker.unidade_medida == receipt.unidade_medida;
    }

    function isConfirmationOrderUpdate(orderId, oldData, newData) {
      let receiptId = newData.get("ultima_separacao_confirmacao_id", null);
      let receipt = receiptId is string ? confirmationReceipt(orderId, receiptId) : {};
      let callId = receipt.get("chamado_id", null);
      let call = callId is string ? confirmationCall(callId) : {};
      let operator = call.get("operador_uid", null) is string
        ? get(/databases/$(database)/documents/usuarios/$(call.operador_uid)).data
        : {};
      let auditId = newData.get("ultima_auditoria_atualizacao_id", null);
      let audit = auditId is string ? confirmationAudit(auditId) : {};
      return oldData.status == "Em separação"
        && newData.status == oldData.status
        && newData.get("empresa_id", null) == oldData.get("empresa_id", null)
        && newData.get("supermercado_id", null) == oldData.get("supermercado_id", null)
        && receipt.id == receiptId
        && receipt.pedido_id == orderId
        && receipt.chamado_id == callId
        && receipt.empresa_id == oldData.empresa_id
        && receipt.supermercado_id == oldData.supermercado_id
        && receipt.actor_uid == request.auth.uid
        && receipt.confirmado_em == request.time
        && call.status == "Finalizado"
        && call.categoria == "operacional"
        && call.empresa_id == oldData.empresa_id
        && call.supermercado_id == oldData.supermercado_id
        && call.pedido_origem_id == orderId
        && call.solicitante_uid == request.auth.uid
        && call.get("finalizado_por_uid", null) == call.get("operador_uid", null)
        && operator.get("status", null) == "Ativo"
        && operator.get("perfil", null) == "Operador"
        && operator.get("empresa_id", null) == oldData.empresa_id
        && effectiveUnitIds(operator).hasAny([oldData.supermercado_id])
        && call.pedido_origem_item_index == receipt.item_index
        && call.pedido_origem_produto == receipt.produto
        && confirmationItemIsConsistent(oldData, newData, receipt)
        && confirmationMarkerIsConsistent(newData, callId, receipt)
        && receipt.quantidade is int && receipt.quantidade >= 0
        && (receipt.quantidade > 0 || (receipt.justificativa is string && receipt.justificativa.size() > 0))
        && newData.total_solicitado == oldData.total_solicitado
        && newData.total_encontrado == oldData.total_encontrado + receipt.quantidade
        && newData.percentual_atendido == math.round(newData.total_encontrado * 100 / newData.total_solicitado)
        && newData.ultima_separacao_confirmacao_id == receiptId
        && audit.action == "chamado_atualizado"
        && audit.actorUid == request.auth.uid
        && audit.entityType == "chamado"
        && audit.entityId == orderId
        && audit.empresa_id == oldData.empresa_id
        && audit.supermercado_id == oldData.supermercado_id
        && audit.details.separacao_confirmacao_id == receiptId
        && audit.details.item_index == receipt.item_index
        && audit.details.quantidade == receipt.quantidade
        && audit.details.unidade_medida == receipt.unidade_medida;
    }
`;
  replaceOnce("    function canSeparatorUpdateTelevendas(oldData, newData) {", `${helper}\n    function canSeparatorUpdateTelevendas(oldData, newData) {`, "confirmation helper");

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
      let companyId = data.get("empresa_id", null);
      let unitId = data.get("supermercado_id", null);
      let company = get(/databases/$(database)/documents/empresas/$(companyId)).data;
      let unit = get(/databases/$(database)/documents/supermercados/$(unitId)).data;
      let link = actor.get("vinculos_unidades_v2", false)
        ? get(userUnitAssignmentPath(request.auth.uid, unitId)).data
        : {};
      return request.auth != null
        && actor.get("status", "Ativo") == "Ativo"
        && actor.get("perfil", null) == "Separador de Televendas"
        && actor.get("empresa_id", null) == companyId
        && effectiveUnitIds(actor).hasAny([unitId])
        && (!actor.get("vinculos_unidades_v2", false)
          || (link.get("status", null) == "Ativo" && link.get("empresa_id", null) == companyId))
        && company.get("status", "Ativa") == "Ativa"
        && unit.get("status", "Ativo") == "Ativo"
        && unit.get("empresa_id", null) == companyId
        && isChamadoTelevendas(data);
    }`;
  replaceOnce(oldSeparatorRead, optimizedSeparatorRead, "optimized separator order read");

  const linkedReadStart = helper.indexOf("    function canSeparatorReadLinkedCall(data) {");
  const oldLinkedRead = helper.slice(linkedReadStart, helper.indexOf("\n\n    function confirmationAudit", linkedReadStart));
  const optimizedLinkedRead = `    function canSeparatorReadLinkedCall(data) {
      let actor = get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data;
      let order = get(/databases/$(database)/documents/chamados/$(data.pedido_origem_id)).data;
      let company = get(/databases/$(database)/documents/empresas/$(order.empresa_id)).data;
      let unit = get(/databases/$(database)/documents/supermercados/$(order.supermercado_id)).data;
      let link = actor.get("vinculos_unidades_v2", false)
        ? get(userUnitAssignmentPath(request.auth.uid, order.supermercado_id)).data
        : {};
      let items = order.get("itens", []);
      let itemIndex = data.get("pedido_origem_item_index", -1);
      let item = itemIndex is int && itemIndex >= 0 && itemIndex < items.size() ? items[itemIndex] : {};
      let operator = data.get("operador_uid", null) is string
        ? get(/databases/$(database)/documents/usuarios/$(data.operador_uid)).data
        : {};
      return request.auth != null
        && actor.get("status", "Ativo") == "Ativo"
        && actor.get("perfil", null) == "Separador de Televendas"
        && actor.get("empresa_id", null) == order.empresa_id
        && effectiveUnitIds(actor).hasAny([order.supermercado_id])
        && (!actor.get("vinculos_unidades_v2", false)
          || (link.get("status", null) == "Ativo" && link.get("empresa_id", null) == order.empresa_id))
        && company.get("status", "Ativa") == "Ativa"
        && unit.get("status", "Ativo") == "Ativo"
        && unit.get("empresa_id", null) == order.empresa_id
        && isChamadoTelevendas(order)
        && order.status == "Em separação"
        && data.get("categoria", null) == "operacional"
        && data.get("status", null) == "Finalizado"
        && data.get("empresa_id", null) == order.empresa_id
        && data.get("supermercado_id", null) == order.supermercado_id
        && data.get("pedido_origem_id", null) == order.id
        && data.get("solicitante_uid", null) == request.auth.uid
        && data.get("operador_uid", null) is string
        && data.get("finalizado_por_uid", null) == data.get("operador_uid", null)
        && operator.get("status", null) == "Ativo"
        && operator.get("perfil", null) == "Operador"
        && operator.get("empresa_id", null) == order.empresa_id
        && effectiveUnitIds(operator).hasAny([order.supermercado_id])
        && data.get("pedido_origem_produto", null) == item.get("produto", null);
    }`;
  if (!oldLinkedRead.startsWith("    function canSeparatorReadLinkedCall(data)")) {
    throw new Error("Expected linked-call read helper block exactly once");
  }
  replaceOnce(oldLinkedRead, optimizedLinkedRead, "optimized linked-call read");

  replaceOnce("          canSeparatorReadChamado(resource.data)\n          || (", "          canSeparatorReadChamado(resource.data)\n          || canSeparatorReadLinkedCall(resource.data)\n          || (", "linked operational call read");

  const oldFields = '"percentual_atendido", "status", "motivo_incompleto", "observacao_operador",\n        "atualizado_em", "atualizado_por", "operador_nome", "assumido_em", "cancelado_em"';
  const newFields = '"percentual_atendido", "status", "motivo_incompleto", "observacao_operador",\n        "confirmacoes_empilhadeira", "ultima_separacao_confirmacao_id", "ultima_auditoria_atualizacao_id",\n        "atualizado_em", "atualizado_por", "operador_nome", "assumido_em", "cancelado_em"';
  replaceOnce(oldFields, newFields.replace('"atualizado_em"', '"operador_uid", "atualizado_em"'), "separator changed fields");

  replaceOnce(`      let starting = oldData.status == "Aberto"
        && newData.status == "Em separação"
        && isCampoVazio(oldData.operador_nome)
        && newData.operador_nome is string
        && newData.operador_nome.size() > 0
        && newData.assumido_em is string
        && newData.assumido_em.size() > 0;`, `      let starting = oldData.status == "Aberto"
        && newData.status == "Em separação"
        && isCampoVazio(oldData.operador_nome)
        && oldData.get("operador_uid", null) == null
        && newData.get("operador_uid", null) == request.auth.uid
        && newData.operador_nome is string
        && newData.operador_nome.size() > 0
        && newData.assumido_em is string
        && newData.assumido_em.size() > 0
        && hasValidBoundedItems(newData.get("itens", []))
        && aggregatesMatch(newData, newData.itens);`, "UID-bound claim and bounded items");

  replaceOnce(`      let completing = oldData.status == "Em separação"
        && newData.status in ["Pronto", "Incompleto", "Cancelado"]
        && oldData.operador_nome == newData.operador_nome;`, `      let completing = oldData.status == "Em separação"
        && newData.status in ["Pronto", "Incompleto"]
        && oldData.get("operador_uid", null) == request.auth.uid
        && newData.get("operador_uid", null) == oldData.get("operador_uid", null)
        && oldData.operador_nome == newData.operador_nome
        && hasValidBoundedItems(newData.get("itens", []))
        && aggregatesMatch(newData, newData.itens)
        && finalStatusMatches(newData, newData.itens);`, "UID-bound finalization with item totals");

  replaceOnce(`      let retrying = oldData.status == "Incompleto"
        && newData.status in ["Pronto", "Incompleto", "Cancelado"]
        && oldData.operador_nome == newData.operador_nome;`, `      let retrying = false;`, "terminal incomplete status");

  const retryingEnd = `      let retrying = false;
      return (!("status" in userData) || userData.status == "Ativo")`;
  const confirmingEnd = `      let retrying = false;
      let confirming = isConfirmationOrderUpdate(oldData.id, oldData, newData);
      return (!("status" in userData) || userData.status == "Ativo")`;
  replaceOnce(retryingEnd, confirmingEnd, "separator confirmation transition");
  replaceOnce(`      return oldData.status == "Em separação"
        && newData.status == oldData.status`, `      return oldData.status == "Em separação"
        && oldData.get("operador_uid", null) == request.auth.uid
        && newData.get("operador_uid", null) == oldData.get("operador_uid", null)
        && newData.status == oldData.status`, "UID-bound item confirmation");
  replaceOnce("        && (starting || completing || retrying)\n        && separatorChangedFieldsAllowed", "        && (starting || completing || retrying || confirming)\n        && separatorChangedFieldsAllowed", "separator confirmation branch");

  const nestedMatch = `
      match /separacao_confirmacoes/{confirmationId} {
        function parentOrder() {
          return get(/databases/$(database)/documents/chamados/$(id)).data;
        }
        allow get: if isCurrentUserActive()
          && (isAdminGeral() || canAccessCurrentSupermercado(parentOrder().supermercado_id));
        allow list: if false;
        allow create: if isCurrentUserActive()
          && currentUserPerfil() == "Separador de Televendas"
          && request.resource.data.keys().hasOnly([
            "id", "pedido_id", "chamado_id", "item_index", "produto", "empresa_id",
            "supermercado_id", "actor_uid", "actor_nome", "quantidade", "unidade_medida",
            "justificativa", "confirmado_em"
          ])
          && request.resource.data.id == confirmationId
          && request.resource.data.pedido_id == id
          && request.resource.data.chamado_id == confirmationId
          && request.resource.data.actor_uid == request.auth.uid
          && request.resource.data.item_index is int
          && request.resource.data.quantidade is int
          && request.resource.data.confirmado_em == request.time
          && request.resource.data.keys().hasAll([
            "id", "pedido_id", "chamado_id", "item_index", "produto", "empresa_id",
            "supermercado_id", "actor_uid", "actor_nome", "quantidade", "unidade_medida", "confirmado_em"
          ])
          && getAfter(/databases/$(database)/documents/chamados/$(id)).data.ultima_separacao_confirmacao_id == confirmationId;
        allow update, delete: if false;
      }
`;
  replaceOnce("      allow delete: if isAdminGeral();\n    }\n\n    match /auditoria/{id}", `      allow delete: if isAdminGeral();\n${nestedMatch}    }\n\n    match /auditoria/{id}`, "nested immutable receipt match");

  replaceOnce('          "chamado_finalizado",\n          "empilhadeira_criada",', '          "chamado_finalizado",\n          "chamado_atualizado",\n          "empilhadeira_criada",', "audit action allowlist");
  const auditEnd = `        && request.resource.data.details is map
        && (
          !("empresa_id" in request.resource.data)`;
  const auditWithCorrelation = `        && request.resource.data.details is map
        && (request.resource.data.action != "chamado_atualizado"
          || (
            request.resource.data.entityType == "chamado"
            && request.resource.data.details.separacao_confirmacao_id is string
            && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.entityId)).data.ultima_auditoria_atualizacao_id == id
            && getAfter(/databases/$(database)/documents/chamados/$(request.resource.data.entityId)).data.ultima_separacao_confirmacao_id == request.resource.data.details.separacao_confirmacao_id
          ))
        && (
          !("empresa_id" in request.resource.data)`;
  replaceOnce(auditEnd, auditWithCorrelation, "correlated confirmation audit");

  return rules;
}

const experimentalRules = buildExperimentalRules(baseRules);
await writeFile(experimentRulesPath, experimentalRules);

const environment = await initializeTestEnvironment({
  projectId: "demo-patio-confirmation-proof",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "28080"),
    rules: experimentalRules,
  },
});

const product = (name, requested, found = 0) => ({
  produto: name,
  unidadeMedida: "Unidade",
  quantidadeSolicitada: requested,
  quantidadeEncontrada: found,
  quantidadeFaltante: requested - found,
  recebimentoEmpilhadeiraConfirmado: false,
});

async function seed({
  suffix,
  orderStatus = "Em separação",
  orderItems = [product("Arroz", 5), product("Feijão", 4)],
  orderCompany = "empresa-a",
  orderUnit = "loja-a",
  callCompany = orderCompany,
  callUnit = orderUnit,
  callStatus = "Finalizado",
  profile = "Separador de Televendas",
  assignedUid = "auto",
  includeAssignedUid = true,
  operatorName = "auto",
  userCompany = orderCompany,
  userUnit = orderUnit,
  category = "televendas",
  type = "Atendimento Televendas",
}) {
  const orderId = `pedido-${suffix}`;
  const callId = `chamado-${suffix}`;
  const uid = `user-${suffix}`;
  const assignedOperatorUid = assignedUid === "auto" ? (orderStatus === "Aberto" ? null : uid) : assignedUid;
  const assignedOperatorName = operatorName === "auto" ? (orderStatus === "Aberto" ? null : "Separador Teste") : operatorName;
  const forkliftOperatorUid = `operador-${suffix}`;
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, `empresas/${orderCompany}`), { status: "Ativa" });
    await setDoc(doc(firestore, `empresas/${callCompany}`), { status: "Ativa" });
    await setDoc(doc(firestore, `supermercados/${orderUnit}`), { empresa_id: orderCompany, status: "Ativo" });
    await setDoc(doc(firestore, `supermercados/${callUnit}`), { empresa_id: callCompany, status: "Ativo" });
    await setDoc(doc(firestore, `usuarios/${uid}`), {
      perfil: profile,
      status: "Ativo",
      empresa_id: userCompany,
      supermercado_id: userUnit,
    });
    await setDoc(doc(firestore, `usuarios/${forkliftOperatorUid}`), {
      perfil: "Operador", status: "Ativo", empresa_id: orderCompany, supermercado_id: orderUnit,
    });
    await setDoc(doc(firestore, `chamados/${orderId}`), {
      id: orderId,
      categoria: category,
      tipo_servico: type,
      status: orderStatus,
      empresa_id: orderCompany,
      supermercado_id: orderUnit,
      itens: orderItems,
      total_solicitado: orderItems.reduce((sum, item) => sum + item.quantidadeSolicitada, 0),
      total_encontrado: orderItems.reduce((sum, item) => sum + item.quantidadeEncontrada, 0),
      percentual_atendido: 0,
      confirmacoes_empilhadeira: {},
      operador_nome: assignedOperatorName,
      ...(includeAssignedUid ? { operador_uid: assignedOperatorUid } : {}),
      assumido_em: assignedOperatorUid ? "2026-10-30T10:00:00.000Z" : null,
      atualizado_em: "2026-10-30T10:00:00.000Z",
      atualizado_por: "Separador Teste",
      cancelado_em: null,
      motivo_incompleto: null,
      observacao_operador: null,
      ultima_separacao_confirmacao_id: null,
      ultima_auditoria_atualizacao_id: null,
    });
    await setDoc(doc(firestore, `chamados/${callId}`), {
      id: callId,
      categoria: "operacional",
      tipo_servico: "Descarga",
      status: callStatus,
      empresa_id: callCompany,
      supermercado_id: callUnit,
      pedido_origem_id: orderId,
      pedido_origem_item_index: 0,
      pedido_origem_produto: orderItems[0]?.produto ?? "Arroz",
      solicitante_uid: uid,
      operador_uid: forkliftOperatorUid,
      finalizado_por_uid: forkliftOperatorUid,
    });
  });
  return {
    orderId,
    callId,
    uid,
    forkliftOperatorUid,
    db: environment.authenticatedContext(uid).firestore(),
  };
}

function makePayload(order, call, actorUid, auditId, quantity, justification = "") {
  const itemIndex = 0;
  const oldItems = order.itens;
  const foundItems = oldItems.map((item, index) => index === itemIndex
    ? {
        ...item,
        quantidadeEncontrada: item.quantidadeEncontrada + quantity,
        quantidadeFaltante: item.quantidadeSolicitada - item.quantidadeEncontrada - quantity,
        recebimentoEmpilhadeiraConfirmado: true,
      }
    : { ...item });
  const requested = foundItems.reduce((sum, item) => sum + item.quantidadeSolicitada, 0);
  const found = foundItems.reduce((sum, item) => sum + item.quantidadeEncontrada, 0);
  const updatedAt = new Date().toISOString();
  return {
    order: {
      ...order,
      itens: foundItems,
      total_solicitado: requested,
      total_encontrado: found,
      percentual_atendido: requested === 0 ? 0 : Math.round((found / requested) * 100),
      confirmacoes_empilhadeira: {
        ...(order.confirmacoes_empilhadeira ?? {}),
        [call.id]: { item_index: itemIndex, quantidade: quantity, unidade_medida: foundItems[0].unidadeMedida },
      },
      ultima_separacao_confirmacao_id: call.id,
      ultima_auditoria_atualizacao_id: auditId,
      atualizado_em: updatedAt,
      atualizado_por: "Separador Teste",
    },
    receipt: {
      id: call.id,
      pedido_id: order.id,
      chamado_id: call.id,
      item_index: itemIndex,
      produto: foundItems[0].produto,
      empresa_id: order.empresa_id,
      supermercado_id: order.supermercado_id,
      actor_uid: actorUid,
      actor_nome: "Separador Teste",
      quantidade: quantity,
      unidade_medida: foundItems[0].unidadeMedida,
      justificativa: justification.trim() || null,
      confirmado_em: serverTimestamp(),
    },
    audit: {
      action: "chamado_atualizado",
      actorUid,
      actorName: "Separador Teste",
      entityType: "chamado",
      entityId: order.id,
      empresa_id: order.empresa_id,
      supermercado_id: order.supermercado_id,
      occurredAt: updatedAt,
      details: {
        empresa_id: order.empresa_id,
        supermercado_id: order.supermercado_id,
        statusAnterior: order.status,
        statusAtual: order.status,
        operador_nome: "Separador Teste",
        atualizado_em: updatedAt,
        categoria: "televendas",
        separacao_confirmacao_id: call.id,
        item_index: itemIndex,
        quantidade: quantity,
        unidade_medida: foundItems[0].unidadeMedida,
      },
    },
  };
}

async function executeAndroidShape(db, orderId, callId, quantity, justification = "", mutate = (value) => value, validateClient = true) {
  const orderRef = doc(db, `chamados/${orderId}`);
  const callRef = doc(db, `chamados/${callId}`);
  const receiptRef = doc(db, `chamados/${orderId}/separacao_confirmacoes/${callId}`);
  const auditRef = doc(collection(db, "auditoria"));
  return runTransaction(db, async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    const callSnapshot = await transaction.get(callRef);
    const receiptSnapshot = await transaction.get(receiptRef);
    assert.ok(orderSnapshot.exists() && callSnapshot.exists());
    assert.equal(receiptSnapshot.exists(), false, "receipt already exists");
    const order = { id: orderSnapshot.id, ...orderSnapshot.data() };
    const actorUid = orderId.replace(/^pedido-/, "user-");
    const call = { id: callSnapshot.id, ...callSnapshot.data() };
    if (validateClient) {
      assert.equal(order.status, "Em separação");
      assert.equal(call.status, "Finalizado");
      assert.equal(order.empresa_id, call.empresa_id);
      assert.equal(order.supermercado_id, call.supermercado_id);
      assert.equal(call.pedido_origem_id, orderId);
      assert.equal(call.pedido_origem_item_index, 0);
      assert.equal(call.pedido_origem_produto, order.itens[0].produto);
      assert.ok(quantity >= 0 && quantity <= order.itens[0].quantidadeSolicitada - order.itens[0].quantidadeEncontrada);
      assert.ok(quantity > 0 || justification.trim().length > 0);
    }
    const payload = makePayload(order, call, actorUid, auditRef.id, quantity, justification);
    const changed = mutate(payload) ?? payload;
    transaction.update(orderRef, changed.order);
    transaction.set(receiptRef, changed.receipt);
    if (!changed.skipAudit) transaction.set(auditRef, changed.audit);
    return changed;
  });
}

function orderRef(db, id) { return doc(db, `chamados/${id}`); }
function callRef(db, id) { return doc(db, `chamados/${id}`); }
function receiptRef(db, orderId, callId) { return doc(db, `chamados/${orderId}/separacao_confirmacoes/${callId}`); }
after(async () => environment.cleanup());

test("experimental rules permit the Android-shaped atomic confirmation", async () => {
  const ctx = await seed({ suffix: "valid" });
  await assertSucceeds(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 2));
  const order = await getDoc(orderRef(ctx.db, ctx.orderId));
  const receipt = await getDoc(receiptRef(ctx.db, ctx.orderId, ctx.callId));
  const audit = await getDoc(doc(ctx.db, `auditoria/${order.data().ultima_auditoria_atualizacao_id}`));
  assert.equal(order.data().itens[0].quantidadeEncontrada, 2);
  assert.equal(order.data().itens[1].quantidadeEncontrada, 0);
  assert.equal(order.data().total_encontrado, 2);
  assert.equal(receipt.data().quantidade, 2);
  assert.equal(audit.data().details.separacao_confirmacao_id, ctx.callId);
});

test("a second transaction with the same receipt id is rejected without duplicate writes", async () => {
  const ctx = await seed({ suffix: "duplicate" });
  await executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 2);
  await assert.rejects(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1));
  const order = await getDoc(orderRef(ctx.db, ctx.orderId));
  assert.equal(order.data().total_encontrado, 2);
});

test("client validation rejects quantities over the remaining balance", async () => {
  const ctx = await seed({ suffix: "over" });
  await assertFails(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 6, "", (value) => value, false));
  assert.equal((await getDoc(receiptRef(ctx.db, ctx.orderId, ctx.callId))).exists(), false);
});

test("zero quantity with a reason is accepted", async () => {
  const ctx = await seed({ suffix: "zero-reason" });
  await assertSucceeds(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 0, "Estoque indisponível"));
  assert.equal((await getDoc(receiptRef(ctx.db, ctx.orderId, ctx.callId))).data().quantidade, 0);
});

test("zero quantity without a reason and positive quantity over the bound are denied by client preconditions", async () => {
  const zero = await seed({ suffix: "zero-no-reason" });
  await assertFails(executeAndroidShape(zero.db, zero.orderId, zero.callId, 0, "", (value) => value, false));
  const positive = await seed({ suffix: "positive-no-reason" });
  await assertSucceeds(executeAndroidShape(positive.db, positive.orderId, positive.callId, 1));
});

test("a pedido outside Em separação is denied", async () => {
  const ctx = await seed({ suffix: "wrong-order-state", orderStatus: "Aberto" });
  await assertFails(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1, "", (value) => value, false));
});

test("a call from another unit or company is denied", async () => {
  const unit = await seed({ suffix: "cross-unit", callUnit: "loja-b" });
  await assertFails(executeAndroidShape(unit.db, unit.orderId, unit.callId, 1, "", (value) => value, false));
  const company = await seed({ suffix: "cross-company", callCompany: "empresa-b", callUnit: "loja-b" });
  await assertFails(executeAndroidShape(company.db, company.orderId, company.callId, 1, "", (value) => value, false));
});

test("a call not Finalizado is denied", async () => {
  const ctx = await seed({ suffix: "call-not-final", callStatus: "Em atendimento" });
  await assertFails(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1, "", (value) => value, false));
});

test("receipt update and delete remain denied after a successful confirmation", async () => {
  const ctx = await seed({ suffix: "immutable" });
  await executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1);
  const ref = receiptRef(ctx.db, ctx.orderId, ctx.callId);
  await assertFails(setDoc(ref, { quantidade: 999 }, { merge: true }));
  await assertFails(deleteDoc(ref));
});

test("forged receipt fields and direct orphan receipts are denied", async () => {
  const ctx = await seed({ suffix: "forged" });
  const receipt = receiptRef(ctx.db, ctx.orderId, ctx.callId);
  await assertFails(setDoc(receipt, {
    id: ctx.callId, pedido_id: ctx.orderId, chamado_id: ctx.callId,
    item_index: 0, produto: "Falsificado", empresa_id: "empresa-a", supermercado_id: "loja-a",
    actor_uid: ctx.uid, actor_nome: "Separador Teste", quantidade: 4,
    unidade_medida: "Unidade", justificativa: null, confirmado_em: serverTimestamp(),
  }));
});

test("manual aggregate manipulation is denied", async () => {
  const ctx = await seed({ suffix: "aggregate" });
  await assert.rejects(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1, "", (payload) => {
    payload.order.total_encontrado = 999;
    return payload;
  }));
  assert.equal((await getDoc(orderRef(ctx.db, ctx.orderId))).data().total_encontrado, 0);
});

test("audit omission or changed audit identity causes the atomic write to fail", async () => {
  const missing = await seed({ suffix: "no-audit" });
  await assert.rejects(executeAndroidShape(missing.db, missing.orderId, missing.callId, 1, "", (payload) => {
    payload.skipAudit = true;
    return payload;
  }));
  assert.equal((await getDoc(receiptRef(missing.db, missing.orderId, missing.callId))).exists(), false);

  const changed = await seed({ suffix: "bad-audit" });
  await assert.rejects(executeAndroidShape(changed.db, changed.orderId, changed.callId, 1, "", (payload) => {
    payload.audit.details.separacao_confirmacao_id = "forjado";
    return payload;
  }));

  const badReceipt = await seed({ suffix: "bad-receipt" });
  await assertFails(executeAndroidShape(badReceipt.db, badReceipt.orderId, badReceipt.callId, 1, "", (payload) => {
    payload.receipt.produto = "Outro produto";
    return payload;
  }));
});

test("an Operator cannot confirm a pedido", async () => {
  const ctx = await seed({ suffix: "operator", profile: "Operador" });
  await assertFails(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1));
  assert.equal((await getDoc(receiptRef(ctx.db, ctx.orderId, ctx.callId))).exists(), false);
});

test("legacy Administrador da Empresa does not inherit confirmation permission", async () => {
  const ctx = await seed({ suffix: "legacy-admin-profile", profile: "Administrador da Empresa" });
  await assertFails(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1));
  assert.equal((await getDoc(receiptRef(ctx.db, ctx.orderId, ctx.callId))).exists(), false);
});

test("legacy Televendas inferred from tipo_servico is supported when structured items exist", async () => {
  const ctx = await seed({ suffix: "legacy", category: undefined, type: "Atendimento Televendas" });
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    const { updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(firestore, `chamados/${ctx.orderId}`), { categoria: null });
  });
  await assertSucceeds(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1));
});

test("a legacy order without structured items cannot be confirmed", async () => {
  const ctx = await seed({ suffix: "legacy-no-items", orderItems: [] });
  await assert.rejects(executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1));
});

test("diagnostic attack: unrelated item fields are accepted by this Rules prototype", async () => {
  const ctx = await seed({ suffix: "other-item-attack" });
  const payload = await executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1, "", (value) => {
    value.order.itens[1].produto = "Produto alterado sem vínculo";
    value.order.itens[1].quantidadeSolicitada = 400;
    value.order.itens[1].quantidadeEncontrada = 399;
    value.order.itens[1].quantidadeFaltante = 1;
    return value;
  });
  const stored = await getDoc(orderRef(ctx.db, ctx.orderId));
  assert.equal(stored.data().itens[1].produto, "Produto alterado sem vínculo");
  assert.equal(payload.order.total_encontrado, 1);
});

test("concurrent distinct confirmations cannot exceed the remaining item quantity", async () => {
  const ctx = await seed({ suffix: "concurrent", orderItems: [product("Arroz", 2)] });
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "chamados/chamado-concurrent-b"), {
      id: "chamado-concurrent-b", categoria: "operacional", tipo_servico: "Descarga", status: "Finalizado",
      empresa_id: "empresa-a", supermercado_id: "loja-a", pedido_origem_id: ctx.orderId,
      pedido_origem_item_index: 0, pedido_origem_produto: "Arroz",
    });
  });
  const a = executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 2);
  const b = executeAndroidShape(ctx.db, ctx.orderId, "chamado-concurrent-b", 2);
  const outcomes = await Promise.allSettled([a, b]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await getDoc(orderRef(ctx.db, ctx.orderId))).data().total_encontrado, 2);
});

test("same call id concurrent retry creates only one receipt", async () => {
  const ctx = await seed({ suffix: "concurrent-duplicate" });
  const outcomes = await Promise.allSettled([
    executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1),
    executeAndroidShape(ctx.db, ctx.orderId, ctx.callId, 1),
  ]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await getDoc(receiptRef(ctx.db, ctx.orderId, ctx.callId))).exists(), true);
});
