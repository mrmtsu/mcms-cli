import { getOperationConfirmation, type RiskLevel } from "./operation-risk.js";

type TaskStepTemplate = {
  title: string;
  command: string;
  operation?: string;
  note?: string;
};

type TaskTemplate = {
  id: string;
  title: string;
  summary: string;
  aliases: string[];
  steps: TaskStepTemplate[];
};

export type TaskCatalogItem = {
  id: string;
  title: string;
  summary: string;
  aliases: string[];
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
};

export type SuggestedTask = TaskCatalogItem & {
  score: number;
  stepsPreview: string[];
  guideCommand: string;
};

export type TaskGuideStep = {
  index: number;
  title: string;
  command: string;
  operation: string | null;
  requiresConfirmation: boolean;
  riskLevel: RiskLevel;
  confirmationReason: string | null;
  note: string | null;
};

export type TaskGuide = {
  id: string;
  title: string;
  summary: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  steps: TaskGuideStep[];
};

const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "content-create",
    title: "Create Content Safely",
    summary: "Validate payload and create a new content item with dry-run first.",
    aliases: ["create", "new-content", "add-content"],
    steps: [
      {
        title: "Validate payload shape against endpoint schema",
        command: "microcms validate <endpoint> --file <payload.json> --json",
      },
      {
        title: "Dry-run create request",
        command: "microcms content create <endpoint> --file <payload.json> --dry-run --json",
        operation: "content.create",
      },
      {
        title: "Create content",
        command: "microcms content create <endpoint> --file <payload.json> --json",
        operation: "content.create",
      },
    ],
  },
  {
    id: "content-update",
    title: "Update Content Safely",
    summary: "Validate and update an existing item while preserving dry-run safety checks.",
    aliases: ["update", "edit-content", "patch-content"],
    steps: [
      {
        title: "Validate payload shape against endpoint schema",
        command: "microcms validate <endpoint> --file <payload.json> --json",
      },
      {
        title: "Dry-run update request",
        command: "microcms content update <endpoint> <id> --file <payload.json> --dry-run --json",
        operation: "content.update",
      },
      {
        title: "Update content",
        command: "microcms content update <endpoint> <id> --file <payload.json> --json",
        operation: "content.update",
      },
    ],
  },
  {
    id: "content-delete",
    title: "Delete Content with Guardrails",
    summary: "Precheck target content, then dry-run and confirm before delete.",
    aliases: ["delete", "remove-content", "destroy-content"],
    steps: [
      {
        title: "Read current content before deletion",
        command: "microcms content get <endpoint> <id> --json",
      },
      {
        title: "Dry-run delete request",
        command: "microcms content delete <endpoint> <id> --dry-run --json",
        operation: "content.delete",
      },
      {
        title: "Delete content",
        command: "microcms content delete <endpoint> <id> --json",
        operation: "content.delete",
      },
    ],
  },
  {
    id: "content-import",
    title: "Bulk Import Content",
    summary: "Run strict dry-run validation before importing multiple records.",
    aliases: ["import", "seed-content", "load-data"],
    steps: [
      {
        title: "Optional backup before write",
        command: "microcms content export <endpoint> --out backup/<endpoint>.json --json",
      },
      {
        title: "Dry-run import with strict warnings",
        command:
          "microcms content import <endpoint> --file <contents.json> --dry-run --strict-warnings --json",
        operation: "content.import",
      },
      {
        title: "Execute import",
        command: "microcms content import <endpoint> --file <contents.json> --json",
        operation: "content.import",
        note: "Add --upsert only when update-by-id behavior is required.",
      },
    ],
  },
  {
    id: "content-bulk",
    title: "Execute Bulk Operations",
    summary: "Validate operation file and execute create/update/delete/status actions safely.",
    aliases: ["bulk", "migration", "batch-write"],
    steps: [
      {
        title: "Validate operation file and payloads",
        command:
          "microcms content bulk --file <operations.json> --dry-run --validate-payload --strict-warnings --json",
        operation: "content.bulk",
      },
      {
        title: "Execute bulk operations with stop-on-error",
        command: "microcms content bulk --file <operations.json> --stop-on-error --json",
        operation: "content.bulk",
      },
    ],
  },
  {
    id: "content-status-set",
    title: "Change Content Status",
    summary: "Review metadata and change published/draft status with confirmation.",
    aliases: ["status", "publish", "unpublish"],
    steps: [
      {
        title: "Check current metadata",
        command: "microcms content meta get <endpoint> <id> --json",
      },
      {
        title: "Dry-run status change",
        command:
          "microcms content status set <endpoint> <id> --status <PUBLISH|DRAFT> --dry-run --json",
        operation: "content.status.set",
      },
      {
        title: "Apply status change",
        command: "microcms content status set <endpoint> <id> --status <PUBLISH|DRAFT> --json",
        operation: "content.status.set",
      },
    ],
  },
  {
    id: "content-created-by-set",
    title: "Change Content Creator",
    summary: "Safely update createdBy metadata in Management API.",
    aliases: ["created-by", "creator", "audit-owner"],
    steps: [
      {
        title: "Dry-run creator update",
        command:
          "microcms content created-by set <endpoint> <id> --member <memberId> --dry-run --json",
        operation: "content.created-by.set",
      },
      {
        title: "Apply creator update",
        command: "microcms content created-by set <endpoint> <id> --member <memberId> --json",
        operation: "content.created-by.set",
      },
    ],
  },
  {
    id: "media-upload",
    title: "Upload Media",
    summary: "Verify local file before uploading media assets.",
    aliases: ["upload-media", "asset-upload", "upload"],
    steps: [
      {
        title: "Dry-run upload request",
        command: "microcms media upload <path> --dry-run --json",
        operation: "media.upload",
      },
      {
        title: "Upload media",
        command: "microcms media upload <path> --json",
        operation: "media.upload",
      },
    ],
  },
  {
    id: "media-delete",
    title: "Delete Media",
    summary: "Validate target URL and confirm before deleting media assets.",
    aliases: ["delete-media", "remove-media", "asset-delete"],
    steps: [
      {
        title: "Optional lookup to confirm target asset",
        command: "microcms media list --file-name <keyword> --json",
      },
      {
        title: "Dry-run media delete",
        command: "microcms media delete --url <media-url> --dry-run --json",
        operation: "media.delete",
      },
      {
        title: "Delete media",
        command: "microcms media delete --url <media-url> --json",
        operation: "media.delete",
      },
    ],
  },
];

export function listTaskCatalog(): TaskCatalogItem[] {
  return TASK_TEMPLATES.map((template) => {
    const risk = deriveTaskRisk(template);
    return {
      id: template.id,
      title: template.title,
      summary: template.summary,
      aliases: template.aliases,
      riskLevel: risk.riskLevel,
      requiresConfirmation: risk.requiresConfirmation,
    };
  });
}

export function suggestTasks(query: string | undefined, limit: number): SuggestedTask[] {
  const max = Math.max(1, limit);
  const normalized = normalize(query);

  if (normalized.length === 0) {
    return listTaskCatalog()
      .slice(0, max)
      .map((item) => toSuggestedTask(item, 1));
  }

  const tokens = tokenize(normalized);
  const scored = TASK_TEMPLATES.map((template) => ({
    template,
    score: scoreTemplate(template, normalized, tokens),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.template.id.localeCompare(b.template.id);
    })
    .slice(0, max);

  return scored.map(({ template, score }) => {
    const item = toCatalogItem(template);
    return toSuggestedTask(item, score);
  });
}

export function buildTaskGuide(taskIdOrAlias: string): TaskGuide | null {
  const template = resolveTaskTemplate(taskIdOrAlias);
  if (!template) {
    return null;
  }

  const steps: TaskGuideStep[] = template.steps.map((step, index) => {
    const confirmation = step.operation
      ? getOperationConfirmation(step.operation)
      : {
          requiresConfirmation: false,
          riskLevel: "low" as const,
          confirmationReason: null,
        };

    return {
      index: index + 1,
      title: step.title,
      command: step.command,
      operation: step.operation ?? null,
      requiresConfirmation: confirmation.requiresConfirmation,
      riskLevel: confirmation.riskLevel,
      confirmationReason: confirmation.confirmationReason,
      note: step.note ?? null,
    };
  });

  return {
    id: template.id,
    title: template.title,
    summary: template.summary,
    riskLevel: highestRiskLevel(steps.map((step) => step.riskLevel)),
    requiresConfirmation: steps.some((step) => step.requiresConfirmation),
    steps,
  };
}

export function renderTaskGuideMarkdown(guide: TaskGuide): string {
  const lines: string[] = [];
  lines.push(`# ${guide.title}`);
  lines.push("");
  lines.push(`Task ID: \`${guide.id}\``);
  lines.push(`Risk: \`${guide.riskLevel}\``);
  lines.push(`Requires Confirmation: \`${guide.requiresConfirmation ? "yes" : "no"}\``);
  lines.push("");
  lines.push(guide.summary);
  lines.push("");
  lines.push("## Steps");
  lines.push("");

  for (const step of guide.steps) {
    lines.push(`${step.index}. ${step.title}`);
    lines.push(`   - Command: \`${step.command}\``);
    lines.push(`   - Risk: \`${step.riskLevel}\``);
    lines.push(`   - Requires confirmation: \`${step.requiresConfirmation ? "yes" : "no"}\``);
    if (step.confirmationReason) {
      lines.push(`   - Reason: ${step.confirmationReason}`);
    }
    if (step.note) {
      lines.push(`   - Note: ${step.note}`);
    }
  }

  return lines.join("\n");
}

function resolveTaskTemplate(taskIdOrAlias: string): TaskTemplate | null {
  const key = normalize(taskIdOrAlias);
  if (key.length === 0) {
    return null;
  }

  for (const template of TASK_TEMPLATES) {
    if (normalize(template.id) === key) {
      return template;
    }

    if (template.aliases.some((alias) => normalize(alias) === key)) {
      return template;
    }
  }

  return null;
}

function toCatalogItem(template: TaskTemplate): TaskCatalogItem {
  const risk = deriveTaskRisk(template);
  return {
    id: template.id,
    title: template.title,
    summary: template.summary,
    aliases: template.aliases,
    riskLevel: risk.riskLevel,
    requiresConfirmation: risk.requiresConfirmation,
  };
}

function toSuggestedTask(item: TaskCatalogItem, score: number): SuggestedTask {
  const guide = buildTaskGuide(item.id);
  const preview = guide ? guide.steps.slice(0, 3).map((step) => step.command) : [];
  return {
    ...item,
    score,
    stepsPreview: preview,
    guideCommand: `microcms task guide ${item.id} --json`,
  };
}

function deriveTaskRisk(template: TaskTemplate): {
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
} {
  const levels: RiskLevel[] = [];
  let requiresConfirmation = false;

  for (const step of template.steps) {
    if (!step.operation) {
      continue;
    }

    const confirmation = getOperationConfirmation(step.operation);
    levels.push(confirmation.riskLevel);
    if (confirmation.requiresConfirmation) {
      requiresConfirmation = true;
    }
  }

  return {
    riskLevel: highestRiskLevel(levels),
    requiresConfirmation,
  };
}

function highestRiskLevel(levels: RiskLevel[]): RiskLevel {
  if (levels.includes("high")) {
    return "high";
  }
  if (levels.includes("medium")) {
    return "medium";
  }
  return "low";
}

function scoreTemplate(template: TaskTemplate, query: string, tokens: string[]): number {
  const normalizedId = normalize(template.id);
  const normalizedAliases = template.aliases.map((alias) => normalize(alias));
  const haystack = [
    normalizedId,
    normalize(template.title),
    normalize(template.summary),
    ...normalizedAliases,
  ].join("\n");

  let score = 0;
  if (normalizedId === query) {
    score += 30;
  }
  if (normalizedAliases.includes(query)) {
    score += 24;
  }
  if (haystack.includes(query)) {
    score += 12;
  }

  for (const token of tokens) {
    if (token.length < 2) {
      continue;
    }

    if (normalizedId.includes(token)) {
      score += 5;
    } else if (normalizedAliases.some((alias) => alias.includes(token))) {
      score += 4;
    } else if (haystack.includes(token)) {
      score += 2;
    }
  }

  return score;
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().normalize("NFKC");
}

function tokenize(value: string): string[] {
  return value
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}
