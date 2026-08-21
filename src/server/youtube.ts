import { z } from "zod";

import { ApiError } from "./api-error";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const youtubeResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    snippet: z.object({
      title: z.string(),
      description: z.string().optional(),
      channelTitle: z.string().optional(),
    }),
  })),
});

export type YouTubeVideoReference = {
  videoId: string;
  url: string;
};

export type YouTubeSnippet = {
  title: string;
  description: string;
  channelTitle: string;
  warnings: string[];
};

export function extractYouTubeVideoId(rawUrl: string): YouTubeVideoReference {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ApiError("YOUTUBE_INVALID_URL", "YouTube URLが正しくありません。", 400, true);
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || !YOUTUBE_HOSTS.has(hostname) || url.username || url.password) {
    throw new ApiError("YOUTUBE_INVALID_URL", "YouTube URLが正しくありません。", 400, true);
  }

  let candidate = "";
  if (hostname === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
  } else if (url.pathname === "/watch") {
    candidate = url.searchParams.get("v") ?? "";
  } else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (["shorts", "embed", "live"].includes(parts[0] ?? "")) {
      candidate = parts[1] ?? "";
    }
  }

  if (!VIDEO_ID_PATTERN.test(candidate)) {
    throw new ApiError("YOUTUBE_INVALID_URL", "YouTube動画IDを確認できませんでした。", 400, true);
  }

  return {
    videoId: candidate,
    url: rawUrl.trim(),
  };
}

export type YouTubeSnippetFetcher = (videoId: string) => Promise<YouTubeSnippet>;

export function createYouTubeSnippetFetcher(options: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): YouTubeSnippetFetcher {
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (videoId: string) => {
    const apiKey = options.apiKey ?? process.env.YOUTUBE_DATA_API_KEY;
    if (!apiKey) {
      throw new ApiError(
        "YOUTUBE_NOT_CONFIGURED",
        "YouTube情報取得機能が設定されていません。",
        503,
        false,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
    let response: Response;
    try {
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
      endpoint.searchParams.set("part", "snippet");
      endpoint.searchParams.set("id", videoId);
      endpoint.searchParams.set("fields", "items(id,snippet(title,description,channelTitle))");
      endpoint.searchParams.set("key", apiKey);
      response = await fetchImpl(endpoint, { signal: controller.signal });
    } catch {
      throw new ApiError(
        "YOUTUBE_FETCH_FAILED",
        "YouTube動画の情報を取得できませんでした。",
        502,
        true,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ApiError(
        "YOUTUBE_FETCH_FAILED",
        "YouTube動画の情報を取得できませんでした。",
        502,
        true,
      );
    }

    let parsed: z.infer<typeof youtubeResponseSchema>;
    try {
      parsed = youtubeResponseSchema.parse(await response.json());
    } catch {
      throw new ApiError(
        "YOUTUBE_FETCH_FAILED",
        "YouTube動画の情報を取得できませんでした。",
        502,
        true,
      );
    }

    const item = parsed.items.find((entry) => entry.id === videoId);
    if (!item) {
      throw new ApiError(
        "YOUTUBE_VIDEO_NOT_FOUND",
        "YouTube動画の情報を取得できませんでした。",
        404,
        true,
      );
    }

    const description = item.snippet.description?.trim() ?? "";
    return {
      title: item.snippet.title.trim(),
      description,
      channelTitle: item.snippet.channelTitle?.trim() ?? "",
      warnings: description
        ? []
        : ["YouTubeの概要欄は空でした。概要欄を使用せず、動画から確認できた内容だけを候補にしています。"],
    };
  };
}
