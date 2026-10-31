import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";

const environment = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "8080"),
    rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});

const activeUser = (perfil, overrides = {}) => ({
  perfil,
  status: "Ativo",
  empresa_id: "empresa-a",
  supermercado_id: "loja-a",
  ...overrides,
});

before(async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "empresas/empresa-a"), { status: "Ativa" });
    await setDoc(doc(db, "empresas/empresa-b"), { status: "Ativa" });
    await setDoc(doc(db, "supermercados/loja-a"), { empresa_id: "empresa-a", status: "Ativo" });
    await setDoc(doc(db, "supermercados/loja-b"), { empresa_id: "empresa-a", status: "Ativo" });
    await setDoc(doc(db, "supermercados/loja-inativa"), { empresa_id: "empresa-a", status: "Inativo" });
    await setDoc(doc(db, "supermercados/loja-outra-empresa"), { empresa_id: "empresa-b", status: "Ativo" });
    await setDoc(doc(db, "usuarios/admin-geral"), { perfil: "Administrador Geral", status: "Ativo", empresa_id: null, supermercado_id: null, supermercado_ids: [] });
    await setDoc(doc(db, "usuarios/gerente"), activeUser("Gerente da Empresa", { supermercado_ids: ["loja-a", "loja-b"] }));
    for (const supermercadoId of ["loja-a", "loja-b"]) {
      await setDoc(doc(db, `usuarios/gerente/unidades/${supermercadoId}`), {
        empresa_id: "empresa-a", supermercado_id: supermercadoId, status: "Ativo",
      });
    }
    await setDoc(doc(db, "usuarios/gerente-sem-unidades"), activeUser("Gerente da Empresa", { supermercado_id: null, supermercado_ids: [] }));
    await setDoc(doc(db, "usuarios/gerente-uma-unidade"), activeUser("Gerente da Empresa"));
    await setDoc(doc(db, "usuarios/gerente-uma-unidade/unidades/loja-a"), {
      empresa_id: "empresa-a", supermercado_id: "loja-a", status: "Ativo",
    });
    await setDoc(doc(db, "usuarios/operador"), activeUser("Operador"));
    await setDoc(doc(db, "usuarios/televendas"), activeUser("Televendas"));
    await setDoc(doc(db, "usuarios/separador"), activeUser("Separador de Televendas"));
    await setDoc(doc(db, "usuarios/legacy-company-admin"), activeUser("Administrador da Empresa", { supermercado_id: null }));
    await setDoc(doc(db, "usuarios/alvo"), activeUser("Operador", { empresa_id: null, supermercado_id: null, supermercado_ids: [] }));
    await setDoc(doc(db, "usuarios/alvo-parcial"), activeUser("Operador", { empresa_id: null, supermercado_id: null, supermercado_ids: [] }));
    await setDoc(doc(db, "empilhadeiras/asset-a"), { empresa_id: "empresa-a", supermercado_id: "loja-a" });
    await setDoc(doc(db, "empilhadeiras/asset-b"), { empresa_id: "empresa-a", supermercado_id: "loja-b" });
    await setDoc(doc(db, "operational_escalations/operational-escalation"), {
      unitId: "loja-a", unitName: "Loja A", status: "active", severity: "critical",
      openCalls: 1, urgentCalls: 1, delayedCalls: 1, action: "Atuar", createdAt: "t1", updatedAt: "t1", resolvedAt: null,
    });
    await setDoc(doc(db, "operational_escalations/other-unit-escalation"), {
      unitId: "loja-outra-empresa", unitName: "Outra empresa", status: "active", severity: "critical",
      openCalls: 1, urgentCalls: 1, delayedCalls: 1, action: "Atuar", createdAt: "t1", updatedAt: "t1", resolvedAt: null,
    });
    const previousBoundaryUnits = Array.from({ length: 8 }, (_, index) => `loja-limite-${index + 1}`);
    const nextBoundaryUnits = Array.from({ length: 8 }, (_, index) => `loja-limite-${index + 9}`);
    for (const supermercadoId of [...previousBoundaryUnits, ...nextBoundaryUnits]) {
      await setDoc(doc(db, `supermercados/${supermercadoId}`), { empresa_id: "empresa-a", status: "Ativo" });
    }
    await setDoc(doc(db, "usuarios/gerente-limite"), activeUser("Gerente da Empresa", {
      supermercado_id: previousBoundaryUnits[0], supermercado_ids: previousBoundaryUnits,
      vinculos_unidades_v2: true,
    }));
    for (const supermercadoId of previousBoundaryUnits) {
      await setDoc(doc(db, `usuarios/gerente-limite/unidades/${supermercadoId}`), {
        empresa_id: "empresa-a", supermercado_id: supermercadoId, status: "Ativo",
      });
    }
  });
});

after(async () => environment.cleanup());

test("Administrador Geral assigns multiple valid units; invalid, duplicate, inactive and cross-company units are rejected", async () => {
  const admin = environment.authenticatedContext("admin-geral").firestore();
  const target = doc(admin, "usuarios/alvo");
  const assignBatch = writeBatch(admin);
  assignBatch.update(target, {
    perfil: "Gerente da Empresa", empresa_id: "empresa-a", supermercado_id: "loja-a",
    supermercado_ids: ["loja-a", "loja-b"], vinculos_unidades_v2: true, atualizado_em: "t2",
  });
  for (const supermercadoId of ["loja-a", "loja-b"]) {
    assignBatch.set(doc(admin, `usuarios/alvo/unidades/${supermercadoId}`), {
      empresa_id: "empresa-a", supermercado_id: supermercadoId, status: "Ativo",
    });
  }
  await assertSucceeds(assignBatch.commit());

  const duplicate = writeBatch(admin);
  duplicate.update(target, { supermercado_id: "loja-a", supermercado_ids: ["loja-a", "loja-a"] });
  await assertFails(duplicate.commit());

  for (const supermercadoId of ["nao-existe", "loja-inativa", "loja-outra-empresa"]) {
    const invalidBatch = writeBatch(admin);
    invalidBatch.update(target, {
      supermercado_id: "loja-a", supermercado_ids: ["loja-a", supermercadoId],
      vinculos_unidades_v2: true,
    });
    invalidBatch.set(doc(admin, `usuarios/alvo/unidades/${supermercadoId}`), {
      empresa_id: "empresa-a", supermercado_id: supermercadoId, status: "Ativo",
    });
    await assertFails(invalidBatch.commit());
  }
  const userAfterRejectedBatches = await getDoc(target);
  if (userAfterRejectedBatches.data().supermercado_ids.join(",") !== "loja-a,loja-b") {
    throw new Error("Rejected assignment batch changed the user document");
  }
});

test("Gerente reads only assigned active units and an empty assignment grants no unit access", async () => {
  const manager = environment.authenticatedContext("gerente").firestore();
  const admin = environment.authenticatedContext("admin-geral").firestore();
  await assertSucceeds(getDoc(doc(manager, "supermercados/loja-a")));
  await assertSucceeds(getDoc(doc(manager, "supermercados/loja-b")));
  await assertSucceeds(getDoc(doc(manager, "empilhadeiras/asset-a")));
  await assertSucceeds(getDoc(doc(manager, "empilhadeiras/asset-b")));
  await assertFails(getDoc(doc(manager, "supermercados/loja-outra-empresa")));
  await assertFails(getDoc(doc(manager, "supermercados/loja-inativa")));
  await assertFails(setDoc(doc(manager, "usuarios/gerente/unidades/loja-inativa"), {
    empresa_id: "empresa-a", supermercado_id: "loja-inativa", status: "Ativo",
  }));
  await assertSucceeds(updateDoc(doc(admin, "usuarios/gerente/unidades/loja-b"), { status: "Inativo" }));
  await assertFails(getDoc(doc(manager, "supermercados/loja-b")));
  await assertSucceeds(updateDoc(doc(admin, "usuarios/gerente/unidades/loja-b"), { status: "Ativo" }));
  await assertSucceeds(getDoc(doc(manager, "supermercados/loja-b")));
  const oneUnitManager = environment.authenticatedContext("gerente-uma-unidade").firestore();
  await assertSucceeds(getDoc(doc(oneUnitManager, "supermercados/loja-a")));
  await assertFails(getDoc(doc(oneUnitManager, "supermercados/loja-b")));
  const emptyManager = environment.authenticatedContext("gerente-sem-unidades").firestore();
  await assertFails(getDoc(doc(emptyManager, "supermercados/loja-a")));
  await assertFails(getDoc(doc(emptyManager, "empilhadeiras/asset-a")));
  const legacyAdmin = environment.authenticatedContext("legacy-company-admin").firestore();
  await assertFails(getDoc(doc(legacyAdmin, "supermercados/loja-a")));
});

test("unit removal is an atomic user and relationship update; concurrent assignments to separate users both succeed", async () => {
  const admin = environment.authenticatedContext("admin-geral").firestore();
  const removeBatch = writeBatch(admin);
  removeBatch.update(doc(admin, "usuarios/gerente"), {
    supermercado_id: "loja-a", supermercado_ids: ["loja-a"],
    vinculos_unidades_v2: true, atualizado_em: "t3",
  });
  removeBatch.update(doc(admin, "usuarios/gerente/unidades/loja-b"), {
    status: "Inativo", atualizado_em: "t3",
  });
  await assertSucceeds(removeBatch.commit());
  const manager = environment.authenticatedContext("gerente").firestore();
  await assertSucceeds(getDoc(doc(manager, "supermercados/loja-a")));
  await assertFails(getDoc(doc(manager, "supermercados/loja-b")));

  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "usuarios/alvo-concorrente-a"), activeUser("Operador", {
      empresa_id: null, supermercado_id: null, supermercado_ids: [],
    }));
    await setDoc(doc(db, "usuarios/alvo-concorrente-b"), activeUser("Televendas", {
      empresa_id: null, supermercado_id: null, supermercado_ids: [],
    }));
  });
  const assign = (uid, perfil, unitId) => {
    const batch = writeBatch(admin);
    batch.update(doc(admin, `usuarios/${uid}`), {
      perfil, empresa_id: "empresa-a", supermercado_id: unitId,
      supermercado_ids: [unitId], vinculos_unidades_v2: true, atualizado_em: "t4",
    });
    batch.set(doc(admin, `usuarios/${uid}/unidades/${unitId}`), {
      empresa_id: "empresa-a", supermercado_id: unitId, status: "Ativo",
    });
    return batch.commit();
  };
  await Promise.all([
    assertSucceeds(assign("alvo-concorrente-a", "Operador", "loja-a")),
    assertSucceeds(assign("alvo-concorrente-b", "Televendas", "loja-b")),
  ]);
});

test("link activation is required for v2 access and replacing eight units stays under the access-call ceiling", async () => {
  const admin = environment.authenticatedContext("admin-geral").firestore();
  const target = doc(admin, "usuarios/alvo-parcial");
  await assertSucceeds(updateDoc(target, {
    perfil: "Operador", empresa_id: "empresa-a", supermercado_id: "loja-a",
    supermercado_ids: ["loja-a"], vinculos_unidades_v2: true,
  }));
  const partialOperator = environment.authenticatedContext("alvo-parcial").firestore();
  await assertFails(getDoc(doc(partialOperator, "supermercados/loja-a")));
  const activationBatch = writeBatch(admin);
  activationBatch.set(doc(admin, "usuarios/alvo-parcial/unidades/loja-a"), {
    empresa_id: "empresa-a", supermercado_id: "loja-a", status: "Ativo",
  });
  await assertSucceeds(activationBatch.commit());
  await assertSucceeds(getDoc(doc(partialOperator, "supermercados/loja-a")));

  const oldUnits = Array.from({ length: 8 }, (_, index) => `loja-limite-${index + 1}`);
  const newUnits = Array.from({ length: 8 }, (_, index) => `loja-limite-${index + 9}`);
  const replacement = writeBatch(admin);
  replacement.update(doc(admin, "usuarios/gerente-limite"), {
    supermercado_id: newUnits[0], supermercado_ids: newUnits,
    vinculos_unidades_v2: true, atualizado_em: "t5",
  });
  for (const supermercadoId of oldUnits) {
    replacement.update(doc(admin, `usuarios/gerente-limite/unidades/${supermercadoId}`), { status: "Inativo" });
  }
  for (const supermercadoId of newUnits) {
    replacement.set(doc(admin, `usuarios/gerente-limite/unidades/${supermercadoId}`), {
      empresa_id: "empresa-a", supermercado_id: supermercadoId, status: "Ativo",
    });
  }
  await assertSucceeds(replacement.commit());
  const boundaryManager = environment.authenticatedContext("gerente-limite").firestore();
  await assertSucceeds(getDoc(doc(boundaryManager, "supermercados/loja-limite-9")));
  await assertFails(getDoc(doc(boundaryManager, "supermercados/loja-limite-1")));
});

test("Gerente and operational users cannot assign units to themselves", async () => {
  for (const uid of ["gerente", "operador", "televendas", "separador"]) {
    const db = environment.authenticatedContext(uid).firestore();
    await assertFails(updateDoc(doc(db, `usuarios/${uid}`), {
      supermercado_id: "loja-b", supermercado_ids: ["loja-a", "loja-b"],
    }));
    await assertFails(updateDoc(doc(db, `usuarios/${uid}`), { perfil: "Administrador Geral" }));
    await assertFails(updateDoc(doc(db, `usuarios/${uid}`), { empresa_id: "empresa-b" }));
  }
  const manager = environment.authenticatedContext("gerente").firestore();
  await assertFails(setDoc(doc(manager, "usuarios/gerente/unidades/loja-outra-empresa"), {
    empresa_id: "empresa-b", supermercado_id: "loja-outra-empresa", status: "Ativo",
  }));
});

test("self-registration cannot include company or unit assignments", async () => {
  const db = environment.authenticatedContext("self-register").firestore();
  await assertSucceeds(setDoc(doc(db, "usuarios/self-register"), {
    id: "self-register", perfil: "Operador", status: "Ativo", empresa_id: null,
    supermercado_id: null, supermercado_ids: [],
  }));
  await assertFails(setDoc(doc(db, "usuarios/self-register"), {
    id: "self-register", perfil: "Operador", status: "Ativo", empresa_id: "empresa-a",
    supermercado_id: "loja-a", supermercado_ids: ["loja-a"],
  }));
});

test("legacy single-unit user retains access without a supermercado_ids field", async () => {
  const db = environment.authenticatedContext("legacy-operator").firestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "usuarios/legacy-operator"), activeUser("Operador"));
  });
  await assertSucceeds(getDoc(doc(db, "supermercados/loja-a")));
  await assertFails(getDoc(doc(db, "supermercados/loja-b")));
});

test("operational escalations are scoped to assigned units and protected from broad updates", async () => {
  const manager = environment.authenticatedContext("gerente").firestore();
  const operator = environment.authenticatedContext("operador").firestore();
  const admin = environment.authenticatedContext("admin-geral").firestore();
  await assertSucceeds(getDoc(doc(manager, "operational_escalations/operational-escalation")));
  const managerQuery = query(
    collection(manager, "operational_escalations"),
    where("unitId", "==", "loja-a")
  );
  const scopedEscalations = await assertSucceeds(getDocs(managerQuery));
  if (scopedEscalations.docs.some((item) => item.data().unitId !== "loja-a")) {
    throw new Error("Gerente received an escalation outside the assigned unit");
  }
  await assertSucceeds(getDoc(doc(operator, "operational_escalations/operational-escalation")));
  await assertFails(getDoc(doc(operator, "operational_escalations/other-unit-escalation")));
  await assertFails(updateDoc(doc(operator, "operational_escalations/operational-escalation"), { status: "resolved" }));
  await assertFails(updateDoc(doc(manager, "operational_escalations/operational-escalation"), { unitId: "loja-outra-empresa" }));
  await assertSucceeds(updateDoc(doc(admin, "operational_escalations/operational-escalation"), { status: "resolved" }));
});
