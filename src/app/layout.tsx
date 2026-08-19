import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { AppShell } from "@/components/AppShell";
import { PwaRegister } from "@/components/PwaRegister";
import { AuthProvider } from "@/contexts/AuthProvider";
import { E2eAppProviders } from "@/e2e/E2eAppProviders";
import { RecipeProvider } from "@/contexts/RecipeProvider";
import { PantryProvider } from "@/contexts/PantryProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "My Recipe Note",
    template: "%s | My Recipe Note",
  },
  applicationName: "My Recipe Note",
  description: "見つけたレシピを保存し、料理中に一工程ずつ確認できる個人用レシピ帳",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "My Recipe Note",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fffefa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const useE2eProviders = process.env.NODE_ENV === "development"
    && process.env.NEXT_PUBLIC_E2E_MODE === "1";
  const content = (
    <Suspense fallback={<main className="center-screen">読み込み中です</main>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );

  return (
    <html lang="ja">
      <body>
        <PwaRegister />
        {useE2eProviders ? (
          <E2eAppProviders>{content}</E2eAppProviders>
        ) : (
          <AuthProvider>
            <RecipeProvider><PantryProvider>{content}</PantryProvider></RecipeProvider>
          </AuthProvider>
        )}
      </body>
    </html>
  );
}
