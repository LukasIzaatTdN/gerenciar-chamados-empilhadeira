export type AdminInviteStatus = "Pendente" | "Usado" | "Expirado" | "Cancelado";

export interface AdminInvite {
  id: string;
  empresa_id: string;
  perfil: "Administrador da Empresa";
  status: AdminInviteStatus;
  criado_em: string;
  expira_em: string;
  expira_em_ms: number;
  criado_por_uid: string | null;
  criado_por_nome: string | null;
  usado_em: string | null;
  usado_por_uid: string | null;
  usado_por_nome: string | null;
}

