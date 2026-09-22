import { describe, expect, it } from "vitest";

import probeJson from "./probe.json";

describe("probe.json", () => {
  it("has healthPath equal to /api/health", () => {
    expect(probeJson.healthPath).toBe("/api/health");
  });

  it("has probeField equal to status", () => {
    expect(probeJson.probeField).toBe("status");
  });
});
