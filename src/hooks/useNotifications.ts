import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { AppNotification, NotificationType } from "../types/notification";
import { NOTIFICATION_CONFIG } from "../types/notification";
import { useNotificationSound } from "./useNotificationSound";
import { dispatchWhatsApp } from "../services/whatsapp";

const STORAGE_KEY = "notificacoes_empilhadeira";
const MAX_NOTIFICATIONS = 50;

function loadNotifications(): AppNotification[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveNotifications(notifs: AppNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, MAX_NOTIFICATIONS)));
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadNotifications());
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const { play } = useNotificationSound();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
      const config = NOTIFICATION_CONFIG[type];

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
      play(config.sound);

      // Auto-dismiss toast after 5 seconds
      setTimeout(() => {
        if (mountedRef.current) {
          setToasts((prev) => prev.filter((t) => t.id !== notif.id));
        }
      }, 5000);

      // Dispatch to WhatsApp service (future integration)
      dispatchWhatsApp(notif);
    },
    [play]
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
