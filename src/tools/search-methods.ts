import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchMethods } from "../search.js";
import type { ToolContext } from "./context.js";
import { toolResult } from "./context.js";

export function registerSearchMethods(server: McpServer, context: ToolContext): void {
  server.registerTool("telegram_search_methods", {
    title: "Search Telegram methods",
    description: "Fuzzy-search every Telegram Bot API method by name, description, category, or parameter name.",
    inputSchema: {
      search: z.string().max(500).default("").describe("Search terms, for example 'send photo'"),
      limit: z.number().int().min(1).max(50).default(10),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ search, limit }) => {
    const matches = searchMethods(context.store.getSchema().methods, search, limit).map((method) => ({
      name: method.name,
      description: method.description.slice(0, 280),
      category: method.category,
      parameters: method.parameters.map((parameter) => parameter.name),
      returnType: method.returnType,
      score: Math.round(method.score * 100) / 100,
    }));
    return toolResult({ ok: true, query: search, count: matches.length, methods: matches });
  });
}
