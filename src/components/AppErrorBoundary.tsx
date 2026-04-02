import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Erro inesperado ao renderizar a aplicação.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 px-4 py-10">
          <div className="mx-auto max-w-2xl rounded-[28px] border border-red-200 bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-500">
              Erro de visualizacao
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
              O app encontrou um erro inesperado
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-2xl bg-[linear-gradient(135deg,#0f3d75,#0f172a)] px-5 py-3 text-sm font-semibold text-white"
            >
              Recarregar aplicacao
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
