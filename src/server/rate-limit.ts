import { ApiError } from "./api-error";

type RateEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
};

export type RateLimiter = (key: string) => void;

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const entries = new Map<string, RateEntry>();
  const now = options.now ?? Date.now;
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));

  return (key: string) => {
    const currentTime = now();
    if (entries.size > 5_000) {
      for (const [entryKey, entry] of entries) {
        if (entry.resetAt <= currentTime) entries.delete(entryKey);
      }
    }

    const existing = entries.get(key);
    if (!existing || existing.resetAt <= currentTime) {
      entries.set(key, { count: 1, resetAt: currentTime + windowMs });
      return;
    }

    if (existing.count >= limit) {
      throw new ApiError(
        "RATE_LIMITED",
        "短時間に多くの処理が行われました。少し待ってからもう一度お試しください。",
        429,
        true,
      );
    }
    existing.count += 1;
  };
}

export function environmentRateLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

