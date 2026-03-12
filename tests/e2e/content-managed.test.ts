import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

function buildEnv(mockStorePath: string): NodeJS.ProcessEnv {
  return {
    MICROCMS_SERVICE_DOMAIN: "mock",
    MICROCMS_API_KEY: "mock-key",
    MICROCMS_CONTENT_MOCK_FILE: mockStorePath,
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function writeMockStore(path: string): void {
  writeFileSync(
    path,
    JSON.stringify(
      {
        nextId: 10,
        endpoints: {
          notes: {
            "1": {
              title: "note-1",
              updatedAt: "2026-03-10T00:00:00.000Z",
            },
            "2": {
              title: "note-2",
              updatedAt: "2026-03-11T00:00:00.000Z",
            },
            "3": {
              title: "note-3",
              updatedAt: "2026-03-12T00:00:00.000Z",
            },
            "4": {
              title: "note-4",
              updatedAt: "2026-03-13T00:00:00.000Z",
            },
          },
        },
        schemas: {
          notes: {
            endpoint: "notes",
            apiType: "list",
            apiFields: [{ fieldId: "title", required: true, kind: "text" }],
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("content managed-json workflow", () => {
  it("pulls managed-json layout for an endpoint", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-managed-pull-"));
    const mockStorePath = join(workDir, "mock-store.json");
    const outDir = join(workDir, "managed");
    writeMockStore(mockStorePath);

    const result = runCli(
      ["content", "pull", "notes", "--all", "--out", outDir, "--format", "managed-json", "--json"],
      buildEnv(mockStorePath),
    );
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data).toMatchObject({
      operation: "content.pull",
      format: "managed-json",
      endpointCount: 1,
    });

    const manifest = readJson(join(outDir, "notes", "_manifest.json")) as {
      formatVersion: string;
      records: Array<{ id: string; remoteUpdatedAt: string | null }>;
    };
    expect(manifest.formatVersion).toBe("managed-json/v1");
    expect(manifest.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "1", remoteUpdatedAt: "2026-03-10T00:00:00.000Z" }),
        expect.objectContaining({ id: "4", remoteUpdatedAt: "2026-03-13T00:00:00.000Z" }),
      ]),
    );
    expect(readJson(join(outDir, "notes", "records", "1.json"))).toEqual({ title: "note-1" });
    expect(readJson(join(outDir, "schema", "notes.json"))).toMatchObject({ endpoint: "notes" });
  });

  it("verifies create/update/delete actions and pushes them on execute", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-managed-push-"));
    const mockStorePath = join(workDir, "mock-store.json");
    const outDir = join(workDir, "managed");
    writeMockStore(mockStorePath);

    const env = buildEnv(mockStorePath);
    expect(runCli(["content", "pull", "notes", "--all", "--out", outDir, "--json"], env).code).toBe(
      0,
    );

    writeJson(join(outDir, "notes", "records", "1.json"), { title: "note-1-updated" });
    writeJson(join(outDir, "notes", "records", "draft-local.json"), { title: "draft-new" });
    rmSync(join(outDir, "notes", "records", "2.json"));
    writeJson(join(outDir, "notes", "deletions", "2.json"), { delete: true });

    const dryPush = runCli(["content", "push", "notes", "--dir", outDir, "--json"], env);
    expect(dryPush.code).toBe(0);
    const dryPushBody = JSON.parse(dryPush.stdout);
    expect(dryPushBody.data).toMatchObject({
      operation: "content.push",
      execute: false,
      hasFailures: false,
    });

    const verify = runCli(["content", "verify", "notes", "--dir", outDir, "--json"], env);
    expect(verify.code).toBe(0);
    const verifyBody = JSON.parse(verify.stdout);
    const endpoint = verifyBody.data.endpoints[0];
    expect(endpoint.counts).toMatchObject({
      create: 1,
      update: 3,
      delete: 1,
    });

    const push = runCli(["content", "push", "notes", "--dir", outDir, "--execute", "--json"], env);
    expect(push.code).toBe(0);
    const pushBody = JSON.parse(push.stdout);
    expect(pushBody.data.execution).toMatchObject({
      attempted: 5,
      succeeded: 5,
      failed: 0,
    });

    const manifest = readJson(join(outDir, "notes", "_manifest.json")) as {
      records: Array<{ id: string }>;
    };
    expect(manifest.records.some((record) => record.id === "2")).toBe(false);
    const createdRecord = manifest.records.find((record) => record.id.startsWith("mock-created-"));
    expect(createdRecord).toBeDefined();
    expect(existsSync(join(outDir, "notes", "records", "draft-local.json"))).toBe(false);
    expect(
      existsSync(join(outDir, "notes", "records", `${createdRecord?.id ?? "missing"}.json`)),
    ).toBe(true);
    expect(existsSync(join(outDir, "notes", "deletions", "2.json"))).toBe(false);

    const store = readJson(mockStorePath) as {
      endpoints: Record<string, Record<string, { title?: string }>>;
    };
    expect(store.endpoints.notes["1"]?.title).toBe("note-1-updated");
    expect(store.endpoints.notes["2"]).toBeUndefined();
    expect(
      Object.values(store.endpoints.notes).some((record) => record.title === "draft-new"),
    ).toBe(true);
  });

  it("blocks stale remote updates unless --force is set", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-managed-force-"));
    const mockStorePath = join(workDir, "mock-store.json");
    const outDir = join(workDir, "managed");
    writeMockStore(mockStorePath);

    const env = buildEnv(mockStorePath);
    expect(runCli(["content", "pull", "notes", "--all", "--out", outDir, "--json"], env).code).toBe(
      0,
    );

    writeJson(join(outDir, "notes", "records", "1.json"), { title: "forced-update" });
    const store = readJson(mockStorePath) as {
      endpoints: Record<string, Record<string, Record<string, unknown>>>;
    };
    store.endpoints.notes["1"] = {
      ...store.endpoints.notes["1"],
      updatedAt: "2026-03-20T00:00:00.000Z",
    };
    writeFileSync(mockStorePath, JSON.stringify(store, null, 2), "utf8");

    const blocked = runCli(
      ["content", "push", "notes", "--dir", outDir, "--execute", "--json"],
      env,
    );
    expect(blocked.code).toBe(6);
    const blockedBody = JSON.parse(blocked.stdout);
    expect(blockedBody.data).toMatchObject({
      blocked: true,
      force: false,
    });

    const forced = runCli(
      ["content", "push", "notes", "--dir", outDir, "--execute", "--force", "--json"],
      env,
    );
    expect(forced.code).toBe(0);
    const forcedStore = readJson(mockStorePath) as {
      endpoints: Record<string, Record<string, { title?: string }>>;
    };
    expect(forcedStore.endpoints.notes["1"]?.title).toBe("forced-update");
  });

  it("normalizes single select writes before managed execute", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-managed-single-select-"));
    const mockStorePath = join(workDir, "mock-store.json");
    const outDir = join(workDir, "managed");

    writeFileSync(
      mockStorePath,
      JSON.stringify(
        {
          nextId: 10,
          endpoints: {
            tech_articles: {
              article_1: {
                title: "Article 1",
                intent: ["comparison"],
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            },
          },
          schemas: {
            tech_articles: {
              endpoint: "tech_articles",
              apiType: "list",
              apiFields: [
                { fieldId: "title", kind: "text", required: true },
                {
                  fieldId: "intent",
                  kind: "select",
                  multipleSelect: false,
                  selectItems: ["comparison", "guide"],
                },
              ],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const env = buildEnv(mockStorePath);
    expect(
      runCli(["content", "pull", "tech_articles", "--all", "--out", outDir, "--json"], env).code,
    ).toBe(0);
    expect(readJson(join(outDir, "tech_articles", "records", "article_1.json"))).toEqual({
      title: "Article 1",
      intent: "comparison",
    });

    writeJson(join(outDir, "tech_articles", "records", "article_1.json"), {
      title: "Article 1",
      intent: "guide",
    });

    const verify = runCli(["content", "verify", "tech_articles", "--dir", outDir, "--json"], env);
    expect(verify.code).toBe(0);

    const push = runCli(
      ["content", "push", "tech_articles", "--dir", outDir, "--execute", "--json"],
      env,
    );
    expect(push.code).toBe(0);

    const store = readJson(mockStorePath) as {
      endpoints: Record<string, Record<string, { intent?: unknown }>>;
    };
    expect(store.endpoints.tech_articles.article_1?.intent).toEqual(["guide"]);
    expect(readJson(join(outDir, "tech_articles", "records", "article_1.json"))).toEqual({
      title: "Article 1",
      intent: "guide",
    });
  });

  it("reports sync-status categories for managed records", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-managed-status-"));
    const mockStorePath = join(workDir, "mock-store.json");
    const outDir = join(workDir, "managed");
    writeMockStore(mockStorePath);

    const env = buildEnv(mockStorePath);
    expect(runCli(["content", "pull", "notes", "--all", "--out", outDir, "--json"], env).code).toBe(
      0,
    );

    const store = readJson(mockStorePath) as {
      endpoints: Record<string, Record<string, Record<string, unknown>>>;
    };
    store.endpoints.notes["1"] = {
      ...store.endpoints.notes["1"],
      updatedAt: "2026-03-30T00:00:00.000Z",
    };
    delete store.endpoints.notes["2"];
    store.endpoints.notes["5"] = {
      title: "remote-5",
      updatedAt: "2026-03-14T00:00:00.000Z",
    };
    writeFileSync(mockStorePath, JSON.stringify(store, null, 2), "utf8");

    writeJson(join(outDir, "notes", "records", "local-only.json"), { title: "local-only" });
    writeJson(join(outDir, "notes", "records", "5.json"), { title: "remote-5" });
    rmSync(join(outDir, "notes", "records", "4.json"));
    writeJson(join(outDir, "notes", "deletions", "4.json"), { delete: true });

    const status = runCli(["content", "sync-status", "notes", "--dir", outDir, "--json"], env);
    expect(status.code).toBe(0);
    const body = JSON.parse(status.stdout);
    expect(body.data.endpoints[0].counts).toMatchObject({
      stale_remote: 1,
      remote_missing: 1,
      local_only: 1,
      manifest_missing: 1,
      pending_delete: 1,
      in_sync: 1,
    });
  });
});
