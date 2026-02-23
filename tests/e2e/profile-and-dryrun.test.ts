import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("profile and dry-run flows", () => {
  it("adds and uses a profile for service domain resolution", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "microcms-cli-profile-"));

    const addResult = runCli(
      ["auth", "profile", "add", "work", "--service-domain", "example", "--json"],
      {},
      { configRoot },
    );
    expect(addResult.code).toBe(0);

    const useResult = runCli(["auth", "profile", "use", "work", "--json"], {}, { configRoot });
    expect(useResult.code).toBe(0);

    const statusResult = runCli(["auth", "status", "--json"], {}, { configRoot });
    expect(statusResult.code).toBe(0);
    const body = JSON.parse(statusResult.stdout);
    expect(body.data.profile).toBe("work");
    expect(body.data.serviceDomain).toBe("example");
  });

  it("fetches all pages with content list --all", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-all-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: {
            notes: {
              "1": { title: "n1" },
              "2": { title: "n2" },
              "3": { title: "n3" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = {
      MICROCMS_SERVICE_DOMAIN: "mock",
      MICROCMS_API_KEY: "mock-key",
      MICROCMS_CONTENT_MOCK_FILE: mockStorePath,
    };
    const result = runCli(["content", "list", "notes", "--all", "--limit", "2", "--json"], env);
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data.totalCount).toBe(3);
    expect(body.data.contents).toHaveLength(3);
  });

  it("supports dry-run for write operations", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-dryrun-"));
    const payloadPath = join(workDir, "payload.json");
    const mediaPath = join(workDir, "media.png");
    writeFileSync(payloadPath, JSON.stringify({ title: "dry" }), "utf8");
    writeFileSync(mediaPath, "fake-image-bytes", "utf8");

    const createResult = runCli([
      "content",
      "create",
      "notes",
      "--file",
      payloadPath,
      "--dry-run",
      "--json",
    ]);
    expect(createResult.code).toBe(0);
    expect(JSON.parse(createResult.stdout).data.operation).toBe("content.create");

    const updateResult = runCli([
      "content",
      "update",
      "notes",
      "id-1",
      "--file",
      payloadPath,
      "--dry-run",
      "--json",
    ]);
    expect(updateResult.code).toBe(0);
    expect(JSON.parse(updateResult.stdout).data.operation).toBe("content.update");

    const deleteResult = runCli(["content", "delete", "notes", "id-1", "--dry-run", "--json"]);
    expect(deleteResult.code).toBe(0);
    expect(JSON.parse(deleteResult.stdout).data.operation).toBe("content.delete");

    const statusResult = runCli([
      "content",
      "status",
      "set",
      "notes",
      "id-1",
      "--status",
      "PUBLISH",
      "--dry-run",
      "--json",
    ]);
    expect(statusResult.code).toBe(0);
    expect(JSON.parse(statusResult.stdout).data.operation).toBe("content.status.set");

    const mediaResult = runCli(["media", "upload", mediaPath, "--dry-run", "--json"]);
    expect(mediaResult.code).toBe(0);
    const mediaBody = JSON.parse(mediaResult.stdout);
    expect(mediaBody.data.operation).toBe("media.upload");
    expect(mediaBody.data.size).toBeGreaterThan(0);
  });

  it("validates media list options before network calls", () => {
    const result = runCli(["media", "list", "--limit", "abc", "--json"]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_INPUT");
  });

  it("does not change default profile during auth login with --profile", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "microcms-cli-login-profile-"));

    const addDefaultResult = runCli(
      [
        "auth",
        "profile",
        "add",
        "default",
        "--service-domain",
        "example",
        "--set-default",
        "--json",
      ],
      {},
      { configRoot },
    );
    expect(addDefaultResult.code).toBe(0);

    const loginResult = runCli(
      [
        "auth",
        "login",
        "--profile",
        "work",
        "--service-domain",
        "example-work",
        "--api-key-stdin",
        "--json",
      ],
      {},
      { configRoot, stdin: "dummy-key\n" },
    );
    expect(loginResult.code).toBe(0);

    const listResult = runCli(["auth", "profile", "list", "--json"], {}, { configRoot });
    expect(listResult.code).toBe(0);
    const body = JSON.parse(listResult.stdout);
    expect(body.data.defaultProfile).toBe("default");
    expect(body.data.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "default", isDefault: true }),
        expect.objectContaining({ name: "work", isDefault: false }),
      ]),
    );
  });
});
