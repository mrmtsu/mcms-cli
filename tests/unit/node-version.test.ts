import { describe, expect, it } from "vitest";
import { isSupportedNodeVersion } from "../../src/core/node-version.js";

describe("supported Node.js versions", () => {
  it.each([
    ["22.23.4", false],
    ["22.23.5", true],
    ["22.24.0", true],
    ["24.22.2", false],
    ["24.22.3", true],
    ["26.13.0", false],
    ["26.13.1", true],
    ["20.99.0", false],
    ["23.99.0", false],
    ["27.0.0", false],
    ["26.13.1-rc.1", false],
  ])("checks %s", (version, expected) => {
    expect(isSupportedNodeVersion(version)).toBe(expected);
  });
});
