import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./tools/context.js";
import { registerCallMethod } from "./tools/call-method.js";
import { registerGetMethod } from "./tools/get-method.js";
import { registerGetType } from "./tools/get-type.js";
import { registerRefreshSchema } from "./tools/refresh-schema.js";
import { registerSearchMethods } from "./tools/search-methods.js";
import { packageVersion } from "./version.js";

export function createServer(context: ToolContext): McpServer {
  const server = new McpServer({ name: "dynamic-telegram-bot-api-mcp", version: packageVersion });
  registerSearchMethods(server, context);
  registerGetMethod(server, context);
  registerGetType(server, context);
  registerCallMethod(server, context);
  registerRefreshSchema(server, context);
  return server;
}
