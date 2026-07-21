import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./context.js";
import { errorResult, toolResult } from "./context.js";

export function registerRefreshSchema(server: McpServer, context: ToolContext): void {
  server.registerTool("telegram_refresh_schema", {
    title: "Refresh Telegram schema",
    description: "Fetch and atomically install the latest schema from the official Telegram Bot API documentation.",
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
  }, async () => {
    try {
      const schema = await context.store.refresh();
      context.logger.info("telegram_schema_refreshed", { version: schema.version, methods: schema.methods.length, types: schema.types.length });
      return toolResult({
        ok: true,
        source: schema.source,
        retrievedAt: schema.retrievedAt,
        version: schema.version,
        methods: schema.methods.length,
        types: schema.types.length,
        enums: schema.enums.length,
      });
    } catch (error) {
      context.logger.warn("telegram_schema_refresh_failed");
      return errorResult("SCHEMA_REFRESH_FAILED", error instanceof Error ? error.message : "Unknown refresh error");
    }
  });
}
