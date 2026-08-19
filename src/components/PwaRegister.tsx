"use client";

import { useEffect } from "react";

function activateWaitingWorker(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
}

export async function registerPwaServiceWorker(
  serviceWorkers: ServiceWorkerContainer,
  deploymentId = "local",
): Promise<ServiceWorkerRegistration> {
  const serviceWorkerUrl = `/sw.js?v=${encodeURIComponent(deploymentId)}`;
  const registration = await serviceWorkers.register(serviceWorkerUrl, {
    scope: "/",
    updateViaCache: "none",
  });

  activateWaitingWorker(registration);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && serviceWorkers.controller) {
        activateWaitingWorker(registration);
      }
    });
  });

  await registration.update().catch(() => undefined);
  return registration;
}

export function PwaRegister(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;

    const deploymentId = document.documentElement.dataset.dplId ?? "local";
    void registerPwaServiceWorker(navigator.serviceWorker, deploymentId)
      .then((value) => {
        if (disposed) return;
        registration = value;
      })
      .catch(() => {
        // Offline support is progressive enhancement; the app remains usable.
      });

    const updateOnFocus = () => {
      void registration?.update().catch(() => undefined);
    };
    window.addEventListener("focus", updateOnFocus);

    return () => {
      disposed = true;
      window.removeEventListener("focus", updateOnFocus);
    };
  }, []);

  return null;
}
