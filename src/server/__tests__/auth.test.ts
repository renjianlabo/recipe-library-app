import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api-error";
import {
  authenticateRequest,
  bearerToken,
  isFirebaseAdminConfigurationError,
  parseAllowedEmails,
} from "../auth";

describe("server authentication", () => {
  it("requires an exact Bearer token", () => {
    expect(() => bearerToken(new Request("https://example.test/api"))).toThrowError(ApiError);
    expect(bearerToken(new Request("https://example.test/api", {
      headers: { authorization: "Bearer token-123" },
    }))).toBe("token-123");
  });

  it("normalizes ALLOWED_EMAILS and accepts an allowed verified token", async () => {
    expect([...parseAllowedEmails(" A@EXAMPLE.COM, b@example.com ,, ")])
      .toEqual(["a@example.com", "b@example.com"]);
    const verifyToken = vi.fn(async () => ({ uid: "user-1", email: "A@example.com" }));
    const result = await authenticateRequest(new Request("https://example.test/api", {
      headers: { authorization: "Bearer good-token" },
    }), { verifyToken, allowedEmails: "a@example.com" });

    expect(result).toEqual({ uid: "user-1", email: "a@example.com" });
    expect(verifyToken).toHaveBeenCalledWith("good-token");
  });

  it("does not leak verifier errors and rejects non-allowed email", async () => {
    const request = new Request("https://example.test/api", {
      headers: { authorization: "Bearer token" },
    });
    await expect(authenticateRequest(request, {
      verifyToken: async () => { throw new Error("secret verifier detail"); },
    })).rejects.toMatchObject({ code: "AUTH_INVALID", status: 401 });

    await expect(authenticateRequest(request, {
      verifyToken: async () => ({ uid: "user-1", email: "other@example.com" }),
      allowedEmails: "allowed@example.com",
    })).rejects.toMatchObject({ code: "EMAIL_NOT_ALLOWED", status: 403 });
  });

  it("rejects an invalid Firebase ID token as 401", async () => {
    const verifyIdToken = vi.fn(async () => {
      throw Object.assign(new Error("Firebase ID token is invalid"), {
        code: "auth/argument-error",
      });
    });
    const request = new Request("https://example.test/api", {
      headers: { authorization: "Bearer invalid-id-token" },
    });

    await expect(authenticateRequest(request, {
      adminAuthFactory: () => ({ verifyIdToken }),
    })).rejects.toMatchObject({ code: "AUTH_INVALID", status: 401 });
    expect(verifyIdToken).toHaveBeenCalledWith("invalid-id-token");
  });

  it("separates Firebase Admin configuration failures from invalid user tokens", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new Request("https://example.test/api", {
      headers: { authorization: "Bearer user-id-token" },
    });
    const configurationFailure = Object.assign(
      new Error("Could not load the default credentials: secret-value"),
      { code: "app/invalid-credential" },
    );

    expect(isFirebaseAdminConfigurationError(configurationFailure)).toBe(true);
    await expect(authenticateRequest(request, {
      adminAuthFactory: () => { throw configurationFailure; },
    })).rejects.toMatchObject({
      code: "AUTH_CONFIGURATION_ERROR",
      status: 500,
      recoverable: false,
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[recipe-library-server-error]",
      expect.objectContaining({
        location: "auth.firebase-admin",
        name: "Error",
        code: "app/invalid-credential",
      }),
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secret-value");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("user-id-token");
  });
});
