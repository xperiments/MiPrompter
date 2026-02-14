import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for production (skipped in dev by default)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    console.debug('SW registered', reg);

    // expose an activation helper so UI can trigger skipWaiting
    (window as any).__smui_activateUpdate = async () => {
      const waiting = reg.waiting;
      if (waiting) {
        waiting.postMessage('skipWaiting');
      }
    };

    reg.addEventListener('updatefound', () => {
      console.debug('SW update found');
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        console.debug('SW statechange', newWorker.state);
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // new content available
          window.dispatchEvent(new CustomEvent('smui.sw-update-available'));
        }
      });
    });
  }).catch((err) => {
    console.debug('SW register failed', err);
  });

  // reload page when new service worker takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.debug('SW controllerchange — reloading');
    window.location.reload();
  });
}

// Install prompt hook (expose deferred prompt for UI)
window.addEventListener('beforeinstallprompt', (e: any) => {
  e.preventDefault();
  (window as any).__smui_deferredInstallPrompt = e;
  window.dispatchEvent(new CustomEvent('smui.install-prompt-available'));
});

window.addEventListener('appinstalled', () => {
  console.debug('PWA installed');
  window.dispatchEvent(new CustomEvent('smui.app-installed'));
});
