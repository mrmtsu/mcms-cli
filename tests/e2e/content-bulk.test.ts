import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

function buildEnv(mockStorePath: string): NodeJS.ProcessEnv {
  return {
    MICROCMS_SERVICE_DOMAIN: "mock",
    MICROCMS_API_KEY: "mock-key",
    MICROCMS_CONTENT_MOCK_FILE: mockStorePath,
  };
}

describe("content bulk", () => {
  it("executes create/update/delete/status operations", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-bulk-success-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const filePath = join(workDir, "operations.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 20,
          endpoints: {
            notes: {
              "keep-1": { title: "before" },
              "to-delete": { title: "remove" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      filePath,
      JSON.stringify(
        {
          operations: [
            { action: "update", endpoint: "notes", id: "keep-1", payload: { title: "after" } },
            { action: "create", endpoint: "notes", payload: { title: "new" } },
            { action: "status", endpoint: "notes", id: "keep-1", status: "PUBLISH" },
            { action: "delete", endpoint: "notes", id: "to-delete" },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = buildEnv(mockStorePath);
    const result = runCli(["content", "bulk", "--file", filePath, "--json"], env);
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data).toMatchObject({
      operation: "content.bulk",
      total: 4,
      succeeded: 4,
      failed: 0,
      skipped: 0,
    });

    const listResult = runCli(["content", "list", "notes", "--all", "--json"], env);
    expect(listResult.code).toBe(0);
    const listBody = JSON.parse(listResult.stdout);
    expect(listBody.data.totalCount).toBe(2);
    expect(listBody.data.contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "keep-1", title: "after", _status: "PUBLISH" }),
        expect.objectContaining({ title: "new" }),
      ]),
    );
  });

  it("stops on first error by default", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-bulk-stop-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const filePath = join(workDir, "operations.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: { notes: {} },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      filePath,
      JSON.stringify(
        {
          operations: [
            { action: "update", endpoint: "notes", id: "missing", payload: { title: "x" } },
            { action: "create", endpoint: "notes", payload: { title: "should-not-run" } },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = buildEnv(mockStorePath);
    const result = runCli(["content", "bulk", "--file", filePath, "--json"], env);
    expect(result.code).toBe(1);
    const body = JSON.parse(result.stdout);
    expect(body.data).toMatchObject({
      failed: 1,
      skipped: 1,
      succeeded: 0,
      stopOnError: true,
    });

    const listResult = runCli(["content", "list", "notes", "--all", "--json"], env);
    expect(listResult.code).toBe(0);
    expect(JSON.parse(listResult.stdout).data.totalCount).toBe(0);
  });

  it("continues on error when --continue-on-error is set", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-bulk-continue-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const filePath = join(workDir, "operations.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: { notes: {} },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      filePath,
      JSON.stringify(
        {
          operations: [
            { action: "update", endpoint: "notes", id: "missing", payload: { title: "x" } },
            { action: "create", endpoint: "notes", payload: { title: "ran" } },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = buildEnv(mockStorePath);
    const result = runCli(
      ["content", "bulk", "--file", filePath, "--continue-on-error", "--json"],
      env,
    );
    expect(result.code).toBe(1);
    const body = JSON.parse(result.stdout);
    expect(body.data).toMatchObject({
      failed: 1,
      skipped: 0,
      succeeded: 1,
      stopOnError: false,
    });

    const listResult = runCli(["content", "list", "notes", "--all", "--json"], env);
    expect(listResult.code).toBe(0);
    expect(JSON.parse(listResult.stdout).data.totalCount).toBe(1);
  });

  it("rejects conflicting --continue-on-error and --stop-on-error", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-bulk-conflict-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const filePath = join(workDir, "operations.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: { notes: {} },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      filePath,
      JSON.stringify(
        {
          operations: [{ action: "create", endpoint: "notes", payload: { title: "x" } }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["content", "bulk", "--file", filePath, "--continue-on-error", "--stop-on-error", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(2);
    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("prints progress lines in non-json mode", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-bulk-progress-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const filePath = join(workDir, "operations.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: { notes: {} },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      filePath,
      JSON.stringify(
        {
          operations: [
            { action: "create", endpoint: "notes", payload: { title: "a" } },
            { action: "create", endpoint: "notes", payload: { title: "b" } },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(["content", "bulk", "--file", filePath], buildEnv(mockStorePath));
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("[1/2] Succeeded:");
    expect(result.stderr).toContain("[2/2] Succeeded:");
  });

  it("validates operation definition in dry-run mode", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-bulk-dryrun-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const filePath = join(workDir, "operations.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: { notes: {} },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      filePath,
      JSON.stringify(
        {
          operations: [{ action: "unknown", endpoint: "notes" }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["content", "bulk", "--file", filePath, "--dry-run", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(2);
    const body = JSON.parse(result.stderr);
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("supports dry-run without auth when only structure check is needed", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-bulk-dryrun-noauth-"));
    const filePath = join(workDir, "operations.json");

    writeFileSync(
      filePath,
      JSON.stringify(
        {
          operations: [{ action: "create", endpoint: "notes", payload: { title: "x" } }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(["content", "bulk", "--file", filePath, "--dry-run", "--json"]);
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data).toMatchObject({
      dryRun: true,
      total: 1,
      validatePayload: false,
    });
  });

  it("fails with strict warnings when payload has unknown fields", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-bulk-strict-"));
    const mockStorePath = join(workDir, "mock-content-store.json");
    const filePath = join(workDir, "operations.json");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 1,
          endpoints: { notes: {} },
          schemas: {
            notes: {
              endpoint: "notes",
              apiFields: [{ fieldId: "title", kind: "text" }],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      filePath,
      JSON.stringify(
        {
          operations: [
            { action: "create", endpoint: "notes", payload: { title: "ok", extra: "x" } },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = runCli(
      ["content", "bulk", "--file", filePath, "--dry-run", "--strict-warnings", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_INPUT");
  });
});
