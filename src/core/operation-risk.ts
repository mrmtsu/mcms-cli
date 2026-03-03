export type RiskLevel = "low" | "medium" | "high";

export type OperationConfirmation = {
  requiresConfirmation: boolean;
  riskLevel: RiskLevel;
  confirmationReason: string | null;
};

type OperationPolicy = {
  requiresConfirmation: boolean;
  riskLevel: RiskLevel;
  reason?: string;
};

const DEFAULT_POLICY: OperationPolicy = {
  requiresConfirmation: false,
  riskLevel: "low",
};

const OPERATION_POLICIES: Record<string, OperationPolicy> = {
  "content.create": {
    requiresConfirmation: false,
    riskLevel: "low",
  },
  "content.update": {
    requiresConfirmation: false,
    riskLevel: "medium",
  },
  "content.delete": {
    requiresConfirmation: true,
    riskLevel: "high",
    reason: "Deletes content and recovery depends on backups or export data.",
  },
  "content.import": {
    requiresConfirmation: true,
    riskLevel: "high",
    reason: "Writes many records and may overwrite existing content when --upsert is used.",
  },
  "content.bulk": {
    requiresConfirmation: true,
    riskLevel: "high",
    reason: "Runs multiple write operations and may leave partial state when failures occur.",
  },
  "content.status.set": {
    requiresConfirmation: true,
    riskLevel: "medium",
    reason: "Changes published/draft state and can affect public visibility immediately.",
  },
  "content.created-by.set": {
    requiresConfirmation: true,
    riskLevel: "medium",
    reason: "Changes creator metadata and affects audit trails.",
  },
  "media.upload": {
    requiresConfirmation: false,
    riskLevel: "low",
  },
  "media.delete": {
    requiresConfirmation: true,
    riskLevel: "high",
    reason: "Deletes media assets and referenced files may be hard to recover.",
  },
};

export function getOperationConfirmation(operation: string): OperationConfirmation {
  const policy = OPERATION_POLICIES[operation] ?? DEFAULT_POLICY;
  return {
    requiresConfirmation: policy.requiresConfirmation,
    riskLevel: policy.riskLevel,
    confirmationReason: policy.reason ?? null,
  };
}

export function withOperationConfirmation<T extends Record<string, unknown>>(
  operation: string,
  data: T,
): T & OperationConfirmation {
  return {
    ...data,
    ...getOperationConfirmation(operation),
  };
}
