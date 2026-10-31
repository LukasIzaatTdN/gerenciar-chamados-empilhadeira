import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { and, collection, deleteDoc, doc, getDocs, or, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";

const environment = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "8080"),
    rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});

const item = { produto: "Arroz", unidadeMedida: "Unidade", quantidadeSolicitada: 2, quantidadeEncontrada: 0, quantidadeFaltante: 2 };
const baseCall = (id, overrides = {}) => ({
  id, categoria: "televendas", empresa_id: "empresa-a", supermercado_id: "loja-a",
  solicitante_nome: "Solicitante teste", solicitante_uid: "requester", setor: "Televendas",
  tipo_servico: "Atendimento Televendas", numero_pedido: id, cliente: "Cliente teste",
  produto: "Arroz", quantidade: "2", itens: [item], total_solicitado: 2,
  total_encontrado: 0, percentual_atendido: 0, prioridade: "Normal", status: "Aberto",
  operador_nome: null, assumido_em: null, atualizado_em: null, atualizado_por: null,
  motivo_incompleto: null, observacao_operador: null, cancelado_em: null,
  empilhadeira_id: null, empilhadeira_identificacao: null, criado_em: "2026-10-29T00:00:00.000Z",
  ...overrides,
});

before(async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "empresas/empresa-a"), { status: "Ativa" });
    await setDoc(doc(firestore, "supermercados/loja-a"), { empresa_id: "empresa-a", status: "Ativo" });
    await setDoc(doc(firestore, "supermercados/loja-b"), { empresa_id: "empresa-a", status: "Ativo" });
    await setDoc(doc(firestore, "usuarios/separador-a"), {
      perfil: "Separador de Televendas", status: "Ativo", nome: "Separador teste",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(firestore, "usuarios/separador-b"), {
      perfil: "Separador de Televendas", status: "Ativo", nome: "Separador teste",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(firestore, "usuarios/operador-a"), {
      perfil: "Operador", status: "Ativo", empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(firestore, "chamados/pedido-aberto"), baseCall("pedido-aberto"));
    const legacyCall = baseCall("pedido-legado");
    delete legacyCall.categoria;
    await setDoc(doc(firestore, "chamados/pedido-legado"), legacyCall);
    const legacyWithoutItems = baseCall("pedido-legado-sem-itens");
    delete legacyWithoutItems.categoria;
    delete legacyWithoutItems.itens;
    await setDoc(doc(firestore, "chamados/pedido-legado-sem-itens"), legacyWithoutItems);
    await setDoc(doc(firestore, "chamados/pedido-operacional"), baseCall("pedido-operacional", {
      categoria: "operacional", tipo_servico: "Descarga", status: "Aguardando", itens: [],
    }));
    await setDoc(doc(firestore, "chamados/pedido-cancelacao"), baseCall("pedido-cancelacao"));
    await setDoc(doc(firestore, "chamados/pedido-uid-ownership"), baseCall("pedido-uid-ownership"));
    await setDoc(doc(firestore, "chamados/outra-unidade"), baseCall("outra-unidade", { supermercado_id: "loja-b" }));
  });
});

after(async () => environment.cleanup());

test("separator query reads only unit Televendas, including legacy type_servico documents", async () => {
  const db = environment.authenticatedContext("separador-a").firestore();
  const calls = query(
    collection(db, "chamados"),
    and(
    where("empresa_id", "==", "empresa-a"),
    where("supermercado_id", "==", "loja-a"),
    or(where("categoria", "==", "televendas"), where("tipo_servico", "==", "Atendimento Televendas"))
    )
  );
  const result = await assertSucceeds(getDocs(calls));
  const ids = result.docs.map((entry) => entry.id).sort();
  if (ids.join(",") !== "pedido-aberto,pedido-cancelacao,pedido-legado,pedido-legado-sem-itens") throw new Error(`Unexpected result set: ${ids.join(",")}`);
  await assertFails(getDocs(query(collection(db, "chamados"), where("empresa_id", "==", "empresa-a"))));
  await assertFails(getDocs(query(collection(db, "chamados"), where("supermercado_id", "==", "loja-b"))));
});

test("separator can assume, record item counts, and mark ready or incomplete with a reason", async () => {
  const db = environment.authenticatedContext("separador-a").firestore();
  const ref = doc(db, "chamados/pedido-aberto");
  await assertSucceeds(updateDoc(ref, {
    status: "Em separação", operador_nome: "Separador teste", separador_uid: "separador-a", assumido_em: "2026-10-29T01:00:00.000Z",
  }));
  const found = { ...item, quantidadeEncontrada: 2, quantidadeFaltante: 0 };
  await assertSucceeds(updateDoc(ref, {
    itens: [found], produto: "Arroz", quantidade: "2", total_solicitado: 2,
    total_encontrado: 2, percentual_atendido: 100, status: "Pronto", motivo_incompleto: null,
    atualizado_em: "2026-10-29T01:01:00.000Z", atualizado_por: "Separador teste",
    operador_nome: "Separador teste", separador_uid: "separador-a", cancelado_em: null,
  }));

  const incomplete = doc(db, "chamados/pedido-legado");
  await assertSucceeds(updateDoc(incomplete, {
    status: "Em separação", operador_nome: "Separador teste", separador_uid: "separador-a", assumido_em: "2026-10-29T02:00:00.000Z",
  }));
  await assertFails(updateDoc(incomplete, { status: "Incompleto", motivo_incompleto: null }));
  await assertSucceeds(updateDoc(incomplete, {
    itens: [item], status: "Incompleto", motivo_incompleto: "Estoque insuficiente",
    atualizado_em: "2026-10-29T02:01:00.000Z", atualizado_por: "Separador teste",
    operador_nome: "Separador teste", separador_uid: "separador-a", cancelado_em: null,
  }));

  const legacyWithoutItems = doc(db, "chamados/pedido-legado-sem-itens");
  const audit = doc(collection(db, "auditoria"));
  const batch = writeBatch(db);
  batch.update(legacyWithoutItems, {
    status: "Em separação", operador_nome: "Separador teste", separador_uid: "separador-a", assumido_em: "2026-10-29T02:30:00.000Z",
    atualizado_em: "2026-10-29T02:30:00.000Z",
  });
  batch.set(audit, {
    action: "chamado_assumido", actorUid: "separador-a", actorName: "Separador teste",
    entityType: "chamado", entityId: "pedido-legado-sem-itens", occurredAt: "2026-10-29T02:30:00.000Z",
    empresa_id: "empresa-a", supermercado_id: "loja-a",
    details: { empresa_id: "empresa-a", supermercado_id: "loja-a", statusAnterior: "Aberto", statusAtual: "Em separação", operador_nome: "Separador teste" },
  });
  await assertSucceeds(batch.commit());
});

test("separator ownership is tied to auth UID even when another separator has the same display name", async () => {
  const ownerDb = environment.authenticatedContext("separador-a").firestore();
  const ref = doc(ownerDb, "chamados/pedido-uid-ownership");
  await assertSucceeds(updateDoc(ref, {
    status: "Em separação", operador_nome: "Separador teste",
    separador_uid: "separador-a", assumido_em: "2026-10-29T02:45:00.000Z",
  }));

  const otherDb = environment.authenticatedContext("separador-b").firestore();
  await assertFails(updateDoc(doc(otherDb, "chamados/pedido-uid-ownership"), {
    status: "Cancelado", itens: [item], cancelado_em: "2026-10-29T02:46:00.000Z",
    atualizado_em: "2026-10-29T02:46:00.000Z", operador_nome: "Separador teste",
    separador_uid: "separador-b",
  }));

  await assertSucceeds(updateDoc(ref, {
    status: "Pronto", itens: [{ ...item, quantidadeEncontrada: 2, quantidadeFaltante: 0 }],
    total_solicitado: 2, total_encontrado: 2, percentual_atendido: 100,
    atualizado_em: "2026-10-29T02:47:00.000Z", operador_nome: "Separador teste",
    separador_uid: "separador-a", cancelado_em: null,
  }));
});

test("separator cannot change operational fields, unit scope, or incompatible status", async () => {
  const db = environment.authenticatedContext("separador-a").firestore();
  await assertFails(updateDoc(doc(db, "chamados/pedido-aberto"), { status: "Finalizado" }));
  await assertFails(updateDoc(doc(db, "chamados/pedido-aberto"), { empresa_id: "empresa-b" }));
  await assertFails(updateDoc(doc(db, "chamados/pedido-aberto"), {
    status: "Em separação", empresa_id: "empresa-b", operador_nome: "Separador teste",
    assumido_em: "2026-10-29T05:00:00.000Z",
  }));
  await assertFails(updateDoc(doc(db, "chamados/pedido-aberto"), { empilhadeira_id: "empilhadeira-forjada" }));
  await assertFails(updateDoc(doc(db, "chamados/outra-unidade"), { status: "Em separação" }));
});

test("separation confirmation documents remain client-immutable and default-denied", async () => {
  const db = environment.authenticatedContext("separador-a").firestore();
  const confirmation = doc(db, "separacao_confirmacoes/confirmation-forged");
  await assertFails(setDoc(confirmation, {
    uid: "separador-a", chamado_id: "pedido-aberto", item_index: 0, quantidade: 2,
  }));
  await assertFails(updateDoc(confirmation, { quantidade: 999 }));
  await assertFails(deleteDoc(confirmation));
  const nestedConfirmation = doc(db, "chamados/pedido-aberto/separacao_confirmacoes/confirmation-forged");
  await assertFails(setDoc(nestedConfirmation, { chamado_id: "pedido-aberto", quantidade: 2 }));
});

test("operator operational update remains available and separator cancellation remains status constrained", async () => {
  const operatorDb = environment.authenticatedContext("operador-a").firestore();
  await assertSucceeds(updateDoc(doc(operatorDb, "chamados/pedido-operacional"), {
    status: "Em atendimento", a_caminho_em: "2026-10-29T04:00:00.000Z",
    cheguei_em: "2026-10-29T04:00:00.000Z", iniciado_em: "2026-10-29T04:00:00.000Z",
    finalizado_em: null, cancelado_em: null,
  }));

  const separatorDb = environment.authenticatedContext("separador-a").firestore();
  const ref = doc(separatorDb, "chamados/pedido-cancelacao");
  await assertFails(updateDoc(ref, { status: "Cancelado" }));
  await assertSucceeds(updateDoc(ref, {
    status: "Em separação", operador_nome: "Separador teste", separador_uid: "separador-a", assumido_em: "2026-10-29T03:00:00.000Z",
  }));
  await assertSucceeds(updateDoc(ref, {
    status: "Cancelado", itens: [item], cancelado_em: "2026-10-29T03:01:00.000Z",
    atualizado_em: "2026-10-29T03:01:00.000Z", operador_nome: "Separador teste", separador_uid: "separador-a",
  }));
});

