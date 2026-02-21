import { CliError } from "../errors.js";
import { EXIT_CODE } from "../exit-codes.js";
import type { DocsProvider } from "./provider.js";

export function createLocalDocsProvider(): DocsProvider {
  return {
    async listDocuments(_params) {
      return {
        categories: [],
        docs: [],
        total: 0,
      };
    },
    async getDocument({ category, filename }) {
      throw new CliError({
        code: "INVALID_INPUT",
        message: `Document markdown is unavailable in local source. Install/enable microcms-document-mcp-server and use --source mcp or --source auto.`,
        exitCode: EXIT_CODE.INVALID_INPUT,
        details: {
          category,
          filename,
        },
      });
    },
  };
}
