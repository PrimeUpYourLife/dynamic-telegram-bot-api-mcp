#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";
import { ProjectContextResolver } from "./project-context.js";
import { SchemaStore, defaultSchemaPath } from "./schema-store.js";
import { createServer } from "./server.js";
import type { ToolContext } from "./tools/context.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const store = new SchemaStore(config.schemaPath ?? defaultSchemaPath);
  const initialized = await store.initialize(config.schemaMaxAgeMs);
  if (initialized.refreshError) logger.warn("telegram_schema_refresh_failed_using_cached_schema");
  if (initialized.refreshed) {
    logger.info("telegram_schema_refreshed", { version: initialized.schema.version, methods: initialized.schema.methods.length, types: initialized.schema.types.length });
  }
  const context: ToolContext = { config, logger, store };
  const server = createServer(context);
  const projectContextResolver = new ProjectContextResolver({
    rootProvider: server.server,
    fallbackConfig: config,
    environment: process.env,
    logger,
  });
  context.resolveProjectContext = () => projectContextResolver.resolve();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("mcp_server_started", { transport: "stdio", schemaVersion: initialized.schema.version });
}

main().catch((error: unknown) => {
  const logger = new Logger("error");
  logger.error("mcp_server_start_failed", { error: error instanceof Error ? error.message : "Unknown startup error" });
  process.exitCode = 1;
});
