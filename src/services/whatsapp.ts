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

const config: WhatsAppConfig = {
  enabled: false, // Set to true when API is configured
  apiUrl: "https://YOUR_WHATSAPP_API_ENDPOINT/send-message",
  authToken: "YOUR_AUTH_TOKEN_HERE",
  defaultRecipients: [
    // Add operator phone numbers here
    // "+5511999999999",
  ],
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
 * Dispatches a notification to WhatsApp.
 * Currently logs to console (disabled). Enable by setting config.enabled = true
 * and providing valid API credentials.
 */
export function dispatchWhatsApp(notification: AppNotification): void {
  if (!config.enabled) {
    // Log for development/debugging purposes
    console.debug("[WhatsApp] Integration disabled. Notification queued:", {
      type: notification.type,
      title: notification.title,
      message: notification.message,
    });
    return;
  }

  const template = MESSAGE_TEMPLATES[notification.type];
  const formattedMessage = template(notification);

  // Determine recipients based on notification type
  const recipients = getRecipientsForType(notification.type, notification.meta);

  // Send to all recipients
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

/**
 * Determines which phone numbers should receive a given notification type.
 */
function getRecipientsForType(
  type: NotificationType,
  meta?: Record<string, string>
): string[] {
  // If a specific phone was provided in meta, use it
  if (meta?.phone) {
    return [meta.phone];
  }

  // Route based on type:
  switch (type) {
    case "chamado_criado":
      // Notify all operators about new calls
      return config.defaultRecipients;

    case "chamado_assumido":
    case "atendimento_iniciado":
    case "operador_proximo":
      // Notify the requesting promoter (would need phone in meta)
      return meta?.solicitantePhone ? [meta.solicitantePhone] : [];

    case "atendimento_finalizado":
      // Notify both parties
      return [
        ...(meta?.solicitantePhone ? [meta.solicitantePhone] : []),
        ...(meta?.operadorPhone ? [meta.operadorPhone] : []),
      ];

    default:
      return config.defaultRecipients;
  }
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
