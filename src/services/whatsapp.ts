/**
 * ─────────────────────────────────────────────────────────
 * WhatsApp Integration Service (Prepared for future use)
 * ─────────────────────────────────────────────────────────
 *
 * This module provides a structured foundation for integrating
 * WhatsApp notifications into the forklift call management system.
 *
 * HOW TO INTEGRATE:
 *
 * 1. Set up a WhatsApp Business API provider (e.g., Twilio, Meta Cloud API, Z-API)
 * 2. Replace the placeholder API_URL and AUTH_TOKEN below
 * 3. Set WHATSAPP_ENABLED to true
 * 4. Configure recipient phone numbers for operators
 *
 * EXAMPLE PROVIDERS:
 *   - Meta Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
 *   - Twilio: https://www.twilio.com/docs/whatsapp
 *   - Z-API: https://z-api.io/
 *   - Evolution API: https://doc.evolution-api.com/
 */

import type { AppNotification, NotificationType } from "../types/notification";

// ─── Configuration ───────────────────────────────────────
interface WhatsAppConfig {
  enabled: boolean;
  apiUrl: string;
  authToken: string;
  defaultRecipients: string[];
}

const env =
  typeof import.meta !== "undefined" && import.meta && "env" in import.meta
    ? ((import.meta.env as Record<string, string | boolean | undefined>) ?? {})
    : ({} as Record<string, string | boolean | undefined>);

const parseRecipients = (value: unknown): string[] => {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const config: WhatsAppConfig = {
  enabled: Boolean(env.VITE_WHATSAPP_ENABLED),
  apiUrl: (env.VITE_WHATSAPP_API_URL as string) ?? "https://YOUR_WHATSAPP_API_ENDPOINT/send-message",
  authToken: (env.VITE_WHATSAPP_AUTH_TOKEN as string) ?? "YOUR_AUTH_TOKEN_HERE",
  defaultRecipients: parseRecipients(
    (env.VITE_WHATSAPP_DEFAULT_RECIPIENTS as string) ?? "+5511999999999"
  ),
};

// ─── Message Templates ───────────────────────────────────
const MESSAGE_TEMPLATES: Record<NotificationType, (notif: AppNotification) => string> = {
  chamado_criado: (n) =>
    `📋 *Novo Chamado Criado*\n\n${n.message}\n\n⏰ ${new Date(n.timestamp).toLocaleString("pt-BR")}`,

  chamado_assumido: (n) =>
    `🤚 *Chamado Assumido*\n\n${n.message}\n\n⏰ ${new Date(n.timestamp).toLocaleString("pt-BR")}`,

  atendimento_iniciado: (n) =>
    `▶️ *Atendimento Iniciado*\n\n${n.message}\n\n⏰ ${new Date(n.timestamp).toLocaleString("pt-BR")}`,

  operador_proximo: (n) =>
    `📍 *Operador Próximo*\n\n${n.message}\n\n⏰ ${new Date(n.timestamp).toLocaleString("pt-BR")}`,

  atendimento_finalizado: (n) =>
    `✅ *Atendimento Finalizado*\n\n${n.message}\n\n⏰ ${new Date(n.timestamp).toLocaleString("pt-BR")}`,

  operational_escalation: (n) =>
    `🚨 *Escalonamento Operacional Crítico*\n\n${n.title}\n${n.message}\n\n⏰ ${new Date(n.timestamp).toLocaleString("pt-BR")}`,

  perfil_atualizado: (n) =>
    `🏪 *Perfil Atualizado*\n\n${n.message}\n\n⏰ ${new Date(n.timestamp).toLocaleString("pt-BR")}`,

  erro_perfil: (n) =>
    `⚠️ *Erro de Perfil*\n\n${n.message}\n\n⏰ ${new Date(n.timestamp).toLocaleString("pt-BR")}`,
};

// ─── Send Function ───────────────────────────────────────
async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!config.enabled) {
    return { success: false, error: "WhatsApp integration not enabled" };
  }

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.authToken}`,
      },
      body: JSON.stringify({
        phone,
        message,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[WhatsApp] Failed to send message: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

// ─── Public Dispatch Function ────────────────────────────
/**
 * Determines which phone numbers should receive a given notification type.
 */
export function resolveNotificationRecipients(
  type: NotificationType,
  meta?: Record<string, string>
): string[] {
  const seen = new Set<string>();
  const pushUnique = (phones: string[]) => {
    phones.forEach((phone) => {
      const normalized = phone.trim();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
      }
    });
  };

  if (meta?.phone) {
    pushUnique([meta.phone]);
    return [...seen];
  }

  const unitSupervisorRecipients = parseRecipients(
    meta?.supervisorPhones ?? meta?.unitSupervisorPhones ?? meta?.unitSupervisorPhone ?? ""
  );

  switch (type) {
    case "chamado_criado":
      pushUnique(config.defaultRecipients);
      break;

    case "chamado_assumido":
    case "atendimento_iniciado":
    case "operador_proximo":
      pushUnique(meta?.solicitantePhone ? [meta.solicitantePhone] : []);
      break;

    case "atendimento_finalizado":
      pushUnique([
        ...(meta?.solicitantePhone ? [meta.solicitantePhone] : []),
        ...(meta?.operadorPhone ? [meta.operadorPhone] : []),
      ]);
      break;

    case "operational_escalation":
      if (unitSupervisorRecipients.length > 0) {
        pushUnique(unitSupervisorRecipients);
      } else {
        pushUnique(config.defaultRecipients);
      }
      break;

    case "perfil_atualizado":
    case "erro_perfil":
      pushUnique(config.defaultRecipients);
      break;

    default:
      pushUnique(config.defaultRecipients);
      break;
  }

  return [...seen];
}

/**
 * Dispatches a notification to WhatsApp.
 * Currently logs to console (disabled). Enable by setting config.enabled = true
 * and providing valid API credentials.
 */
export function dispatchWhatsApp(notification: AppNotification): void {
  if (!config.enabled) {
    console.debug("[WhatsApp] Integration disabled. Notification queued:", {
      type: notification.type,
      title: notification.title,
      message: notification.message,
      recipients: resolveNotificationRecipients(notification.type, notification.meta),
    });
    return;
  }

  const template = MESSAGE_TEMPLATES[notification.type];
  const formattedMessage = template(notification);
  const recipients = resolveNotificationRecipients(notification.type, notification.meta);

  recipients.forEach((phone) => {
    sendWhatsAppMessage(phone, formattedMessage).then((result) => {
      if (result.success) {
        console.info(`[WhatsApp] ✓ Message sent to ${phone}`);
      } else {
        console.warn(`[WhatsApp] ✗ Failed to send to ${phone}: ${result.error}`);
      }
    });
  });
}

// ─── Utility: Generate WhatsApp deep link ────────────────
/**
 * Generates a wa.me link for manual sharing.
 * Can be used as a fallback when API is not configured.
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encoded}`;
}
