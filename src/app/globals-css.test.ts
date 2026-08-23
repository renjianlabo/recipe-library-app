import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
const loading = readFileSync(resolve(process.cwd(), "src/app/loading.tsx"), "utf8");

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
  it("floats the shared save bar above the safe area within the app width", () => {
    expect(css).toMatch(/\.manual-save\s*\{[^}]*position:\s*fixed;/u);
    expect(css).toMatch(/\.manual-save\s*\{[^}]*bottom:[^;]*100dvh\s*-\s*874px/u);
    expect(css).toMatch(/\.manual-save\s*\{[^}]*100vw\s*-\s*402px/u);
    expect(css).toMatch(/\.manual-save\s*\{[^}]*env\(safe-area-inset-bottom\)/u);
    expect(css).toMatch(/\.floating-action-bar\s*\{[^}]*border-radius:\s*22px;[^}]*box-shadow:/u);
  });

  it("reserves scroll space for the final editor fields", () => {
    expect(css).toMatch(
      /\.page-container\.editor-page\.manual-content\s*\{[^}]*padding:[^;]*124px[^;]*safe-area-inset-bottom[^;]*;[^}]*scroll-padding-bottom:[^;]*104px[^;]*safe-area-inset-bottom/u,
    );
  });
});

describe("floating primary actions", () => {
  it("keeps detail and review actions away from the viewport edges", () => {
    expect(css).toMatch(/\.detail-actions\s*\{[^}]*right:\s*16px;[^}]*bottom:[^;]*safe-area-inset-bottom[^}]*left:\s*16px/u);
    expect(css).toMatch(/\.review-fixed-actions\s*\{[^}]*right:\s*16px;[^}]*bottom:[^;]*safe-area-inset-bottom[^}]*left:\s*16px/u);
  });

  it("floats the AI create action and reserves scroll space", () => {
    expect(css).toMatch(/\.ai-create-actions\s*\{[^}]*position:\s*fixed;[^}]*100vw\s*-\s*402px[^}]*safe-area-inset-bottom/u);
    expect(css).toMatch(/\.ai-action-page\s*\{[^}]*padding-bottom:[^;]*132px[^;]*safe-area-inset-bottom[^}]*scroll-padding-bottom:/u);
  });

  it("avoids backdrop blur and multiple shadows on persistent floating surfaces", () => {
    expect(css).toMatch(/\.bottom-nav\s*\{[^}]*background:\s*rgb\(255 254 250 \/ 96%\);[^}]*box-shadow:\s*0 8px 22px[^;]*;[^}]*backdrop-filter:\s*none;/u);
    expect(css).toMatch(/\.floating-action-bar\s*\{[^}]*background:\s*rgb\(255 254 250 \/ 96%\);[^}]*box-shadow:\s*0 8px 22px[^;]*;[^}]*backdrop-filter:\s*none;/u);
  });
});

describe("route loading state", () => {
  it("keeps root loading content inside the app-sized page surface", () => {
    expect(layout).toContain('className="page-container route-loading"');
    expect(loading).toContain('className="page-container route-loading"');
    expect(css).toMatch(/\.route-loading\s*\{[^}]*height:\s*100dvh;[^}]*min-height:\s*100dvh;/u);
    expect(css).toMatch(/\.app-shell > \.route-loading\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*background:\s*var\(--paper\);/u);
  });
});
