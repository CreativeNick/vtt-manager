import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initVisualEffects } from "./lib/visualEffects";

// Apply the saved "reduce visual effects" preference before first paint so a lite-mode user
// never sees a flash of the full decorative layer.
initVisualEffects();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
