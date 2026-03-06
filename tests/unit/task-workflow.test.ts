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

  it("builds markdown guide with risk/confirmation details", () => {
    const guide = buildTaskGuide("content-delete");
    expect(guide).not.toBeNull();
    expect(guide?.requiresConfirmation).toBe(true);
    expect(guide?.steps.some((step) => step.operation === "content.delete")).toBe(true);

    const markdown = renderTaskGuideMarkdown(guide!);
    expect(markdown).toContain("# Delete Content with Guardrails");
    expect(markdown).toContain("Requires confirmation");
  });
});
