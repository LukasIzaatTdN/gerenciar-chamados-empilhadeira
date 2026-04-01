export type PerfilAcesso =
  | "Promotor"
  | "Funcionário"
  | "Operador"
  | "Supervisor"
  | "Administrador Geral";

export type UsuarioStatus = "Ativo" | "Inativo";

export interface UsuarioSistema {
  id: string;
  nome: string;
  perfil: PerfilAcesso;
  supermercado_id: string | null;
  status?: UsuarioStatus;
  email?: string;
  criado_em?: string;
  atualizado_em?: string;
}
