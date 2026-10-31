import { useSupermercados } from "./useSupermercados";

interface UseUnidadesOptions {
  userId?: string | null;
  empresaId?: string | null;
  supermercadoId?: string | null;
  supermercadoIds?: string[];
  canViewAllUnits?: boolean;
  canViewAllCompanies?: boolean;
  perfil?: string | null;
}

export function useUnidades(options: UseUnidadesOptions = {}) {
  const {
    supermercados,
    syncError,
    isRemoteSyncEnabled,
    createSupermercado,
    updateSupermercado,
    toggleSupermercadoStatus,
  } = useSupermercados(options);

  return {
    unidades: supermercados,
    syncError,
    isRemoteSyncEnabled,
    createUnidade: createSupermercado,
    updateUnidade: updateSupermercado,
    toggleUnidadeStatus: toggleSupermercadoStatus,
  };
}
