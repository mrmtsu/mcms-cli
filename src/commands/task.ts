import { Command } from "commander";
import {
  buildTaskGuide,
  listTaskCatalog,
  renderTaskGuideMarkdown,
  suggestTasks,
} from "../core/task-workflow.js";
import { CliError } from "../core/errors.js";
import { EXIT_CODE } from "../core/exit-codes.js";
import { printSuccess } from "../core/output.js";
import { parseIntegerOption, withCommandContext } from "./utils.js";

type SuggestOptions = {
  limit?: string;
};

export function registerTaskCommands(program: Command): void {
  const task = program.command("task").description("Agent-oriented task workflow helpers");

  task
    .command("list")
    .description("List built-in task workflow IDs")
    .action(
      withCommandContext(async (ctx) => {
        const tasks = listTaskCatalog();
        printSuccess(ctx, {
          tasks,
          total: tasks.length,
        });
      }),
    );

  task
    .command("suggest")
    .argument("[query]", "task query (for example: delete, import, status)")
    .description("Suggest safe command sequences from task intent")
    .option("--limit <n>", "maximum suggestions (1-20)", "5")
    .action(
      withCommandContext(async (ctx, query: string | undefined, options: SuggestOptions) => {
        const limit = parseIntegerOption("limit", options.limit, { min: 1, max: 20 }) ?? 5;
        const suggestions = suggestTasks(query, limit);

        if ((query ?? "").trim().length > 0 && suggestions.length === 0) {
          throw new CliError({
            code: "INVALID_INPUT",
            message: `No task suggestions found for query: ${query}`,
            exitCode: EXIT_CODE.INVALID_INPUT,
          });
        }

        printSuccess(ctx, {
          query: query ?? null,
          suggestions,
          total: suggestions.length,
        });
      }),
    );

  task
    .command("guide")
    .argument("<taskId>", "task id from `microcms task list`")
    .description("Print a task-focused runbook in markdown")
    .action(
      withCommandContext(async (ctx, taskId: string) => {
        const guide = buildTaskGuide(taskId);
        if (!guide) {
          throw new CliError({
            code: "INVALID_INPUT",
            message: `Unknown task id: ${taskId}`,
            exitCode: EXIT_CODE.INVALID_INPUT,
          });
        }

        const markdown = renderTaskGuideMarkdown(guide);
        if (ctx.json) {
          printSuccess(ctx, {
            ...guide,
            markdown,
          });
          return;
        }

        process.stdout.write(`${markdown}\n`);
      }),
    );
}
