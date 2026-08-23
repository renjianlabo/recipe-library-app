export const DEMO_DURATION_MS = 24 * 60 * 60 * 1_000;
export const DEMO_AI_LIMIT = 5;

export type DemoStatus = {
  active: true;
  createdAt: string;
  expiresAt: string;
  aiLimit: number;
  aiUsed: number;
  aiRemaining: number;
  newSession?: boolean;
} | {
  active: false;
};

export function demoRemainingLabel(expiresAt: string, now = Date.now()): string {
  const remaining = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return "期限切れ";
  if (remaining < 60 * 60 * 1_000) return "残り1時間未満";
  return `残り${Math.max(1, Math.ceil(remaining / (60 * 60 * 1_000)))}時間`;
}
