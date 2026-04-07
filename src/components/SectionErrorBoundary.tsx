import { Component, type ErrorInfo, type ReactNode } from "react";

interface SectionErrorBoundaryProps {
  children: ReactNode;
  title?: string;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Erro inesperado ao renderizar esta seção.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SectionErrorBoundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          <p className="font-semibold">
            {this.props.title ?? "Esta seção encontrou um erro de visualização."}
          </p>
          <p className="mt-1">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: "" })}
            className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
