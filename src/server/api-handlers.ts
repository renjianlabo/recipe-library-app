import { z } from "zod";

import { ApiError, errorResponse } from "./api-error";
import { createAiRecipeService, type AiRecipeService } from "./ai-service";
import { extractRequestSchema } from "./ai-schema";
import { authenticateRequest, type AuthenticatedUser } from "./auth";
import {
  createFirestoreDemoSessionStore,
  requireDemoSession,
  type DemoSessionStore,
} from "./demo-session";
import { createRateLimiter, environmentRateLimit, type RateLimiter } from "./rate-limit";
import { extractYouTubeVideoId } from "./youtube";

type Authenticator = (request: Request) => Promise<AuthenticatedUser>;

export type AiAuthenticatedUser = AuthenticatedUser & {
  authKind?: "firebase" | "demo";
  demoSessionKey?: string;
};

type AiAuthenticator = (request: Request) => Promise<AiAuthenticatedUser>;

export const AI_REQUEST_MAX_BYTES = 4_000_000;

const aiRateLimiter = createRateLimiter({
  limit: environmentRateLimit("AI_RATE_LIMIT_PER_MINUTE", 10),
  windowMs: 60_000,
});

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiError(
      "REQUEST_TOO_LARGE",
      "送信データが大きすぎます。スクリーンショットの枚数を減らすか、画像を小さくしてください。",
      413,
      true,
    );
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new ApiError("REQUEST_INVALID", "送信内容を読み取れませんでした。", 400, true);
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ApiError(
      "REQUEST_TOO_LARGE",
      "送信データが大きすぎます。スクリーンショットの枚数を減らすか、画像を小さくしてください。",
      413,
      true,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("REQUEST_INVALID", "送信内容が正しいJSONではありません。", 400, true);
  }
}

function parsedOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError("REQUEST_INVALID", "入力内容を確認してください。", 400, true);
  }
  return result.data;
}

function validateBeforeQuota(input: z.infer<typeof extractRequestSchema>): void {
  if (input.type === "youtube") {
    extractYouTubeVideoId(input.url);
  }
  if (input.type === "website") {
    try {
      const url = new URL(input.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch {
      throw new ApiError("URL_INVALID", "URLを確認してください。", 400, true);
    }
  }
}

export function createAiAuthenticator(options: {
  authenticateFirebase?: Authenticator;
  demoStore?: DemoSessionStore;
  now?: () => number;
} = {}): AiAuthenticator {
  const authenticateFirebase = options.authenticateFirebase ?? authenticateRequest;
  return async (request) => {
    if (request.headers.get("authorization")?.trim()) {
      return { ...await authenticateFirebase(request), authKind: "firebase" };
    }
    const session = await requireDemoSession(request, { store: options.demoStore, now: options.now });
    return {
      uid: "demo-user",
      email: null,
      authKind: "demo",
      demoSessionKey: session.key,
    };
  };
}

export function createExtractHandler(options: {
  authenticate?: AiAuthenticator;
  rateLimit?: RateLimiter;
  service?: AiRecipeService;
  demoStore?: DemoSessionStore;
  now?: () => number;
} = {}) {
  const demoStore = options.demoStore;
  const authenticate = options.authenticate ?? createAiAuthenticator({ demoStore, now: options.now });
  const rateLimit = options.rateLimit ?? aiRateLimiter;
  const service = options.service ?? createAiRecipeService();
  return async (request: Request): Promise<Response> => {
    try {
      const user = await authenticate(request);
      const demoSessionKey = user.authKind === "demo" ? user.demoSessionKey : null;
      if (user.authKind === "demo" && !demoSessionKey) {
        throw new ApiError("AUTH_REQUIRED", "有効なデモセッションが必要です。", 401, true);
      }
      rateLimit(`ai:extract:${demoSessionKey ?? user.uid}`);
      const input = parsedOrThrow(extractRequestSchema, await readJson(request, AI_REQUEST_MAX_BYTES));
      validateBeforeQuota(input);
      if (demoSessionKey) {
        await (demoStore ?? createFirestoreDemoSessionStore()).consumeAi(demoSessionKey, (options.now ?? Date.now)());
      }
      return Response.json(await service.extract(input), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return errorResponse(error, "ai.extract");
    }
  };
}

export function createAiStatusHandler(options: { authenticate?: AiAuthenticator; demoStore?: DemoSessionStore } = {}) {
  const authenticate = options.authenticate ?? createAiAuthenticator({ demoStore: options.demoStore });
  return async (request: Request): Promise<Response> => {
    try {
      await authenticate(request);
      return Response.json({
        configured: Boolean(process.env.GEMINI_API_KEY),
        model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
        youtubeConfigured: Boolean(process.env.YOUTUBE_DATA_API_KEY),
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error, "ai.status");
    }
  };
}
