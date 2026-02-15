import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { EVT_SW_UPDATE_AVAILABLE, EVT_INSTALL_PROMPT_AVAILABLE, EVT_APP_INSTALLED } from "./lib/keys";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for production (skipped in dev by default)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {

    // expose an activation helper so UI can trigger skipWaiting
    window.__smui_activateUpdate = async () => {
      const waiting = reg.waiting;
      if (waiting) {
        waiting.postMessage('skipWaiting');
      }
    };

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // new content available
          window.dispatchEvent(new CustomEvent(EVT_SW_UPDATE_AVAILABLE));
        }
      });
    });
  }).catch((err) => {
  });

  // reload page when new service worker takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// Install prompt hook (expose deferred prompt for UI)
window.addEventListener('beforeinstallprompt', (e: Event) => {
  (e as Event & { prompt?: () => Promise<void> })?.preventDefault?.();
  window.__smui_deferredInstallPrompt = e as unknown;
  window.dispatchEvent(new CustomEvent(EVT_INSTALL_PROMPT_AVAILABLE));
  window.dispatchEvent(new CustomEvent(EVT_APP_INSTALLED));
});
