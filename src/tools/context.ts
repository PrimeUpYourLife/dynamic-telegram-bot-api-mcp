import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { ResolvedProjectContext } from "../project-context.js";
import type { SchemaStore } from "../schema-store.js";
import type { TelegramClient } from "../telegram-client.js";

export interface ToolContext {
  config: AppConfig;
  logger: Logger;
  store: SchemaStore;
  client?: TelegramClient;
  resolveProjectContext?: () => Promise<ResolvedProjectContext>;
}

export function toolResult(value: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  };
}

export function errorResult(error: string, description: string, parameters: Record<string, unknown> = {}) {
  return toolResult({ ok: false, error, description, parameters }, true);
}
