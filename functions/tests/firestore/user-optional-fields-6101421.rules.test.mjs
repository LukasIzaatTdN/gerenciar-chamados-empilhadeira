import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";

// 6.10.14.21: optional-field probes. They run ONLY with demo project + emulator.
const env = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "28080"),
    rules: await readFile(process.env.PATIO_RULES_TEST_RULES_PATH || new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});
const makeUser = (id, perfil, fields = {}) => ({
  id, perfil, empresa_id: "empresa-a", nome: id, email: id + "@test.invalid",
  status: "Ativo", criado_em: "seed", ...fields,
});
before(async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "empresas/empresa-a"), { nome: "Empresa A", status: "Ativa" });
    await setDoc(doc(db, "supermercados/loja-a"), { empresa_id: "empresa-a", status: "Ativo" });
    await setDoc(doc(db, "usuarios/worker-no-store"), makeUser("worker-no-store", "Promotor"));
    await setDoc(doc(db, "usuarios/admin-a"), makeUser("admin-a", "Administrador da Empresa", { supermercado_id: null }));
    await setDoc(doc(db, "usuarios/managed-no-store"), makeUser("managed-no-store", "Promotor"));
    await setDoc(doc(db, "usuarios/managed-no-token"), makeUser("managed-no-token", "Administrador da Empresa", { supermercado_id: null }));
    await setDoc(doc(db, "usuarios/platform-admin"), makeUser("platform-admin", "Administrador Geral", {
      empresa_id: null, supermercado_id: null,
    }));
  });
});
after(async () => env.cleanup());
const as = uid => env.authenticatedContext(uid).firestore();

test("6101421 own timestamp without supermercado_id", async () => {
  await assertSucceeds(updateDoc(doc(as("worker-no-store"), "usuarios/worker-no-store"), { atualizado_em: "probe" }));
});
test("6101421 company admin cannot modify other company admin without invite token", async () => {
  await assertFails(updateDoc(doc(as("admin-a"), "usuarios/managed-no-token"), { perfil: "Administrador Geral" }));
});
test("6101421 platform admin cannot manage admin without invite token", async () => {
  await assertFails(updateDoc(doc(as("platform-admin"), "usuarios/managed-no-token"), { status: "Inativo" }));
});
test("6101421 company admin cannot escalate worker without supermercado_id", async () => {
  await assertFails(updateDoc(doc(as("admin-a"), "usuarios/managed-no-store"), { perfil: "Administrador Geral" }));
});
