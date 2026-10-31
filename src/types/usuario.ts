export type PerfilAcesso =
  | "Promotor"
  | "Funcionário"
  | "Operador"
  | "Supervisor"
  | "Televendas"
  | "Separador de Televendas"
  | "Gerente da Empresa"
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
  vinculos_unidades_v2?: boolean;
  status?: UsuarioStatus;
  email?: string;
  telefone?: string;
  convite_token?: string | null;
  criado_em?: string;
  atualizado_em?: string;
}
