import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";

const environment = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "8080"),
    rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});

const stamp = "2026-10-19T10:00:00.000Z";
const initial = {
  id: "tv-a", empresa_id: "empresa-a", supermercado_id: "loja-a",
  categoria: "televendas", tipo_servico: "Atendimento Televendas",
  status: "Em separação", operador_nome: "Operador A", atualizado_em: stamp,
  empilhadeira_id: null, empilhadeira_identificacao: null,
  assumido_em: stamp, a_caminho_em: null, cheguei_em: null,
  iniciado_em: null, finalizado_em: null, cancelado_em: null,
  itens: [{ id: "item-1", produto: "Produto", nome: "Produto", quantidade: 1 }],
  observacao_operador: null, motivo_incompleto: null,
};
const update = {
  status: "Pronto", atualizado_em: "2026-10-19T10:01:00.000Z",
  atualizado_por: "Operador A", operador_nome: "Operador A",
};
const audit = (id, overrides = {}) => ({
  action: "chamado_atualizado", actorUid: "operator-a", actorName: "Operador A",
  entityType: "chamado", entityId: id,
  empresa_id: "empresa-a", supermercado_id: "loja-a",
  occurredAt: "2026-10-19T10:01:00.000Z",
  details: {
    empresa_id: "empresa-a", supermercado_id: "loja-a",
    statusAnterior: "Em separação", statusAtual: "Pronto",
    operador_nome: "Operador A", atualizado_em: update.atualizado_em,
    categoria: "televendas",
  },
  ...overrides,
});

before(async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "usuarios/operator-a"), {
      perfil: "Separador de Televendas", status: "Ativo", nome: "Separador A",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(db, "usuarios/separator-legacy-company"), {
      perfil: "Separador de Televendas", status: "Ativo", nome: "Separador legado",
      supermercado_id: "loja-a",
    });
    await setDoc(doc(db, "usuarios/operator-b"), {
      perfil: "Separador de Televendas", status: "Ativo", nome: "Separador B",
      empresa_id: "empresa-b", supermercado_id: "loja-b",
    });
    await setDoc(doc(db, "usuarios/real-operator"), {
      perfil: "Operador", status: "Ativo", nome: "Operador Real",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(db, "usuarios/supervisor-a"), {
      perfil: "Supervisor", status: "Ativo", nome: "Supervisor A",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(db, "usuarios/company-admin-a"), {
      perfil: "Administrador da Empresa", status: "Ativo", nome: "Admin A",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(db, "usuarios/televendas-a"), {
      perfil: "Televendas", status: "Ativo", nome: "Televendas A",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(db, "usuarios/inactive-a"), {
      perfil: "Operador", status: "Inativo", nome: "Inativo A",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    for (const [company, store] of [["empresa-a", "loja-a"], ["empresa-b", "loja-b"]]) {
      await setDoc(doc(db, "empresas", company), { nome: company, status: "Ativa" });
      await setDoc(doc(db, "supermercados", store), { empresa_id: company, status: "Ativo", nome: store });
    }
    await setDoc(doc(db, "chamados/tv-a"), initial);
    // Keep linked-call creation independent from tests that advance tv-a's status.
    await setDoc(doc(db, "chamados/tv-linked"), { ...initial, id: "tv-linked" });
    await setDoc(doc(db, "chamados/tv-assumed"), {
      ...initial, id: "tv-assumed", status: "Em separação", operador_nome: "Separador A",
      assumido_em: stamp,
    });
    await setDoc(doc(db, "chamados/tv-regression"), { ...initial, id: "tv-regression" });
    await setDoc(doc(db, "chamados/tv-gap"), { ...initial, id: "tv-gap" });
    await setDoc(doc(db, "chamados/tv-b"), {
      ...initial, id: "tv-b", empresa_id: "empresa-b", supermercado_id: "loja-b",
    });
    await setDoc(doc(db, "chamados/tv-other-unit"), {
      ...initial, id: "tv-other-unit", supermercado_id: "loja-other",
    });
    await setDoc(doc(db, "supermercados/loja-other"), { empresa_id: "empresa-a", status: "Ativo", nome: "Outra" });
    await setDoc(doc(db, "chamados/op-source"), {
      ...initial, id: "op-source", categoria: "operacional", tipo_servico: "Reposição", status: "Aguardando",
    });
    await setDoc(doc(db, "chamados/op-operator-transition"), linkedOperationalCall("op-operator-transition", {
      operador_nome: null,
    }));
  });
});
after(async () => environment.cleanup());

test("a scoped Televendas separator can update a pedido and its audit atomically", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-a"), { ...update, ultima_auditoria_atualizacao_id: "tv-update-1" });
  batch.set(doc(db, "auditoria/tv-update-1"), audit("tv-a"));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(db, "chamados/tv-a"))).data().status, "Pronto");
  const recorded = (await getDoc(doc(db, "auditoria/tv-update-1"))).data();
  assert.equal(recorded.action, "chamado_atualizado");
  assert.equal(recorded.empresa_id, "empresa-a");
  assert.equal(recorded.details.statusAtual, "Pronto");
});

test("an operator cannot modify a Televendas pedido", async () => {
  const db = environment.authenticatedContext("real-operator").firestore();
  await assertFails(updateDoc(doc(db, "chamados/tv-a"), { status: "Pronto" }));
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-a"), { ...update, ultima_auditoria_atualizacao_id: "operator-tv-audit" });
  batch.set(doc(db, "auditoria/operator-tv-audit"), audit("tv-a", {
    actorUid: "real-operator", actorName: "Operador Real",
  }));
  await assertFails(batch.commit());
});

test("Televendas can create a pedido with its authenticated creator identity", async () => {
  const db = environment.authenticatedContext("televendas-a").firestore();
  const pedido = {
    id: "tv-created-by-televendas", empresa_id: "empresa-a", supermercado_id: "loja-a",
    categoria: "televendas", solicitante_nome: "Televendas A", solicitante_uid: "televendas-a",
    setor: "Televendas", tipo_servico: "Atendimento Televendas", numero_pedido: "PED-100",
    cliente: "Cliente A", produto: "Produto A", quantidade: "2 Unidade",
    itens: [{ produto: "Produto A", unidadeMedida: "Unidade", quantidadeSolicitada: 2, quantidadeEncontrada: 0, quantidadeFaltante: 2 }],
    total_solicitado: 2, total_encontrado: 0, percentual_atendido: 0,
    motivo_incompleto: null, observacao_operador: null, atualizado_em: null, atualizado_por: null,
    local_exato: "Separação A", local_separacao: "Separação A", prazo_limite: "18:00",
    prioridade: "Normal", observacoes: null, foto_nome: null, foto_data_url: null,
    empilhadeira_id: null, empilhadeira_identificacao: null, status: "Aberto",
    operador_nome: null, criado_em: stamp, assumido_em: null, a_caminho_em: null,
    cheguei_em: null, iniciado_em: null, finalizado_em: null, cancelado_em: null,
  };
  await assertSucceeds(setDoc(doc(db, "chamados/tv-created-by-televendas"), pedido));
  await assertFails(setDoc(doc(db, "chamados/tv-forged-creator"), {
    ...pedido, id: "tv-forged-creator", solicitante_uid: "another-user",
  }));
});

test("a Televendas separator cannot create an unlinked operational call, regardless of empty or forged link fields", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const unlinked = linkedOperationalCall("op-separator-unlinked", {
    pedido_origem_id: null,
    pedido_origem_item_index: null,
    pedido_origem_produto: null,
    localizacao_pallet: null,
  });
  await assertFails(setDoc(doc(db, "chamados/op-separator-unlinked"), unlinked));
  await assertFails(setDoc(doc(db, "chamados/op-separator-empty"), {
    ...unlinked, id: "op-separator-empty", pedido_origem_id: "",
  }));
  await assertFails(setDoc(doc(db, "chamados/op-separator-forged"), {
    ...unlinked, id: "op-separator-forged", pedido_origem_id: "tv-does-not-exist",
    pedido_origem_item_index: 0, pedido_origem_produto: "Produto",
    localizacao_pallet: "Rua 4, módulo 2, nível 1",
  }));
});

test("blocking unlinked operational calls for separators preserves other profiles and Televendas pedidos", async () => {
  const unlinked = linkedOperationalCall("op-unlinked-profile", {
    pedido_origem_id: null,
    pedido_origem_item_index: null,
    pedido_origem_produto: null,
    localizacao_pallet: null,
  });
  for (const [uid, id] of [
    ["real-operator", "op-unlinked-operator"],
    ["supervisor-a", "op-unlinked-supervisor"],
    ["company-admin-a", "op-unlinked-company-admin"],
  ]) {
    const db = environment.authenticatedContext(uid).firestore();
    await assertSucceeds(setDoc(doc(db, `chamados/${id}`), { ...unlinked, id, solicitante_uid: uid }));
  }
  const televendasDb = environment.authenticatedContext("televendas-a").firestore();
  await assertSucceeds(setDoc(doc(televendasDb, "chamados/op-unlinked-televendas"), {
    ...unlinked, id: "op-unlinked-televendas", solicitante_uid: "televendas-a",
  }));
  // The Televendas user's authorized order creation is covered above; the
  // separator remains allowed to create such orders by the unlinked branch.
  const separatorDb = environment.authenticatedContext("operator-a").firestore();
  const pedido = {
    id: "tv-created-by-separator", empresa_id: "empresa-a", supermercado_id: "loja-a",
    categoria: "televendas", solicitante_nome: "Separador A", solicitante_uid: "operator-a",
    setor: "Televendas", tipo_servico: "Atendimento Televendas", numero_pedido: "PED-SEP-1",
    cliente: "Cliente", produto: "Produto", quantidade: "1 Unidade",
    itens: [{ produto: "Produto", unidadeMedida: "Unidade", quantidadeSolicitada: 1, quantidadeEncontrada: 0, quantidadeFaltante: 1 }],
    total_solicitado: 1, total_encontrado: 0, percentual_atendido: 0,
    motivo_incompleto: null, observacao_operador: null, atualizado_em: null, atualizado_por: null,
    local_exato: "Separação A", local_separacao: "Separação A", prazo_limite: "18:00",
    prioridade: "Normal", observacoes: null, foto_nome: null, foto_data_url: null,
    empilhadeira_id: null, empilhadeira_identificacao: null, status: "Aberto",
    operador_nome: null, criado_em: stamp, assumido_em: null, a_caminho_em: null,
    cheguei_em: null, iniciado_em: null, finalizado_em: null, cancelado_em: null,
  };
  await assertSucceeds(setDoc(doc(separatorDb, "chamados/tv-created-by-separator"), pedido));
});

const linkedOperationalCall = (id, overrides = {}) => ({
  id, empresa_id: "empresa-a", supermercado_id: "loja-a", categoria: "operacional",
  solicitante_nome: "Separador A", solicitante_uid: "operator-a", setor: "Televendas",
  local_exato: "Corredor 3", tipo_servico: "Movimentação", numero_pedido: null,
  cliente: null, produto: "Produto", quantidade: null, itens: [], total_solicitado: null,
  total_encontrado: null, percentual_atendido: null, motivo_incompleto: null,
  observacao_operador: null, atualizado_em: null, atualizado_por: null, local_separacao: null,
  prazo_limite: null, prioridade: "Normal", observacoes: null, foto_nome: null,
  foto_data_url: null, empilhadeira_id: null, empilhadeira_identificacao: null,
  pedido_origem_id: "tv-linked", pedido_origem_item_index: 0, pedido_origem_produto: "Produto",
  localizacao_pallet: "Rua 4, módulo 2, nível 1", status: "Aguardando", operador_nome: null,
  criado_em: stamp, assumido_em: null, a_caminho_em: null, cheguei_em: null,
  iniciado_em: null, finalizado_em: null, cancelado_em: null, ...overrides,
});

test("an Operator can assume and advance a linked operational call without changing its Televendas pedido", async () => {
  const db = environment.authenticatedContext("real-operator").firestore();
  const callRef = doc(db, "chamados/op-operator-transition");
  const pedidoRef = doc(db, "chamados/tv-linked");
  await assertSucceeds(updateDoc(callRef, {
    operador_nome: "Operador Real", assumido_em: stamp, atualizado_em: stamp,
  }));
  await assertSucceeds(updateDoc(callRef, {
    a_caminho_em: "2026-10-19T10:01:00.000Z",
    atualizado_em: "2026-10-19T10:01:00.000Z",
  }));
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const current = await transaction.get(callRef);
    const time = "2026-10-19T10:02:00.000Z";
    transaction.update(callRef, {
      status: "Em atendimento", iniciado_em: time, atualizado_em: time, atualizado_por: "Operador Real",
      operador_nome: "Operador Real", assumido_em: current.data().assumido_em,
      a_caminho_em: current.data().a_caminho_em, cheguei_em: time,
      finalizado_em: null, cancelado_em: null,
      empilhadeira_id: null, empilhadeira_identificacao: null,
    });
    transaction.set(doc(db, "auditoria/operator-transition-start"), {
      action: "chamado_iniciado", actorUid: "real-operator", actorName: "Operador Real",
      entityType: "chamado", entityId: current.id, occurredAt: time,
      empresa_id: "empresa-a", supermercado_id: "loja-a",
      details: {
        statusAnterior: current.data().status, statusAtual: "Em atendimento",
        operador_nome: "Operador Real", empresa_id: "empresa-a", supermercado_id: "loja-a",
      },
    });
  }));
  assert.equal((await getDoc(callRef)).data().status, "Em atendimento");
  assert.equal((await getDoc(callRef)).data().a_caminho_em, "2026-10-19T10:01:00.000Z");
  assert.equal((await getDoc(pedidoRef)).data().status, "Em separação");
});

test("multiple operational calls can link to the same Televendas pedido without changing it", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertSucceeds(setDoc(doc(db, "chamados/op-linked-1"), linkedOperationalCall("op-linked-1")));
  await assertSucceeds(setDoc(doc(db, "chamados/op-linked-2"), linkedOperationalCall("op-linked-2", {
    tipo_servico: "Retirada", localizacao_pallet: "Rua 5, módulo 1, nível 2",
  })));
  const created = (await getDoc(doc(db, "chamados/op-linked-1"))).data();
  assert.equal(created.categoria, "operacional");
  assert.equal(created.status, "Aguardando");
  assert.equal(created.pedido_origem_id, "tv-linked");
  assert.equal(created.pedido_origem_item_index, 0);
  assert.equal(created.pedido_origem_produto, "Produto");
  assert.equal((await getDoc(doc(db, "chamados/tv-linked"))).data().status, "Em separação");
});

test("linked calls reject missing, non-Televendas, and incomplete item references", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(setDoc(doc(db, "chamados/op-no-origin"), linkedOperationalCall("op-no-origin", { pedido_origem_id: "missing" })));
  await assertFails(setDoc(doc(db, "chamados/op-not-tv"), linkedOperationalCall("op-not-tv", { pedido_origem_id: "op-source" })));
  await assertFails(setDoc(doc(db, "chamados/op-missing-item"), linkedOperationalCall("op-missing-item", { pedido_origem_produto: "" })));
  await assertFails(setDoc(doc(db, "chamados/op-item-index"), linkedOperationalCall("op-item-index", { pedido_origem_item_index: -1 })));
});

test("linked calls cannot cross company or unit boundaries", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(setDoc(doc(db, "chamados/op-cross-unit"), linkedOperationalCall("op-cross-unit", { pedido_origem_id: "tv-other-unit" })));
  await assertFails(setDoc(doc(db, "chamados/op-cross-company"), linkedOperationalCall("op-cross-company", { pedido_origem_id: "tv-b" })));
});

test("only Televendas separators and scoped administrators can create linked calls", async () => {
  const operatorDb = environment.authenticatedContext("real-operator").firestore();
  await assertFails(setDoc(doc(operatorDb, "chamados/op-linked-operator"), linkedOperationalCall("op-linked-operator", { solicitante_uid: "real-operator" })));
  const tvDb = environment.authenticatedContext("televendas-a").firestore();
  await assertFails(setDoc(doc(tvDb, "chamados/op-linked-tv"), linkedOperationalCall("op-linked-tv", { solicitante_uid: "televendas-a" })));
});

test("a Televendas separator cannot update an operational call", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(updateDoc(doc(db, "chamados/op-source"), { status: "Em atendimento" }));
});

test("a separator reads only linked calls in the authorized unit and receives live status changes", async () => {
  const separatorDb = environment.authenticatedContext("operator-a").firestore();
  const linkedRef = doc(separatorDb, "chamados/op-read-live");
  await assertSucceeds(setDoc(linkedRef, linkedOperationalCall("op-read-live")));
  await assertFails(getDoc(doc(separatorDb, "chamados/op-source")));
  await assertSucceeds(getDoc(doc(separatorDb, "chamados/tv-linked")));

  const linkedQuery = query(
    collection(separatorDb, "chamados"),
    where("empresa_id", "==", "empresa-a"),
    where("supermercado_id", "==", "loja-a"),
    where("categoria", "==", "operacional"),
    where("pedido_origem_id", "in", ["tv-linked"])
  );
  const linkedSnapshot = await getDocs(linkedQuery);
  assert(linkedSnapshot.docs.some((snapshot) => snapshot.id === "op-read-live"));

  const foreignDb = environment.authenticatedContext("operator-b").firestore();
  await assertFails(getDoc(doc(foreignDb, "chamados/op-read-live")));

  const operatorDb = environment.authenticatedContext("real-operator").firestore();
  await assertSucceeds(getDoc(doc(operatorDb, "chamados/op-source")));

  let unsubscribe = () => {};
  const initialSnapshot = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for linked-call snapshot")), 5000);
    unsubscribe = onSnapshot(linkedQuery, (snapshot) => {
      if (snapshot.docs.some((entry) => entry.id === "op-read-live")) {
        clearTimeout(timeout);
        resolve();
      }
    }, (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  try {
    await initialSnapshot;
    unsubscribe();
    const statusUpdate = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for linked-call status update")), 5000);
      unsubscribe = onSnapshot(linkedQuery, (snapshot) => {
        const linkedCall = snapshot.docs.find((entry) => entry.id === "op-read-live")?.data();
        if (linkedCall?.status === "Em atendimento") {
          clearTimeout(timeout);
          resolve();
        }
      }, (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    await environment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "chamados/op-read-live"), {
        status: "Em atendimento", operador_nome: "Operador A", iniciado_em: stamp,
      });
    });
    await statusUpdate;
    assert.equal((await getDoc(doc(separatorDb, "chamados/tv-linked"))).data().status, "Em separação");
  } finally {
    unsubscribe();
  }
});

test("a Televendas separator can still query a pedido after assuming it for separation", async () => {
  const separatorDb = environment.authenticatedContext("operator-a").firestore();
  const assignedOrderQuery = query(
    collection(separatorDb, "chamados"),
    where("empresa_id", "==", "empresa-a"),
    where("supermercado_id", "==", "loja-a"),
    where("categoria", "==", "televendas")
  );
  const snapshot = await getDocs(assignedOrderQuery);
  const assignedOrder = snapshot.docs.find((entry) => entry.id === "tv-assumed");
  assert.ok(assignedOrder, "an assigned Em separação pedido remains readable to its separator");
  assert.equal(assignedOrder.data().status, "Em separação");
  assert.equal(assignedOrder.data().operador_nome, "Separador A");
});

test("a separator without empresa_id can read pedidos through the linked unit scope only", async () => {
  const separatorDb = environment.authenticatedContext("separator-legacy-company").firestore();
  const pedidosQuery = query(
    collection(separatorDb, "chamados"),
    where("empresa_id", "==", "empresa-a"),
    where("supermercado_id", "==", "loja-a"),
    where("categoria", "==", "televendas")
  );
  const snapshot = await getDocs(pedidosQuery);
  assert(snapshot.docs.some((entry) => entry.id === "tv-assumed"));
  await assertFails(getDoc(doc(separatorDb, "chamados/tv-b")));
});

test("a foreign-company separator cannot update or audit another company's call", async () => {
  const db = environment.authenticatedContext("operator-b").firestore();
  await assertFails(updateDoc(doc(db, "chamados/tv-a"), { status: "Incompleto" }));
  await assertFails(setDoc(doc(db, "auditoria/tv-foreign-1"), audit("tv-a", { actorUid: "operator-b" })));
  await assertFails(getDoc(doc(db, "chamados/tv-a")));
});

test("a foreign-company separator cannot disguise the event as its own company", async () => {
  const db = environment.authenticatedContext("operator-b").firestore();
  await assertFails(setDoc(doc(db, "auditoria/tv-foreign-2"), audit("tv-a", {
    actorUid: "operator-b",
    empresa_id: "empresa-a", supermercado_id: "loja-a",
  })));
});

test("an invalid audit rejects the entire batch without updating the call", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const beforeStatus = (await getDoc(doc(db, "chamados/tv-a"))).data().status;
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-a"), { status: "Incompleto" });
  batch.set(doc(db, "auditoria/tv-invalid-actor"), audit("tv-a", { actorUid: "operator-b" }));
  await assertFails(batch.commit());
  assert.equal((await getDoc(doc(db, "chamados/tv-a"))).data().status, beforeStatus);
});

test("inactive operators cannot update calls or create audit records", async () => {
  const db = environment.authenticatedContext("inactive-a").firestore();
  await assertFails(updateDoc(doc(db, "chamados/tv-a"), { status: "Incompleto" }));
  await assertFails(setDoc(doc(db, "auditoria/tv-inactive"), audit("tv-a", { actorUid: "inactive-a" })));
});

test("audit records are immutable after creation", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(updateDoc(doc(db, "auditoria/tv-update-1"), { action: "chamado_finalizado" }));
});

test("standalone forged update audit is denied", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(setDoc(doc(db, "auditoria/tv-standalone-gap"), audit("tv-a", {
    details: { ...audit("tv-a").details, statusAtual: "Cancelado" },
  })));
});

test("audit with a mismatched post-commit status is denied", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-a"), {
    ...update, status: "Incompleto", atualizado_em: "2026-10-19T10:02:00.000Z",
    ultima_auditoria_atualizacao_id: "tv-wrong-status",
  });
  batch.set(doc(db, "auditoria/tv-wrong-status"), audit("tv-a", {
    details: { ...audit("tv-a").details, statusAnterior: "Pronto", statusAtual: "Pronto", atualizado_em: "2026-10-19T10:02:00.000Z" },
  }));
  await assertFails(batch.commit());
});

test("marker-only changes cannot manufacture a new update event", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-a"), {
    ultima_auditoria_atualizacao_id: "tv-marker-only",
    atualizado_em: "2026-10-19T10:03:00.000Z",
  });
  batch.set(doc(db, "auditoria/tv-marker-only"), audit("tv-a", {
    details: { ...audit("tv-a").details, statusAnterior: "Pronto", atualizado_em: "2026-10-19T10:03:00.000Z" },
  }));
  await assertFails(batch.commit());
});

test("an old audit ID cannot be reused for a later update", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-a"), {
    status: "Incompleto", atualizado_em: "2026-10-19T10:04:00.000Z",
    ultima_auditoria_atualizacao_id: "tv-update-1",
  });
  batch.set(doc(db, "auditoria/tv-update-1"), audit("tv-a"));
  await assertFails(batch.commit());
});


// Stage 6.10.1: explicit positive controls and regression probes.
// Keep these isolated from tv-a, whose state changes in the original suite.
test("a valid second same-company update and matching audit succeed", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-regression"), {
    ...update, ultima_auditoria_atualizacao_id: "tv-regression-audit",
  });
  batch.set(doc(db, "auditoria/tv-regression-audit"), audit("tv-regression"));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(db, "chamados/tv-regression"))).data().ultima_auditoria_atualizacao_id, "tv-regression-audit");
});

test("foreign-company separator cannot submit a complete valid-shaped update batch", async () => {
  const db = environment.authenticatedContext("operator-b").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-regression"), {
    ...update, atualizado_em: "2026-10-19T10:05:00.000Z",
    ultima_auditoria_atualizacao_id: "tv-cross-company-batch",
  });
  batch.set(doc(db, "auditoria/tv-cross-company-batch"), audit("tv-regression", {
    actorUid: "operator-b",
    occurredAt: "2026-10-19T10:05:00.000Z",
    details: { ...audit("tv-regression").details, statusAnterior: "Pronto", statusAtual: "Incompleto", atualizado_em: "2026-10-19T10:05:00.000Z" },
  }));
  await assertFails(batch.commit());
  assert.equal((await getDoc(doc(environment.authenticatedContext("operator-a").firestore(), "chamados/tv-regression"))).data().ultima_auditoria_atualizacao_id, "tv-regression-audit");
});

test("Televendas scoped update rejects immutable identity and tenant changes", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(updateDoc(doc(db, "chamados/tv-regression"), {
    empresa_id: "empresa-b", atualizado_em: "2026-10-19T10:06:00.000Z",
    ultima_auditoria_atualizacao_id: "tv-illegal-company",
  }));
  await assertFails(updateDoc(doc(db, "chamados/tv-regression"), {
    id: "another-id", atualizado_em: "2026-10-19T10:06:00.000Z",
    ultima_auditoria_atualizacao_id: "tv-illegal-id",
  }));
});

test("a standalone audit cannot reuse the latest committed marker", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(setDoc(doc(db, "auditoria/tv-audit-replay"), audit("tv-regression", {
    details: { ...audit("tv-regression").details, statusAnterior: "Pronto" },
  })));
});

// Regression: a matching audit MUST be created in the same atomic commit.
test("same-tenant marker update without audit is denied and call stays unchanged", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(updateDoc(doc(db, "chamados/tv-gap"), {
    status: "Pronto", atualizado_em: "2026-10-19T10:07:00.000Z",
    atualizado_por: "Operador A", operador_nome: "Operador A",
    ultima_auditoria_atualizacao_id: "tv-no-audit",
  }));
  const call = await getDoc(doc(db, "chamados/tv-gap"));
  assert.equal(call.data().status, "Em separação");
  assert.equal(call.data().ultima_auditoria_atualizacao_id, undefined);
  await environment.withSecurityRulesDisabled(async context => {
    const auditSnapshot = await getDoc(doc(context.firestore(), "auditoria/tv-no-audit"));
    assert.equal(auditSnapshot.exists(), false);
  });
});

test("a scoped separator cannot attach a foreign call's audit to its marker", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-gap"), {
    ...update, ultima_auditoria_atualizacao_id: "tv-wrong-entity",
  });
  batch.set(doc(db, "auditoria/tv-wrong-entity"), audit("tv-regression"));
  await assertFails(batch.commit());
  assert.equal((await getDoc(doc(db, "chamados/tv-gap"))).data().status, "Em separação");
});


test("active separator from company B can update its own Televendas call with an atomic audit", async () => {
  const db = environment.authenticatedContext("operator-b").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-b"), {
    status: "Pronto", atualizado_em: "2026-10-19T10:09:00.000Z",
    atualizado_por: "Operador B", operador_nome: "Operador B",
    ultima_auditoria_atualizacao_id: "tv-company-b-ok",
  });
  batch.set(doc(db, "auditoria/tv-company-b-ok"), audit("tv-b", {
    actorUid: "operator-b", actorName: "Operador B",
    empresa_id: "empresa-b", supermercado_id: "loja-b",
    occurredAt: "2026-10-19T10:09:00.000Z",
    details: {
      ...audit("tv-b").details,
      empresa_id: "empresa-b", supermercado_id: "loja-b",
      statusAtual: "Pronto", operador_nome: "Operador B",
      atualizado_em: "2026-10-19T10:09:00.000Z",
    },
  }));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(db, "chamados/tv-b"))).data().status, "Pronto");
});

test("inactive operator cannot bypass restrictions using a complete Televendas audit batch", async () => {
  const db = environment.authenticatedContext("inactive-a").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-gap"), {
    ...update, atualizado_por: "Inativo A", operador_nome: "Inativo A",
    ultima_auditoria_atualizacao_id: "tv-inactive-batch",
  });
  batch.set(doc(db, "auditoria/tv-inactive-batch"), audit("tv-gap", {
    actorUid: "inactive-a", actorName: "Inativo A",
    details: { ...audit("tv-gap").details, operador_nome: "Inativo A" },
  }));
  await assertFails(batch.commit());
  assert.equal((await getDoc(doc(environment.authenticatedContext("operator-a").firestore(), "chamados/tv-gap"))).data().status, "Em separação");
});


test("invalid marker write is rejected without invoking the legacy update path", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(updateDoc(doc(db, "chamados/tv-gap"), {
    ultima_auditoria_atualizacao_id: "tv-missing-audit",
    atualizado_em: "2026-10-19T10:12:00.000Z",
  }));
  const snapshot = await getDoc(doc(db, "chamados/tv-gap"));
  assert.equal(snapshot.data().ultima_auditoria_atualizacao_id, undefined);
});

test("legacy same-tenant update without changing audit marker remains available", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertSucceeds(updateDoc(doc(db, "chamados/tv-gap"), {
    observacao_operador: "Revisão operacional sem novo marcador",
  }));
  assert.equal(
    (await getDoc(doc(db, "chamados/tv-gap"))).data().observacao_operador,
    "Revisão operacional sem novo marcador"
  );
});


test("audit without entityId is rejected before any call lookup", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const malformed = audit("tv-gap");
  delete malformed.entityId;
  await assertFails(setDoc(doc(db, "auditoria/tv-no-entity-id"), malformed));
});

test("audit with non-string entityId is rejected before any call lookup", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(setDoc(doc(db, "auditoria/tv-numeric-entity-id"), {
    ...audit("tv-gap"), entityId: 123,
  }));
});

test("missing audit details is rejected", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const payload = audit("tv-gap");
  delete payload.details;
  await assertFails(setDoc(doc(db, "auditoria/tv-missing-details"), payload));
});

test("incomplete audit details is rejected", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertFails(setDoc(doc(db, "auditoria/tv-incomplete-details"), {
    ...audit("tv-gap"),
    details: { categoria: "televendas" },
  }));
});


test("6.10.11: orphaned and replayed Televendas audit records are rejected", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  // A syntactically complete audit cannot refer to a nonexistent call.
  await assertFails(setDoc(doc(db, "auditoria/tv-orphan-61011"), audit("tv-does-not-exist")));
  // The current call already references its original audit marker; a new
  // standalone audit must not be authorized by that prior successful update.
  await assertFails(setDoc(doc(db, "auditoria/tv-replay-61011"), audit("tv-regression", {
    details: { ...audit("tv-regression").details, statusAnterior: "Pronto" },
  })));
});


test("6.10.12: company admin can atomically audit its own Televendas call", async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "usuarios/company-admin-61012"), {
      perfil: "Administrador da Empresa", status: "Ativo",
      empresa_id: "empresa-a", supermercado_id: null, nome: "Admin A",
    });
    await setDoc(doc(db, "chamados/tv-admin-61012"), { ...initial, id: "tv-admin-61012" });
  });
  const db = environment.authenticatedContext("company-admin-61012").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-admin-61012"), {
    ...update, ultima_auditoria_atualizacao_id: "tv-admin-audit-61012",
  });
  batch.set(doc(db, "auditoria/tv-admin-audit-61012"), audit("tv-admin-61012", {
    actorUid: "company-admin-61012", actorName: "Admin A",
  }));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(db, "chamados/tv-admin-61012"))).data().status, "Pronto");
});

test("6.10.12: company admin cannot create a foreign company's Televendas audit", async () => {
  const db = environment.authenticatedContext("company-admin-61012").firestore();
  await assertFails(setDoc(doc(db, "auditoria/tv-admin-foreign-61012"), audit("tv-b", {
    actorUid: "company-admin-61012", actorName: "Admin A",
    empresa_id: "empresa-b", supermercado_id: "loja-b",
    details: {
      ...audit("tv-b").details,
      empresa_id: "empresa-b", supermercado_id: "loja-b",
    },
  })));
});
