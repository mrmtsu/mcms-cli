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
    expect(spec.commands.some((command) => command.path === "member get")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content meta list")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content meta get")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content status set")).toBe(true);
    expect(spec.commands.some((command) => command.path === "content created-by set")).toBe(true);
    expect(spec.commands.some((command) => command.path === "media list")).toBe(true);
    expect(spec.commands.some((command) => command.path === "media delete")).toBe(true);
    expect(spec.commands.some((command) => command.path === "search")).toBe(true);
    expect(spec.commands.some((command) => command.path === "spec")).toBe(true);
  });
});
