import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeContext } from "../../src/core/context.js";
import { listContent } from "../../src/core/client.js";

function createContext(): RuntimeContext {
  return {
    json: true,
    verbose: false,
    color: false,
    timeoutMs: 1000,
    retry: 0,
    retryMaxDelayMs: 1000,
    outputMode: "inspect",
    profileSource: "none",
    serviceDomain: "example",
    serviceDomainSource: "option",
    apiKey: "test-api-key",
    apiKeySource: "option",
    apiKeySourceDetail: "option",
  };
}

function writeMock(path: string, count: number): void {
  const notes = Object.fromEntries(
    Array.from({ length: count }, (_, index) => [String(index + 1), { title: `n-${index + 1}` }]),
  );

  writeFileSync(
    path,
    JSON.stringify(
      {
        nextId: count + 1,
        endpoints: {
          notes,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("content client runtime env resolution", () => {
  const originalMockFile = process.env.MICROCMS_CONTENT_MOCK_FILE;

  afterEach(() => {
    if (originalMockFile === undefined) {
      delete process.env.MICROCMS_CONTENT_MOCK_FILE;
    } else {
      process.env.MICROCMS_CONTENT_MOCK_FILE = originalMockFile;
    }
  });

  it("re-resolves mock file env per request", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "microcms-cli-runtime-env-"));
    const mock1 = join(workDir, "mock-1.json");
    const mock2 = join(workDir, "mock-2.json");
    writeMock(mock1, 1);
    writeMock(mock2, 2);

    const ctx = createContext();

    process.env.MICROCMS_CONTENT_MOCK_FILE = mock1;
    const first = await listContent(ctx, "notes");
    expect((first.data as { totalCount: number }).totalCount).toBe(1);

    process.env.MICROCMS_CONTENT_MOCK_FILE = mock2;
    const second = await listContent(ctx, "notes");
    expect((second.data as { totalCount: number }).totalCount).toBe(2);
  });
});
