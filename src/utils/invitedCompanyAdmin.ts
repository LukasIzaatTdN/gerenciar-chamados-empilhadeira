import type { UsuarioSistema } from "../types/usuario";

export function isInvitedCompanyAdmin(usuario: UsuarioSistema): boolean {
  return (
    usuario.perfil === "Administrador da Empresa" &&
    typeof usuario.convite_token === "string" &&
    usuario.convite_token.trim().length > 0
  );
}
