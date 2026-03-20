import { createRequire } from "node:module";
import { EXIT_CODE } from "./exit-codes.js";

export type GlobalOptionSpec = {
  name: string;
  description: string;
};

export type CommandSpec = {
  path: string;
  description: string;
  args: string[];
  options: string[];
  readOnly: boolean;
  relatedCommands?: string[];
};

export type DiscoveryHintSpec = {
  intent: string;
  commands: string[];
  note?: string;
};

export type CliSpec = {
  name: string;
  version: string;
  jsonContractVersion: string;
  globalOptions: GlobalOptionSpec[];
  exitCodes: Record<string, number>;
  commands: CommandSpec[];
  discoveryHints: DiscoveryHintSpec[];
};

type PackageJson = {
  version?: unknown;
};

const DEFAULT_VERSION = "0.1.0";

export function getCliSpec(): CliSpec {
  return {
    name: "microcms",
    version: resolveVersion(),
    jsonContractVersion: "0.x",
    globalOptions: GLOBAL_OPTIONS,
    exitCodes: {
      SUCCESS: EXIT_CODE.SUCCESS,
      UNKNOWN: EXIT_CODE.UNKNOWN,
      INVALID_INPUT: EXIT_CODE.INVALID_INPUT,
      AUTH: EXIT_CODE.AUTH,
      PERMISSION: EXIT_CODE.PERMISSION,
      NETWORK: EXIT_CODE.NETWORK,
      CONFLICT: EXIT_CODE.CONFLICT,
    },
    commands: COMMANDS,
    discoveryHints: DISCOVERY_HINTS,
  };
}

function resolveVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as PackageJson;
    if (typeof pkg.version === "string" && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch (error) {
    if (process.argv.includes("--verbose")) {
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[spec] failed to resolve version from package.json: ${detail}\n`);
    }
    // fallback for non-standard runtime layouts
  }

  return DEFAULT_VERSION;
}

const GLOBAL_OPTIONS: GlobalOptionSpec[] = [
  { name: "--json", description: "machine-readable JSON output" },
  { name: "--plain", description: "human output mode (line-oriented)" },
  { name: "--table", description: "human output mode (table)" },
  { name: "--select <fields>", description: "comma-separated field names for --table output" },
  {
    name: "--profile <name>",
    description: "profile name to resolve service domain / keychain key",
  },
  { name: "--service-domain <serviceDomain>", description: "microCMS service domain" },
  { name: "--api-key <apiKey>", description: "microCMS API key (less secure)" },
  { name: "--api-key-stdin", description: "read microCMS API key from stdin" },
  { name: "--timeout <ms>", description: "request timeout in milliseconds (default: 10000)" },
  { name: "--retry <count>", description: "retry count for retryable failures (default: 2)" },
  {
    name: "--retry-max-delay <ms>",
    description: "max retry delay in milliseconds (default: 3000)",
  },
  { name: "--verbose", description: "verbose error output" },
  { name: "--no-color", description: "disable colorized output" },
];

const DISCOVERY_HINTS: DiscoveryHintSpec[] = [
  {
    intent: "Read official docs through the CLI entrypoint",
    commands: [
      'microcms search "api schema" --scope all --json',
      'microcms docs get --category management-api --file "APIスキーマ取得API（フィールド定義やカスタムフィールド）.md" --json',
      "microcms spec --json",
    ],
    note: "Prefer docs/search/spec before leaving the CLI surface.",
  },
  {
    intent: "Inspect or export one endpoint schema",
    commands: [
      "microcms api schema inspect <endpoint> --json",
      "microcms api schema export <endpoint> --out <endpoint>-api-schema.json --json",
      "microcms schema pull --format api-export --endpoints <endpoint> --out <endpoint>-api-schema.json --json",
    ],
    note: "`schema pull` remains canonical; `api schema export` is the discoverability alias.",
  },
  {
    intent: "Validate then write content safely",
    commands: [
      "microcms schema pull --out microcms-schema.json --json",
      "microcms validate <endpoint> --file <payload.json> --json",
      "microcms content create <endpoint> --file <payload.json> --dry-run --json",
    ],
  },
];

const COMMANDS: CommandSpec[] = [
  {
    path: "auth login",
    description: "save API key in keychain (OAuth is not supported in MVP)",
    args: [],
    options: [
      "--profile <name>",
      "--service-domain <serviceDomain>",
      "--api-key <apiKey>",
      "--api-key-stdin",
      "--prompt",
    ],
    readOnly: false,
  },
  {
    path: "auth status",
    description: "show auth resolution status",
    args: [],
    options: [],
    readOnly: true,
  },
  {
    path: "auth profile list",
    description: "list configured profiles",
    args: [],
    options: [],
    readOnly: true,
  },
  {
    path: "auth profile add",
    description: "add or update a profile",
    args: ["<name>"],
    options: ["--service-domain <serviceDomain>", "--set-default"],
    readOnly: false,
  },
  {
    path: "auth profile use",
    description: "set default profile",
    args: ["<name>"],
    options: [],
    readOnly: false,
  },
  {
    path: "auth profile remove",
    description: "remove profile from config",
    args: ["<name>"],
    options: [],
    readOnly: false,
  },
  {
    path: "api list",
    description: "list APIs",
    args: [],
    options: [],
    readOnly: true,
    relatedCommands: ["api info", "api schema export", "schema pull"],
  },
  {
    path: "api info",
    description: "show API details for one-off inspection",
    args: ["<endpoint>"],
    options: [],
    readOnly: true,
    relatedCommands: ["api schema inspect", "api schema export", "schema pull"],
  },
  {
    path: "api schema inspect",
    description: "alias of api info for schema discovery",
    args: ["<endpoint>"],
    options: [],
    readOnly: true,
    relatedCommands: ["api info", "api schema export", "schema pull"],
  },
  {
    path: "api schema export",
    description: "export a single endpoint schema in API import-compatible shape",
    args: ["<endpoint>"],
    options: ["--out <path>"],
    readOnly: true,
    relatedCommands: ["schema pull", "api schema inspect", "docs get"],
  },
  {
    path: "member get",
    description: "get member details by id",
    args: ["<memberId>"],
    options: [],
    readOnly: true,
  },
  {
    path: "config doctor",
    description: "show resolved auth/config sources and common risks",
    args: [],
    options: [],
    readOnly: true,
  },
  {
    path: "completion install",
    description: "install completion script for your shell",
    args: ["[shell]"],
    options: [],
    readOnly: false,
  },
  {
    path: "completion uninstall",
    description: "remove installed completion scripts",
    args: [],
    options: [],
    readOnly: false,
  },
  {
    path: "completion endpoints",
    description: "print endpoint candidates for shell completion",
    args: [],
    options: [],
    readOnly: true,
  },
  {
    path: "content list",
    description: "list content",
    args: ["<endpoint>"],
    options: [
      "--limit <limit>",
      "--offset <offset>",
      "--orders <orders>",
      "--q <q>",
      "--filters <filters>",
      "--fields <fields>",
      "--ids <ids>",
      "--depth <depth>",
      "--draft-key <draftKey>",
      "--all",
    ],
    readOnly: true,
  },
  {
    path: "content get",
    description: "get content by id",
    args: ["<endpoint>", "<id>"],
    options: ["--draft-key <draftKey>"],
    readOnly: true,
  },
  {
    path: "content pull",
    description: "pull content into managed-json files for file-based content workflows",
    args: ["[endpoint]"],
    options: ["--out <dir>", "--all", "--id <id>", "--ids <ids>", "--format <format>"],
    readOnly: true,
  },
  {
    path: "content verify",
    description: "verify managed-json files with validate and dry-run style checks",
    args: ["[endpoint]"],
    options: [
      "--dir <dir>",
      "--id <id>",
      "--ids <ids>",
      "--endpoints <endpoints>",
      "--only-changed",
    ],
    readOnly: true,
  },
  {
    path: "content push",
    description: "verify and optionally execute managed-json changes against microCMS",
    args: ["[endpoint]"],
    options: [
      "--dir <dir>",
      "--id <id>",
      "--ids <ids>",
      "--endpoints <endpoints>",
      "--only-changed",
      "--execute",
      "--force",
    ],
    readOnly: false,
  },
  {
    path: "content sync-status",
    description: "compare managed-json state with remote content state",
    args: ["[endpoint]"],
    options: ["--dir <dir>", "--id <id>", "--ids <ids>", "--endpoints <endpoints>"],
    readOnly: true,
  },
  {
    path: "content create",
    description: "create content",
    args: ["<endpoint>"],
    options: ["--file <path>", "--dry-run"],
    readOnly: false,
  },
  {
    path: "content update",
    description: "update content",
    args: ["<endpoint>", "<id>"],
    options: ["--file <path>", "--dry-run"],
    readOnly: false,
  },
  {
    path: "content delete",
    description: "delete content",
    args: ["<endpoint>", "<id>"],
    options: ["--dry-run"],
    readOnly: false,
  },
  {
    path: "content export",
    description: "export content in JSON/CSV format",
    args: ["[endpoint]"],
    options: ["--out <path>", "--all", "--format <format>"],
    readOnly: true,
  },
  {
    path: "content import",
    description: "import content from JSON file",
    args: ["<endpoint>"],
    options: ["--file <path>", "--dry-run", "--upsert", "--interval <ms>", "--strict-warnings"],
    readOnly: false,
  },
  {
    path: "content diff",
    description: "show field-level differences between published and draft content",
    args: ["<endpoint>", "<id>"],
    options: ["--draft-key <draftKey>"],
    readOnly: true,
  },
  {
    path: "content bulk",
    description: "execute bulk content operations from definition file",
    args: [],
    options: [
      "--file <path>",
      "--dry-run",
      "--interval <ms>",
      "--continue-on-error",
      "--stop-on-error",
      "--validate-payload",
      "--strict-warnings",
    ],
    readOnly: false,
  },
  {
    path: "content meta list",
    description: "list content metadata from management API",
    args: ["<endpoint>"],
    options: ["--limit <limit>", "--offset <offset>"],
    readOnly: true,
  },
  {
    path: "content meta get",
    description: "get content metadata by id from management API",
    args: ["<endpoint>", "<id>"],
    options: [],
    readOnly: true,
  },
  {
    path: "content status set",
    description: "set content status via management API",
    args: ["<endpoint>", "<id>"],
    options: ["--status <status>", "--dry-run"],
    readOnly: false,
  },
  {
    path: "content created-by set",
    description: "set content creator via management API",
    args: ["<endpoint>", "<id>"],
    options: ["--member <memberId>", "--dry-run"],
    readOnly: false,
  },
  {
    path: "media list",
    description: "list media",
    args: [],
    options: ["--limit <limit>", "--image-only", "--file-name <fileName>", "--token <token>"],
    readOnly: true,
  },
  {
    path: "media upload",
    description: "upload media",
    args: ["<path>"],
    options: ["--dry-run"],
    readOnly: false,
  },
  {
    path: "media delete",
    description: "delete media by url",
    args: [],
    options: ["--url <url>", "--dry-run"],
    readOnly: false,
  },
  {
    path: "schema pull",
    description: "fetch API schema metadata and save to file (canonical schema export entrypoint)",
    args: [],
    options: ["--out <path>", "--endpoints <list>", "--format <format>", "--include-extensions"],
    readOnly: true,
    relatedCommands: ["api schema export", "api schema inspect", "schema diff"],
  },
  {
    path: "schema diff",
    description: "detect schema differences from baseline file",
    args: [],
    options: ["--baseline <path>", "--exit-code"],
    readOnly: true,
  },
  {
    path: "types generate",
    description: "generate declaration file from schema bundle",
    args: [],
    options: ["--schema <path>", "--out <path>", "--endpoints <list>"],
    readOnly: true,
  },
  {
    path: "types sync",
    description: "fetch schema and generate declaration file in one command",
    args: [],
    options: ["--out <path>", "--schema-out <path>", "--endpoints <list>"],
    readOnly: true,
  },
  {
    path: "validate",
    description: "run lightweight payload precheck before create/update",
    args: ["<endpoint>"],
    options: ["--file <path>", "--strict-warnings"],
    readOnly: true,
  },
  {
    path: "docs list",
    description: "list official documentation metadata",
    args: [],
    options: ["--source <source>", "--category <name>", "--limit <n>"],
    readOnly: true,
  },
  {
    path: "docs get",
    description: "get official documentation markdown",
    args: [],
    options: ["--category <name>", "--file <filename>", "--max-chars <n>", "--source <source>"],
    readOnly: true,
    relatedCommands: ["search", "spec", "task guide"],
  },
  {
    path: "search",
    description:
      "search command/spec references and official doc titles (use docs get for full markdown)",
    args: ["<query>"],
    options: ["--source <source>", "--scope <scope>", "--category <name>", "--limit <n>"],
    readOnly: true,
    relatedCommands: ["docs get", "spec", "task suggest"],
  },
  {
    path: "task list",
    description: "list built-in task workflow ids",
    args: [],
    options: [],
    readOnly: true,
    relatedCommands: ["task suggest", "task guide", "search"],
  },
  {
    path: "task suggest",
    description: "suggest safe command sequences from task intent",
    args: ["[query]"],
    options: ["--limit <n>"],
    readOnly: true,
    relatedCommands: ["task guide", "search", "spec"],
  },
  {
    path: "task guide",
    description: "print a task-focused runbook in markdown",
    args: ["<taskId>"],
    options: [],
    readOnly: true,
    relatedCommands: ["task suggest", "search", "docs get"],
  },
  {
    path: "spec",
    description: "output machine-readable CLI spec",
    args: [],
    options: [],
    readOnly: true,
    relatedCommands: ["search", "task suggest", "docs get"],
  },
];
