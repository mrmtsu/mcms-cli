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
};

export type CliSpec = {
  name: string;
  version: string;
  jsonContractVersion: string;
  globalOptions: GlobalOptionSpec[];
  exitCodes: Record<string, number>;
  commands: CommandSpec[];
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
  };
}

function resolveVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as PackageJson;
    if (typeof pkg.version === "string" && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch {
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
  { path: "api list", description: "list APIs", args: [], options: [], readOnly: true },
  {
    path: "api info",
    description: "show API details",
    args: ["<endpoint>"],
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
    path: "schema pull",
    description: "fetch API schema metadata and save to file",
    args: [],
    options: ["--out <path>", "--endpoints <list>"],
    readOnly: true,
  },
  {
    path: "types generate",
    description: "generate declaration file from schema bundle",
    args: [],
    options: ["--schema <path>", "--out <path>"],
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
  },
  {
    path: "search",
    description: "search docs/spec for agent-friendly references",
    args: ["<query>"],
    options: ["--source <source>", "--scope <scope>", "--category <name>", "--limit <n>"],
    readOnly: true,
  },
  {
    path: "spec",
    description: "output machine-readable CLI spec",
    args: [],
    options: [],
    readOnly: true,
  },
];
