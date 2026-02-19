import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("exit codes", () => {
  it("returns AUTH exit code when API key is missing", () => {
    const result = runCli(["content", "list", "posts", "--service-domain", "example", "--json"]);
    expect(result.code).toBe(3);

    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("AUTH_FAILED");
  });

  it("returns INVALID_INPUT exit code for unknown command", () => {
    const result = runCli(["unknown-command", "--json"]);
    expect(result.code).toBe(2);

    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("prints version from package metadata", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { version: string };
    const result = runCli(["--version"]);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  });
});
