import type { UsuarioSistema } from "../types/usuario";

export const USUARIOS_SISTEMA: UsuarioSistema[] = [
  {
    id: "u-admin-geral",
    nome: "Patrícia Almeida",
    perfil: "Administrador Geral",
    supermercado_id: null,
  },
  {
    id: "u-promotor-centro",
    nome: "Carlos Santos",
    perfil: "Promotor",
    supermercado_id: "sm-centro",
  },
  {
    id: "u-funcionario-centro",
    nome: "Fernanda Rocha",
    perfil: "Funcionário",
    supermercado_id: "sm-centro",
  },
  {
    id: "u-operador-centro",
    nome: "João Batista",
    perfil: "Operador",
    supermercado_id: "sm-centro",
  },
  {
    id: "u-supervisor-jardim",
    nome: "Marina Costa",
    perfil: "Supervisor",
    supermercado_id: "sm-jardim",
  },
  {
    id: "u-operador-jardim",
    nome: "Ricardo Lima",
    perfil: "Operador",
    supermercado_id: "sm-jardim",
  },
  {
    id: "u-funcionario-norte",
    nome: "Bianca Moura",
    perfil: "Funcionário",
    supermercado_id: "sm-norte",
  },
  {
    id: "u-operador-norte",
    nome: "Lucas Ferreira",
    perfil: "Operador",
    supermercado_id: "sm-norte",
  },
];
