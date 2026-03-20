import { describe, expect, it } from "vitest";
import { getCliSpec } from "../../src/core/spec.js";

describe("cli spec", () => {
  it("contains top-level metadata and new command specs", () => {
    const spec = getCliSpec();
    expect(spec.name).toBe("microcms");
    expect(spec.jsonContractVersion).toBe("0.x");
    expect(spec.globalOptions.some((option) => option.name === "--json")).toBe(true);
    expect(spec.exitCodes.INVALID_INPUT).toBe(2);
    expect(spec.commands.some((command) => command.path === "docs list")).toBe(true);
    expect(spec.commands.some((command) => command.path === "docs get")).toBe(true);
    expect(spec.commands.some((command) => command.path === "api schema inspect")).toBe(true);
    expect(spec.commands.some((command) => command.path === "api schema export")).toBe(true);
    expect(spec.commands.some((command) => command.path === "member get")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content meta list")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content meta get")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content pull")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content verify")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content push")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content sync-status")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content status set")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content created-by set")).toBe(true);
    expect(spec.commands.some((command) => command.path === "media list")).toBe(true);
    expect(spec.commands.some((command) => command.path === "media delete")).toBe(true);
    expect(spec.commands.some((command) => command.path === "search")).toBe(true);
    expect(spec.commands.some((command) => command.path === "task suggest")).toBe(true);
    expect(spec.commands.some((command) => command.path === "task guide")).toBe(true);
    expect(spec.commands.some((command) => command.path === "spec")).toBe(true);
    expect(Array.isArray(spec.discoveryHints)).toBe(true);
    expect(spec.discoveryHints.length).toBeGreaterThan(0);

    const schemaPull = spec.commands.find((command) => command.path === "schema pull");
    expect(schemaPull?.relatedCommands).toContain("api schema export");
  });
});
