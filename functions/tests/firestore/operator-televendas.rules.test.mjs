import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const environment = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "8080"),
    rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});

const televendasOrder = (id, overrides = {}) => ({
  id,
  categoria: "televendas",
  empresa_id: "empresa-a",
  supermercado_id: "loja-a",
  solicitante_nome: "Solicitante de teste",
  solicitante_uid: "solicitante-a",
  setor: "Televendas",
  tipo_servico: "Atendimento Televendas",
  numero_pedido: id,
  cliente: "Cliente teste",
  produto: "Arroz",
  quantidade: "2",
  itens: [{ produto: "Arroz", unidadeMedida: "Unidade", quantidadeSolicitada: 2, quantidadeEncontrada: 0, quantidadeFaltante: 2 }],
  total_solicitado: 2,
  total_encontrado: 0,
  percentual_atendido: 0,
  prioridade: "Normal",
  status: "Aberto",
  operador_nome: null,
  assumido_em: null,
  a_caminho_em: null,
  cheguei_em: null,
  iniciado_em: null,
  finalizado_em: null,
  cancelado_em: null,
  atualizado_em: null,
  atualizado_por: null,
  motivo_incompleto: null,
  observacao_operador: null,
  empilhadeira_id: null,
  empilhadeira_identificacao: null,
  criado_em: "2026-10-30T00:00:00.000Z",
  ...overrides,
});

before(async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "empresas/empresa-a"), { status: "Ativa" });
    await setDoc(doc(db, "supermercados/loja-a"), { empresa_id: "empresa-a", status: "Ativo" });
    await setDoc(doc(db, "supermercados/loja-b"), { empresa_id: "empresa-a", status: "Ativo" });
    await setDoc(doc(db, "usuarios/operador-a"), {
      nome: "Operador A", perfil: "Operador", status: "Ativo",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(db, "usuarios/operador-b"), {
      nome: "Operador B", perfil: "Operador", status: "Ativo",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(db, "chamados/pedido-operador"), televendasOrder("pedido-operador"));
    await setDoc(doc(db, "chamados/pedido-status-incorreto"), televendasOrder("pedido-status-incorreto"));
    await setDoc(doc(db, "chamados/pedido-outra-unidade"), televendasOrder("pedido-outra-unidade", {
      supermercado_id: "loja-b",
    }));
    await setDoc(doc(db, "chamados/chamado-operacional"), televendasOrder("chamado-operacional", {
      categoria: "operacional", tipo_servico: "Descarga", status: "Aguardando", itens: [],
    }));
  });
});

after(async () => environment.cleanup());

test("Operator can assume, update separation, and finalize a Televendas order with audit batches", async () => {
  const db = environment.authenticatedContext("operador-a").firestore();
  const order = doc(db, "chamados/pedido-operador");

  const assumeBatch = writeBatch(db);
  const assumeAudit = doc(collection(db, "auditoria"));
  assumeBatch.update(order, {
    status: "Em separação", operador_nome: "Operador A",
    assumido_em: "2026-10-30T01:00:00.000Z", atualizado_em: "2026-10-30T01:00:00.000Z",
  });
  assumeBatch.set(assumeAudit, {
    action: "chamado_assumido", actorUid: "operador-a", actorName: "Operador A",
    entityType: "chamado", entityId: "pedido-operador", occurredAt: "2026-10-30T01:00:00.000Z",
    empresa_id: "empresa-a", supermercado_id: "loja-a",
    details: { empresa_id: "empresa-a", supermercado_id: "loja-a", statusAnterior: "Aberto", statusAtual: "Em separação", operador_nome: "Operador A" },
  });
  await assertSucceeds(assumeBatch.commit());

  await assertSucceeds(updateDoc(order, {
    itens: [{ produto: "Arroz", unidadeMedida: "Unidade", quantidadeSolicitada: 2, quantidadeEncontrada: 2, quantidadeFaltante: 0 }],
    produto: "Arroz", quantidade: "2", total_solicitado: 2,
    total_encontrado: 2, percentual_atendido: 100, status: "Pronto",
    motivo_incompleto: null, observacao_operador: null,
    atualizado_em: "2026-10-30T01:01:00.000Z", atualizado_por: "Operador A",
    operador_nome: "Operador A", cancelado_em: null,
  }));

  const finishBatch = writeBatch(db);
  const finishAudit = doc(collection(db, "auditoria"));
  finishBatch.update(order, {
    status: "Finalizado", finalizado_em: "2026-10-30T01:02:00.000Z",
    operador_nome: "Operador A", cancelado_em: null,
    atualizado_em: "2026-10-30T01:02:00.000Z", atualizado_por: "Operador A",
  });
  finishBatch.set(finishAudit, {
    action: "chamado_finalizado", actorUid: "operador-a", actorName: "Operador A",
    entityType: "chamado", entityId: "pedido-operador", occurredAt: "2026-10-30T01:02:00.000Z",
    empresa_id: "empresa-a", supermercado_id: "loja-a",
    details: { empresa_id: "empresa-a", supermercado_id: "loja-a", statusAnterior: "Pronto", statusAtual: "Finalizado", operador_nome: "Operador A" },
  });
  await assertSucceeds(finishBatch.commit());
});

test("Operator Televendas changes remain bound to its current operator, unit and allowed transitions", async () => {
  const db = environment.authenticatedContext("operador-a").firestore();
  await assertFails(updateDoc(doc(db, "chamados/pedido-outra-unidade"), {
    status: "Em separação", operador_nome: "Operador A", assumido_em: "2026-10-30T02:00:00.000Z",
  }));
  await assertFails(updateDoc(doc(db, "chamados/pedido-operador"), {
    status: "Finalizado", finalizado_em: "2026-10-30T02:00:00.000Z",
  }));
  await assertFails(updateDoc(doc(db, "chamados/pedido-status-incorreto"), {
    status: "Em separação", operador_nome: "Operador B", assumido_em: "2026-10-30T02:00:00.000Z",
  }));
  await assertFails(updateDoc(doc(db, "chamados/pedido-status-incorreto"), {
    status: "Em separação", operador_nome: "Operador A", assumido_em: "2026-10-30T02:00:00.000Z",
    empilhadeira_id: "empilhadeira-forjada",
  }));

  const otherOperatorDb = environment.authenticatedContext("operador-b").firestore();
  await assertFails(updateDoc(doc(otherOperatorDb, "chamados/pedido-status-incorreto"), {
    status: "Finalizado", operador_nome: "Operador A", finalizado_em: "2026-10-30T02:00:00.000Z",
  }));
});

test("Operator retains the existing operational call update path", async () => {
  const db = environment.authenticatedContext("operador-a").firestore();
  await assertSucceeds(updateDoc(doc(db, "chamados/chamado-operacional"), {
    status: "Em atendimento", operador_nome: "Operador A",
    iniciado_em: "2026-10-30T03:00:00.000Z", assumido_em: "2026-10-30T03:00:00.000Z",
    atualizado_em: "2026-10-30T03:00:00.000Z", atualizado_por: "Operador A",
    finalizado_em: null, cancelado_em: null,
  }));
});
