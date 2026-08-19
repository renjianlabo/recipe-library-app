import { describe, expect, it } from "vitest";

import { assertSafePublicUrl, isPrivateOrReservedIp } from "../url-safety";
import { createYouTubeSnippetFetcher, extractYouTubeVideoId } from "../youtube";

describe("safe URL validation", () => {
  it("rejects localhost, literal private IPs, private DNS answers and unsupported schemes", async () => {
    await expect(assertSafePublicUrl("http://localhost/recipe"))
      .rejects.toMatchObject({ code: "URL_UNSAFE" });
    await expect(assertSafePublicUrl("http://169.254.169.254/latest/meta-data"))
      .rejects.toMatchObject({ code: "URL_UNSAFE" });
    await expect(assertSafePublicUrl("file:///etc/passwd"))
      .rejects.toMatchObject({ code: "URL_UNSAFE" });
    await expect(assertSafePublicUrl("https://recipe.example/item", {
      lookup: async () => ["10.0.0.8"],
    })).rejects.toMatchObject({ code: "URL_UNSAFE" });
    expect(isPrivateOrReservedIp("::1")).toBe(true);
  });

  it("accepts a public http(s) URL after DNS validation and removes fragments", async () => {
    const result = await assertSafePublicUrl("https://recipe.example/path#ingredients", {
      lookup: async () => ["93.184.216.34"],
    });
    expect(result.href).toBe("https://recipe.example/path");
  });
});

describe("YouTube integration", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=10",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
    "https://m.youtube.com/live/dQw4w9WgXcQ",
  ])("extracts a safe video id from %s", (url) => {
    expect(extractYouTubeVideoId(url)).toEqual({
      videoId: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("does not accept look-alike hosts or guessed IDs", () => {
    expect(() => extractYouTubeVideoId("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"))
      .toThrow();
    expect(() => extractYouTubeVideoId("https://youtube.com/watch?v=too-short"))
      .toThrow();
  });

  it("returns the real description and warns honestly when it is empty", async () => {
    const successFetch: typeof fetch = async () => new Response(JSON.stringify({
      items: [{ id: "dQw4w9WgXcQ", snippet: { description: "材料: 卵2個" } }],
    }), { status: 200 });
    const fetchDescription = createYouTubeSnippetFetcher({ apiKey: "test", fetchImpl: successFetch });
    await expect(fetchDescription("dQw4w9WgXcQ")).resolves.toEqual({
      description: "材料: 卵2個",
      warnings: [],
    });

    const emptyFetch: typeof fetch = async () => new Response(JSON.stringify({
      items: [{ id: "dQw4w9WgXcQ", snippet: { description: "  " } }],
    }), { status: 200 });
    const empty = await createYouTubeSnippetFetcher({ apiKey: "test", fetchImpl: emptyFetch })("dQw4w9WgXcQ");
    expect(empty.description).toBe("");
    expect(empty.warnings[0]).toContain("概要欄は空");
  });

  it("fails instead of fabricating a missing or failed video", async () => {
    const notFoundFetch: typeof fetch = async () => new Response(JSON.stringify({ items: [] }), { status: 200 });
    await expect(createYouTubeSnippetFetcher({ apiKey: "test", fetchImpl: notFoundFetch })("dQw4w9WgXcQ"))
      .rejects.toMatchObject({ code: "YOUTUBE_VIDEO_NOT_FOUND" });

    const failedFetch: typeof fetch = async () => new Response("quota", { status: 403 });
    await expect(createYouTubeSnippetFetcher({ apiKey: "test", fetchImpl: failedFetch })("dQw4w9WgXcQ"))
      .rejects.toMatchObject({ code: "YOUTUBE_FETCH_FAILED" });
  });
});
