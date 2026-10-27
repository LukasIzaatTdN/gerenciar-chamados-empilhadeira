import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const environment = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "8080"),
    rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});

const stamp = "2026-10-26T11:46:00.000Z";
const equipment = {
  id: "fork-02",
  identificacao: "Empilhadeira 02",
  empresa_id: "empresa-a",
  supermercado_id: "loja-a",
  status: "Em uso",
};

const operationalCall = (id, tipoServico, setor) => ({
  id,
  empresa_id: "empresa-a",
  supermercado_id: "loja-a",
  categoria: "operacional",
  solicitante_nome: "Marcelo da rosa",
  solicitante_uid: "user-separador",
  setor,
  local_exato: "Corredor 5",
  tipo_servico: tipoServico,
  numero_pedido: null,
  cliente: null,
  produto: "Produto",
  quantidade: null,
  itens: [],
  total_solicitado: null,
  total_encontrado: null,
  percentual_atendido: null,
  motivo_incompleto: null,
  observacao_operador: null,
  atualizado_em: stamp,
  atualizado_por: null,
  local_separacao: null,
  prazo_limite: null,
  prioridade: "Normal",
  observacoes: null,
  foto_nome: null,
  foto_data_url: null,
  empilhadeira_id: equipment.id,
  empilhadeira_identificacao: equipment.identificacao,
  pedido_origem_id: setor === "Televendas" ? "pedido-televendas" : null,
  pedido_origem_item_index: setor === "Televendas" ? 0 : null,
  pedido_origem_produto: setor === "Televendas" ? "Produto" : null,
  localizacao_pallet: setor === "Televendas" ? "Corredor 5" : null,
  status: "Aguardando",
  operador_nome: "Operador Real",
  criado_em: stamp,
  assumido_em: stamp,
  a_caminho_em: null,
  cheguei_em: null,
  iniciado_em: null,
  finalizado_em: null,
  cancelado_em: null,
});

before(async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "usuarios/real-operator"), {
      perfil: "Operador",
      status: "Ativo",
      nome: "Operador Real",
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
    });
    await setDoc(doc(firestore, "usuarios/operator-legacy-company"), {
      perfil: "Operador",
      status: "Ativo",
      nome: "Operador Real",
      supermercado_id: "loja-a",
    });
    await setDoc(doc(firestore, "usuarios/operator-other-unit"), {
      perfil: "Operador",
      status: "Ativo",
      nome: "Operador Outra Unidade",
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
    });
    await setDoc(doc(firestore, "usuarios/operator-inactive"), {
      perfil: "Operador",
      status: "Inativo",
      nome: "Operador Inativo",
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
    });
    await setDoc(doc(firestore, "usuarios/operator-second"), {
      perfil: "Operador",
      status: "Ativo",
      nome: "Segundo Operador",
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
    });
    await setDoc(doc(firestore, "usuarios/televendas-separator"), {
      perfil: "Separador de Televendas",
      status: "Ativo",
      nome: "Separador Televendas",
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
    });
    await setDoc(doc(firestore, "empresas/empresa-a"), { nome: "Empresa A", status: "Ativa" });
    await setDoc(doc(firestore, "supermercados/loja-a"), {
      nome: "Loja A",
      empresa_id: "empresa-a",
      status: "Ativo",
    });
    await setDoc(doc(firestore, "empilhadeiras/fork-02"), equipment);
    await setDoc(doc(firestore, "empilhadeiras/fork-maintenance"), {
      ...equipment,
      id: "fork-maintenance",
      identificacao: "Empilhadeira em manutenção",
      status: "Em manutenção",
    });
    await setDoc(doc(firestore, "empilhadeiras/fork-foreign"), {
      ...equipment,
      id: "fork-foreign",
      empresa_id: "empresa-b",
      supermercado_id: "loja-b",
    });
    await setDoc(doc(firestore, "empresas/empresa-b"), { nome: "Empresa B", status: "Ativa" });
    await setDoc(doc(firestore, "supermercados/loja-b"), {
      nome: "Loja B",
      empresa_id: "empresa-a",
      status: "Ativo",
    });
    await setDoc(doc(firestore, "chamados/movimentacao-televendas"),
      operationalCall("movimentacao-televendas", "Movimentação", "Televendas"));
    await setDoc(doc(firestore, "chamados/retirada-limpeza"),
      operationalCall("retirada-limpeza", "Retirada", "Limpeza"));
    await setDoc(doc(firestore, "chamados/movimentacao-operator-legacy-company"),
      operationalCall("movimentacao-operator-legacy-company", "Movimentação", "Operacionais"));
    await setDoc(doc(firestore, "chamados/movimentacao-unassigned"), {
      ...operationalCall("movimentacao-unassigned", "Movimentação", "Operacionais"),
      operador_nome: null,
      assumido_em: null,
      empilhadeira_id: null,
      empilhadeira_identificacao: null,
    });
    await setDoc(doc(firestore, "chamados/operator-complete-flow"), {
      ...operationalCall("operator-complete-flow", "Retirada", "Operacionais"),
      operador_nome: null,
      assumido_em: null,
      empilhadeira_id: null,
      empilhadeira_identificacao: null,
    });
    await setDoc(doc(firestore, "chamados/operator-invalid-flow"), {
      ...operationalCall("operator-invalid-flow", "Retirada", "Operacionais"),
      operador_nome: null,
      assumido_em: null,
      empilhadeira_id: null,
      empilhadeira_identificacao: null,
    });
    await setDoc(doc(firestore, "chamados/operator-other-unit-call"), {
      ...operationalCall("operator-other-unit-call", "Retirada", "Operacionais"),
      supermercado_id: "loja-b",
      operador_nome: null,
      assumido_em: null,
      empilhadeira_id: null,
      empilhadeira_identificacao: null,
    });
    await setDoc(doc(firestore, "chamados/pedido-televendas"), {
      id: "pedido-televendas",
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
      categoria: "televendas",
      tipo_servico: "Atendimento Televendas",
      status: "Aberto",
      operador_nome: null,
      assumido_em: null,
      atualizado_em: stamp,
      empilhadeira_id: null,
      empilhadeira_identificacao: null,
    });
  });
});

after(async () => environment.cleanup());

test("web Operator payload can mark both assigned operational calls A caminho and start them", async () => {
  const db = environment.authenticatedContext("real-operator").firestore();

  for (const callId of ["movimentacao-televendas", "retirada-limpeza"]) {
    const callRef = doc(db, "chamados", callId);
    const routeTime = "2026-10-26T11:47:00.000Z";

    await assertSucceeds(updateDoc(callRef, {
      status: "Aguardando",
      operador_nome: "Operador Real",
      assumido_em: stamp,
      a_caminho_em: routeTime,
      atualizado_em: routeTime,
    }));

    const startTime = "2026-10-26T11:48:00.000Z";
    const batch = writeBatch(db);
    batch.update(callRef, {
      status: "Em atendimento",
      iniciado_em: startTime,
      operador_nome: "Operador Real",
      assumido_em: stamp,
      a_caminho_em: routeTime,
      cheguei_em: startTime,
      finalizado_em: null,
      cancelado_em: null,
      atualizado_em: startTime,
      atualizado_por: "Operador Real",
      empilhadeira_id: equipment.id,
      empilhadeira_identificacao: equipment.identificacao,
    });
    batch.set(doc(db, "auditoria", `start-${callId}`), {
      action: "chamado_iniciado",
      actorUid: "real-operator",
      actorName: "Operador Real",
      entityType: "chamado",
      entityId: callId,
      details: {
        empresa_id: "empresa-a",
        supermercado_id: "loja-a",
        statusAnterior: "Aguardando",
        statusAtual: "Em atendimento",
        operador_nome: "Operador Real",
      },
      occurredAt: startTime,
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
    });
    await assertSucceeds(batch.commit());
  }

  const callRef = doc(db, "chamados/movimentacao-televendas");
  await assertFails(updateDoc(callRef, {
    empilhadeira_id: "fork-maintenance",
    empilhadeira_identificacao: "Empilhadeira em manutenção",
  }));
  await assertFails(updateDoc(callRef, {
    empilhadeira_id: "fork-foreign",
    empilhadeira_identificacao: "Empilhadeira de outra unidade",
  }));
  const unchangedCall = (await getDoc(callRef)).data();
  assert.equal(unchangedCall.empilhadeira_id, equipment.id);
  assert.equal(unchangedCall.empilhadeira_identificacao, equipment.identificacao);
});

test("an Operator without empresa_id can advance an assigned call inside the linked unit", async () => {
  const db = environment.authenticatedContext("operator-legacy-company").firestore();
  const callId = "movimentacao-operator-legacy-company";
  const callRef = doc(db, "chamados", callId);
  const routeTime = "2026-10-26T11:47:00.000Z";

  await assertSucceeds(updateDoc(callRef, {
    status: "Aguardando",
    operador_nome: "Operador Real",
    assumido_em: stamp,
    a_caminho_em: routeTime,
    atualizado_em: routeTime,
  }));

  const startTime = "2026-10-26T11:48:00.000Z";
  const batch = writeBatch(db);
  batch.update(callRef, {
    status: "Em atendimento",
    iniciado_em: startTime,
    operador_nome: "Operador Real",
    assumido_em: stamp,
    a_caminho_em: routeTime,
    cheguei_em: startTime,
    finalizado_em: null,
    cancelado_em: null,
    atualizado_em: startTime,
    atualizado_por: "Operador Real",
    empilhadeira_id: equipment.id,
    empilhadeira_identificacao: equipment.identificacao,
  });
  batch.set(doc(db, "auditoria", `start-${callId}`), {
    action: "chamado_iniciado",
    actorUid: "operator-legacy-company",
    actorName: "Operador Real",
    entityType: "chamado",
    entityId: callId,
    details: {
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
      statusAnterior: "Aguardando",
      statusAtual: "Em atendimento",
      operador_nome: "Operador Real",
    },
    occurredAt: startTime,
    empresa_id: "empresa-a",
    supermercado_id: "loja-a",
  });
  await assertSucceeds(batch.commit());
});

test("Operator can assume an unassigned operational call with the app's atomic audit payload", async () => {
  const db = environment.authenticatedContext("real-operator").firestore();
  const callId = "movimentacao-unassigned";
  const time = "2026-10-26T12:00:00.000Z";
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados", callId), {
    status: "Aguardando",
    operador_nome: "Operador Real",
    assumido_em: time,
    atualizado_em: time,
    empilhadeira_id: equipment.id,
    empilhadeira_identificacao: equipment.identificacao,
  });
  batch.set(doc(db, "auditoria", `assume-${callId}`), {
    action: "chamado_assumido",
    actorUid: "real-operator",
    actorName: "Operador Real",
    entityType: "chamado",
    entityId: callId,
    details: {
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
      statusAnterior: "Aguardando",
      statusAtual: "Aguardando",
      operador_nome: "Operador Real",
    },
    occurredAt: time,
    empresa_id: "empresa-a",
    supermercado_id: "loja-a",
  });
  await assertSucceeds(batch.commit());
});

test("Operator completes the route, arrival, start, and finish flow without changing separation data or history", async () => {
  const db = environment.authenticatedContext("real-operator").firestore();
  const callId = "operator-complete-flow";
  const callRef = doc(db, "chamados", callId);
  const audit = (action, beforeStatus, afterStatus, time) => ({
    action,
    actorUid: "real-operator",
    actorName: "Operador Real",
    entityType: "chamado",
    entityId: callId,
    details: {
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
      statusAnterior: beforeStatus,
      statusAtual: afterStatus,
      operador_nome: "Operador Real",
    },
    occurredAt: time,
    empresa_id: "empresa-a",
    supermercado_id: "loja-a",
  });
  const assumedAt = "2026-10-26T12:10:00.000Z";
  const assumeBatch = writeBatch(db);
  assumeBatch.update(callRef, {
    status: "Aguardando",
    operador_nome: "Operador Real",
    assumido_em: assumedAt,
    atualizado_em: assumedAt,
    empilhadeira_id: equipment.id,
    empilhadeira_identificacao: equipment.identificacao,
  });
  assumeBatch.set(doc(db, "auditoria/operator-flow-assume"),
    audit("chamado_assumido", "Aguardando", "Aguardando", assumedAt));
  await assertSucceeds(assumeBatch.commit());

  const routeAt = "2026-10-26T12:11:00.000Z";
  await assertSucceeds(updateDoc(callRef, {
    status: "Aguardando",
    operador_nome: "Operador Real",
    assumido_em: assumedAt,
    a_caminho_em: routeAt,
    atualizado_em: routeAt,
  }));

  const arrivalAt = "2026-10-26T12:12:00.000Z";
  await assertSucceeds(updateDoc(callRef, {
    status: "Aguardando",
    operador_nome: "Operador Real",
    assumido_em: assumedAt,
    a_caminho_em: routeAt,
    cheguei_em: arrivalAt,
    atualizado_em: arrivalAt,
  }));

  const startedAt = "2026-10-26T12:13:00.000Z";
  const startBatch = writeBatch(db);
  startBatch.update(callRef, {
    status: "Em atendimento",
    iniciado_em: startedAt,
    operador_nome: "Operador Real",
    assumido_em: assumedAt,
    a_caminho_em: routeAt,
    cheguei_em: arrivalAt,
    finalizado_em: null,
    cancelado_em: null,
    atualizado_em: startedAt,
    atualizado_por: "Operador Real",
    empilhadeira_id: equipment.id,
    empilhadeira_identificacao: equipment.identificacao,
  });
  startBatch.set(doc(db, "auditoria/operator-flow-start"),
    audit("chamado_iniciado", "Aguardando", "Em atendimento", startedAt));
  await assertSucceeds(startBatch.commit());

  const finishedAt = "2026-10-26T12:14:00.000Z";
  const finishBatch = writeBatch(db);
  finishBatch.update(callRef, {
    status: "Finalizado",
    finalizado_em: finishedAt,
    operador_nome: "Operador Real",
    cancelado_em: null,
    atualizado_em: finishedAt,
    atualizado_por: "Operador Real",
  });
  finishBatch.set(doc(db, "auditoria/operator-flow-finish"),
    audit("chamado_finalizado", "Em atendimento", "Finalizado", finishedAt));
  await assertSucceeds(finishBatch.commit());

  const completed = (await getDoc(callRef)).data();
  assert.equal(completed.operador_nome, "Operador Real");
  assert.equal(completed.assumido_em, assumedAt);
  assert.equal(completed.a_caminho_em, routeAt);
  assert.equal(completed.cheguei_em, arrivalAt);
  assert.equal(completed.iniciado_em, startedAt);
  assert.equal(completed.finalizado_em, finishedAt);
  assert.deepEqual(completed.itens, []);
  assert.equal(completed.confirmacoes_empilhadeira, undefined);
});

test("Operator cannot take over another unit, inactive profiles, skip steps, or edit separation data", async () => {
  const otherUnitDb = environment.authenticatedContext("operator-other-unit").firestore();
  const inactiveDb = environment.authenticatedContext("operator-inactive").firestore();
  const secondOperatorDb = environment.authenticatedContext("operator-second").firestore();
  const operatorDb = environment.authenticatedContext("real-operator").firestore();
  const otherUnitCall = doc(otherUnitDb, "chamados/operator-other-unit-call");
  await assertFails(updateDoc(otherUnitCall, {
    status: "Aguardando",
    operador_nome: "Operador Outra Unidade",
    assumido_em: "2026-10-26T12:20:00.000Z",
    atualizado_em: "2026-10-26T12:20:00.000Z",
  }));
  await assertFails(updateDoc(doc(inactiveDb, "chamados/operator-invalid-flow"), {
    status: "Aguardando",
    operador_nome: "Operador Inativo",
    assumido_em: "2026-10-26T12:21:00.000Z",
    atualizado_em: "2026-10-26T12:21:00.000Z",
  }));
  await assertFails(updateDoc(doc(secondOperatorDb, "chamados/movimentacao-televendas"), {
    status: "Aguardando",
    operador_nome: "Segundo Operador",
    assumido_em: "2026-10-26T12:21:30.000Z",
    a_caminho_em: "2026-10-26T12:21:30.000Z",
    atualizado_em: "2026-10-26T12:21:30.000Z",
  }));

  const callRef = doc(operatorDb, "chamados/operator-invalid-flow");
  const now = "2026-10-26T12:22:00.000Z";
  await assertFails(updateDoc(callRef, {
    status: "Aguardando",
    operador_nome: "Operador Real",
    assumido_em: now,
    cheguei_em: now,
    atualizado_em: now,
  }));
  await assertFails(updateDoc(callRef, {
    status: "Finalizado",
    operador_nome: "Operador Real",
    finalizado_em: now,
    atualizado_em: now,
    atualizado_por: "Operador Real",
  }));
  await assertFails(updateDoc(callRef, {
    itens: [{ produto: "Alteração indevida", quantidadeSolicitada: 1 }],
  }));
  await assertFails(updateDoc(callRef, {
    confirmacoes_empilhadeira: { forged: { item_index: 0, quantidade: 1 } },
  }));
});

test("a scoped Televendas separator can assume an open pedido with the app's atomic audit payload", async () => {
  const db = environment.authenticatedContext("televendas-separator").firestore();
  const callId = "pedido-televendas";
  const time = "2026-10-26T12:01:00.000Z";
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados", callId), {
    status: "Em separação",
    operador_nome: "Separador Televendas",
    assumido_em: time,
    atualizado_em: time,
    empilhadeira_id: null,
    empilhadeira_identificacao: null,
  });
  batch.set(doc(db, "auditoria", `assume-${callId}`), {
    action: "chamado_assumido",
    actorUid: "televendas-separator",
    actorName: "Separador Televendas",
    entityType: "chamado",
    entityId: callId,
    details: {
      empresa_id: "empresa-a",
      supermercado_id: "loja-a",
      statusAnterior: "Aberto",
      statusAtual: "Em separação",
      operador_nome: "Separador Televendas",
    },
    occurredAt: time,
    empresa_id: "empresa-a",
    supermercado_id: "loja-a",
  });
  await assertSucceeds(batch.commit());
});

test("role-category mismatch cannot assume calls", async () => {
  const operatorDb = environment.authenticatedContext("real-operator").firestore();
  await assertFails(updateDoc(doc(operatorDb, "chamados/pedido-televendas"), {
    operador_nome: "Operador Real",
    assumido_em: "2026-10-26T12:02:00.000Z",
    atualizado_em: "2026-10-26T12:02:00.000Z",
  }));

  const separatorDb = environment.authenticatedContext("televendas-separator").firestore();
  await assertFails(updateDoc(doc(separatorDb, "chamados/movimentacao-unassigned"), {
    operador_nome: "Separador Televendas",
    assumido_em: "2026-10-26T12:03:00.000Z",
    atualizado_em: "2026-10-26T12:03:00.000Z",
  }));
});
