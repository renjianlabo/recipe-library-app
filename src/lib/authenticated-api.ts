import type { User } from "firebase/auth";

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    recoverable?: boolean;
  };
};

export class AuthenticatedApiError extends Error {
  readonly code: string;
  readonly recoverable: boolean;
  readonly status: number;

  constructor(message: string, options: { code?: string; recoverable?: boolean; status: number }) {
    super(message);
    this.name = "AuthenticatedApiError";
    this.code = options.code ?? "UNKNOWN";
    this.recoverable = options.recoverable ?? options.status >= 500;
    this.status = options.status;
  }
}

function fallbackHttpError(status: number): { code: string; message: string; recoverable: boolean } {
  if (status === 413) {
    return {
      code: "REQUEST_TOO_LARGE",
      message: "送信サイズが上限を超えました。スクリーンショットの枚数を減らすか、画像を小さくしてください。入力内容は保持されています。",
      recoverable: true,
    };
  }
  if (status === 504) {
    return {
      code: "PLATFORM_TIMEOUT",
      message: "AI処理がサーバーの実行時間内に完了しませんでした。入力内容は保持されています。もう一度試すか、手動で編集を続けてください。",
      recoverable: true,
    };
  }
  return {
    code: "HTTP_ERROR",
    message: "サーバーで処理を完了できませんでした。入力内容は保持されています。時間をおいてもう一度お試しください。",
    recoverable: status >= 500,
  };
}

export async function authenticatedJson<T>(
  user: Pick<User, "getIdToken">,
  path: string,
  init: Omit<RequestInit, "body" | "headers"> & { body?: unknown } = {},
): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, {
    ...init,
    method: init.method ?? "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = await response.json().catch(() => null) as (T & ApiErrorPayload) | null;
  if (!response.ok) {
    const fallback = fallbackHttpError(response.status);
    throw new AuthenticatedApiError(
      payload?.error?.message ?? fallback.message,
      {
        code: payload?.error?.code ?? fallback.code,
        recoverable: payload?.error?.recoverable ?? fallback.recoverable,
        status: response.status,
      },
    );
  }
  if (payload === null) {
    throw new AuthenticatedApiError("サーバーから正しい応答を受け取れませんでした。", {
      code: "INVALID_RESPONSE",
      recoverable: true,
      status: response.status,
    });
  }
  return payload;
}
