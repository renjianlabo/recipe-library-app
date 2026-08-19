import type { DecodedIdToken } from "firebase-admin/auth";

import { ApiError, logServerError } from "./api-error";
import { getFirebaseAdminAuth } from "./firebase-admin";

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
};

export type TokenVerifier = (token: string) => Promise<Pick<DecodedIdToken, "uid" | "email">>;

export type AuthenticateRequestOptions = {
  verifyToken?: TokenVerifier;
  allowedEmails?: string | undefined;
  adminAuthFactory?: () => { verifyIdToken: TokenVerifier };
};

export function isFirebaseAdminConfigurationError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = String(candidate?.code ?? "").toLowerCase();
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : typeof candidate?.message === "string"
      ? candidate.message.toLowerCase()
      : "";
  return /(?:^|\/)(?:invalid-credential|invalid-app-options|no-app|app-deleted)$/u.test(code)
    || /default credentials|application default|service account|project[ -]?id|credential.*(?:missing|invalid)|initialize.*firebase/u.test(message);
}

function authConfigurationError(error: unknown): ApiError {
  logServerError(error, "auth.firebase-admin");
  return new ApiError(
    "AUTH_CONFIGURATION_ERROR",
    "認証サービスの設定を確認できませんでした。管理者へお問い合わせください。",
    500,
    false,
  );
}

export function parseAllowedEmails(value: string | undefined): Set<string> {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    throw new ApiError(
      "AUTH_REQUIRED",
      "ログインが必要です。もう一度ログインしてください。",
      401,
      true,
    );
  }
  return match[1];
}

export async function authenticateRequest(
  request: Request,
  options: AuthenticateRequestOptions = {},
): Promise<AuthenticatedUser> {
  const token = bearerToken(request);
  const usesFirebaseAdmin = !options.verifyToken;
  let verifyToken = options.verifyToken;
  if (!verifyToken) {
    try {
      const adminAuth = (options.adminAuthFactory ?? getFirebaseAdminAuth)();
      verifyToken = (value) => adminAuth.verifyIdToken(value);
    } catch (error) {
      throw authConfigurationError(error);
    }
  }

  let decoded: Pick<DecodedIdToken, "uid" | "email">;
  try {
    decoded = await verifyToken(token);
  } catch (error) {
    if (usesFirebaseAdmin && isFirebaseAdminConfigurationError(error)) {
      throw authConfigurationError(error);
    }
    throw new ApiError(
      "AUTH_INVALID",
      "ログイン情報を確認できませんでした。もう一度ログインしてください。",
      401,
      true,
    );
  }

  const email = typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : null;
  const allowedEmails = parseAllowedEmails(options.allowedEmails ?? process.env.ALLOWED_EMAILS);
  if (allowedEmails.size > 0 && (!email || !allowedEmails.has(email))) {
    throw new ApiError(
      "EMAIL_NOT_ALLOWED",
      "このアカウントは利用を許可されていません。",
      403,
      false,
    );
  }

  return { uid: decoded.uid, email };
}
