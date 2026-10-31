import type { UsuarioSistema } from "../types/usuario";

export function isInvitedCompanyManager(usuario: UsuarioSistema): boolean {
  return (
    usuario.perfil === "Gerente da Empresa" &&
    typeof usuario.convite_token === "string" &&
    usuario.convite_token.trim().length > 0
  );
}
