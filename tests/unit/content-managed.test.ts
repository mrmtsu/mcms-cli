import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createManagedManifest,
  createManagedManifestRecord,
  loadManagedEndpointState,
  normalizeManagedPayload,
  removeManagedManifestRecord,
  upsertManagedManifestRecord,
} from "../../src/core/content-managed.js";

describe("content managed helpers", () => {
  it("normalizes schema-aware payloads for managed-json", () => {
    const schema = {
      apiFields: [
        { fieldId: "title", kind: "text" },
        { fieldId: "category", kind: "relation" },
        { fieldId: "tags", kind: "relationList" },
        { fieldId: "cover", kind: "media" },
        { fieldId: "status", kind: "select" },
        { fieldId: "multi", kind: "select", multipleSelect: true },
      ],
    };
    const record = {
      id: "article-1",
      title: "Hello",
      category: { id: "tutorial", name: "Tutorial" },
      tags: [{ id: "tag-1" }, { id: "tag-2" }],
      cover: { url: "https://example.com/cover.png", width: 1200 },
      status: [],
      multi: "featured",
      createdAt: "2026-03-01T00:00:00.000Z",
      extraField: "keep-me",
    };

    expect(normalizeManagedPayload(schema, record)).toEqual({
      title: "Hello",
      category: "tutorial",
      tags: ["tag-1", "tag-2"],
      cover: "https://example.com/cover.png",
      multi: ["featured"],
      extraField: "keep-me",
    });
  });

  it("loads manifest-backed records and tombstones from managed-json layout", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "microcms-cli-managed-state-"));
    const endpointDir = join(rootDir, "notes");
    const recordsDir = join(endpointDir, "records");
    const deletionsDir = join(endpointDir, "deletions");
    mkdirSync(recordsDir, { recursive: true });
    mkdirSync(deletionsDir, { recursive: true });

    writeFileSync(
      join(endpointDir, "_manifest.json"),
      JSON.stringify(
        createManagedManifest({
          endpoint: "notes",
          pulledAt: "2026-03-12T00:00:00.000Z",
          schemaPath: "schema/notes.json",
          records: [
            createManagedManifestRecord({
              id: "1",
              fileName: "1.json",
              payload: { title: "note-1" },
              remoteUpdatedAt: "2026-03-10T00:00:00.000Z",
            }),
          ],
        }),
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(join(recordsDir, "1.json"), JSON.stringify({ title: "note-1" }, null, 2), "utf8");
    writeFileSync(
      join(recordsDir, "draft-local.json"),
      JSON.stringify({ title: "draft-local" }, null, 2),
      "utf8",
    );
    writeFileSync(join(deletionsDir, "2.json"), JSON.stringify({ delete: true }, null, 2), "utf8");

    const state = await loadManagedEndpointState(rootDir, "notes");
    expect(state.manifest.records).toHaveLength(1);
    expect(state.localRecords).toHaveLength(2);
    expect(state.localRecords.find((record) => record.id === "1")?.manifestRecord?.id).toBe("1");
    expect(
      state.localRecords.find((record) => record.id === "draft-local")?.manifestRecord,
    ).toBeNull();
    expect(state.tombstones).toEqual([
      expect.objectContaining({
        id: "2",
        relativePath: "deletions/2.json",
      }),
    ]);
  });

  it("upserts and removes manifest records by id", () => {
    const base = createManagedManifest({
      endpoint: "notes",
      pulledAt: "2026-03-12T00:00:00.000Z",
      schemaPath: "schema/notes.json",
      records: [
        createManagedManifestRecord({
          id: "1",
          fileName: "1.json",
          payload: { title: "before" },
        }),
      ],
    });

    const updated = upsertManagedManifestRecord(
      base,
      createManagedManifestRecord({
        id: "1",
        fileName: "1.json",
        payload: { title: "after" },
      }),
    );
    expect(updated.records).toHaveLength(1);
    expect(updated.records[0]?.sha256).not.toBe(base.records[0]?.sha256);

    const removed = removeManagedManifestRecord(updated, "1");
    expect(removed.records).toEqual([]);
    expect(removed.totalCount).toBe(0);
  });
});
