export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    recoverable: boolean;
  };
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly recoverable: boolean;

  constructor(code: string, message: string, status: number, recoverable = true) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.recoverable = recoverable;
  }
}

function safeErrorCode(error: unknown): string | undefined {
  const value = (error as { code?: unknown } | null)?.code;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).slice(0, 120);
  return /^[A-Za-z0-9_./:-]+$/.test(normalized) ? normalized : undefined;
}

/** Logs diagnostics without serializing error messages, request bodies, tokens, or AI inputs. */
export function logServerError(error: unknown, location: string): void {
  const knownError = error instanceof Error ? error : null;
  const stack = knownError?.stack
    ?.split(/\r?\n/u)
    .slice(1, 9)
    .join("\n");
  console.error("[recipe-library-server-error]", {
    location,
    name: knownError?.name ?? "UnknownError",
    code: safeErrorCode(error),
    stack,
  });
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  return new ApiError(
    "INTERNAL_ERROR",
    "処理中に予期しないエラーが発生しました。入力内容は保持されています。",
    500,
    true,
  );
}

export function errorResponse(error: unknown, location = "api-handler"): Response {
  if (!(error instanceof ApiError)) {
    logServerError(error, location);
  }
  const apiError = toApiError(error);
  const body: ApiErrorBody = {
    error: {
      code: apiError.code,
      message: apiError.message,
      recoverable: apiError.recoverable,
    },
  };

  return Response.json(body, {
    status: apiError.status,
    headers: { "Cache-Control": "no-store" },
  });
}
