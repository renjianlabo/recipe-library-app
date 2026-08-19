export interface ScreenWakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void, options?: AddEventListenerOptions): void;
}

export interface ScreenWakeLockLike {
  request(type: "screen"): Promise<ScreenWakeLockSentinelLike>;
}

export type WakeLockStatus = "idle" | "acquiring" | "active" | "unsupported" | "failed";

export interface WakeLockController {
  request(): Promise<void>;
  release(): Promise<void>;
  dispose(): Promise<void>;
}

export function createWakeLockController(options: {
  getWakeLock: () => ScreenWakeLockLike | undefined;
  isVisible: () => boolean;
  isActive: () => boolean;
  onStatus: (status: WakeLockStatus) => void;
}): WakeLockController {
  let generation = 0;
  let disposed = false;
  let sentinel: ScreenWakeLockSentinelLike | null = null;

  const release = async () => {
    generation += 1;
    const current = sentinel;
    sentinel = null;
    if (!disposed) options.onStatus("idle");
    try {
      if (current && !current.released) await current.release();
    } catch {
      // Releasing Wake Lock is best effort.
    }
  };

  const request = async () => {
    if (disposed || !options.isActive() || !options.isVisible()) return;
    const wakeLock = options.getWakeLock();
    if (!wakeLock?.request) {
      options.onStatus("unsupported");
      return;
    }
    if (sentinel && !sentinel.released) {
      options.onStatus("active");
      return;
    }

    const requestedGeneration = ++generation;
    options.onStatus("acquiring");
    try {
      const acquired = await wakeLock.request("screen");
      if (
        disposed ||
        requestedGeneration !== generation ||
        !options.isActive() ||
        !options.isVisible()
      ) {
        await acquired.release().catch(() => undefined);
        return;
      }

      sentinel = acquired;
      options.onStatus("active");
      acquired.addEventListener("release", () => {
        if (sentinel !== acquired) return;
        sentinel = null;
        if (!disposed) options.onStatus("idle");
      }, { once: true });
    } catch {
      if (!disposed && requestedGeneration === generation) options.onStatus("failed");
    }
  };

  return {
    request,
    release,
    async dispose() {
      disposed = true;
      await release();
    },
  };
}
