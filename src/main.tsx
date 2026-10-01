import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./App.css";

// right click is prevented everywhere to keep the desktop shell feeling native rather than webview
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// shortcuts that expose webview inspector are suppressed in production builds
if (!import.meta.env.DEV) {
  window.addEventListener("keydown", (e) => {
    const isDevTools =
      ((e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === "I" ||
          e.key === "i" ||
          e.key === "J" ||
          e.key === "j" ||
          e.key === "C" ||
          e.key === "c")) ||
      (e.metaKey &&
        e.altKey &&
        (e.key === "I" ||
          e.key === "i" ||
          e.key === "J" ||
          e.key === "j" ||
          e.key === "C" ||
          e.key === "c")) ||
      e.key === "F12" ||
      ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U"));

    if (isDevTools) {
      e.preventDefault();
    }
  });
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
