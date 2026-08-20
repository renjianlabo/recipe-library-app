"use client";

import { useId, useState } from "react";

export const RECIPE_UNIT_OPTIONS = [
  ["", "単位なし"],
  ["g", "g"],
  ["kg", "kg"],
  ["ml", "ml"],
  ["L", "L"],
  ["個", "個"],
  ["本", "本"],
  ["枚", "枚"],
  ["玉", "玉"],
  ["束", "束"],
  ["袋", "袋"],
  ["缶", "缶"],
  ["パック", "パック"],
  ["大さじ", "大さじ"],
  ["小さじ", "小さじ"],
  ["カップ", "カップ"],
  ["合", "合"],
] as const;

const OTHER_UNIT_VALUE = "__other_unit__";
const PRESET_UNIT_VALUES = new Set<string>(RECIPE_UNIT_OPTIONS.map(([value]) => value));

function isPresetUnit(value: string): boolean {
  return value !== "" && PRESET_UNIT_VALUES.has(value);
}

export function UnitSelect({
  value,
  onChange,
  label = "単位",
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const id = useId();
  const [otherSelectedForEmptyValue, setOtherSelectedForEmptyValue] = useState(false);
  const selectedValue = value
    ? isPresetUnit(value) ? value : OTHER_UNIT_VALUE
    : otherSelectedForEmptyValue ? OTHER_UNIT_VALUE : "";

  return (
    <div className={compact ? "field unit-field unit-field--compact" : "field unit-field"}>
      <label className={compact ? "visually-hidden" : undefined} htmlFor={`${id}-select`}>{label}</label>
      <select
        id={`${id}-select`}
        value={selectedValue}
        onChange={(event) => {
          const next = event.target.value;
          if (next === OTHER_UNIT_VALUE) {
            setOtherSelectedForEmptyValue(true);
            if (isPresetUnit(value)) onChange("");
            return;
          }
          setOtherSelectedForEmptyValue(false);
          onChange(next);
        }}
      >
        {RECIPE_UNIT_OPTIONS.map(([optionValue, optionLabel]) => (
          <option key={optionLabel} value={optionValue}>{optionLabel}</option>
        ))}
        <option value={OTHER_UNIT_VALUE}>その他</option>
      </select>
      {selectedValue === OTHER_UNIT_VALUE ? (
        <>
          <label className="visually-hidden" htmlFor={`${id}-custom`}>その他の単位</label>
          <input
            id={`${id}-custom`}
            value={isPresetUnit(value) ? "" : value}
            maxLength={30}
            placeholder="任意の単位を入力"
            onChange={(event) => onChange(event.target.value)}
          />
        </>
      ) : null}
    </div>
  );
}
