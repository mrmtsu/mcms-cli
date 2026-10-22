import { describe, expect, it } from "vitest";
import { isSupportedNodeVersion } from "../../src/core/node-version.js";

describe("supported Node.js versions", () => {
  it.each([
    ["22.23.3", false],
    ["22.23.4", true],
    ["22.24.0", true],
    ["24.22.0", false],
    ["24.22.1", true],
    ["26.12.0", false],
    ["26.12.1", true],
    ["20.99.0", false],
    ["23.99.0", false],
    ["27.0.0", false],
    ["26.12.1-rc.1", false],
  ])("checks %s", (version, expected) => {
    expect(isSupportedNodeVersion(version)).toBe(expected);
  });
});
