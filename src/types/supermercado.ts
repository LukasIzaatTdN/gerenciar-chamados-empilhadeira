export interface Supermercado {
  id: string;
  empresa_id: string;
  nome: string;
  codigo: string;
  endereco: string;
  status: "Ativo" | "Inativo";
  criado_em: string;
}
