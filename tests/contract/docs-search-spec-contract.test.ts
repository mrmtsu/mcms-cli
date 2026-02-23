import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("docs/search/spec contract", () => {
  it("keeps stable success envelope for docs list / search / spec", () => {
    const missingCommand = join(mkdtempSync(join(tmpdir(), "mcms-docs-contract-")), "missing-mcp");
    const env = {
      MICROCMS_DOC_MCP_COMMAND: missingCommand,
    };

    const docsResult = runCli(["docs", "list", "--json"], env);
    expect(docsResult.code).toBe(0);
    const docsBody = JSON.parse(docsResult.stdout);
    expect(docsBody.ok).toBe(true);
    expect(docsBody.meta.version).toBe("0.x");
    expect(docsBody.data).toHaveProperty("sourceResolved");

    const searchResult = runCli(["search", "docs", "--json"], env);
    expect(searchResult.code).toBe(0);
    const searchBody = JSON.parse(searchResult.stdout);
    expect(searchBody.ok).toBe(true);
    expect(searchBody.meta.version).toBe("0.x");
    expect(searchBody.data).toHaveProperty("hits");

    const specResult = runCli(["spec", "--json"]);
    expect(specResult.code).toBe(0);
    const specBody = JSON.parse(specResult.stdout);
    expect(specBody.ok).toBe(true);
    expect(specBody.meta.version).toBe("0.x");
    expect(specBody.data).toHaveProperty("commands");
    expect(
      (specBody.data.commands as Array<{ path?: string }>).some(
        (command) => command.path === "member get",
      ),
    ).toBe(true);
    expect(
      (specBody.data.commands as Array<{ path?: string }>).some(
        (command) => command.path === "content meta list",
      ),
    ).toBe(true);
    expect(
      (specBody.data.commands as Array<{ path?: string }>).some(
        (command) => command.path === "content meta get",
      ),
    ).toBe(true);
    expect(
      (specBody.data.commands as Array<{ path?: string }>).some(
        (command) => command.path === "content status set",
      ),
    ).toBe(true);
    expect(
      (specBody.data.commands as Array<{ path?: string }>).some(
        (command) => command.path === "media delete",
      ),
    ).toBe(true);
  });
});
