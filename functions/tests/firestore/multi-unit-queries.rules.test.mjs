import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  documentId,
  and,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
  or,
} from "firebase/firestore";

const environment = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "8080"),
    rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});

const unitIds = Array.from({ length: 8 }, (_, index) => `multi-unit-${index + 1}`);

async function seedAssignedUser(db, uid, perfil, ids, extra = {}) {
  await setDoc(doc(db, `usuarios/${uid}`), {
    id: uid,
    perfil,
    status: "Ativo",
    empresa_id: "empresa-a",
    supermercado_id: ids[0] ?? null,
    supermercado_ids: ids,
    vinculos_unidades_v2: true,
    ...extra,
  });
  for (const id of ids) {
    await setDoc(doc(db, `usuarios/${uid}/unidades/${id}`), {
      empresa_id: "empresa-a",
      supermercado_id: id,
      status: "Ativo",
      atualizado_em: "2026-10-30T00:00:00.000Z",
    });
  }
}

before(async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "empresas/empresa-a"), { status: "Ativa" });
    await setDoc(doc(db, "empresas/empresa-b"), { status: "Ativa" });
    for (const id of [...unitIds, "multi-unit-9", "multi-unit-inactive", "multi-unit-foreign"]) {
      const foreign = id === "multi-unit-foreign";
      const inactive = id === "multi-unit-inactive";
      await setDoc(doc(db, `supermercados/${id}`), {
        empresa_id: foreign ? "empresa-b" : "empresa-a",
        status: inactive ? "Inativo" : "Ativo",
      });
      await setDoc(doc(db, `chamados/call-${id}`), {
        id: `call-${id}`,
        empresa_id: foreign ? "empresa-b" : "empresa-a",
        supermercado_id: id,
        categoria: "operacional",
        tipo_servico: "Descarga",
        status: "Aguardando",
        criado_em: `2026-10-${String(30 - Number(id.match(/(\d+)$/)?.[1] ?? 1)).padStart(2, "0")}T00:00:00.000Z`,
      });
    }
    await setDoc(doc(db, "chamados/call-legacy"), {
      id: "call-legacy",
      supermercado_id: "multi-unit-9",
      status: "Aguardando",
      criado_em: "2026-10-01T00:00:00.000Z",
    });
    await setDoc(doc(db, "usuarios/manager-inactive"), {
      perfil: "Gerente da Empresa", status: "Ativo", empresa_id: "empresa-a",
      supermercado_id: "multi-unit-inactive", supermercado_ids: ["multi-unit-inactive"],
      vinculos_unidades_v2: true,
    });
    await setDoc(doc(db, "usuarios/manager-inactive/unidades/multi-unit-inactive"), {
      empresa_id: "empresa-a", supermercado_id: "multi-unit-inactive", status: "Ativo",
    });
    await setDoc(doc(db, "usuarios/manager-foreign"), {
      perfil: "Gerente da Empresa", status: "Ativo", empresa_id: "empresa-a",
      supermercado_id: "multi-unit-foreign", supermercado_ids: ["multi-unit-foreign"],
      vinculos_unidades_v2: true,
    });
    await setDoc(doc(db, "usuarios/manager-foreign/unidades/multi-unit-foreign"), {
      empresa_id: "empresa-a", supermercado_id: "multi-unit-foreign", status: "Ativo",
    });
    await setDoc(doc(db, "usuarios/legacy-operator"), {
      perfil: "Operador", status: "Ativo", empresa_id: "empresa-a", supermercado_id: "multi-unit-9",
    });
    for (const uid of ["manager-one", "manager-two", "manager-eight", "televendas-two", "operator-two", "separator-two"]) {
      const ids = uid === "manager-one" ? [unitIds[0]] : uid === "manager-eight" ? unitIds : unitIds.slice(0, 2);
      const perfil = uid === "televendas-two" ? "Televendas"
        : uid === "operator-two" ? "Operador"
        : uid === "separator-two" ? "Separador de Televendas"
        : "Gerente da Empresa";
      await seedAssignedUser(db, uid, perfil, ids);
    }
    await setDoc(doc(db, "chamados/call-televendas-secondary"), {
      id: "call-televendas-secondary", empresa_id: "empresa-a", supermercado_id: unitIds[1],
      categoria: "televendas", tipo_servico: "Atendimento Televendas", status: "Aberto",
      criado_em: "2026-10-20T00:00:00.000Z",
    });
    await setDoc(doc(db, "operational_escalations/escalation-one"), {
      unitId: unitIds[0], unitName: "Unidade 1", status: "active", severity: "low",
      openCalls: 0, urgentCalls: 0, delayedCalls: 0, action: "Acompanhar",
      createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z", resolvedAt: null,
    });
    await setDoc(doc(db, "auditoria/audit-one"), {
      action: "teste", actorUid: "operator-two", actorName: "Operador", entityType: "chamado",
      entityId: "call-multi-unit-1", details: {}, empresa_id: "empresa-a", supermercado_id: unitIds[0],
      occurredAt: "2026-10-20T00:00:00.000Z",
    });
  });
});

after(async () => environment.cleanup());

function queryCalls(db, ids) {
  return query(collection(db, "chamados"), where("supermercado_id", ids.length === 1 ? "==" : "in", ids.length === 1 ? ids[0] : ids));
}

test("one-unit and two-unit users read only their assigned calls", async () => {
  const one = environment.authenticatedContext("manager-one").firestore();
  const two = environment.authenticatedContext("manager-two").firestore();
  const oneRows = await assertSucceeds(getDocs(queryCalls(one, [unitIds[0]])));
  assert.deepEqual(oneRows.docs.map((item) => item.id), [`call-${unitIds[0]}`]);
  const twoRows = await assertSucceeds(getDocs(queryCalls(two, unitIds.slice(0, 2))));
  assert.deepEqual(new Set(twoRows.docs.map((item) => item.id)), new Set([
    ...unitIds.slice(0, 2).map((id) => `call-${id}`),
    "call-televendas-secondary",
  ]));
});

test("eight-unit query stays within the assigned set and returns each document once", async () => {
  const db = environment.authenticatedContext("manager-eight").firestore();
  const result = await assertSucceeds(getDocs(queryCalls(db, unitIds)));
  const ids = result.docs.map((item) => item.id);
  assert.equal(ids.length, 9);
  assert.equal(new Set(ids).size, ids.length);
});

test("manager query for a unit outside the assignment is denied", async () => {
  const db = environment.authenticatedContext("manager-two").firestore();
  await assertFails(getDocs(queryCalls(db, [unitIds[2]])));
});

test("legacy user with only supermercado_id retains single-unit query compatibility", async () => {
  const db = environment.authenticatedContext("legacy-operator").firestore();
  const result = await assertSucceeds(getDocs(queryCalls(db, ["multi-unit-9"])));
  assert.deepEqual(new Set(result.docs.map((item) => item.id)), new Set(["call-legacy", "call-multi-unit-9"]));
});

test("an inactive unit is not readable even when a stale assignment document exists", async () => {
  const db = environment.authenticatedContext("manager-inactive").firestore();
  await assertFails(getDocs(queryCalls(db, ["multi-unit-inactive"])));
});

test("a unit owned by another company is not readable", async () => {
  const db = environment.authenticatedContext("manager-foreign").firestore();
  await assertFails(getDocs(queryCalls(db, ["multi-unit-foreign"])));
});

test("user switching gets independent results and does not widen the previous query", async () => {
  const manager = environment.authenticatedContext("manager-two").firestore();
  const legacy = environment.authenticatedContext("legacy-operator").firestore();
  const managerRows = await assertSucceeds(getDocs(queryCalls(manager, unitIds.slice(0, 2))));
  const legacyRows = await assertSucceeds(getDocs(queryCalls(legacy, ["multi-unit-9"])));
  assert.equal(managerRows.docs.length, 3);
  assert.equal(legacyRows.docs.length, 2);
  assert.equal(legacyRows.docs[0].id, "call-legacy");
});

test("ordered query supports cursor pagination across multiple units", async () => {
  const db = environment.authenticatedContext("manager-eight").firestore();
  const firstQuery = query(queryCalls(db, unitIds), orderBy("criado_em", "asc"), limit(3));
  const first = await assertSucceeds(getDocs(firstQuery));
  const second = await assertSucceeds(getDocs(query(queryCalls(db, unitIds), orderBy("criado_em", "asc"), startAfter(first.docs.at(-1)), limit(3))));
  assert.equal(first.docs.length, 3);
  assert.equal(second.docs.length, 3);
  assert.ok(first.docs.at(-1).data().criado_em < second.docs[0].data().criado_em);
});

test("Televendas and Operador keep reads within their multiple assigned units", async () => {
  for (const uid of ["televendas-two", "operator-two"]) {
    const db = environment.authenticatedContext(uid).firestore();
    const result = await assertSucceeds(getDocs(queryCalls(db, unitIds.slice(0, 2))));
    assert.equal(result.docs.length, 3);
    assert.ok(result.docs.every((item) => unitIds.slice(0, 2).includes(item.data().supermercado_id)));
  }
});

test("Separator can read Televendas calls from each assigned unit", async () => {
  const db = environment.authenticatedContext("separator-two").firestore();
  let fixture;
  await environment.withSecurityRulesDisabled(async (context) => {
    const rawDb = context.firestore();
    const [user, call, assignment, unit, company] = await Promise.all([
      getDoc(doc(rawDb, "usuarios/separator-two")),
      getDoc(doc(rawDb, "chamados/call-televendas-secondary")),
      getDoc(doc(rawDb, `usuarios/separator-two/unidades/${unitIds[1]}`)),
      getDoc(doc(rawDb, `supermercados/${unitIds[1]}`)),
      getDoc(doc(rawDb, "empresas/empresa-a")),
    ]);
    fixture = { user: user.data(), call: call.data(), assignment: assignment.data(), unit: unit.data(), company: company.data() };
  });
  assert.equal(fixture.user.empresa_id, "empresa-a");
  assert.equal(fixture.call.empresa_id, "empresa-a");
  assert.equal(fixture.user.perfil, "Separador de Televendas");
  assert.equal(fixture.user.status, "Ativo");
  assert.ok(fixture.user.supermercado_ids.includes(unitIds[1]));
  assert.equal(fixture.call.supermercado_id, unitIds[1]);
  assert.equal(fixture.call.categoria, "televendas");
  assert.equal(fixture.assignment.status, "Ativo");
  assert.equal(fixture.assignment.empresa_id, "empresa-a");
  assert.equal(fixture.unit.status, "Ativo");
  assert.equal(fixture.unit.empresa_id, "empresa-a");
  assert.equal(fixture.company.status, "Ativa");
  await assertSucceeds(getDoc(doc(db, `supermercados/${unitIds[1]}`)));
  await assertSucceeds(getDoc(doc(db, `usuarios/separator-two/unidades/${unitIds[1]}`)));
  const secondaryCall = await assertSucceeds(getDoc(doc(db, "chamados/call-televendas-secondary")));
  assert.equal(secondaryCall.data().empresa_id, "empresa-a");
  const perUnitResults = await Promise.all(unitIds.slice(0, 2).map((unitId) => assertSucceeds(getDocs(query(
    collection(db, "chamados"),
    and(
      where("empresa_id", "==", "empresa-a"),
      where("supermercado_id", "==", unitId),
      or(where("categoria", "==", "televendas"), where("tipo_servico", "==", "Atendimento Televendas"))
    )
  )))));
  const merged = new Map(perUnitResults.flatMap((result) => result.docs.map((item) => [item.id, item])));
  assert.deepEqual([...merged.keys()], ["call-televendas-secondary"]);
});

test("operational escalation query is scoped to assigned units and ordered", async () => {
  const db = environment.authenticatedContext("manager-two").firestore();
  const q = query(collection(db, "operational_escalations"), where("unitId", "in", unitIds.slice(0, 2)), orderBy("updatedAt", "desc"));
  const result = await assertSucceeds(getDocs(q));
  assert.deepEqual(result.docs.map((item) => item.id), ["escalation-one"]);
});

test("audit query is scoped and ordered for multiple units", async () => {
  const db = environment.authenticatedContext("manager-two").firestore();
  const q = query(collection(db, "auditoria"), where("supermercado_id", "in", unitIds.slice(0, 2)), orderBy("occurredAt", "desc"), limit(30));
  const result = await assertSucceeds(getDocs(q));
  assert.deepEqual(result.docs.map((item) => item.id), ["audit-one"]);
});

test("unit selection query cannot read an unassigned unit", async () => {
  const db = environment.authenticatedContext("manager-two").firestore();
  await assertFails(getDocs(query(collection(db, "supermercados"), where(documentId(), "in", [unitIds[2]]), where("empresa_id", "==", "empresa-a"), where("status", "==", "Ativo"))));
});

test("unit selector query returns only the two active assigned units", async () => {
  const db = environment.authenticatedContext("manager-two").firestore();
  const result = await assertSucceeds(getDocs(query(
    collection(db, "supermercados"),
    where(documentId(), "in", unitIds.slice(0, 2)),
    where("empresa_id", "==", "empresa-a"),
    where("status", "==", "Ativo")
  )));
  assert.deepEqual(new Set(result.docs.map((item) => item.id)), new Set(unitIds.slice(0, 2)));
});

test("assignment listener is unsubscribed and stops receiving updates", async () => {
  const db = environment.authenticatedContext("manager-two").firestore();
  const q = queryCalls(db, unitIds.slice(0, 2));
  let eventCount = 0;
  let unsubscribe;
  await new Promise((resolve, reject) => {
    unsubscribe = onSnapshot(q, () => {
      eventCount += 1;
      if (eventCount === 1) resolve();
    }, reject);
  });
  unsubscribe();
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), `chamados/call-${unitIds[0]}`), { status: "Em atendimento" });
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(eventCount, 1);
});
