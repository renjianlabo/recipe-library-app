import { describe, expect, it, vi } from "vitest";

import {
  createWakeLockController,
  type ScreenWakeLockSentinelLike,
  type WakeLockStatus,
} from "./wake-lock";

function sentinel() {
  const listeners: Array<() => void> = [];
  const value: ScreenWakeLockSentinelLike = {
    released: false,
    release: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((_type, listener) => listeners.push(listener)),
  };
  return { value, listeners };
}

describe("Wake Lock controller", () => {
  it("reports unsupported without blocking cooking", async () => {
    const statuses: WakeLockStatus[] = [];
    const controller = createWakeLockController({
      getWakeLock: () => undefined,
      isVisible: () => true,
      isActive: () => true,
      onStatus: (status) => statuses.push(status),
    });

    await controller.request();
    expect(statuses).toEqual(["unsupported"]);
  });

  it("acquires once, observes browser release, and can reacquire", async () => {
    const first = sentinel();
    const second = sentinel();
    const request = vi.fn()
      .mockResolvedValueOnce(first.value)
      .mockResolvedValueOnce(second.value);
    const statuses: WakeLockStatus[] = [];
    const controller = createWakeLockController({
      getWakeLock: () => ({ request }),
      isVisible: () => true,
      isActive: () => true,
      onStatus: (status) => statuses.push(status),
    });

    await controller.request();
    expect(request).toHaveBeenCalledOnce();
    expect(statuses.at(-1)).toBe("active");
    first.listeners[0]();
    expect(statuses.at(-1)).toBe("idle");
    await controller.request();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("releases a delayed acquisition when visibility changes during the request", async () => {
    let resolveRequest!: (value: ScreenWakeLockSentinelLike) => void;
    const delayed = new Promise<ScreenWakeLockSentinelLike>((resolve) => {
      resolveRequest = resolve;
    });
    const acquired = sentinel();
    let visible = true;
    const statuses: WakeLockStatus[] = [];
    const controller = createWakeLockController({
      getWakeLock: () => ({ request: () => delayed }),
      isVisible: () => visible,
      isActive: () => true,
      onStatus: (status) => statuses.push(status),
    });

    const requestPromise = controller.request();
    visible = false;
    await controller.release();
    resolveRequest(acquired.value);
    await requestPromise;

    expect(acquired.value.release).toHaveBeenCalledOnce();
    expect(statuses).not.toContain("active");
  });

  it("releases the active lock on disposal without later status updates", async () => {
    const acquired = sentinel();
    const statuses: WakeLockStatus[] = [];
    const controller = createWakeLockController({
      getWakeLock: () => ({ request: vi.fn().mockResolvedValue(acquired.value) }),
      isVisible: () => true,
      isActive: () => true,
      onStatus: (status) => statuses.push(status),
    });

    await controller.request();
    await controller.dispose();
    acquired.listeners[0]();
    expect(acquired.value.release).toHaveBeenCalledOnce();
    expect(statuses).toEqual(["acquiring", "active"]);
  });
});
