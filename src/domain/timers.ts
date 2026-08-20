export const TIMER_MINUTE_OPTIONS = Array.from({ length: 61 }, (_, index) => index);
export const TIMER_SECOND_OPTIONS = [0, 10, 20, 30, 40, 50] as const;

export function nextTimerLabel(labels: readonly string[]): string {
  const used = new Set<number>();
  labels.forEach((label) => {
    const match = label.trim().match(/^タイマー([1-9]\d*)$/);
    if (match) used.add(Number(match[1]));
  });
  let index = 1;
  while (used.has(index)) index += 1;
  return `タイマー${index}`;
}

export function timerDurationSeconds(minutes: number, seconds: number): number | null {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 60) return null;
  if (!TIMER_SECOND_OPTIONS.includes(seconds as (typeof TIMER_SECOND_OPTIONS)[number])) return null;
  const duration = minutes * 60 + seconds;
  return duration > 0 ? duration : null;
}

export function timerWheelParts(totalSeconds: number): { minutes: number; seconds: number } {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.round(totalSeconds) : 0;
  let minutes = Math.min(60, Math.floor(safe / 60));
  let seconds = Math.round((safe % 60) / 10) * 10;
  if (seconds === 60) {
    minutes = Math.min(60, minutes + 1);
    seconds = 0;
  }
  return { minutes, seconds };
}

export function formatTimerDurationJa(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  if (!minutes) return `${seconds}秒`;
  if (!seconds) return `${minutes}分`;
  return `${minutes}分${seconds}秒`;
}
