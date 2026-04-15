import { useSupermercados } from "./useSupermercados";

interface UseUnidadesOptions {
  empresaId?: string | null;
  canViewAllCompanies?: boolean;
}

export function useUnidades(options: UseUnidadesOptions = {}) {
  const {
    supermercados,
    isRemoteSyncEnabled,
    createSupermercado,
    updateSupermercado,
    toggleSupermercadoStatus,
  } = useSupermercados(options);

  return {
    unidades: supermercados,
    isRemoteSyncEnabled,
    createUnidade: createSupermercado,
    updateUnidade: updateSupermercado,
    toggleUnidadeStatus: toggleSupermercadoStatus,
  };
}
