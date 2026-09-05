import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("api create command", () => {
  it("validates and previews API creation without auth or network", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-api-create-"));
    const payloadPath = join(workDir, "api-create.json");
    const payload = {
      name: "Blog",
      endpoint: "blogs",
      type: "list",
      apiFields: [{ fieldId: "title", name: "Title", kind: "text", required: true }],
      customFields: [],
    };
    writeFileSync(payloadPath, JSON.stringify(payload), "utf8");

    const result = runCli([
      "api",
      "create",
      "--file",
      payloadPath,
      "--allow-additional-charge",
      "--dry-run",
      "--json",
    ]);

    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.ok).toBe(true);
    expect(body.data.operation).toBe("api.create");
    expect(body.data.payload).toEqual(payload);
    expect(body.data.allowAdditionalCharge).toBe(true);
    expect(body.data.requiresConfirmation).toBe(true);
    expect(body.data.riskLevel).toBe("high");
  });

  it("accepts schema-only input when basic settings are supplied by options", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-api-create-options-"));
    const payloadPath = join(workDir, "api-schema.json");
    writeFileSync(
      payloadPath,
      JSON.stringify({
        apiFields: [{ fieldId: "title", name: "Title", kind: "text" }],
      }),
      "utf8",
    );

    const result = runCli([
      "api",
      "create",
      "--file",
      payloadPath,
      "--name",
      "Blog",
      "--endpoint",
      "blogs",
      "--type",
      "list",
      "--dry-run",
      "--json",
    ]);

    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.data.payload).toMatchObject({
      name: "Blog",
      endpoint: "blogs",
      type: "list",
    });
  });

  it("rejects incomplete API create payloads before any write", () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-api-create-invalid-"));
    const payloadPath = join(workDir, "invalid.json");
    writeFileSync(
      payloadPath,
      JSON.stringify({
        name: "Blog",
        endpoint: "blogs",
        apiFields: [{ fieldId: "title", name: "Title", kind: "text" }],
      }),
      "utf8",
    );

    const result = runCli(["api", "create", "--file", payloadPath, "--dry-run", "--json"]);

    expect(result.code).toBe(2);
    const body = JSON.parse(result.stderr);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.details.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "type" })]),
    );
  });
});
