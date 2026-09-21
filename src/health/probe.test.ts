import { describe, it, expect } from "vitest";
import probeData from "./probe.json";

describe("probe.json", () => {
  it("should have healthPath equal to /api/health", () => {
    expect(probeData.healthPath).toBe("/api/health");
  });

  it("should have probeField equal to status", () => {
    expect(probeData.probeField).toBe("status");
  });
});
