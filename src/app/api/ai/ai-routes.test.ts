import { describe, expect, it } from "vitest";

import { maxDuration as extractMaxDuration, runtime as extractRuntime } from "./extract/route";

describe("AI route deployment limits", () => {
  it("uses the Node.js runtime and explicitly requests the supported maximum duration", () => {
    expect(extractRuntime).toBe("nodejs");
    expect(extractMaxDuration).toBe(300);
  });
});
