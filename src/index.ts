#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { RateLimiter } from "./rate-limiter.js";
import { SchemaStore, defaultSchemaPath } from "./schema-store.js";
import { createServer } from "./server.js";
import { TelegramClient } from "./telegram-client.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const store = new SchemaStore(config.schemaPath ?? defaultSchemaPath);
  const initialized = await store.initialize(config.schemaMaxAgeMs);
  if (initialized.refreshError) logger.warn("telegram_schema_refresh_failed_using_cached_schema");
  if (initialized.refreshed) {
    logger.info("telegram_schema_refreshed", { version: initialized.schema.version, methods: initialized.schema.methods.length, types: initialized.schema.types.length });
  }
  const client = config.token ? new TelegramClient({
    token: config.token,
    baseUrl: config.apiBaseUrl,
    timeoutMs: config.requestTimeoutMs,
    retries: config.requestRetries,
    limiter: new RateLimiter(config.rateLimitPerSecond, config.rateLimitBurst),
    logger,
  }) : undefined;
  if (!client) logger.warn("telegram_bot_token_missing_call_tool_disabled");

  const context = { config, logger, store, ...(client ? { client } : {}) };
  const server = createServer(context);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("mcp_server_started", { transport: "stdio", schemaVersion: initialized.schema.version });
}

main().catch((error: unknown) => {
  const logger = new Logger("error");
  logger.error("mcp_server_start_failed", { error: error instanceof Error ? error.message : "Unknown startup error" });
  process.exitCode = 1;
});
