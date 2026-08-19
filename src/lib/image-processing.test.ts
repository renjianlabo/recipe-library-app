import { describe, expect, it } from "vitest";

import {
  calculateProcessedImageBudget,
  IMAGE_LIMITS,
  validateImageFiles,
} from "./image-processing";

function imageFile(name: string, size: number, type = "image/jpeg") {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateImageFiles", () => {
  it("対応画像形式を受け付ける", () => {
    expect(() => validateImageFiles([
      imageFile("a.jpg", 1, "image/jpeg"),
      imageFile("b.png", 1, "image/png"),
      imageFile("c.webp", 1, "image/webp"),
    ])).not.toThrow();
  });

  it("画像の未選択と形式違いを日本語で拒否する", () => {
    expect(() => validateImageFiles([])).toThrow("1枚以上");
    expect(() => validateImageFiles([imageFile("a.gif", 1, "image/gif")])).toThrow();
  });

  it("枚数と元画像合計サイズを上限で止める", () => {
    const tooMany = Array.from({ length: IMAGE_LIMITS.maxFiles + 1 }, (_, index) => imageFile(`${index}.jpg`, 1));
    expect(() => validateImageFiles(tooMany)).toThrow("6枚まで");
    expect(() => validateImageFiles([imageFile("large.jpg", IMAGE_LIMITS.maxRawBytes + 1)])).toThrow();
  });

  it("Base64化後も余裕を残す2MBを残り枚数へ安全に配分する", () => {
    expect(IMAGE_LIMITS.maxProcessedBytes).toBe(2 * 1024 * 1024);
    expect(calculateProcessedImageBudget(0, 6))
      .toBe(Math.floor(IMAGE_LIMITS.maxProcessedBytes / 6));
    const firstImageBytes = 100_000;
    expect(calculateProcessedImageBudget(firstImageBytes, 5))
      .toBe(Math.floor((IMAGE_LIMITS.maxProcessedBytes - firstImageBytes) / 5));
    expect(calculateProcessedImageBudget(IMAGE_LIMITS.maxProcessedBytes, 1)).toBe(0);
  });
});
