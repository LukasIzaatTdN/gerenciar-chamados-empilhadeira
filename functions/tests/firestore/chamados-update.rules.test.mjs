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
    await setDoc(doc(db, "chamados/tv-b"), {
      ...initial, id: "tv-b", empresa_id: "empresa-b", supermercado_id: "loja-b",
    });
  });
});
after(async () => environment.cleanup());

test("valid televendas update and scoped audit commit atomically", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, "chamados/tv-a"), update);
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

/**
 * SECURITY GAP CHARACTERIZATION, not a security success:
 * The current rules permit a same-tenant actor to create a standalone audit
 * without an accompanying call update. This test will PASS until the policy is
 * hardened, and MUST NOT be interpreted as proof of event authenticity.
 */
test("KNOWN GAP: same-tenant standalone update audit is currently permitted", async () => {
  const db = environment.authenticatedContext("operator-a").firestore();
  await assertSucceeds(setDoc(doc(db, "auditoria/tv-standalone-gap"), audit("tv-a", {
    details: { ...audit("tv-a").details, statusAtual: "Cancelado" },
  })));
  assert.ok((await getDoc(doc(db, "auditoria/tv-standalone-gap"))).exists());
});
