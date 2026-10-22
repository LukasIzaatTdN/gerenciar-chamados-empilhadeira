export type CompanyRegistrationInput = { nome: string; codigo: string; cnpj?: string };

export function buildCompanyRegistration(input: CompanyRegistrationInput, id: string, createdAt: string) {
  return {
    id,
    nome: input.nome.trim(),
    codigo: input.codigo.trim().toUpperCase(),
    cnpj: input.cnpj?.trim() || null,
    status: "Ativa" as const,
    criado_em: createdAt,
  };
}
