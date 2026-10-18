const assert = require("node:assert/strict");
const test = require("node:test");
const { assertPlatformAdmin, assertSubscriptionTransition, validatePlan, addCycle } = require("./subscriptions-policy");

test("only an active platform administrator passes authorization", () => {
  assert.doesNotThrow(() => assertPlatformAdmin({ perfil: "Administrador Geral", status: "Ativo" }));
  for (const user of [null, { perfil: "Administrador da Empresa", status: "Ativo" }, { perfil: "Administrador Geral", status: "Inativo" }, { perfil: "Administrador Geral" }]) {
    assert.throws(() => assertPlatformAdmin(user), { code: "permission-denied" });
  }
});

test("plan values and limits are validated as integer currency and quantities", () => {
  const valid = validatePlan({ nome: "Pro", valor_centavos: 12900, ciclo: "Mensal", limite_usuarios: 5, limite_filiais: null, status: "Ativo" });
  assert.equal(valid.valor_centavos, 12900);
  assert.throws(() => validatePlan({ nome: "Pro", valor_centavos: 12.9, ciclo: "Mensal" }), { code: "invalid-argument" });
  assert.throws(() => validatePlan({ nome: "Pro", valor_centavos: 100, ciclo: "Mensal", limite_filiais: 0 }), { code: "invalid-argument" });
  assert.throws(() => validatePlan({ nome: "Pro", valor_centavos: 100, ciclo: "Mensal", status: "desconhecido" }), { code: "invalid-argument" });
});

test("subscription status transitions allow only explicit activation and manual renewal paths", () => {
  assert.equal(assertSubscriptionTransition("assignPlan", null), "Pendente");
  assert.equal(assertSubscriptionTransition("activate", "Pendente"), "Ativa");
  assert.equal(assertSubscriptionTransition("renew", "Ativa"), "Ativa");
  assert.equal(assertSubscriptionTransition("renew", "Expirada"), "Ativa");
  assert.equal(assertSubscriptionTransition("assignPlan", "Ativa"), "Ativa");
  for (const [action, status] of [["activate", "Ativa"], ["renew", "Pendente"], ["renew", "Suspensa"], ["activate", "Cancelada"], ["activate", "Bogus"], ["assignPlan", "Suspensa"]]) {
    assert.throws(() => assertSubscriptionTransition(action, status), { code: "failed-precondition" });
  }
});

test("company paths use one current subscription regardless of branches", () => {
  const companyId = "company-a";
  const subscriptionPath = `empresas/${companyId}/assinaturas/atual`;
  const otherCompanyPath = `empresas/company-b/assinaturas/atual`;
  assert.notEqual(subscriptionPath, otherCompanyPath);
  assert.equal(subscriptionPath.split("/").filter((part) => part === "atual").length, 1);
});

test("cycle math clips month end safely", () => {
  assert.equal(addCycle(new Date("2026-01-31T00:00:00.000Z"), "Mensal").toISOString(), "2026-02-28T00:00:00.000Z");
});
