import { chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

const MOCK_MCP_COMMAND = resolve(process.cwd(), "tests/fixtures/mock-doc-mcp-server.js");

function mcpEnv(): NodeJS.ProcessEnv {
  chmodSync(MOCK_MCP_COMMAND, 0o755);
  return {
    MICROCMS_DOC_MCP_COMMAND: MOCK_MCP_COMMAND,
  };
}

describe("docs/search/spec commands", () => {
  it("falls back to local source for docs list when MCP is unavailable", () => {
    const missingCommand = join(mkdtempSync(join(tmpdir(), "mcms-docs-missing-")), "missing-mcp");
    const result = runCli(["docs", "list", "--json"], {
      MICROCMS_DOC_MCP_COMMAND: missingCommand,
    });

    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.sourceResolved).toBe("local");
    expect(Array.isArray(body.data.warnings)).toBe(true);
    expect(body.data.warnings.length).toBeGreaterThan(0);
  });

  it("lists docs via MCP source", () => {
    const result = runCli(["docs", "list", "--source", "mcp", "--json"], mcpEnv());
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data.sourceResolved).toBe("mcp");
    expect(body.data.total).toBeGreaterThan(0);
    expect(
      body.data.docs.some(
        (doc: { filename: string }) => doc.filename === "コンテンツ一覧取得API.md",
      ),
    ).toBe(true);
  });

  it("works for docs list without API key/service domain config", () => {
    const result = runCli(["docs", "list", "--source", "mcp", "--json"], {
      ...mcpEnv(),
      MICROCMS_API_KEY: "",
      MICROCMS_SERVICE_DOMAIN: "",
    });

    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.sourceResolved).toBe("mcp");
    expect(body.data.total).toBeGreaterThan(0);
  });

  it("uses bundled MCP runtime by default without env override", () => {
    const result = runCli(["docs", "list", "--source", "mcp", "--json"]);
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.sourceResolved).toBe("mcp");
    expect(body.data.total).toBeGreaterThan(0);
  });

  it("gets markdown via MCP source in JSON mode", () => {
    const result = runCli(
      [
        "docs",
        "get",
        "--source",
        "mcp",
        "--category",
        "content-api",
        "--file",
        "コンテンツ一覧取得API.md",
        "--json",
      ],
      mcpEnv(),
    );
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data.sourceResolved).toBe("mcp");
    expect(body.data.markdown).toContain("# GET /api/v1/{endpoint}");
    expect(body.data.truncated).toBe(false);
  });

  it("gets markdown via MCP source in raw mode", () => {
    const result = runCli(
      ["docs", "get", "--source", "mcp", "--category", "manual", "--file", "はじめに.md"],
      mcpEnv(),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("# はじめに");
    expect(result.stdout).not.toContain('"ok": true');
  });

  it("truncates markdown output with --max-chars", () => {
    const result = runCli(
      [
        "docs",
        "get",
        "--source",
        "mcp",
        "--category",
        "content-api",
        "--file",
        "コンテンツ一覧取得API.md",
        "--max-chars",
        "20",
        "--json",
      ],
      mcpEnv(),
    );
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.truncated).toBe(true);
    expect(body.data.originalLength).toBeGreaterThan(20);
    expect(body.data.markdown).toContain("<!-- truncated -->");
  });

  it("searches docs/spec in one command", () => {
    const result = runCli(["search", "content", "--json"], mcpEnv());
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.scope).toBe("all");
    expect(body.data.sourceResolved).toBe("mcp");
    expect(body.data.hits.length).toBeGreaterThan(0);
  });

  it("returns machine-readable spec", () => {
    const result = runCli(["spec", "--json"]);
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.name).toBe("microcms");
    expect(
      body.data.commands.some((command: { path: string }) => command.path === "docs get"),
    ).toBe(true);
  });

  it("validates docs/search options", () => {
    const invalidLimit = runCli(["docs", "list", "--limit", "abc", "--json"]);
    expect(invalidLimit.code).toBe(2);
    expect(JSON.parse(invalidLimit.stderr).error.code).toBe("INVALID_INPUT");

    const invalidScope = runCli(["search", "hello", "--scope", "bad", "--json"]);
    expect(invalidScope.code).toBe(2);
    expect(JSON.parse(invalidScope.stderr).error.code).toBe("INVALID_INPUT");

    const invalidMaxChars = runCli([
      "docs",
      "get",
      "--category",
      "manual",
      "--file",
      "はじめに.md",
      "--max-chars",
      "0",
      "--json",
    ]);
    expect(invalidMaxChars.code).toBe(2);
    expect(JSON.parse(invalidMaxChars.stderr).error.code).toBe("INVALID_INPUT");
  });
});
