import { describe, expect, it, vi } from "vitest";

import { registerPwaServiceWorker } from "./PwaRegister";

describe("PWA service worker registration", () => {
  it("registers without HTTP cache reuse and requests an update", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();
    const addEventListener = vi.fn();
    const registration = {
      waiting: { postMessage },
      installing: null,
      addEventListener,
      update,
    } as unknown as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);
    const serviceWorkers = { register, controller: null } as unknown as ServiceWorkerContainer;

    await expect(registerPwaServiceWorker(serviceWorkers, "deploy/2026 07")).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith("/sw.js?v=deploy%2F2026%2007", {
      scope: "/",
      updateViaCache: "none",
    });
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(addEventListener).toHaveBeenCalledWith("updatefound", expect.any(Function));
    expect(update).toHaveBeenCalledOnce();
  });

  it("keeps registration successful when the explicit update check fails", async () => {
    const registration = {
      waiting: null,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn().mockRejectedValue(new Error("offline")),
    } as unknown as ServiceWorkerRegistration;
    const serviceWorkers = {
      register: vi.fn().mockResolvedValue(registration),
      controller: null,
    } as unknown as ServiceWorkerContainer;

    await expect(registerPwaServiceWorker(serviceWorkers)).resolves.toBe(registration);
    expect(serviceWorkers.register).toHaveBeenCalledWith("/sw.js?v=local", {
      scope: "/",
      updateViaCache: "none",
    });
  });
});
