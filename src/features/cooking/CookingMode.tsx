"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useRouter } from "next/navigation";

import { AppIcon } from "@/components/AppIcon";
import { formatScaledIngredientAmount } from "@/domain/amounts";
import type { Recipe } from "@/domain/recipe";
import {
  deleteCookingSession,
  loadCookingSession,
  saveCookingSession,
} from "@/lib/indexed-db";

import {
  SWIPE_EXCLUDED_SELECTOR,
  addCookingTimerSeconds,
  completeCookingSession,
  createCookingSession,
  createCookingTimer,
  deleteCookingSessionTimer,
  deriveStepIngredients,
  finishCookingTimer,
  getSwipeDirection,
  moveCookingStep,
  nextSwipeStepIndex,
  pauseCookingTimer,
  reconcileCookingTimers,
  remainingTimerSeconds,
  restoreCookingSession,
  resumeCookingTimer,
  updateCookingSessionTimer,
  type CookingSession,
  type CookingTimer,
  type SupportedServings,
  type SwipePoint,
} from "./cooking-core";
import {
  createWakeLockController,
  type ScreenWakeLockLike,
  type WakeLockStatus,
} from "./wake-lock";
import styles from "./cooking-mode.module.css";

interface SwipeGesture {
  identifier: number;
  start: SwipePoint;
}

interface RestoreCandidate {
  stored: CookingSession;
  fresh: CookingSession;
  sameRecipe: boolean;
}

export interface CookingModeProps {
  uid: string;
  recipe: Recipe;
  selectedServings?: SupportedServings;
  returnHref?: string;
}

const WAKE_LOCK_LABELS: Record<WakeLockStatus, string> = {
  idle: "料理モード",
  acquiring: "画面点灯を準備中",
  active: "画面を点灯したままにします",
  unsupported: "画面点灯の固定には対応していません",
  failed: "画面点灯を固定できませんでした",
};

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function timerStatusLabel(timer: CookingTimer): string {
  if (timer.status === "finished") return "終了";
  if (timer.status === "paused") return "一時停止中";
  return "進行中";
}

function touchByIdentifier(touches: React.TouchList, identifier: number): React.Touch | null {
  return Array.from(touches).find((touch) => touch.identifier === identifier) ?? null;
}

function isScrollableControl(target: Element, root: Element): boolean {
  let current: Element | null = target;
  while (current && current !== root) {
    const element = current as HTMLElement;
    const computed = window.getComputedStyle(element);
    const scrollsVertically = element.scrollHeight > element.clientHeight + 1 && /(auto|scroll)/.test(computed.overflowY);
    const scrollsHorizontally = element.scrollWidth > element.clientWidth + 1 && /(auto|scroll)/.test(computed.overflowX);
    if (scrollsVertically || scrollsHorizontally) return true;
    current = current.parentElement;
  }
  return false;
}

export function CookingMode({
  uid,
  recipe,
  selectedServings = recipe.servings,
  returnHref = `/recipes/${encodeURIComponent(recipe.id)}`,
}: CookingModeProps) {
  const router = useRouter();
  const [session, setSession] = useState<CookingSession | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<RestoreCandidate | null>(null);
  const [initializationError, setInitializationError] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [timerError, setTimerError] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [now, setNow] = useState(0);
  const [wakeLockStatus, setWakeLockStatus] = useState<WakeLockStatus>("idle");
  const [customLabel, setCustomLabel] = useState("");
  const [customMinutes, setCustomMinutes] = useState("5");
  const [customSeconds, setCustomSeconds] = useState("0");
  const [allMaterialsOpen, setAllMaterialsOpen] = useState(false);

  const sessionRef = useRef<CookingSession | null>(null);
  const latestRecipeRef = useRef(recipe);
  const latestSelectedServingsRef = useRef(selectedServings);
  const swipeGestureRef = useRef<SwipeGesture | null>(null);
  const stepScreenRef = useRef<HTMLElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const suppressPersistenceRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    latestRecipeRef.current = recipe;
    latestSelectedServingsRef.current = selectedServings;
  }, [recipe, selectedServings]);

  const commitSession = useCallback((next: CookingSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const queuePersistence = useCallback((next: CookingSession) => {
    if (suppressPersistenceRef.current) return;
    persistenceQueueRef.current = persistenceQueueRef.current
      .then(() => saveCookingSession(uid, next))
      .then(() => setStorageMessage(""))
      .catch(() => {
        if (mountedRef.current) setStorageMessage("途中状態を端末に保存できませんでした");
      });
  }, [uid]);

  useEffect(() => {
    mountedRef.current = true;
    suppressPersistenceRef.current = false;
    let cancelled = false;

    const fresh = () => createCookingSession({
      uid,
      recipe: latestRecipeRef.current,
      selectedServings: latestSelectedServingsRef.current,
    });
    void loadCookingSession<unknown>(uid)
      .then((storedValue) => {
        if (cancelled) return;
        const stored = restoreCookingSession(storedValue, uid);
        const next = fresh();
        if (!stored) {
          commitSession(next);
          return;
        }
        if (stored.status === "completed" && stored.recipeId === recipe.id) {
          commitSession(stored);
          return;
        }
        if (stored.status === "active") {
          setRestoreCandidate({ stored, fresh: next, sameRecipe: stored.recipeId === recipe.id });
          return;
        }
        commitSession(next);
      })
      .catch(() => {
        if (cancelled) return;
        try {
          commitSession(fresh());
          setStorageMessage("端末の途中状態を読み込めませんでした。料理は続けられます");
        } catch (error) {
          setInitializationError(error instanceof Error ? error.message : "料理モードを開始できませんでした");
        }
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [commitSession, recipe.id, uid]);

  useEffect(() => {
    if (session) queuePersistence(session);
  }, [queuePersistence, session]);

  const unlockAudio = useCallback(() => {
    const AudioContextConstructor = window.AudioContext;
    try {
      audioContextRef.current ??= new AudioContextConstructor();
      if (audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume().catch(() => undefined);
      }
    } catch {
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    document.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
    return () => document.removeEventListener("pointerdown", unlockAudio);
  }, [unlockAudio]);

  const announceTimer = useCallback((timer: CookingTimer) => {
    const message = `${timer.label}のタイマーが終了しました`;
    setLiveMessage("");
    window.setTimeout(() => {
      if (mountedRef.current) setLiveMessage(message);
    }, 0);

    const audioContext = audioContextRef.current;
    if (audioContext?.state === "running") {
      try {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        gain.gain.setValueAtTime(0.001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.22, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.55);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.6);
      } catch {
        // The live announcement still reports completion if audio is unavailable.
      }
    }
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // Vibration is optional.
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      const timestamp = Date.now();
      setNow(timestamp);
      const current = sessionRef.current;
      if (!current) return;
      const reconciled = reconcileCookingTimers(current, timestamp);
      if (!reconciled.newlyFinished.length) return;
      commitSession(reconciled.session);
      reconciled.newlyFinished.forEach(announceTimer);
    };
    tick();
    const handle = window.setInterval(tick, 1_000);
    const refresh = () => tick();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.clearInterval(handle);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [announceTimer, commitSession]);

  const sessionActive = session?.status === "active";
  useEffect(() => {
    const controller = createWakeLockController({
      getWakeLock: () => (navigator as unknown as { wakeLock?: ScreenWakeLockLike }).wakeLock,
      isVisible: () => document.visibilityState === "visible",
      isActive: () => sessionRef.current?.status === "active",
      onStatus: (status) => {
        if (mountedRef.current) setWakeLockStatus(status);
      },
    });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void controller.request();
      else void controller.release();
    };
    const handlePageShow = () => void controller.request();

    if (sessionActive) void controller.request();
    else void controller.release();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handlePageShow);
      void controller.dispose();
    };
  }, [sessionActive]);

  const currentStep = session?.recipe.steps[session.currentStepIndex] ?? null;
  const stepIngredients = useMemo(() => (
    session && currentStep
      ? deriveStepIngredients(session.recipe, currentStep, session.selectedServings)
      : []
  ), [currentStep, session]);

  const startTimer = useCallback((durationSeconds: number, label: string, sourceStepId: string | null) => {
    const current = sessionRef.current;
    if (!current) return;
    const timestamp = Date.now();
    const timer = createCookingTimer({ durationSeconds, label, sourceStepId }, timestamp);
    if (!timer) {
      setTimerError("タイマーは1秒から24時間までで設定してください");
      return;
    }
    setTimerError("");
    commitSession({ ...current, timers: [...current.timers, timer], updatedAt: timestamp });
  }, [commitSession]);

  const mutateTimer = useCallback((timerId: string, transform: (timer: CookingTimer) => CookingTimer | null) => {
    const current = sessionRef.current;
    if (!current) return;
    const next = updateCookingSessionTimer(current, timerId, transform, Date.now());
    if (next !== current) commitSession(next);
  }, [commitSession]);

  const addMinute = useCallback((timerId: string) => {
    let refused = false;
    mutateTimer(timerId, (timer) => {
      const next = addCookingTimerSeconds(timer, 60);
      refused = next === null;
      return next;
    });
    setTimerError(refused ? "24時間を超えて追加できません" : "");
  }, [mutateTimer]);

  const goToStep = useCallback((index: number) => {
    const current = sessionRef.current;
    if (!current || current.status !== "active") return;
    const next = moveCookingStep(current, index, Date.now());
    if (next !== current) {
      setAllMaterialsOpen(false);
      commitSession(next);
    }
  }, [commitSession]);

  const finishCooking = useCallback(() => {
    const current = sessionRef.current;
    if (current) commitSession(completeCookingSession(current, Date.now()));
  }, [commitSession]);

  const beginSwipe = (event: TouchEvent<HTMLElement>) => {
    swipeGestureRef.current = null;
    const current = sessionRef.current;
    const root = stepScreenRef.current;
    if (!current || current.status !== "active" || !root || event.touches.length !== 1) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest(SWIPE_EXCLUDED_SELECTOR) || isScrollableControl(target, root)) return;
    const touch = event.touches[0];
    swipeGestureRef.current = {
      identifier: touch.identifier,
      start: { x: touch.clientX, y: touch.clientY },
    };
  };

  const trackSwipe = (event: TouchEvent<HTMLElement>) => {
    const gesture = swipeGestureRef.current;
    if (!gesture) return;
    if (event.touches.length !== 1 || !touchByIdentifier(event.touches, gesture.identifier)) {
      swipeGestureRef.current = null;
    }
  };

  const finishSwipe = (event: TouchEvent<HTMLElement>) => {
    const gesture = swipeGestureRef.current;
    swipeGestureRef.current = null;
    const current = sessionRef.current;
    if (!gesture || event.touches.length !== 0 || !current || current.status !== "active") return;
    const touch = touchByIdentifier(event.changedTouches, gesture.identifier);
    if (!touch) return;
    const direction = getSwipeDirection(gesture.start, { x: touch.clientX, y: touch.clientY });
    const next = nextSwipeStepIndex(current.currentStepIndex, current.recipe.steps.length, direction);
    if (next !== current.currentStepIndex) goToStep(next);
  };

  const submitCustomTimer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minutes = Number(customMinutes);
    const seconds = Number(customSeconds);
    const duration = minutes * 60 + seconds;
    if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || minutes < 0 || seconds < 0 || seconds > 59) {
      setTimerError("分と秒を整数で入力してください");
      return;
    }
    startTimer(duration, customLabel.trim() || `工程 ${Number(sessionRef.current?.currentStepIndex ?? 0) + 1}`, currentStep?.id ?? null);
  };

  const leaveCooking = async (href: string, clear: boolean) => {
    if (clear) {
      suppressPersistenceRef.current = true;
      await persistenceQueueRef.current.catch(() => undefined);
      await deleteCookingSession(uid).catch(() => undefined);
    }
    router.push(href);
  };

  if (initializationError) {
    return (
      <main className={styles.statePage}>
        <section className={styles.stateCard} role="alert">
          <h1>料理モードを開始できませんでした</h1>
          <p>{initializationError}</p>
          <button type="button" onClick={() => router.push(returnHref)}>レシピへ戻る</button>
        </section>
      </main>
    );
  }

  if (restoreCandidate) {
    return (
      <main className={styles.statePage}>
        <section className={styles.stateCard}>
          <p className={styles.kicker}>料理の途中状態があります</p>
          <h1>{restoreCandidate.sameRecipe ? "続きから再開しますか？" : "別の料理が進行中です"}</h1>
          <p>
            {restoreCandidate.sameRecipe
              ? `${restoreCandidate.stored.recipe.title}の工程とタイマーを保存しています。`
              : `${restoreCandidate.stored.recipe.title}を続けるか、この料理を始めるか選んでください。`}
          </p>
          <div className={styles.choiceActions}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => {
                commitSession(restoreCandidate.stored);
                setRestoreCandidate(null);
              }}
            >
              {restoreCandidate.sameRecipe ? "続きから再開" : "前の料理を続ける"}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => {
                commitSession(restoreCandidate.fresh);
                setRestoreCandidate(null);
              }}
            >
              {restoreCandidate.sameRecipe ? "最初から始める" : "この料理を始める"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!session || !currentStep) {
    return (
      <main className={styles.statePage}>
        <section className={styles.stateCard} role="status">
          <p>料理モードを準備しています…</p>
        </section>
      </main>
    );
  }

  const activeReturnHref = session.recipeId === recipe.id
    ? returnHref
    : `/recipes/${encodeURIComponent(session.recipeId)}`;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          className={styles.iconButton}
          type="button"
          aria-label="料理モードを終了"
          onClick={() => {
            if (session.status === "completed" || window.confirm("料理モードを終了しますか？途中状態は端末に保存されます。")) {
              void leaveCooking(activeReturnHref, session.status === "completed");
            }
          }}
        >
          <AppIcon name="x" size={22} />
        </button>
        <div>
          <h1>料理モード</h1>
          <p role="status">工程 {session.currentStepIndex + 1} / {session.recipe.steps.length}</p>
        </div>
      </header>

      {storageMessage ? <p className={styles.storageWarning} role="status">{storageMessage}</p> : null}

      {session.timers.length ? (
        <section className={`${styles.timerShelf} cooking-timers`} data-swipe-ignore aria-labelledby="timer-heading">
          <h2 id="timer-heading">タイマー</h2>
          <div className={styles.timerGrid}>
            {session.timers.map((timer) => {
              const remaining = remainingTimerSeconds(timer, now || session.updatedAt);
              return (
                <article className={styles.timerCard} data-timer-id={timer.id} key={timer.id}>
                  <div>
                    <h3>{timer.label}</h3>
                    <p className={styles.timerClock} aria-label={`残り${formatClock(remaining)}`}>{formatClock(remaining)}</p>
                    <p>{timerStatusLabel(timer)}</p>
                  </div>
                  <div className={styles.timerActions}>
                    <button
                      type="button"
                      disabled={timer.status === "finished"}
                      onClick={() => mutateTimer(timer.id, (value) => (
                        value.status === "paused" ? resumeCookingTimer(value, Date.now()) : pauseCookingTimer(value, Date.now())
                      ))}
                    >
                      {timer.status === "paused" ? "再開" : "一時停止"}
                    </button>
                    <button type="button" disabled={timer.status === "finished"} onClick={() => addMinute(timer.id)}>+1分</button>
                    <button
                      type="button"
                      disabled={timer.status === "finished"}
                      onClick={() => mutateTimer(timer.id, (value) => finishCookingTimer(value, Date.now()))}
                    >
                      終了
                    </button>
                    <button
                      className={styles.dangerButton}
                      type="button"
                      onClick={() => commitSession(deleteCookingSessionTimer(sessionRef.current ?? session, timer.id, Date.now()))}
                    >
                      削除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {session.status === "completed" ? (
        <section className={styles.completion}>
          <p className={styles.completionMark} aria-hidden="true">✓</p>
          <p className={styles.kicker}>料理が完成しました</p>
          <h2>{session.recipe.title}</h2>
          <div className={styles.choiceActions}>
            <button className={styles.primaryButton} type="button" onClick={() => void leaveCooking(activeReturnHref, true)}>
              レシピへ戻る
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => void leaveCooking("/", true)}>
              料理を終了する
            </button>
          </div>
        </section>
      ) : (
        <>
          <section
            className={styles.stepScreen}
            ref={stepScreenRef}
            onTouchStart={beginSwipe}
            onTouchMove={trackSwipe}
            onTouchEnd={finishSwipe}
            onTouchCancel={() => { swipeGestureRef.current = null; }}
            aria-describedby="swipe-hint"
          >
            <p className={styles.visuallyHidden} id="swipe-hint">
              左へスワイプすると次の工程、右へスワイプすると前の工程へ移動します。
            </p>
            <article className={styles.stepCard}>
              <p className={styles.stepKicker}>STEP {session.currentStepIndex + 1}</p>
              <p className={styles.stepText}>{currentStep.text}</p>

              {stepIngredients.length ? (
                <section className={styles.ingredients} aria-labelledby="step-ingredients-heading">
                  <h2 id="step-ingredients-heading">この工程で使う材料</h2>
                  <ul>
                    {stepIngredients.map((ingredient) => (
                      <li key={`${currentStep.id}-${ingredient.ingredientId}-${ingredient.usage}`}>
                        <span>{ingredient.name}</span>
                        <strong>{ingredient.displayAmount}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <button className={styles.allMaterialsButton} type="button" onClick={() => setAllMaterialsOpen(true)}><AppIcon name="list" size={17} />全材料を見る <span>⌃</span></button>

              {currentStep.timers.length ? (
                <section className={styles.suggestions} data-swipe-ignore aria-labelledby="suggested-timers-heading">
                  <h2 id="suggested-timers-heading">おすすめタイマー</h2>
                  <div className={styles.suggestionGrid}>
                    {currentStep.timers.map((timer) => (
                      <button
                        type="button"
                        key={timer.id}
                        onClick={() => startTimer(timer.seconds, timer.label, currentStep.id)}
                      >
                        {timer.label} {formatClock(timer.seconds)} 開始
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <details className={`${styles.manualTimer} cooking-timer-form`} data-swipe-ignore>
                <summary>自由設定タイマー</summary>
                <div className={styles.quickTimers}>
                  {[1, 3, 5, 10].map((minutes) => (
                    <button
                      type="button"
                      key={minutes}
                      onClick={() => startTimer(minutes * 60, `工程 ${session.currentStepIndex + 1} ${minutes}分`, currentStep.id)}
                    >
                      {minutes}分
                    </button>
                  ))}
                </div>
                <form onSubmit={submitCustomTimer}>
                  <label>
                    <span>タイマー名</span>
                    <input value={customLabel} maxLength={80} onChange={(event) => setCustomLabel(event.target.value)} />
                  </label>
                  <div className={styles.timeFields}>
                    <label>
                      <span>分</span>
                      <input type="number" min="0" max="1440" step="1" inputMode="numeric" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} />
                    </label>
                    <label>
                      <span>秒</span>
                      <input type="number" min="0" max="59" step="1" inputMode="numeric" value={customSeconds} onChange={(event) => setCustomSeconds(event.target.value)} />
                    </label>
                  </div>
                  <button className={styles.secondaryButton} type="submit">タイマーを開始</button>
                </form>
              </details>
              {timerError ? <p className={styles.timerError} role="alert">{timerError}</p> : null}
            </article>
          </section>

          <footer className={styles.navigation}>
            <button type="button" disabled={session.currentStepIndex === 0} onClick={() => goToStep(session.currentStepIndex - 1)}>
              前へ
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => {
                if (session.currentStepIndex === session.recipe.steps.length - 1) finishCooking();
                else goToStep(session.currentStepIndex + 1);
              }}
            >
              {session.currentStepIndex === session.recipe.steps.length - 1 ? "完成" : "次へ"}
            </button>
          </footer>
        </>
      )}

      <div className={styles.visuallyHidden} role="status" aria-live="assertive" aria-atomic="true">
        {liveMessage}
      </div>
      <div className={styles.visuallyHidden} role="status">{WAKE_LOCK_LABELS[wakeLockStatus]}</div>
      {allMaterialsOpen ? (
        <div className={styles.materialsSheetLayer} role="dialog" aria-modal="true" aria-label="全材料">
          <button type="button" className={styles.materialsBackdrop} aria-label="全材料を閉じる" onClick={() => setAllMaterialsOpen(false)} />
          <section className={styles.materialsSheet}>
            <div className={styles.sheetHandle} />
            <header><h2>全材料</h2><button type="button" onClick={() => setAllMaterialsOpen(false)} aria-label="閉じる"><AppIcon name="x" size={19} /></button></header>
            <div className={styles.sheetMaterialList}>{session.recipe.ingredients.map((ingredient) => {
              const amount = formatScaledIngredientAmount(ingredient, session.recipe.servings, session.selectedServings);
              return <div key={ingredient.id}><span>{ingredient.name}</span><b>{amount.displayAmount}</b></div>;
            })}</div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
