import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, documentId, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

// Only demo projects are used. Published rules are an immutable, read-only snapshot.
const profiles = ["Gerente da Empresa", "Operador", "Televendas", "Separador de Televendas"];
const environments = {};
const rulesFiles = {
  local: new URL("../../../firestore.rules", import.meta.url),
  published: new URL("../../../docs/diagnostics/etapa-6.2.1/published.firestore.rules", import.meta.url),
};
const uid = (index, scenario) => `profile-${index}-${scenario}`;
const path = (index, scenario) => `usuarios/${uid(index, scenario)}`;
const linkPath = (index, scenario, unit = "unit-a") => `${path(index, scenario)}/unidades/${unit}`;

before(async () => {
  for (const [version, rulesFile] of Object.entries(rulesFiles)) {
    const projectId = `demo-patio-621-${version}`;
    assert.ok(projectId.startsWith("demo-"));
    const env = await initializeTestEnvironment({ projectId, firestore: {
      host: "127.0.0.1", port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "28080"),
      rules: await readFile(rulesFile, "utf8"),
    } });
    environments[version] = env;
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const company of ["company-a", "company-b"]) await setDoc(doc(db, "empresas", company), { status: "Ativa" });
      for (const [id, company, status] of [
        ["unit-a", "company-a", "Ativo"], ["unit-b", "company-a", "Ativo"],
        ["unit-inactive", "company-a", "Inativo"], ["unit-foreign", "company-b", "Ativo"],
      ]) await setDoc(doc(db, "supermercados", id), { empresa_id: company, status });
      await setDoc(doc(db, "usuarios/admin"), { id: "admin", perfil: "Administrador Geral", status: "Ativo", empresa_id: null, supermercado_id: null });
      await setDoc(doc(db, "usuarios/admin-inactive"), { id: "admin-inactive", perfil: "Administrador Geral", status: "Inativo", empresa_id: null, supermercado_id: null });
      for (const [index, profile] of profiles.entries()) {
        for (const scenario of ["active", "inactive-link", "missing-link", "inactive-unit", "foreign-unit", "empty", "inactive-user", "legacy"]) {
          const primary = scenario === "empty" ? null : scenario === "inactive-unit" ? "unit-inactive" : scenario === "foreign-unit" ? "unit-foreign" : "unit-a";
          const user = {
            id: uid(index, scenario), nome: "Fixture", email: "fixture@example.invalid", criado_em: "2026-01-01T00:00:00.000Z",
            perfil: profile, status: scenario === "inactive-user" ? "Inativo" : "Ativo", empresa_id: "company-a",
            supermercado_id: primary, supermercado_ids: primary ? [primary] : [],
          };
          if (scenario !== "legacy") user.vinculos_unidades_v2 = true;
          await setDoc(doc(db, path(index, scenario)), user);
          if (primary && !["missing-link", "legacy"].includes(scenario)) await setDoc(doc(db, linkPath(index, scenario, primary)), {
            empresa_id: "company-a", supermercado_id: primary, status: scenario === "inactive-link" ? "Inativo" : "Ativo",
          });
        }
      }
    });
  }
});

after(async () => { for (const env of Object.values(environments)) await env.cleanup(); });
const context = (version, index, scenario) => environments[version].authenticatedContext(uid(index, scenario)).firestore();
const unitQuery = (db, unit = "unit-a") => query(collection(db, "supermercados"), where(documentId(), "==", unit), where("empresa_id", "==", "company-a"), where("status", "==", "Ativo"));

for (const version of ["local", "published"]) {
  test(`${version}: Administrador Geral mantém leitura global de unidades`, async () => {
    const db = environments[version].authenticatedContext("admin").firestore();
    const result = await assertSucceeds(getDocs(collection(db, "supermercados")));
    assert.equal(result.size, 4);
  });
  test(`${version}: UID sem documento de usuário não recebe acesso operacional`, async () => {
    const db = environments[version].authenticatedContext("unknown-uid").firestore();
    await assertFails(getDoc(doc(db, "supermercados/unit-a")));
  });
  test(`${version}: Administrador Geral inativo não recebe acesso global`, async () => {
    const db = environments[version].authenticatedContext("admin-inactive").firestore();
    await assertFails(getDocs(collection(db, "supermercados")));
  });
  for (const [index, profile] of profiles.entries()) {
    test(`${version}: ${profile} lê seu próprio usuarios/{uid}, não o de outro usuário`, async () => {
      const db = context(version, index, "active");
      await assertSucceeds(getDoc(doc(db, path(index, "active"))));
      await assertFails(getDoc(doc(db, path((index + 1) % profiles.length, "active"))));
    });
    test(`${version}: ${profile} não pode listar todas as unidades ou consultar uma unidade não atribuída`, async () => {
      const db = context(version, index, "active");
      await assertFails(getDocs(collection(db, "supermercados")));
      await assertFails(getDocs(unitQuery(db, "unit-b")));
      await assertFails(getDoc(doc(db, "supermercados/unit-foreign")));
    });
    test(`${version}: ${profile} inativo ou sem unidades não recebe dados operacionais`, async () => {
      for (const scenario of ["inactive-user", "empty"]) await assertFails(getDocs(unitQuery(context(version, index, scenario))));
    });
    if (version === "local") {
      test(`local: ${profile} v2 ativo pode validar seu vínculo e consultar sua unidade`, async () => {
        const db = context(version, index, "active");
        await assertSucceeds(getDoc(doc(db, linkPath(index, "active"))));
        const result = await assertSucceeds(getDocs(unitQuery(db)));
        assert.equal(result.size, 1);
      });
      test(`local: ${profile} tem acesso negado com vínculo ausente, inativo, unidade inativa ou de outra empresa`, async () => {
        for (const [scenario, unit] of [["missing-link", "unit-a"], ["inactive-link", "unit-a"], ["inactive-unit", "unit-inactive"], ["foreign-unit", "unit-foreign"]]) {
          await assertFails(getDoc(doc(context(version, index, scenario), "supermercados", unit)));
        }
      });
      test(`local: ${profile} não altera seus próprios vínculos nem se promove`, async () => {
        const db = context(version, index, "active");
        await assertFails(updateDoc(doc(db, path(index, "active")), { supermercado_id: "unit-b", supermercado_ids: ["unit-b"] }));
        await assertFails(updateDoc(doc(db, path(index, "active")), { perfil: "Administrador Geral" }));
      });
    } else {
      test(`REPRODUÇÃO publicada: ${profile} não consegue ler nem listar a subcoleção de vínculos`, async () => {
        const db = context(version, index, "active");
        await assertFails(getDoc(doc(db, linkPath(index, "active"))));
        await assertFails(getDocs(collection(db, path(index, "active"), "unidades")));
      });
      test(`REPRODUÇÃO publicada: ${profile} legado pode ler sua unidade sem documentos v2`, async () => {
        const result = await assertSucceeds(getDocs(unitQuery(context(version, index, "legacy"))));
        assert.equal(result.size, 1);
      });
      test(`REPRODUÇÃO publicada: o contrato antigo não aplica revogação de vínculos v2 de ${profile}`, async () => {
        for (const scenario of ["missing-link", "inactive-link"]) await assertSucceeds(getDoc(doc(context(version, index, scenario), "supermercados/unit-a")));
      });
    }
  }
}

test("local: Gerente legado sem vínculo não herda acesso só pela unidade principal", async () => {
  await assertFails(getDoc(doc(context("local", 0, "legacy"), "supermercados/unit-a")));
});

test("local: perfis operacionais legados preservam apenas o escopo declarado sem migração implícita", async () => {
  for (const index of [1, 2, 3]) {
    const db = context("local", index, "legacy");
    await assertSucceeds(getDocs(unitQuery(db)));
    await assertFails(getDocs(unitQuery(db, "unit-b")));
  }
});
