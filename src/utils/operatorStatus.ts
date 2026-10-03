export type OperatorAvailability = "Disponível" | "Pausa";

const OPERATOR_STATUS_STORAGE_PREFIX = "operador_empilhadeira_status";

export function getOperatorStatusStorageKey(userId: string | null): string {
  return `${OPERATOR_STATUS_STORAGE_PREFIX}:${userId ?? "anonymous"}`;
}

export function parseOperatorAvailability(value: string | null): OperatorAvailability {
  return value === "Pausa" ? "Pausa" : "Disponível";
}
