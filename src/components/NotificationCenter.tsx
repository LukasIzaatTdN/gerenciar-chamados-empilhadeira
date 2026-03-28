import { useState, useRef, useEffect } from "react";
import type { AppNotification } from "../types/notification";
import { NOTIFICATION_CONFIG } from "../types/notification";

interface NotificationCenterProps {
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  variant?: "light" | "dark";
}

const COLOR_CLASSES: Record<string, { light: string; dark: string }> = {
  blue: {
    light: "bg-blue-100 text-blue-700",
    dark: "bg-blue-500/20 text-blue-300",
  },
  indigo: {
    light: "bg-indigo-100 text-indigo-700",
    dark: "bg-indigo-500/20 text-indigo-300",
  },
  emerald: {
    light: "bg-emerald-100 text-emerald-700",
    dark: "bg-emerald-500/20 text-emerald-300",
  },
  amber: {
    light: "bg-amber-100 text-amber-700",
    dark: "bg-amber-500/20 text-amber-300",
  },
  green: {
    light: "bg-green-100 text-green-700",
    dark: "bg-green-500/20 text-green-300",
  },
};

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function NotificationCenter({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  variant = "light",
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDark = variant === "dark";

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  return (
    <div ref={panelRef} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-95 ${
          isDark
            ? "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
            : "border-2 border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
        }`}
        title="Notificações"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg shadow-red-500/40">
            {unreadCount > 9 ? "9+" : unreadCount}
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-40" />
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          className={`absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border shadow-2xl sm:w-96 ${
            isDark
              ? "border-white/10 bg-slate-800 shadow-black/50"
              : "border-gray-200 bg-white shadow-gray-200/50"
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${
              isDark ? "border-white/10" : "border-gray-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">🔔</span>
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
                Notificações
              </h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllAsRead}
                  className={`rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${
                    isDark
                      ? "text-indigo-300 hover:bg-white/10"
                      : "text-blue-600 hover:bg-blue-50"
                  }`}
                >
                  Marcar todas lidas
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={onClearAll}
                  className={`rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${
                    isDark
                      ? "text-red-300 hover:bg-white/10"
                      : "text-red-500 hover:bg-red-50"
                  }`}
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto sm:max-h-96">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <span className="text-4xl">🔕</span>
                <p className={`mt-3 text-sm font-medium ${isDark ? "text-white/40" : "text-gray-400"}`}>
                  Nenhuma notificação
                </p>
                <p className={`mt-1 text-xs ${isDark ? "text-white/20" : "text-gray-300"}`}>
                  As notificações aparecerão aqui
                </p>
              </div>
            ) : (
              notifications.slice(0, 30).map((notif) => {
                const config = NOTIFICATION_CONFIG[notif.type];
                const colorClass = COLOR_CLASSES[config.color] || COLOR_CLASSES.blue;
                const chipColor = isDark ? colorClass.dark : colorClass.light;

                return (
                  <button
                    key={notif.id}
                    onClick={() => onMarkAsRead(notif.id)}
                    className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors ${
                      isDark
                        ? `border-white/5 ${notif.read ? "bg-transparent" : "bg-white/5"} hover:bg-white/10`
                        : `border-gray-50 ${notif.read ? "bg-transparent" : "bg-blue-50/50"} hover:bg-gray-50`
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${chipColor}`}
                    >
                      <span className="text-sm">{config.icon}</span>
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-xs font-bold leading-tight ${
                            isDark
                              ? notif.read ? "text-white/50" : "text-white"
                              : notif.read ? "text-gray-400" : "text-gray-800"
                          }`}
                        >
                          {notif.title}
                        </p>
                        <span
                          className={`shrink-0 text-[10px] ${
                            isDark ? "text-white/30" : "text-gray-400"
                          }`}
                        >
                          {formatRelative(notif.timestamp)}
                        </span>
                      </div>
                      <p
                        className={`mt-0.5 text-[11px] leading-tight ${
                          isDark
                            ? notif.read ? "text-white/30" : "text-white/60"
                            : notif.read ? "text-gray-300" : "text-gray-500"
                        }`}
                      >
                        {notif.message}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!notif.read && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* WhatsApp Integration Note */}
          <div
            className={`border-t px-4 py-2.5 ${
              isDark ? "border-white/5 bg-white/[0.02]" : "border-gray-100 bg-gray-50/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">💬</span>
              <p className={`text-[10px] ${isDark ? "text-white/25" : "text-gray-400"}`}>
                Integração WhatsApp disponível para configuração
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
