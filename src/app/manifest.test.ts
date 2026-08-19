import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("PWA assets", () => {
  it("defines an installable standalone Japanese manifest", () => {
    expect(manifest()).toMatchObject({
      name: "My Recipe Note",
      short_name: "レシピノート",
      lang: "ja",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    expect(manifest().icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/app-192.png", sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ src: "/icons/app-512.png", sizes: "512x512", purpose: "any" }),
        expect.objectContaining({ src: "/icons/app-maskable-512.png", purpose: "maskable" }),
      ]),
    );
  });

  it("versions shell caches and never intercepts API or Firestore requests", async () => {
    const source = await readFile(path.join(process.cwd(), "public", "sw.js"), "utf8");
    expect(source).toMatch(/recipe-library-shell-/);
    expect(source).toMatch(/searchParams\.get\("v"\)/);
    expect(source).not.toContain("recipe-library-shell-v1");
    expect(source).toMatch(/\/api\//);
    expect(source).toMatch(/firestore/);
    expect(source).toMatch(/url\.origin !== self\.location\.origin/);
    expect(source).toMatch(/request\.mode === "navigate"/);
    expect(source).toMatch(/caches\.match\("\/offline"\)/);
    expect(source).toMatch(/SKIP_WAITING/);
  });

  it("registers the service worker with the deployment identifier", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src", "components", "PwaRegister.tsx"),
      "utf8",
    );
    expect(source).toMatch(/dataset\.dplId/);
    expect(source).toMatch(/\/sw\.js\?v=/);
  });

  it.each([
    ["src/app/apple-icon.png", 180],
    ["src/app/icon.png", 512],
    ["public/icons/app-192.png", 192],
    ["public/icons/app-512.png", 512],
    ["public/icons/app-maskable-512.png", 512],
  ])("contains a valid %s PNG with the declared dimensions", async (filename, expectedSize) => {
    const iconPath = path.join(process.cwd(), ...filename.split("/"));
    const bytes = await readFile(iconPath);
    expect((await stat(iconPath)).size).toBeGreaterThan(100);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBe(expectedSize);
    expect(bytes.readUInt32BE(20)).toBe(expectedSize);
  });

  it("enables a production CSP without unsafe-eval and keeps development HMR separate", async () => {
    const source = await readFile(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(source).toContain("Content-Security-Policy");
    expect(source).toContain("process.env.NODE_ENV === \"production\"");
    expect(source).toContain("https://*.googleapis.com");
    expect(source).toContain("https://*.firebaseio.com");
    expect(source).not.toContain("unsafe-eval");
  });
});
