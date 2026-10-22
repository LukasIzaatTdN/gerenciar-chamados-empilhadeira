import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCompanyRegistration } from "./companyRegistration.ts";

test("new company registration contains only cadastral fields", () => {
  assert.deepEqual(buildCompanyRegistration({ nome: "  Empresa Nova ", codigo: " nova ", cnpj: " 12 " }, "emp-NOVA", "2026-10-22"), {
    id: "emp-NOVA",
    nome: "Empresa Nova",
    codigo: "NOVA",
    cnpj: "12",
    status: "Ativa",
    criado_em: "2026-10-22",
  });
});
