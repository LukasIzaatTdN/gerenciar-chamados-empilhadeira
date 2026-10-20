import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";

// Independent fixtures: compare EXACT same operations under baseline and candidate.
const env = await initializeTestEnvironment({
  projectId: "demo-patio-pro-log",
  firestore: {
    host: "127.0.0.1",
    port: Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "28080"),
    rules: await readFile(process.env.PATIO_RULES_TEST_RULES_PATH || new URL("../../../firestore.rules", import.meta.url), "utf8"),
  },
});
before(async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const id of ["empresa-a", "empresa-b"]) {
      await setDoc(doc(db, "empresas", id), { nome: id, status: "Ativa" });
      await setDoc(doc(db, "supermercados", "loja-" + id.at(-1)), { empresa_id: id, status: "Ativo" });
    }
    const users = {
      "self-a": { id: "self-a", perfil: "Promotor", status: "Ativo", empresa_id: "empresa-a", supermercado_id: "loja-a", nome: "Self", email: "self@test.invalid", criado_em: "seed" },
      "admin-a": { id: "admin-a", perfil: "Administrador da Empresa", status: "Ativo", empresa_id: "empresa-a", supermercado_id: null, nome: "Admin A", email: "admin-a@test.invalid", criado_em: "seed" },
      "admin-b": { id: "admin-b", perfil: "Administrador da Empresa", status: "Ativo", empresa_id: "empresa-b", supermercado_id: null, nome: "Admin B", email: "admin-b@test.invalid", criado_em: "seed" },
      "platform": { id: "platform", perfil: "Administrador Geral", status: "Ativo", empresa_id: null, supermercado_id: null, nome: "Platform", email: "platform@test.invalid", criado_em: "seed" },
      "managed-a": { id: "managed-a", perfil: "Promotor", status: "Ativo", empresa_id: "empresa-a", supermercado_id: "loja-a", nome: "Managed A", email: "managed-a@test.invalid", criado_em: "seed" },
      "managed-b": { id: "managed-b", perfil: "Promotor", status: "Ativo", empresa_id: "empresa-b", supermercado_id: "loja-b", nome: "Managed B", email: "managed-b@test.invalid", criado_em: "seed" },
      "invited-admin-a": { id: "invited-admin-a", perfil: "Administrador da Empresa", status: "Ativo", empresa_id: "empresa-a", supermercado_id: null, convite_token: "token-610149", nome: "Invited Admin", email: "invited@test.invalid", criado_em: "seed" },
    };
    for (const [id, data] of Object.entries(users)) await setDoc(doc(db, "usuarios", id), data);
  });
});
after(async () => env.cleanup());
const as = uid => env.authenticatedContext(uid).firestore();

test("610149 self user updates allowed timestamp", async () => {
  await assertSucceeds(updateDoc(doc(as("self-a"), "usuarios/self-a"), { atualizado_em: "2026-10-19" }));
});
test("610149 user cannot promote own profile", async () => {
  await assertFails(updateDoc(doc(as("self-a"), "usuarios/self-a"), { perfil: "Administrador Geral" }));
});
test("610149 company admin manages same-company user", async () => {
  await assertSucceeds(updateDoc(doc(as("admin-a"), "usuarios/managed-a"), { status: "Inativo" }));
});
test("610149 company admin cannot manage other company", async () => {
  await assertFails(updateDoc(doc(as("admin-a"), "usuarios/managed-b"), { status: "Inativo" }));
});
test("610149 platform admin manages invited company admin", async () => {
  await assertSucceeds(updateDoc(doc(as("platform"), "usuarios/invited-admin-a"), { status: "Inativo" }));
});
test("610149 ordinary user cannot change others privileges", async () => {
  await assertFails(updateDoc(doc(as("self-a"), "usuarios/managed-a"), { perfil: "Administrador da Empresa" }));
});
// Explicit regression probe: company admin could potentially manage their own status
// through the company branch. Do NOT assume an early self-reject preserves that access.
test("610149 company admin self-management regression probe", async () => {
  await assertSucceeds(updateDoc(doc(as("admin-b"), "usuarios/admin-b"), { status: "Inativo" }));
});
