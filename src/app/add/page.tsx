import type { Metadata } from "next";

import { AddMethodPicker } from "@/features/import/AddMethodPicker";

export const metadata: Metadata = { title: "レシピを追加" };

export default function AddPage() {
  return <AddMethodPicker />;
}
