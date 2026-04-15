import type { Empresa } from "../types/empresa";
import { LEGACY_EMPRESA_ID, LEGACY_EMPRESA_NOME } from "../utils/tenant";

export const EMPRESAS: Empresa[] = [
  {
    id: LEGACY_EMPRESA_ID,
    nome: LEGACY_EMPRESA_NOME,
    codigo: "PADRAO",
    cnpj: null,
    status: "Ativa",
    plano_codigo: "starter",
    plano_nome: "Plano Starter",
    plano_status: "Ativo",
    plano_ciclo: "Mensal",
    max_usuarios: null,
    max_unidades: null,
    contrato_inicio: null,
    contrato_fim: null,
    criado_em: "2026-04-02T00:00:00.000Z",
  },
];

export function getEmpresaById(
  empresaId: string | null | undefined,
  empresas: Empresa[] = EMPRESAS
) {
  if (!empresaId) return null;
  return empresas.find((item) => item.id === empresaId) ?? null;
}
