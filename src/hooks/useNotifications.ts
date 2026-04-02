import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { AppNotification, NotificationType } from "../types/notification";
import { NOTIFICATION_CONFIG } from "../types/notification";
import { useNotificationSound } from "./useNotificationSound";
import { dispatchWhatsApp } from "../services/whatsapp";

const STORAGE_KEY = "notificacoes_empilhadeira";
const MAX_NOTIFICATIONS = 50;
const DEFAULT_NOTIFICATION_TYPE: NotificationType = "chamado_criado";

function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && value in NOTIFICATION_CONFIG;
}

function loadNotifications(): AppNotification[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as Partial<AppNotification>[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : uuidv4(),
        type: isNotificationType(item.type) ? item.type : DEFAULT_NOTIFICATION_TYPE,
        title: typeof item.title === "string" ? item.title : "Notificação",
        message: typeof item.message === "string" ? item.message : "",
        timestamp:
          typeof item.timestamp === "string" ? item.timestamp : new Date().toISOString(),
        read: Boolean(item.read),
        chamadoId: typeof item.chamadoId === "string" ? item.chamadoId : undefined,
        meta: item.meta && typeof item.meta === "object" ? item.meta : undefined,
      }));
  } catch {
    return [];
  }
}

function saveNotifications(notifs: AppNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, MAX_NOTIFICATIONS)));
}

export function useNotifications({
  enabled = true,
  soundEnabled = true,
}: {
  enabled?: boolean;
  soundEnabled?: boolean;
} = {}) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadNotifications());
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const { play } = useNotificationSound();
  const mountedRef = useRef(true);
  const toastTimersRef = useRef<number[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      toastTimersRef.current = [];
    };
  }, []);

  // Persist
  useEffect(() => {
    saveNotifications(notifications);
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Dispatch a new notification
  const notify = useCallback(
    (
      type: NotificationType,
      title: string,
      message: string,
      chamadoId?: string,
      meta?: Record<string, string>
    ) => {
      if (!enabled) {
        return;
      }

      const config = NOTIFICATION_CONFIG[type] ?? NOTIFICATION_CONFIG[DEFAULT_NOTIFICATION_TYPE];

      const notif: AppNotification = {
        id: uuidv4(),
        type,
        title,
        message,
        timestamp: new Date().toISOString(),
        read: false,
        chamadoId,
        meta,
      };

      // Add to list
      setNotifications((prev) => [notif, ...prev].slice(0, MAX_NOTIFICATIONS));

      // Show toast
      setToasts((prev) => [...prev, notif]);

      // Play sound
      if (soundEnabled) {
        play(config.sound);
      }

      // Auto-dismiss toast after 5 seconds
      const timer = window.setTimeout(() => {
        if (mountedRef.current) {
          setToasts((prev) => prev.filter((t) => t.id !== notif.id));
        }
      }, 5000);
      toastTimersRef.current.push(timer);

      // Dispatch to WhatsApp service (future integration)
      dispatchWhatsApp(notif);
    },
    [enabled, play, soundEnabled]
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    toasts,
    unreadCount,
    notify,
    markAsRead,
    markAllAsRead,
    dismissToast,
    clearAll,
  };
}
