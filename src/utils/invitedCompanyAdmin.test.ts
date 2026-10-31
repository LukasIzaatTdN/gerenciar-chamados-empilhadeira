import * as assert from "node:assert/strict";
import type { UsuarioSistema } from "../types/usuario.ts";
import { isInvitedCompanyManager } from "./invitedCompanyAdmin.ts";

const gerenteConvidado: UsuarioSistema = {
  id: "manager-1",
  nome: "Gerente convidado",
  perfil: "Gerente da Empresa",
  empresa_id: "empresa-1",
  supermercado_id: null,
  convite_token: "token-valido",
};

assert.equal(isInvitedCompanyManager(gerenteConvidado), true);
assert.equal(isInvitedCompanyManager({ ...gerenteConvidado, convite_token: "   " }), false);
assert.equal(isInvitedCompanyManager({ ...gerenteConvidado, convite_token: null }), false);
assert.equal(
  isInvitedCompanyManager({ ...gerenteConvidado, perfil: "Operador", convite_token: "token-valido" }),
  false
);

console.log("invitedCompanyAdmin tests passed");
