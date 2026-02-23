import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("security and input hardening", () => {
  it("rejects invalid service domain format", () => {
    const result = runCli(["auth", "status", "--service-domain", "localhost/a", "--json"]);
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("rejects invalid timeout", () => {
    const result = runCli(["auth", "status", "--timeout", "abc", "--json"]);
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("timeout");
  });

  it("rejects invalid numeric content query option", () => {
    const result = runCli(
      [
        "content",
        "list",
        "notes",
        "--limit",
        "abc",
        "--service-domain",
        "example",
        "--api-key",
        "key",
        "--json",
      ],
      {},
    );

    expect(result.code).toBe(2);
    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("limit");
  });

  it("rejects invalid numeric content meta query option", () => {
    const result = runCli(
      [
        "content",
        "meta",
        "list",
        "notes",
        "--limit",
        "abc",
        "--service-domain",
        "example",
        "--api-key",
        "key",
        "--json",
      ],
      {},
    );

    expect(result.code).toBe(2);
    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("limit");
  });

  it("supports --api-key-stdin without exposing key", () => {
    const result = runCli(
      ["auth", "status", "--api-key-stdin", "--json"],
      {},
      { stdin: "stdin-key\n" },
    );
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data.apiKeyAvailable).toBe(true);
    expect(body.data.apiKeySource).toBe("option");
  });

  it("omits error details in JSON mode by default", () => {
    const result = runCli(["unknown-command", "--json"]);
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.error.details).toBeUndefined();
  });

  it("includes error details in JSON mode with --verbose", () => {
    const result = runCli(["unknown-command", "--json", "--verbose"]);
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.error.details).toBeDefined();
  });

  it("rejects conflicting output mode options", () => {
    const result = runCli(["auth", "status", "--json", "--table"]);
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("--json");
  });

  it("rejects auth login --prompt with other API key input options", () => {
    const result = runCli([
      "auth",
      "login",
      "--service-domain",
      "example",
      "--prompt",
      "--api-key",
      "x",
      "--json",
    ]);
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("--prompt");
  });

  it("writes config with user-only permissions on unix", () => {
    if (process.platform === "win32") {
      return;
    }

    const configRoot = mkdtempSync(join(tmpdir(), "microcms-cli-config-perm-"));
    const result = runCli(
      ["auth", "profile", "add", "permcheck", "--service-domain", "example", "--json"],
      {},
      { configRoot },
    );
    expect(result.code).toBe(0);

    const configPath = join(configRoot, "mcms-cli", "config.json");
    const mode = statSync(configPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("returns structured JSON error for invalid profile environment variable", () => {
    const result = runCli(["auth", "status", "--json"], {
      MICROCMS_PROFILE: "***",
    });
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("profile");
  });

  it("fails fast when config file contains invalid JSON", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "microcms-cli-config-invalid-"));
    const configDir = join(configRoot, "mcms-cli");
    const configPath = join(configDir, "config.json");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, "{ invalid json", "utf8");

    const result = runCli(["auth", "status", "--json"], {}, { configRoot });
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("invalid JSON");
  });
});
