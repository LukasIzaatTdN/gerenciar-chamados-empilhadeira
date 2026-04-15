export type PerfilAcesso =
  | "Promotor"
  | "Funcionário"
  | "Operador"
  | "Supervisor"
  | "Televendas"
  | "Administrador da Empresa"
  | "Administrador Geral";

export type UsuarioStatus = "Ativo" | "Inativo";

export interface UsuarioSistema {
  id: string;
  nome: string;
  perfil: PerfilAcesso;
  empresa_id: string | null;
  supermercado_id: string | null;
  supermercado_ids?: string[];
  status?: UsuarioStatus;
  email?: string;
  criado_em?: string;
  atualizado_em?: string;
}
