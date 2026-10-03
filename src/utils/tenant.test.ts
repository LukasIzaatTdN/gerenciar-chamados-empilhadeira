import test from "node:test";
import assert from "node:assert/strict";

import { getAccessibleSupermercadosForUser } from "./tenant.ts";

test("getAccessibleSupermercadosForUser keeps only active units from the same company", () => {
  const supermercados = [
    { id: "unit-1", empresa_id: "company-1", status: "Ativo", nome: "Loja 1" },
    { id: "unit-2", empresa_id: "company-2", status: "Ativo", nome: "Loja 2" },
    { id: "unit-3", empresa_id: "company-1", status: "Inativo", nome: "Loja 3" },
  ] as const;

  const user = {
    perfil: "Supervisor",
    empresa_id: "company-1",
    supermercado_id: "unit-1",
    supermercado_ids: ["unit-1"],
  };

  const result = getAccessibleSupermercadosForUser(supermercados, user);

  assert.deepEqual(result.map((item) => item.id), ["unit-1"]);
});

test("getAccessibleSupermercadosForUser blocks units outside the allowed scope", () => {
  const supermercados = [
    { id: "unit-1", empresa_id: "company-1", status: "Ativo", nome: "Loja 1" },
    { id: "unit-2", empresa_id: "company-1", status: "Ativo", nome: "Loja 2" },
    { id: "unit-3", empresa_id: "company-1", status: "Ativo", nome: "Loja 3" },
  ] as const;

  const user = {
    perfil: "Funcionário",
    empresa_id: "company-1",
    supermercado_id: "unit-1",
    supermercado_ids: ["unit-1"],
  };

  const result = getAccessibleSupermercadosForUser(supermercados, user);

  assert.deepEqual(result.map((item) => item.id), ["unit-1"]);
  assert.ok(!result.some((item) => item.id === "unit-2"));
});

test("getAccessibleSupermercadosForUser allows all active units for the global admin", () => {
  const supermercados = [
    { id: "unit-1", empresa_id: "company-1", status: "Ativo", nome: "Loja 1" },
    { id: "unit-2", empresa_id: "company-2", status: "Ativo", nome: "Loja 2" },
  ] as const;

  const user = {
    perfil: "Administrador Geral",
    empresa_id: null,
    supermercado_id: null,
    supermercado_ids: [],
  };

  const result = getAccessibleSupermercadosForUser(supermercados, user);

  assert.deepEqual(result.map((item) => item.id), ["unit-1", "unit-2"]);
});
