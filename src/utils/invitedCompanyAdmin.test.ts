import * as assert from "node:assert/strict";
import type { UsuarioSistema } from "../types/usuario.ts";
import { isInvitedCompanyAdmin } from "./invitedCompanyAdmin.ts";

const gerenteConvidado: UsuarioSistema = {
  id: "manager-1",
  nome: "Gerente convidado",
  perfil: "Administrador da Empresa",
  empresa_id: "empresa-1",
  supermercado_id: null,
  convite_token: "token-valido",
};

assert.equal(isInvitedCompanyAdmin(gerenteConvidado), true);
assert.equal(isInvitedCompanyAdmin({ ...gerenteConvidado, convite_token: "   " }), false);
assert.equal(isInvitedCompanyAdmin({ ...gerenteConvidado, convite_token: null }), false);
assert.equal(
  isInvitedCompanyAdmin({ ...gerenteConvidado, perfil: "Operador", convite_token: "token-valido" }),
  false
);

console.log("invitedCompanyAdmin tests passed");
