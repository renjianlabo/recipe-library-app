"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AppIcon } from "@/components/AppIcon";
import { useAuth } from "@/contexts/AuthProvider";

const navItems = [
  { href: "/", label: "ホーム", icon: "home" },
  { href: "/recipes", label: "レシピ", icon: "book" },
  { href: "/create", label: "作成", icon: "plus" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const focused = !["/", "/recipes", "/add", "/create"].includes(pathname);
  const cooking = pathname.startsWith("/cook/");

  return (
    <div className="app-stage">
      <div className={cooking ? "app-shell cooking-shell" : "app-shell"}>
        {children}
        {user && !focused ? (
          <nav className="bottom-nav" aria-label="メインナビゲーション">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                  <span className={item.href === "/create" ? "create-icon" : ""}>
                    <AppIcon name={item.icon} size={item.href === "/create" ? 23 : 21} />
                  </span>
                  <small>{item.label}</small>
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
