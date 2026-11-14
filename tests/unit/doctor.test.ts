import { describe, expect, it } from "vitest";
import {
  collectDoctorFieldIds,
  parseDoctorRules,
  runDoctorChecks,
  type DoctorFinding,
} from "../../src/core/doctor.js";
import type { ApiFieldRecord } from "../../src/core/api-field-utils.js";

const NOW = new Date("2026-11-14T00:00:00.000Z");

function byCheck(findings: DoctorFinding[], check: string): DoctorFinding | undefined {
  return findings.find((finding) => finding.check === check);
}

describe("doctor checks", () => {
  it("flags empty required fields but not 0 or false", () => {
    const fields: ApiFieldRecord[] = [
      { fieldId: "title", kind: "text", required: true },
      { fieldId: "count", kind: "number", required: true },
      { fieldId: "flag", kind: "boolean", required: true },
    ];
    const findings = runDoctorChecks({
      fields,
      records: [
        { id: "a", title: "", count: 0, flag: false },
        { id: "b", title: "ok", count: 1, flag: true },
        { id: "c", title: null, count: 2, flag: true },
      ],
      now: NOW,
    });
    const finding = byCheck(findings, "required-empty");
    expect(finding?.count).toBe(2);
    expect(finding?.examples.map((example) => example.id)).toEqual(["a", "c"]);
  });

  it("flags select values outside the schema options (scalar and array forms)", () => {
    const fields: ApiFieldRecord[] = [
      {
        fieldId: "status",
        kind: "select",
        selectItems: [
          { id: "draft", value: "draft" },
          { id: "done", value: "done" },
        ],
      },
    ];
    const findings = runDoctorChecks({
      fields,
      records: [
        { id: "a", status: ["draft"] },
        { id: "b", status: ["review"] },
        { id: "c", status: "done" },
        { id: "d", status: [] },
      ],
      now: NOW,
    });
    const finding = byCheck(findings, "select-invalid");
    expect(finding?.severity).toBe("error");
    expect(finding?.count).toBe(1);
    expect(finding?.examples[0]?.id).toBe("b");
  });

  it("flags relation values pointing at missing contents", () => {
    const fields: ApiFieldRecord[] = [
      { fieldId: "feature", kind: "relation", referencedApiEndpoint: "features", required: true },
    ];
    const findings = runDoctorChecks({
      fields,
      records: [
        { id: "a", feature: { id: "f1" } },
        { id: "b", feature: { id: "missing" } },
        { id: "c", feature: [{ id: "f2" }, { id: "gone" }] },
      ],
      relationTargets: new Map([["features", new Set(["f1", "f2"])]]),
      now: NOW,
    });
    const finding = byCheck(findings, "relation-broken");
    expect(finding?.count).toBe(2);
    expect(finding?.examples.map((example) => example.id)).toEqual(["b", "c"]);
  });

  it("flags duplicate values for schema isUnique fields", () => {
    const fields: ApiFieldRecord[] = [{ fieldId: "key", kind: "text", isUnique: true }];
    const findings = runDoctorChecks({
      fields,
      records: [
        { id: "a", key: "k1" },
        { id: "b", key: "k2" },
        { id: "c", key: "k1" },
        { id: "d", key: "" },
        { id: "e", key: "" },
      ],
      now: NOW,
    });
    const finding = byCheck(findings, "unique-duplicate");
    expect(finding?.count).toBe(1);
    expect(finding?.examples[0]?.id).toBe("c");
  });

  it("applies rules: requireFields, unique and stale", () => {
    const findings = runDoctorChecks({
      fields: [
        { fieldId: "status", kind: "select", selectItems: [{ id: "draft" }, { id: "sent" }] },
      ],
      records: [
        {
          id: "a",
          status: ["draft"],
          summary: "",
          ref: "x",
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-13T00:00:00.000Z",
        },
        {
          id: "b",
          status: ["draft"],
          summary: "ok",
          ref: "x",
          createdAt: "2026-11-10T00:00:00.000Z",
          updatedAt: "2026-11-13T00:00:00.000Z",
        },
        {
          id: "c",
          status: ["sent"],
          summary: "ok",
          ref: "y",
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      ],
      rules: {
        requireFields: ["summary"],
        unique: ["ref"],
        stale: [{ field: "status", equals: "draft", days: 7, since: "createdAt" }],
      },
      now: NOW,
    });
    expect(byCheck(findings, "rule-required-empty")?.examples.map((e) => e.id)).toEqual(["a"]);
    expect(byCheck(findings, "unique-duplicate")?.examples.map((e) => e.id)).toEqual(["b"]);
    expect(byCheck(findings, "stale")?.examples.map((e) => e.id)).toEqual(["a"]);
  });

  it("flags orphan contents only when incoming relations exist", () => {
    const base = {
      fields: [] as ApiFieldRecord[],
      records: [{ id: "f1" }, { id: "f2" }],
      now: NOW,
    };
    const withoutIncoming = runDoctorChecks({
      ...base,
      hasIncomingRelations: false,
      referencedIds: new Set(),
    });
    expect(byCheck(withoutIncoming, "orphan")).toBeUndefined();

    const withIncoming = runDoctorChecks({
      ...base,
      hasIncomingRelations: true,
      referencedIds: new Set(["f1"]),
    });
    const orphan = byCheck(withIncoming, "orphan");
    expect(orphan?.severity).toBe("info");
    expect(orphan?.examples.map((e) => e.id)).toEqual(["f2"]);
  });

  it("collects scoped field ids with relation fields as <field>.id", () => {
    const fields: ApiFieldRecord[] = [
      { fieldId: "title", kind: "text", required: true },
      { fieldId: "memo", kind: "text" },
      { fieldId: "feature", kind: "relation", referencedApiEndpoint: "features" },
    ];
    const ids = collectDoctorFieldIds(fields, { requireFields: ["memo"] });
    expect(ids).toContain("title");
    expect(ids).toContain("memo");
    expect(ids).toContain("feature.id");
    expect(ids).not.toContain("feature");
  });
});

describe("parseDoctorRules", () => {
  it("parses a valid rules object", () => {
    const rules = parseDoctorRules({
      endpoints: {
        feedback: {
          requireFields: ["summary"],
          stale: [{ field: "status", equals: "draft", days: 7 }],
        },
      },
    });
    expect(rules.endpoints.feedback?.requireFields).toEqual(["summary"]);
    expect(rules.endpoints.feedback?.stale?.[0]?.days).toBe(7);
  });

  it("rejects invalid shapes", () => {
    expect(() => parseDoctorRules("nope")).toThrow();
    expect(() => parseDoctorRules({ endpoints: { a: { requireFields: "x" } } })).toThrow();
    expect(() =>
      parseDoctorRules({ endpoints: { a: { stale: [{ field: "s", equals: "x", days: -1 }] } } }),
    ).toThrow();
  });
});
