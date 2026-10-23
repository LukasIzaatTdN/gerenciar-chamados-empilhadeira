import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";

// 6.10.14.22 - emulator fixtures. Negative assertions alone do not prove clean denial.
const env = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "28080"),
    rules: await readFile(process.env.PATIO_RULES_TEST_RULES_PATH || new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});
const user = (id, profile, company, store, fields = {}) => ({
  id, perfil: profile, empresa_id: company, nome: id,
  email: id + "@test.invalid", status: "Ativo", criado_em: "seed",
  ...(store === undefined ? {} : { supermercado_id: store }), ...fields,
});
before(async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const company of ["a", "b"])
      await setDoc(doc(db, "empresas/empresa-" + company), { nome: company, status: "Ativa" });
    await setDoc(doc(db, "supermercados/loja-a"), { empresa_id: "empresa-a", status: "Ativo" });
    await setDoc(doc(db, "supermercados/loja-b"), { empresa_id: "empresa-b", status: "Ativo" });
    const fixtures = [
      user("user-a-store", "Promotor", "empresa-a", "loja-a"),
      user("user-a-missing", "Promotor", "empresa-a", undefined),
      user("user-a-null", "Promotor", "empresa-a", null),
      user("user-b-store", "Promotor", "empresa-b", "loja-b"),
      user("inactive-a", "Promotor", "empresa-a", "loja-a", { status: "Inativo" }),
      user("admin-a", "Administrador da Empresa", "empresa-a", null),
      user("admin-b", "Administrador da Empresa", "empresa-b", null),
      user("admin-inactive", "Administrador da Empresa", "empresa-a", null, { status: "Inativo" }),
      user("admin-a-missing", "Administrador da Empresa", "empresa-a", undefined),
      user("platform", "Administrador Geral", null, null),
    ];
    for (const fixture of fixtures)
      await setDoc(doc(db, "usuarios", fixture.id), fixture);
  });
});
after(async () => env.cleanup());
const as = id => env.authenticatedContext(id).firestore();
const update = (actor, target, changes) => updateDoc(doc(as(actor), "usuarios", target), changes);

test("6101422 own timestamp with store present succeeds", async () => {
  await assertSucceeds(update("user-a-store", "user-a-store", { atualizado_em: "probe" }));
});
test("6101422 own timestamp with store missing succeeds", async () => {
  await assertSucceeds(update("user-a-missing", "user-a-missing", { atualizado_em: "probe" }));
});
test("6101422 own timestamp with store null is evaluated", async () => {
  await assertSucceeds(update("user-a-null", "user-a-null", { atualizado_em: "probe" }));
});
test("6101422 own privilege escalation missing store denied", async () => {
  await assertFails(update("user-a-missing", "user-a-missing", { perfil: "Administrador Geral" }));
});
test("6101422 own company move denied", async () => {
  await assertFails(update("user-a-store", "user-a-store", { empresa_id: "empresa-b" }));
});
test("6101422 own store move to other company denied", async () => {
  await assertFails(update("user-a-store", "user-a-store", { supermercado_id: "loja-b" }));
});
test("6101422 inactive worker own timestamp denied", async () => {
  await assertFails(update("inactive-a", "inactive-a", { atualizado_em: "probe" }));
});
test("6101422 admin same-company status update succeeds", async () => {
  await assertSucceeds(update("admin-a", "user-a-store", { status: "Inativo" }));
});
test("6101422 admin cross-company status update denied", async () => {
  await assertFails(update("admin-a", "user-b-store", { status: "Inativo" }));
});
test("6101422 inactive admin cannot manage worker", async () => {
  await assertFails(update("admin-inactive", "user-a-store", { status: "Inativo" }));
});
test("6101422 company admin cannot promote worker to platform", async () => {
  await assertFails(update("admin-a", "user-a-store", { perfil: "Administrador Geral" }));
});
test("6101422 admin with missing own store can manage company worker", async () => {
  await assertSucceeds(update("admin-a-missing", "user-a-store", { status: "Inativo" }));
});
test("6101422 company admin cannot change tenant of worker without store", async () => {
  await assertFails(update("admin-a", "user-a-missing", { empresa_id: "empresa-b" }));
});
test("6101422 platform admin cannot modify company admin without invitation", async () => {
  await assertFails(update("platform", "admin-a", { status: "Inativo" }));
});
