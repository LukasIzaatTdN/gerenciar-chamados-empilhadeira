import { useSupermercados } from "./useSupermercados";

export function useUnidades() {
  const {
    supermercados,
    isRemoteSyncEnabled,
    createSupermercado,
    updateSupermercado,
    toggleSupermercadoStatus,
  } = useSupermercados();

  return {
    unidades: supermercados,
    isRemoteSyncEnabled,
    createUnidade: createSupermercado,
    updateUnidade: updateSupermercado,
    toggleUnidadeStatus: toggleSupermercadoStatus,
  };
}
