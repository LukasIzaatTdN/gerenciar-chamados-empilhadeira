export type NotificationType =
  | "chamado_criado"
  | "chamado_assumido"
  | "atendimento_iniciado"
  | "operador_proximo"
  | "atendimento_finalizado";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  chamadoId?: string;
  /** Extra metadata for future integrations (e.g. WhatsApp) */
  meta?: Record<string, string>;
}

export const NOTIFICATION_CONFIG: Record<
  NotificationType,
  { icon: string; color: string; sound: "info" | "success" | "urgent" | "alert" }
> = {
  chamado_criado: {
    icon: "📋",
    color: "blue",
    sound: "info",
  },
  chamado_assumido: {
    icon: "🤚",
    color: "indigo",
    sound: "info",
  },
  atendimento_iniciado: {
    icon: "▶️",
    color: "emerald",
    sound: "success",
  },
  operador_proximo: {
    icon: "📍",
    color: "amber",
    sound: "alert",
  },
  atendimento_finalizado: {
    icon: "✅",
    color: "green",
    sound: "success",
  },
};
