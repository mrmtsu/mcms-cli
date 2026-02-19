import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("content CRUD contract", () => {
  it("keeps stable envelopes for create/get/update/delete", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-contract-"));
    const createPath = join(workDir, "create.json");
    const updatePath = join(workDir, "update.json");
    const mockStorePath = join(workDir, "mock-content-store.json");

    writeFileSync(
      createPath,
      JSON.stringify({ title: "contract create", body: "create body" }, null, 2),
      "utf8"
    );
    writeFileSync(
      updatePath,
      JSON.stringify({ title: "contract update", body: "update body" }, null, 2),
      "utf8"
    );

    const env = {
      MICROCMS_SERVICE_DOMAIN: "mock",
      MICROCMS_API_KEY: "mock-key",
      MICROCMS_CONTENT_MOCK_FILE: mockStorePath
    };

    const createResult = runCli(["content", "create", "notes", "--file", createPath, "--json"], env);
    expect(createResult.code).toBe(0);
    const createBody = JSON.parse(createResult.stdout);
    expect(createBody).toMatchObject({
      ok: true,
      data: {
        id: expect.any(String),
        title: "contract create",
        body: "create body"
      },
      meta: {
        requestId: expect.any(String),
        version: "0.x"
      }
    });

    const id = createBody.data.id as string;

    const getResult = runCli(["content", "get", "notes", id, "--json"], env);
    expect(getResult.code).toBe(0);
    const getBody = JSON.parse(getResult.stdout);
    expect(getBody).toMatchObject({
      ok: true,
      data: {
        id,
        title: "contract create",
        body: "create body"
      },
      meta: {
        requestId: expect.any(String),
        version: "0.x"
      }
    });

    const updateResult = runCli(["content", "update", "notes", id, "--file", updatePath, "--json"], env);
    expect(updateResult.code).toBe(0);
    const updateBody = JSON.parse(updateResult.stdout);
    expect(updateBody).toMatchObject({
      ok: true,
      data: {
        id
      },
      meta: {
        requestId: expect.any(String),
        version: "0.x"
      }
    });

    const getAfterUpdateResult = runCli(["content", "get", "notes", id, "--json"], env);
    expect(getAfterUpdateResult.code).toBe(0);
    const getAfterUpdateBody = JSON.parse(getAfterUpdateResult.stdout);
    expect(getAfterUpdateBody).toMatchObject({
      ok: true,
      data: {
        id,
        title: "contract update",
        body: "update body"
      },
      meta: {
        requestId: expect.any(String),
        version: "0.x"
      }
    });

    const deleteResult = runCli(["content", "delete", "notes", id, "--json"], env);
    expect(deleteResult.code).toBe(0);
    const deleteBody = JSON.parse(deleteResult.stdout);
    expect(deleteBody).toMatchObject({
      ok: true,
      data: {
        id,
        deleted: true
      },
      meta: {
        requestId: expect.any(String),
        version: "0.x"
      }
    });
  });
});
