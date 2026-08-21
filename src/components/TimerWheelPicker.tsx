"use client";

import { useEffect, useId, useRef } from "react";

import { TIMER_MINUTE_OPTIONS, TIMER_SECOND_OPTIONS } from "@/domain/timers";
import styles from "./TimerWheelPicker.module.css";

const ITEM_HEIGHT = 40;

function Wheel({
  label,
  suffix,
  options,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  options: readonly number[];
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const selectedIndex = Math.max(0, options.indexOf(value));

  useEffect(() => {
    const element = scrollRef.current;
    if (element && Math.abs(element.scrollTop - selectedIndex * ITEM_HEIGHT) > 1) {
      element.scrollTop = selectedIndex * ITEM_HEIGHT;
    }
  }, [selectedIndex]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const selectIndex = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), options.length - 1);
    const next = options[nextIndex];
    if (next !== value) onChange(next);
  };

  return (
    <div className={styles.wheelField}>
      <div className={styles.wheel}>
        <div className={styles.selection} aria-hidden="true" />
        <div
          className={styles.options}
          ref={scrollRef}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-${value}`}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              selectIndex(selectedIndex + (event.key === "ArrowUp" ? -1 : 1));
            }
          }}
          onScroll={(event) => {
            const scrollTop = event.currentTarget.scrollTop;
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
            frameRef.current = requestAnimationFrame(() => {
              frameRef.current = null;
              selectIndex(Math.round(scrollTop / ITEM_HEIGHT));
            });
          }}
        >
          {options.map((option) => (
            <button
              className={`${styles.option} ${option === value ? styles.optionSelected : ""}`}
              id={`${id}-${option}`}
              type="button"
              role="option"
              aria-selected={option === value}
              key={option}
              onClick={() => selectIndex(options.indexOf(option))}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <span className={styles.suffix}>{suffix}</span>
    </div>
  );
}

export function TimerSetupFields({
  label,
  minutes,
  seconds,
  onLabelChange,
  blurLabelOnEnter = false,
  onMinutesChange,
  onSecondsChange,
}: {
  label: string;
  minutes: number;
  seconds: number;
  onLabelChange: (value: string) => void;
  blurLabelOnEnter?: boolean;
  onMinutesChange: (value: number) => void;
  onSecondsChange: (value: number) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>タイマー名</span>
        <input
          className={styles.nameInput}
          value={label}
          maxLength={100}
          placeholder="例：煮込み"
          enterKeyHint={blurLabelOnEnter ? "done" : undefined}
          onChange={(event) => onLabelChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing || !blurLabelOnEnter) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.blur();
          }}
        />
      </label>
      <div className={styles.timeRow}>
        <Wheel label="分" suffix="分" options={TIMER_MINUTE_OPTIONS} value={minutes} onChange={onMinutesChange} />
        <Wheel label="秒" suffix="秒" options={TIMER_SECOND_OPTIONS} value={seconds} onChange={onSecondsChange} />
      </div>
    </div>
  );
}
