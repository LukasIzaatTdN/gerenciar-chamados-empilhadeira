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

const stamp = "2026-10-19T10:00:00.000Z";
const initial = {
  id: "tv-a", empresa_id: "empresa-a", supermercado_id: "loja-a",
  categoria: "televendas", tipo_servico: "Atendimento Televendas",
  status: "Em separação", operador_nome: "Operador A", atualizado_em: stamp,
  empilhadeira_id: null, empilhadeira_identificacao: null,
  assumido_em: stamp, a_caminho_em: null, cheguei_em: null,
  iniciado_em: null, finalizado_em: null, cancelado_em: null,
  itens: [{ id: "item-1", nome: "Produto", quantidade: 1 }],
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
      perfil: "Operador", status: "Ativo", nome: "Operador A",
      empresa_id: "empresa-a", supermercado_id: "loja-a",
    });
    await setDoc(doc(db, "usuarios/operator-b"), {
      perfil: "Operador", status: "Ativo", nome: "Operador B",
      empresa_id: "empresa-b", supermercado_id: "loja-b",
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
    await setDoc(doc(db, "chamados/tv-regression"), { ...initial, id: "tv-regression" });
    await setDoc(doc(db, "chamados/tv-gap"), { ...initial, id: "tv-gap" });
    await setDoc(doc(db, "chamados/tv-b"), {
      ...initial, id: "tv-b", empresa_id: "empresa-b", supermercado_id: "loja-b",
    });
  });
});
after(async () => environment.cleanup());

test("valid televendas update and scoped audit commit atomically", async () => {
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

test("a foreign-company operator cannot update or audit another company's call", async () => {
  const db = environment.authenticatedContext("operator-b").firestore();
  await assertFails(updateDoc(doc(db, "chamados/tv-a"), { status: "Incompleto" }));
  await assertFails(setDoc(doc(db, "auditoria/tv-foreign-1"), audit("tv-a", { actorUid: "operator-b" })));
  await assertFails(getDoc(doc(db, "chamados/tv-a")));
});

test("a foreign-company operator cannot disguise the event as its own company", async () => {
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

test("foreign-company operator cannot submit a complete valid-shaped update batch", async () => {
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

test("a scoped operator cannot attach a foreign call's audit to its marker", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-gap"), {
    ...update, ultima_auditoria_atualizacao_id: "tv-wrong-entity",
  });
  batch.set(doc(db, "auditoria/tv-wrong-entity"), audit("tv-regression"));
  await assertFails(batch.commit());
  assert.equal((await getDoc(doc(db, "chamados/tv-gap"))).data().status, "Em separação");
});


test("active operator from company B can update its own Televendas call with an atomic audit", async () => {
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
