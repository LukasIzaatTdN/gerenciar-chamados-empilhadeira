import { useEffect, useRef, useState } from "react";
import type { AppNotification } from "../types/notification";
import { NOTIFICATION_CONFIG } from "../types/notification";

interface NotificationToastProps {
  toasts: AppNotification[];
  onDismiss: (id: string) => void;
}

const COLOR_MAP: Record<string, { bg: string; border: string; bar: string; icon: string }> = {
  blue: {
    bg: "bg-white",
    border: "border-blue-200",
    bar: "bg-blue-700",
    icon: "bg-blue-100 text-blue-700",
  },
  indigo: {
    bg: "bg-white",
    border: "border-indigo-200",
    bar: "bg-blue-700",
    icon: "bg-blue-100 text-blue-700",
  },
  emerald: {
    bg: "bg-white",
    border: "border-emerald-200",
    bar: "bg-emerald-500",
    icon: "bg-emerald-100 text-emerald-600",
  },
  amber: {
    bg: "bg-white",
    border: "border-amber-200",
    bar: "bg-amber-500",
    icon: "bg-amber-100 text-amber-600",
  },
  green: {
    bg: "bg-white",
    border: "border-green-200",
    bar: "bg-green-500",
    icon: "bg-green-100 text-green-600",
  },
  red: {
    bg: "bg-white",
    border: "border-red-200",
    bar: "bg-red-500",
    icon: "bg-red-100 text-red-600",
  },
};

function ToastItem({ toast, onDismiss }: { toast: AppNotification; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);
  const visibleTimerRef = useRef<number | null>(null);
  const autoExitTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const dismissRequestedRef = useRef(false);

  const config = NOTIFICATION_CONFIG[toast.type] ?? NOTIFICATION_CONFIG.chamado_criado;
  const colors = COLOR_MAP[config.color] || COLOR_MAP.blue;

  useEffect(() => {
    isMountedRef.current = true;
    visibleTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        setVisible(true);
      }
    }, 50);
    autoExitTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        setExiting(true);
      }
    }, 4500);

    return () => {
      isMountedRef.current = false;
      if (visibleTimerRef.current) window.clearTimeout(visibleTimerRef.current);
      if (autoExitTimerRef.current) window.clearTimeout(autoExitTimerRef.current);
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    };
  }, []);

  function handleDismiss() {
    if (dismissRequestedRef.current) return;
    dismissRequestedRef.current = true;
    setExiting(true);
    dismissTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        onDismiss();
      }
    }, 300);
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border shadow-[0_18px_36px_rgba(15,23,42,0.14)] transition-all duration-300 ${colors.bg} ${colors.border} ${
        visible && !exiting
          ? "translate-x-0 opacity-100"
          : "translate-x-full opacity-0"
      }`}
      style={{ maxWidth: 380 }}
    >
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 h-0.5 w-full bg-gray-200/50">
        <div
          className={`h-full ${colors.bar} transition-none`}
          style={{
            animation: "toast-progress 5s linear forwards",
          }}
        />
      </div>

      <div className="flex items-start gap-3 p-3.5">
        {/* Icon */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
          <span className="text-lg">{config.icon}</span>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-800">{toast.title}</p>
          <p className="mt-0.5 text-xs text-gray-600 line-clamp-2">{toast.message}</p>
          <p className="mt-1 text-[10px] text-gray-400">
            {new Date(toast.timestamp).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-xl p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function NotificationToast({ toasts, onDismiss }: NotificationToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[9999] flex flex-col gap-2 sm:right-6 sm:top-6">
      {toasts.slice(-4).map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}
