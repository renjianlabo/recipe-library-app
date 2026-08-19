"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/AuthGate";
import { usePantry } from "@/contexts/PantryProvider";
import { SEASONING_GROUPS } from "@/domain/seasonings";

function SettingsHeader({ title, href }: { title: string; href: string }) {
  return <header className="settings-header"><Link href={href} aria-label="戻る"><AppIcon name="back" size={21} /></Link><h1>{title}</h1></header>;
}

export function SeasoningsIndex() {
  const { selected, addCustom } = usePantry();
  const [query, setQuery] = useState("");
  const [customName, setCustomName] = useState("");
  const groups = useMemo(() => SEASONING_GROUPS.filter((group) => !query.trim() || `${group.name}${group.sample}${group.items.join("")}`.includes(query.trim())), [query]);
  return (
    <AuthGate><main className="settings-page"><SettingsHeader title="家にある調味料" href="/settings" /><p className="seasoning-intro">家にある調味料を登録すると、レシピ機能で利用できます。</p><label className="search seasoning-search"><AppIcon name="search" size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="調味料を検索" /></label><div className="seasoning-groups">{groups.map((group) => <Link className="seasoning-group" href={`/settings/seasonings/${group.id}`} key={group.id}><span><b>{group.name}</b><small>{group.sample}</small></span><span className="group-count">{group.items.filter((item) => selected.has(item)).length}個選択中 <AppIcon name="chevron" size={17} /></span></Link>)}</div><div className="custom-seasoning"><b>＋ 一覧にない調味料を追加</b><div><input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="調味料名" /><button type="button" onClick={() => { const name = customName.trim(); if (!name) return; void addCustom(name); setCustomName(""); }}>追加</button></div></div></main></AuthGate>
  );
}

export function SeasoningCategory({ categoryId }: { categoryId: string }) {
  const group = SEASONING_GROUPS.find((item) => item.id === categoryId) ?? SEASONING_GROUPS[0];
  const { selected, toggle } = usePantry();
  return (
    <AuthGate><main className="settings-page"><SettingsHeader title={group.name} href="/settings/seasonings" /><p className="seasoning-intro">家にあるものを選択してください。変更は自動で保存されます。</p><div className="seasoning-check-list">{group.items.map((item) => { const active = selected.has(item); return <button type="button" key={item} className={active ? "selected" : ""} aria-pressed={active} onClick={() => void toggle(item)}><span className="seasoning-check">{active ? <AppIcon name="check" size={15} /> : null}</span><b>{item}</b></button>; })}</div></main></AuthGate>
  );
}
