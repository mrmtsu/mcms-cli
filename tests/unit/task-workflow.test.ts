import { describe, expect, it } from "vitest";
import {
  buildTaskGuide,
  listTaskCatalog,
  renderTaskGuideMarkdown,
  suggestTasks,
} from "../../src/core/task-workflow.js";

describe("task workflow core", () => {
  it("includes confirmation metadata in task catalog", () => {
    const catalog = listTaskCatalog();
    const deletion = catalog.find((task) => task.id === "content-delete");
    expect(deletion).toBeTruthy();
    expect(deletion?.requiresConfirmation).toBe(true);
    expect(deletion?.riskLevel).toBe("high");
  });

  it("suggests delete workflow from query", () => {
    const suggestions = suggestTasks("delete", 5);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].id).toBe("content-delete");
    expect(suggestions[0].stepsPreview.join("\n")).toContain("--dry-run");
  });

  it("suggests schema export workflow from query", () => {
    const suggestions = suggestTasks("schema export", 5);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].id).toBe("api-schema-export");
    expect(suggestions[0].stepsPreview.join("\n")).toContain("api schema export");
  });

  it("builds markdown guide with risk/confirmation details", () => {
    const guide = buildTaskGuide("content-delete");
    expect(guide).not.toBeNull();
    expect(guide?.requiresConfirmation).toBe(true);
    expect(guide?.steps.some((step) => step.operation === "content.delete")).toBe(true);

    const markdown = renderTaskGuideMarkdown(guide!);
    expect(markdown).toContain("# Delete Content with Guardrails");
    expect(markdown).toContain("Requires confirmation");
  });

  it("builds docs-first schema guidance tasks", () => {
    const guide = buildTaskGuide("api-schema-import-compat");
    expect(guide).not.toBeNull();
    expect(guide?.riskLevel).toBe("low");
    expect(guide?.steps[0].command).toContain("docs get");
    expect(guide?.steps[1].command).toContain("schema pull --format api-export");
  });
});
