import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";

// 6.10.14.18: each test is run in an isolated Emulator process by the harness.
// Compare the *same* setDoc/updateDoc operations with and without the guard.
const environment = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "28080"),
    rules: await readFile(process.env.PATIO_RULES_TEST_RULES_PATH || new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});
const user = (id, perfil = "Promotor") => ({
  id, perfil, status: "Ativo", empresa_id: "empresa-a",
  supermercado_id: "loja-a", nome: "Teste", email: id + "@example.test", criado_em: "seed",
});
before(async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "empresas/empresa-a"), { nome: "Empresa A", status: "Ativa" });
    await setDoc(doc(db, "supermercados/loja-a"), { empresa_id: "empresa-a", status: "Ativo" });
    await setDoc(doc(db, "usuarios/existing"), user("existing"));
    await setDoc(doc(db, "usuarios/another"), user("another"));
  });
});
after(async () => environment.cleanup());
const as = id => environment.authenticatedContext(id).firestore();

test("6101418 setDoc on absent ordinary user is allowed create", async () => {
  await assertSucceeds(setDoc(doc(as("new-user"), "usuarios/new-user"), user("new-user")));
});
test("6101418 setDoc on absent platform admin is denied", async () => {
  await assertFails(setDoc(doc(as("rogue"), "usuarios/rogue"), {
    ...user("rogue"), perfil: "Administrador Geral", empresa_id: null, supermercado_id: null,
  }));
});
test("6101418 setDoc on existing own user cannot escalate", async () => {
  await assertFails(setDoc(doc(as("existing"), "usuarios/existing"), user("existing", "Administrador Geral")));
});
test("6101418 updateDoc on existing own user cannot escalate", async () => {
  await assertFails(updateDoc(doc(as("existing"), "usuarios/existing"), { perfil: "Administrador Geral" }));
});
test("6101418 updateDoc on absent user is denied", async () => {
  await assertFails(updateDoc(doc(as("missing"), "usuarios/missing"), { atualizado_em: "probe" }));
});
test("6101418 updateDoc on existing own user timestamp is allowed", async () => {
  await assertSucceeds(updateDoc(doc(as("existing"), "usuarios/existing"), { atualizado_em: "probe" }));
});
