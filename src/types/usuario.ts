export type PerfilAcesso =
  | "Promotor"
  | "Funcionário"
  | "Operador"
  | "Supervisor"
  | "Administrador Geral";

export interface UsuarioSistema {
  id: string;
  nome: string;
  perfil: PerfilAcesso;
  supermercado_id: string | null;
}
