import type { Metadata } from "next";

import { SettingsHome } from "@/features/settings/SettingsHome";

export const metadata: Metadata = {
  title: "設定",
};

export default function SettingsPage() {
  return <SettingsHome />;
}
