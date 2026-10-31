import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { initializeOneSignal } from "./services/oneSignal";

document.documentElement.lang = "pt-BR";
document.documentElement.setAttribute("translate", "no");
document.body.classList.add("notranslate");

void initializeOneSignal();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
