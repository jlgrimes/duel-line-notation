import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { WorkspaceProvider } from "./workspace-store";
import "./styles.css";

function routeId(): string | undefined {
  const match = window.location.hash.match(/^#\/combos\/([^/]+)\/([^/]+)$/);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkspaceProvider selectedId={routeId()}><App /></WorkspaceProvider>
  </StrictMode>,
);
