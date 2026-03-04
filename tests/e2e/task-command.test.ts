import { describe, expect, it } from "vitest";
import { runCli } from "../helpers/run-cli.js";

describe("task workflow commands", () => {
  it("lists built-in task catalog", () => {
    const result = runCli(["task", "list", "--json"]);
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBeGreaterThan(0);
    expect(
      (body.data.tasks as Array<{ id?: string }>).some((task) => task.id === "content-delete"),
    ).toBe(true);
  });

  it("suggests task workflows from query", () => {
    const result = runCli(["task", "suggest", "delete", "--json"]);
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data.query).toBe("delete");
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.suggestions[0].requiresConfirmation).toBe(true);
    expect(body.data.suggestions[0].stepsPreview.join("\n")).toContain("--dry-run");
  });

  it("returns markdown runbook in JSON mode", () => {
    const result = runCli(["task", "guide", "content-delete", "--json"]);
    expect(result.code).toBe(0);

    const body = JSON.parse(result.stdout);
    expect(body.data.id).toBe("content-delete");
    expect(body.data.requiresConfirmation).toBe(true);
    expect(body.data.markdown).toContain("# Delete Content with Guardrails");
    expect(body.data.markdown).toContain("content delete <endpoint> <id> --dry-run --json");
  });

  it("prints markdown runbook in non-json mode", () => {
    const result = runCli(["task", "guide", "media-delete"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("# Delete Media");
    expect(result.stdout).toContain("--dry-run --json");
    expect(result.stdout).not.toContain('"ok":true');
  });

  it("fails for unknown task id", () => {
    const result = runCli(["task", "guide", "unknown-task", "--json"]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_INPUT");
  });
});
