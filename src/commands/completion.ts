import { lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { listApis } from "../core/client.js";
import { CliError, normalizeError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { printSuccess } from "../core/output.js";
import { extractApiEndpoints } from "../core/schema.js";
import { contextFromCommand, getActionCommand } from "./utils.js";

type SupportedShell = "bash" | "zsh" | "fish";

const SUPPORTED_SHELLS: SupportedShell[] = ["bash", "zsh", "fish"];
const GLOBAL_OPTIONS = [
  "--json",
  "--plain",
  "--table",
  "--select",
  "--profile",
  "--service-domain",
  "--api-key",
  "--api-key-stdin",
  "--timeout",
  "--retry",
  "--retry-max-delay",
  "--verbose",
  "--no-color",
];

export function registerCompletionCommands(program: Command): void {
  const completion = program.command("completion").description("Install shell completion scripts");

  completion
    .command("install")
    .argument("[shell]", "bash|zsh|fish")
    .description("Install completion script for your shell")
    .action(async (...actionArgs: unknown[]) => {
      const shellArg = actionArgs[0] as string | undefined;
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);
      const shell = parseShell(shellArg ?? detectShellFromEnv());
      const targetPath = getCompletionFilePath(shell);
      const script = buildCompletionScript(shell);
      await assertSafeCompletionTargetForWrite(targetPath);

      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, script, "utf8");

      printSuccess(ctx, {
        installed: true,
        shell,
        path: targetPath,
        reloadHint: getReloadHint(shell),
      });
    });

  completion
    .command("uninstall")
    .description("Remove installed completion scripts")
    .action(async (...actionArgs: unknown[]) => {
      const command = getActionCommand(actionArgs);
      const ctx = await contextFromCommand(command);

      const removed: string[] = [];
      for (const shell of SUPPORTED_SHELLS) {
        const path = getCompletionFilePath(shell);
        const state = await getPathState(path);
        if (state === "missing") {
          continue;
        }

        if (state === "symlink") {
          throw new CliError({
            code: "INVALID_INPUT",
            message: `Refusing to uninstall completion because target is a symbolic link: ${path}`,
            exitCode: EXIT_CODE.INVALID_INPUT,
          });
        }

        if (state !== "file") {
          throw new CliError({
            code: "INVALID_INPUT",
            message: `Refusing to uninstall completion because target is not a regular file: ${path}`,
            exitCode: EXIT_CODE.INVALID_INPUT,
          });
        }

        await rm(path, { force: true });
        removed.push(path);
      }

      printSuccess(ctx, {
        uninstalled: true,
        removed,
      });
    });

  completion
    .command("endpoints")
    .description("Print endpoint candidates for shell completion")
    .action(async (...actionArgs: unknown[]) => {
      const command = getActionCommand(actionArgs);

      try {
        const ctx = await contextFromCommand(command);
        const result = await listApis(ctx);
        const endpoints = extractApiEndpoints(result.data);
        if (endpoints.length > 0) {
          process.stdout.write(`${endpoints.join("\n")}\n`);
        }
      } catch (error) {
        const normalized = normalizeError(error);
        if (isExpectedCompletionFailure(normalized.code)) {
          return;
        }

        throw normalized;
      }
    });
}

function parseShell(value: string | undefined): SupportedShell {
  if (!value) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: "Shell is required: bash|zsh|fish",
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  const normalized = value.trim().toLowerCase();
  if (!SUPPORTED_SHELLS.includes(normalized as SupportedShell)) {
    throw new CliError({
      code: "INVALID_INPUT",
      message: `Unsupported shell: ${value}. Choose bash, zsh, or fish.`,
      exitCode: EXIT_CODE.INVALID_INPUT,
    });
  }

  return normalized as SupportedShell;
}

function detectShellFromEnv(): string | undefined {
  const shellPath = process.env.SHELL;
  if (!shellPath) {
    return undefined;
  }

  if (shellPath.endsWith("/bash")) {
    return "bash";
  }

  if (shellPath.endsWith("/zsh")) {
    return "zsh";
  }

  if (shellPath.endsWith("/fish")) {
    return "fish";
  }

  return undefined;
}

function getCompletionFilePath(shell: SupportedShell): string {
  switch (shell) {
    case "bash":
      return join(homedir(), ".local", "share", "bash-completion", "completions", "microcms");
    case "zsh":
      return join(homedir(), ".zfunc", "_microcms");
    case "fish":
      return join(homedir(), ".config", "fish", "completions", "microcms.fish");
  }
}

function getReloadHint(shell: SupportedShell): string {
  switch (shell) {
    case "bash":
      return "Open a new shell session, or run: source ~/.bashrc";
    case "zsh":
      return "Open a new shell session, or run: autoload -U compinit && compinit";
    case "fish":
      return "Open a new shell session, or run: source ~/.config/fish/config.fish";
  }
}

function isExpectedCompletionFailure(code: string): boolean {
  return (
    code === "AUTH_FAILED" ||
    code === "FORBIDDEN" ||
    code === "NETWORK_ERROR" ||
    code === "INVALID_INPUT"
  );
}

type PathState = "missing" | "file" | "symlink" | "other";

async function assertSafeCompletionTargetForWrite(path: string): Promise<void> {
  const state = await getPathState(path);
  if (state !== "symlink") {
    return;
  }

  throw new CliError({
    code: "INVALID_INPUT",
    message: `Refusing to write completion because target is a symbolic link: ${path}`,
    exitCode: EXIT_CODE.INVALID_INPUT,
  });
}

async function getPathState(path: string): Promise<PathState> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) {
      return "symlink";
    }

    if (entry.isFile()) {
      return "file";
    }

    return "other";
  } catch (error) {
    if (isNoEntryError(error)) {
      return "missing";
    }

    throw error;
  }
}

function isNoEntryError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
  );
}

function buildCompletionScript(shell: SupportedShell): string {
  switch (shell) {
    case "bash":
      return buildBashCompletionScript();
    case "zsh":
      return buildZshCompletionScript();
    case "fish":
      return buildFishCompletionScript();
  }
}

function buildBashCompletionScript(): string {
  const globals = GLOBAL_OPTIONS.join(" ");

  return `# microcms completion for bash
_microcms_endpoint_candidates() {
  microcms completion endpoints 2>/dev/null
}

_microcms_complete() {
  local cur command subcmd
  cur="\${COMP_WORDS[COMP_CWORD]}"
  command="\${COMP_WORDS[1]}"
  subcmd="\${COMP_WORDS[2]}"

  local roots="api auth config completion content docs media schema search spec types validate help"
  local globals="${globals}"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${roots} \${globals}" -- "$cur") )
    return
  fi

  case "$command" in
    auth)
      COMPREPLY=( $(compgen -W "login status profile" -- "$cur") )
      ;;
    api)
      if [[ "$subcmd" == "info" && \${COMP_CWORD} -eq 3 ]]; then
        COMPREPLY=( $(compgen -W "$( _microcms_endpoint_candidates )" -- "$cur") )
      else
        COMPREPLY=( $(compgen -W "list info" -- "$cur") )
      fi
      ;;
    content)
      if [[ \${COMP_CWORD} -eq 3 ]]; then
        COMPREPLY=( $(compgen -W "$( _microcms_endpoint_candidates )" -- "$cur") )
      else
        COMPREPLY=( $(compgen -W "list get create update delete meta status" -- "$cur") )
      fi
      ;;
    docs)
      COMPREPLY=( $(compgen -W "list get" -- "$cur") )
      ;;
    media)
      COMPREPLY=( $(compgen -W "list upload delete" -- "$cur") )
      ;;
    config)
      COMPREPLY=( $(compgen -W "doctor" -- "$cur") )
      ;;
    schema)
      COMPREPLY=( $(compgen -W "pull" -- "$cur") )
      ;;
    types)
      COMPREPLY=( $(compgen -W "generate" -- "$cur") )
      ;;
    completion)
      COMPREPLY=( $(compgen -W "install uninstall bash zsh fish" -- "$cur") )
      ;;
    validate)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "$( _microcms_endpoint_candidates )" -- "$cur") )
      else
        COMPREPLY=( $(compgen -W "--file" -- "$cur") )
      fi
      ;;
    search)
      COMPREPLY=( $(compgen -W "--scope --source --category --limit" -- "$cur") )
      ;;
    spec)
      COMPREPLY=( $(compgen -W "$globals" -- "$cur") )
      ;;
    *)
      COMPREPLY=( $(compgen -W "$globals" -- "$cur") )
      ;;
  esac
}

complete -F _microcms_complete microcms
`;
}

function buildZshCompletionScript(): string {
  const globals = GLOBAL_OPTIONS.join(" ");

  return `#compdef microcms

_microcms_endpoints() {
  local -a endpoints
  endpoints=(\${(f)"$(microcms completion endpoints 2>/dev/null)"})
  if (( \${#endpoints[@]} > 0 )); then
    _describe 'endpoint' endpoints
  fi
}

_microcms() {
  local -a roots
  roots=(api auth config completion content docs media schema search spec types validate)
  _arguments '*::arg:->args'

  case $state in
    args)
      if (( CURRENT == 2 )); then
        _describe 'command' roots
        return
      fi

      local subcmd=$words[2]
      local action=$words[3]

      if [[ "$subcmd" == "api" && "$action" == "info" && CURRENT -eq 4 ]]; then
        _microcms_endpoints
        return
      fi

      if [[ "$subcmd" == "content" && CURRENT -eq 4 ]]; then
        _microcms_endpoints
        return
      fi

      if [[ "$subcmd" == "validate" && CURRENT -eq 3 ]]; then
        _microcms_endpoints
        return
      fi

      case $subcmd in
        auth)
          _values 'auth command' login status profile
          ;;
        api)
          _values 'api command' list info
          ;;
        content)
          _values 'content command' list get create update delete meta status
          ;;
        docs)
          _values 'docs command' list get
          ;;
        media)
          _values 'media command' list upload delete
          ;;
        config)
          _values 'config command' doctor
          ;;
        schema)
          _values 'schema command' pull
          ;;
        types)
          _values 'types command' generate
          ;;
        completion)
          _values 'completion command' install uninstall bash zsh fish
          ;;
        search)
          _values 'search option' --scope --source --category --limit
          ;;
        spec)
          _values 'global option' ${globals}
          ;;
        validate)
          _values 'option' --file
          ;;
        *)
          _values 'global option' ${globals}
          ;;
      esac
      ;;
  esac
}

_microcms "$@"
`;
}

function buildFishCompletionScript(): string {
  return `# microcms completion for fish
complete -c microcms -f

complete -c microcms -n '__fish_use_subcommand' -a 'api auth config completion content docs media schema search spec types validate'

complete -c microcms -n '__fish_seen_subcommand_from auth' -a 'login status profile'
complete -c microcms -n '__fish_seen_subcommand_from api' -a 'list info'
complete -c microcms -n '__fish_seen_subcommand_from content' -a 'list get create update delete meta status'
complete -c microcms -n '__fish_seen_subcommand_from docs' -a 'list get'
complete -c microcms -n '__fish_seen_subcommand_from media' -a 'list upload delete'
complete -c microcms -n '__fish_seen_subcommand_from config' -a 'doctor'
complete -c microcms -n '__fish_seen_subcommand_from schema' -a 'pull'
complete -c microcms -n '__fish_seen_subcommand_from types' -a 'generate'
complete -c microcms -n '__fish_seen_subcommand_from completion' -a 'install uninstall bash zsh fish'

complete -c microcms -n '__fish_seen_subcommand_from api; and __fish_seen_subcommand_from info; and __fish_is_nth_token 3' -a '(microcms completion endpoints 2>/dev/null)'
complete -c microcms -n '__fish_seen_subcommand_from content; and __fish_is_nth_token 3' -a '(microcms completion endpoints 2>/dev/null)'
complete -c microcms -n '__fish_seen_subcommand_from validate; and __fish_is_nth_token 2' -a '(microcms completion endpoints 2>/dev/null)'

complete -c microcms -l json
complete -c microcms -l plain
complete -c microcms -l table
complete -c microcms -l select
complete -c microcms -l profile
complete -c microcms -l service-domain
complete -c microcms -l api-key
complete -c microcms -l api-key-stdin
complete -c microcms -l timeout
complete -c microcms -l retry
complete -c microcms -l retry-max-delay
complete -c microcms -l verbose
complete -c microcms -l no-color
`;
}
