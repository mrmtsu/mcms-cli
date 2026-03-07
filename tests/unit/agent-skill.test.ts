import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MCMS_CLI_SKILL_SOURCES, renderMcmsCliSkill } from "../../src/core/agent-skill.js";

describe("agent skill", () => {
  it("renders source metadata for stale checks", () => {
    const skill = renderMcmsCliSkill();

    expect(skill).toContain("metadata:");
    expect(skill).toContain("generatedBy: scripts/generate-skill.ts");
    for (const source of MCMS_CLI_SKILL_SOURCES) {
      expect(skill).toContain(`- ${source}`);
    }
  });

  it("matches the checked-in skill file", () => {
    const expected = `${renderMcmsCliSkill()}\n`;
    const actual = readFileSync(resolve(process.cwd(), "skills/mcms-cli/SKILL.md"), "utf8");

    expect(actual).toBe(expected);
  });
});
