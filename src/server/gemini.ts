import { GoogleGenAI, type Interactions } from "@google/genai";

import { ApiError } from "./api-error";
import {
  aiModelOutputSchema,
  aiModelWireOutputSchema,
  geminiRecipeDraftJsonSchema,
  normalizeAiWireOutput,
  type AiModelOutput,
  type RecipeDraft,
} from "./ai-schema";

export type InteractionContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: string }
  | { type: "video"; uri: string };

export type InteractionResponse = {
  status: string;
  output_text?: string;
  steps?: Array<Record<string, unknown>>;
};

export type GeminiTransport = {
  create: (request: {
    model: string;
    input: InteractionContent[];
    system_instruction: string;
    response_format: {
      type: "text";
      mime_type: "application/json";
      schema: Record<string, unknown>;
    };
    tools?: Array<{ type: "url_context" }>;
    store: false;
  }, signal: AbortSignal) => Promise<InteractionResponse>;
};

export type GenerateRecipeRequest = {
  input: InteractionContent[];
  systemInstruction: string;
  source: RecipeDraft["source"];
  expectedUrlContext?: string;
  retryTransient?: boolean;
};

export type RecipeGenerator = {
  generate: (request: GenerateRecipeRequest) => Promise<AiModelOutput>;
};

export const DEFAULT_AI_TIMEOUT_MS = 45_000;
export const MAX_AI_TIMEOUT_MS = 120_000;
export const DEFAULT_AI_RETRY_DELAY_MS = 700;

type GeminiErrorCandidate = {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
};

function safeGeminiStatus(error: unknown): number | null {
  const candidate = error as GeminiErrorCandidate | null;
  const status = Number(candidate?.status ?? candidate?.statusCode);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function safeGeminiCode(error: unknown): string | null {
  const candidate = error as GeminiErrorCandidate | null;
  const directCode = candidate?.code;
  if (typeof directCode === "string" || typeof directCode === "number") {
    const normalized = String(directCode).toUpperCase();
    const allowedCodes = new Set([
      "RESOURCE_EXHAUSTED",
      "INVALID_ARGUMENT",
      "PERMISSION_DENIED",
      "UNAUTHENTICATED",
      "NOT_FOUND",
      "INTERNAL",
      "UNAVAILABLE",
      "DEADLINE_EXCEEDED",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "ABORT_ERR",
    ]);
    if (allowedCodes.has(normalized)) return normalized;
  }

  const message = typeof candidate?.message === "string" ? candidate.message : "";
  const knownCode = message.match(
    /\b(RESOURCE_EXHAUSTED|INVALID_ARGUMENT|PERMISSION_DENIED|UNAUTHENTICATED|NOT_FOUND|INTERNAL|UNAVAILABLE|DEADLINE_EXCEEDED|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/u,
  );
  return knownCode?.[1] ?? null;
}

function safeGeminiLogMessage(error: unknown, timedOut: boolean): string {
  const candidate = error as GeminiErrorCandidate | null;
  const status = safeGeminiStatus(error);
  const code = safeGeminiCode(error)?.toUpperCase() ?? "";
  const message = typeof candidate?.message === "string" ? candidate.message.toLowerCase() : "";

  if (timedOut || (error instanceof Error && error.name === "AbortError")) {
    return "Gemini API request timed out.";
  }
  if (status === 429 || code.includes("RESOURCE_EXHAUSTED") || /quota|rate.?limit/u.test(message)) {
    return "Gemini API quota or rate limit exceeded.";
  }
  if ([400, 401, 403].includes(status ?? 0)
    || /INVALID_ARGUMENT|PERMISSION_DENIED|UNAUTHENTICATED|NOT_FOUND/u.test(code)
    || /api.?key|permission|model.*not found/u.test(message)) {
    return "Gemini API configuration or permission error.";
  }
  if ((status ?? 0) >= 500 || /INTERNAL|UNAVAILABLE|DEADLINE_EXCEEDED/u.test(code)) {
    return "Gemini API server error.";
  }
  return "Gemini API request failed.";
}

/** Logs only allowlisted diagnostics; raw SDK messages can contain request data. */
export function logGeminiApiFailure(error: unknown, timedOut = false): void {
  console.error("[recipe-library-gemini-error]", {
    status: safeGeminiStatus(error),
    code: safeGeminiCode(error),
    message: safeGeminiLogMessage(error, timedOut),
  });
}

const MAX_LOGGED_SCHEMA_ISSUES = 50;

function safeSchemaIssueMessage(issue: { code: string; message: string }): string {
  if (issue.code === "unrecognized_keys") {
    return "認識されないフィールドが含まれています";
  }
  return issue.message.slice(0, 300);
}

function logInvalidJsonResponse(response: InteractionResponse): void {
  const outputTextPresent = typeof response.output_text === "string";
  console.error("[recipe-library-ai-invalid-response]", {
    phase: "json_parse",
    responseStatus: response.status,
    outputTextPresent,
    outputTextLength: outputTextPresent ? response.output_text?.length ?? 0 : 0,
  });
}

function logInvalidSchemaResponse(
  response: InteractionResponse,
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string; code: string }>,
): void {
  console.error("[recipe-library-ai-invalid-response]", {
    phase: "schema_validation",
    responseStatus: response.status,
    issueCount: issues.length,
    issuesTruncated: issues.length > MAX_LOGGED_SCHEMA_ISSUES,
    issues: issues.slice(0, MAX_LOGGED_SCHEMA_ISSUES).map((issue) => ({
      path: issue.path.map(String).join("."),
      message: safeSchemaIssueMessage(issue),
      code: issue.code,
    })),
  });
}

export function resolveAiTimeoutMs(value: unknown): number {
  const configured = Number(value);
  return Number.isFinite(configured) && configured >= 1_000
    ? Math.min(configured, MAX_AI_TIMEOUT_MS)
    : DEFAULT_AI_TIMEOUT_MS;
}

function sameFetchedUrl(actual: string, expected: string): boolean {
  try {
    const actualUrl = new URL(actual);
    const expectedUrl = new URL(expected);
    actualUrl.hash = "";
    expectedUrl.hash = "";
    return actualUrl.href === expectedUrl.href
      || (actualUrl.origin === expectedUrl.origin && actualUrl.pathname === expectedUrl.pathname);
  } catch {
    return false;
  }
}

export function assertSuccessfulUrlContext(response: InteractionResponse, expectedUrl: string): void {
  const results = (response.steps ?? [])
    .filter((step) => step.type === "url_context_result")
    .flatMap((step) => Array.isArray(step.result) ? step.result : [])
    .filter((result): result is { status?: string; url?: string } => Boolean(result && typeof result === "object"));

  const matching = results.filter((result) => (
    typeof result.url === "string" && sameFetchedUrl(result.url, expectedUrl)
  ));
  if (matching.some((result) => result.status === "unsafe")) {
    throw new ApiError("URL_UNSAFE", "このURLは安全に読み込めません。", 400, false);
  }
  if (matching.length === 0 || !matching.some((result) => result.status === "success")) {
    throw new ApiError(
      "URL_CONTEXT_FAILED",
      "このサイトの内容を読み込めませんでした。文章をコピーするか、スクリーンショットを追加してください。",
      422,
      true,
    );
  }
}

function classifyGeminiError(error: unknown, timedOut: boolean): ApiError {
  if (error instanceof ApiError) return error;
  if (timedOut || (error instanceof Error && error.name === "AbortError")) {
    return new ApiError(
      "AI_TIMEOUT",
      "AI処理が時間内に完了しませんでした。入力内容は保持されています。もう一度お試しください。",
      504,
      true,
    );
  }

  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown };
  const status = Number(candidate?.status ?? candidate?.statusCode);
  const code = String(candidate?.code ?? "").toUpperCase();
  const message = String(candidate?.message ?? "").toLowerCase();
  if (status === 429 || code.includes("RESOURCE_EXHAUSTED") || /quota|rate.?limit/.test(message)) {
    return new ApiError(
      "AI_LIMIT_REACHED",
      "AIの利用上限に達しました。しばらく待つか、手動で編集を続けてください。",
      429,
      true,
    );
  }
  if ([400, 401, 403].includes(status) || /api.?key|permission|model.*not found/.test(message)) {
    return new ApiError(
      "AI_CONFIGURATION_ERROR",
      "AI機能の設定を確認できませんでした。手動で編集を続けてください。",
      503,
      false,
    );
  }
  return new ApiError(
    "AI_UNAVAILABLE",
    "AIとの通信に失敗しました。入力内容は保持されています。手動で編集するか、後でもう一度お試しください。",
    503,
    true,
  );
}

function isTransientGeminiError(error: unknown, timedOut: boolean): boolean {
  if (error instanceof ApiError) return false;

  const status = safeGeminiStatus(error);
  const code = safeGeminiCode(error);
  if (status === 429 || code === "RESOURCE_EXHAUSTED") return false;
  if ([400, 401, 403, 404].includes(status ?? 0)) return false;
  if (["INVALID_ARGUMENT", "PERMISSION_DENIED", "UNAUTHENTICATED", "NOT_FOUND"].includes(code ?? "")) {
    return false;
  }

  return timedOut
    || (error instanceof Error && error.name === "AbortError")
    || (status !== null && status >= 500 && status <= 599)
    || [
      "INTERNAL",
      "UNAVAILABLE",
      "DEADLINE_EXCEEDED",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
    ]
      .includes(code ?? "");
}

function logGeminiRetry(error: unknown): void {
  console.error("[recipe-library-gemini-retry]", {
    phase: "gemini_transient_retry",
    attempt: 2,
    status: safeGeminiStatus(error),
    code: safeGeminiCode(error),
  });
}

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function createGoogleTransport(apiKey: string): GeminiTransport {
  const client = new GoogleGenAI({ apiKey });
  return {
    async create(request, signal) {
      const interaction = await client.interactions.create(
        request as Interactions.CreateModelInteractionParamsNonStreaming,
        { signal },
      );
      return interaction as unknown as InteractionResponse;
    },
  };
}

export function createGeminiRecipeGenerator(options: {
  transport?: GeminiTransport;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
} = {}): RecipeGenerator {
  const model = options.model ?? process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const timeoutMs = options.timeoutMs ?? resolveAiTimeoutMs(process.env.AI_TIMEOUT_MS);
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_AI_RETRY_DELAY_MS;

  return {
    async generate(request) {
      const apiKey = options.transport ? undefined : options.apiKey ?? process.env.GEMINI_API_KEY;
      if (!options.transport && !apiKey) {
        throw new ApiError(
          "AI_NOT_CONFIGURED",
          "AI機能が設定されていません。手動でレシピを作成できます。",
          503,
          false,
        );
      }
      const transport = options.transport ?? createGoogleTransport(apiKey as string);
      let response: InteractionResponse;
      for (let attempt = 1; ; attempt += 1) {
        const controller = new AbortController();
        let timedOut = false;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new Error("Gemini interaction timed out"));
          }, timeoutMs);
        });

        try {
          response = await Promise.race([
            transport.create({
              model,
              input: request.input,
              system_instruction: request.systemInstruction,
              response_format: {
                type: "text",
                mime_type: "application/json",
                schema: geminiRecipeDraftJsonSchema,
              },
              ...(request.expectedUrlContext ? { tools: [{ type: "url_context" as const }] } : {}),
              store: false,
            }, controller.signal),
            timeoutPromise,
          ]);
          break;
        } catch (error) {
          logGeminiApiFailure(error, timedOut);
          const shouldRetry = request.retryTransient !== false
            && attempt === 1
            && isTransientGeminiError(error, timedOut);
          if (!shouldRetry) {
            throw classifyGeminiError(error, timedOut);
          }
          logGeminiRetry(error);
          await waitForRetry(retryDelayMs);
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
      }

      if (response.status === "budget_exceeded") {
        throw new ApiError(
          "AI_LIMIT_REACHED",
          "AIの利用上限に達しました。しばらく待つか、手動で編集を続けてください。",
          429,
          true,
        );
      }
      if (response.status !== "completed") {
        throw new ApiError(
          "AI_INCOMPLETE",
          "AI処理を完了できませんでした。入力内容は保持されています。",
          502,
          true,
        );
      }
      if (request.expectedUrlContext) {
        assertSuccessfulUrlContext(response, request.expectedUrlContext);
      }

      let json: unknown;
      try {
        json = JSON.parse(response.output_text ?? "");
      } catch {
        logInvalidJsonResponse(response);
        throw new ApiError(
          "AI_INVALID_RESPONSE",
          "AIの結果を安全なレシピ形式として確認できませんでした。入力内容は保持されています。",
          502,
          true,
        );
      }
      const wireParsed = aiModelWireOutputSchema.safeParse(json);
      if (!wireParsed.success) {
        logInvalidSchemaResponse(response, wireParsed.error.issues);
        throw new ApiError(
          "AI_INVALID_RESPONSE",
          "AIの結果を安全なレシピ形式として確認できませんでした。入力内容は保持されています。",
          502,
          true,
        );
      }
      const parsed = aiModelOutputSchema.safeParse(
        normalizeAiWireOutput(wireParsed.data, request.source),
      );
      if (!parsed.success) {
        logInvalidSchemaResponse(response, parsed.error.issues);
        throw new ApiError(
          "AI_INVALID_RESPONSE",
          "AIの結果を安全なレシピ形式として確認できませんでした。入力内容は保持されています。",
          502,
          true,
        );
      }
      return parsed.data;
    },
  };
}
