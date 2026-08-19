import { z } from "zod";

import { ApiError, errorResponse } from "./api-error";
import { createAiRecipeService, type AiRecipeService } from "./ai-service";
import { extractRequestSchema, reviseRequestSchema } from "./ai-schema";
import { authenticateRequest, type AuthenticatedUser } from "./auth";
import { createRateLimiter, environmentRateLimit, type RateLimiter } from "./rate-limit";

type Authenticator = (request: Request) => Promise<AuthenticatedUser>;

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

export function createExtractHandler(options: {
  authenticate?: Authenticator;
  rateLimit?: RateLimiter;
  service?: AiRecipeService;
} = {}) {
  const authenticate = options.authenticate ?? authenticateRequest;
  const rateLimit = options.rateLimit ?? aiRateLimiter;
  const service = options.service ?? createAiRecipeService();
  return async (request: Request): Promise<Response> => {
    try {
      const user = await authenticate(request);
      rateLimit(`ai:extract:${user.uid}`);
      const input = parsedOrThrow(extractRequestSchema, await readJson(request, AI_REQUEST_MAX_BYTES));
      return Response.json(await service.extract(input), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return errorResponse(error, "ai.extract");
    }
  };
}

export function createReviseHandler(options: {
  authenticate?: Authenticator;
  rateLimit?: RateLimiter;
  service?: AiRecipeService;
} = {}) {
  const authenticate = options.authenticate ?? authenticateRequest;
  const rateLimit = options.rateLimit ?? aiRateLimiter;
  const service = options.service ?? createAiRecipeService();
  return async (request: Request): Promise<Response> => {
    try {
      const user = await authenticate(request);
      rateLimit(`ai:revise:${user.uid}`);
      const input = parsedOrThrow(reviseRequestSchema, await readJson(request, AI_REQUEST_MAX_BYTES));
      return Response.json(await service.revise(input), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return errorResponse(error, "ai.revise");
    }
  };
}

export function createAiStatusHandler(options: { authenticate?: Authenticator } = {}) {
  const authenticate = options.authenticate ?? authenticateRequest;
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
