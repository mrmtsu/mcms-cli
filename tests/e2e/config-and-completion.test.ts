import { existsSync, lstatSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("config doctor and completion commands", () => {
  it("shows resolved config sources and warnings", () => {
    const result = runCli([
      "config",
      "doctor",
      "--service-domain",
      "example",
      "--api-key",
      "plain-secret",
      "--json"
    ]);

    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.resolved.serviceDomain.value).toBe("example");
    expect(body.data.resolved.apiKey.source).toBe("option");
    expect(body.data.warnings.join("\n")).toContain("--api-key");
  });

  it("installs and uninstalls shell completion scripts", () => {
    const home = mkdtempSync(join(tmpdir(), "microcms-cli-home-"));
    const env = {
      HOME: home,
      USERPROFILE: home
    };

    const installResult = runCli(["completion", "install", "bash", "--json"], env);
    expect(installResult.code).toBe(0);

    const installBody = JSON.parse(installResult.stdout);
    const targetPath = installBody.data.path as string;
    expect(targetPath).toContain("bash-completion");
    expect(existsSync(targetPath)).toBe(true);

    const uninstallResult = runCli(["completion", "uninstall", "--json"], env);
    expect(uninstallResult.code).toBe(0);
    expect(existsSync(targetPath)).toBe(false);
  });

  it("rejects completion install when target is a symbolic link", () => {
    const home = mkdtempSync(join(tmpdir(), "microcms-cli-home-link-"));
    const env = {
      HOME: home,
      USERPROFILE: home
    };

    const targetPath = join(home, ".local", "share", "bash-completion", "completions", "microcms");
    mkdirSync(join(home, ".local", "share", "bash-completion", "completions"), { recursive: true });
    const outsideFile = join(home, "outside.txt");
    writeFileSync(outsideFile, "do-not-touch", "utf8");
    symlinkSync(outsideFile, targetPath);
    expect(lstatSync(targetPath).isSymbolicLink()).toBe(true);

    const result = runCli(["completion", "install", "bash", "--json"], env);
    expect(result.code).toBe(2);
    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("symbolic link");
  });

  it("rejects completion uninstall when target is a symbolic link", () => {
    const home = mkdtempSync(join(tmpdir(), "microcms-cli-home-unlink-"));
    const env = {
      HOME: home,
      USERPROFILE: home
    };

    const targetPath = join(home, ".local", "share", "bash-completion", "completions", "microcms");
    mkdirSync(join(home, ".local", "share", "bash-completion", "completions"), { recursive: true });
    const outsideFile = join(home, "outside.txt");
    writeFileSync(outsideFile, "do-not-delete", "utf8");
    symlinkSync(outsideFile, targetPath);
    expect(lstatSync(targetPath).isSymbolicLink()).toBe(true);

    const result = runCli(["completion", "uninstall", "--json"], env);
    expect(result.code).toBe(2);
    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message).toContain("symbolic link");
    expect(existsSync(outsideFile)).toBe(true);
  });

  it("fails silently for endpoint candidates when auth is unavailable", () => {
    const result = runCli(["completion", "endpoints"]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });
});
