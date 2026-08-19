import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, errorResponse } from "../api-error";

describe("server API error logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs only safe diagnostics for unknown exceptions", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unknown = Object.assign(new Error("GEMINI_API_KEY=secret input recipe body"), {
      code: "SDK_FAILURE",
    });

    const response = errorResponse(unknown, "ai.extract");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "処理中に予期しないエラーが発生しました。入力内容は保持されています。",
        recoverable: true,
      },
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[recipe-library-server-error]",
      expect.objectContaining({ location: "ai.extract", name: "Error", code: "SDK_FAILURE" }),
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("GEMINI_API_KEY");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("recipe body");
  });

  it("does not log expected ApiError responses", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(new ApiError("REQUEST_INVALID", "入力を確認してください。", 400));
    expect(response.status).toBe(400);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
