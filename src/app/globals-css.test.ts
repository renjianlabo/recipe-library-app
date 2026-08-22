import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

describe("mobile form control typography", () => {
  it("guarantees a 16px font for focusable form controls on mobile", () => {
    expect(css).toMatch(
      /@media \(max-width: 767px\)\s*\{\s*input,\s*select,\s*textarea,\s*\[contenteditable="true"\]\s*\{\s*font-size: 16px !important;\s*\}\s*\}\s*$/u,
    );
  });

  it("does not disable user-controlled page zoom", () => {
    expect(layout).not.toMatch(/maximumScale|userScalable/u);
    expect(css).not.toMatch(/maximum-scale|user-scalable|\bzoom\s*:/u);
  });
});

describe("recipe editor save bar", () => {
  it("fixes the shared save bar above the safe area within the app width", () => {
    expect(css).toMatch(/\.manual-save\s*\{[^}]*position:\s*fixed;/u);
    expect(css).toMatch(/\.manual-save\s*\{[^}]*bottom:[^;]*100dvh\s*-\s*874px/u);
    expect(css).toMatch(/\.manual-save\s*\{[^}]*100vw\s*-\s*402px/u);
    expect(css).toMatch(/\.manual-save\s*\{[^}]*env\(safe-area-inset-bottom\)/u);
  });

  it("reserves scroll space for the final editor fields", () => {
    expect(css).toMatch(
      /\.page-container\.editor-page\.manual-content\s*\{[^}]*padding:[^;]*124px[^;]*safe-area-inset-bottom[^;]*;[^}]*scroll-padding-bottom:[^;]*104px[^;]*safe-area-inset-bottom/u,
    );
  });
});
