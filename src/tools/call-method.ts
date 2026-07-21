import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TelegramApiError } from "../telegram-client.js";
import { UploadProcessor } from "../uploads.js";
import { ParameterValidationError, validateMethodParameters } from "../validation.js";
import type { ToolContext } from "./context.js";
import { errorResult, toolResult } from "./context.js";

const destructiveMethod = /^(?:delete|ban|unban|kick|restrict|promote|revoke|close|logOut|leave|remove|unpin|decline|refund|stop|setWebhook|setChatPermissions|setChatPhoto|setChatTitle|setChatDescription)/i;

function allowed(method: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const expression = `^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`;
    return new RegExp(expression, "i").test(method);
  });
}

export function registerCallMethod(server: McpServer, context: ToolContext): void {
  server.registerTool("telegram_call_method", {
    title: "Call Telegram method",
    description: "Validate and execute any current Telegram Bot API method. Destructive methods require confirm=true. Local files and base64 upload descriptors are converted to multipart uploads.",
    inputSchema: {
      method: z.string().min(1).max(200),
      parameters: z.record(z.string(), z.unknown()).default({}),
      confirm: z.boolean().default(false).describe("Must be true for destructive methods such as deleteMessage or banChatMember"),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  }, async ({ method: requestedMethod, parameters, confirm }) => {
    const method = context.store.getMethod(requestedMethod);
    if (!method) return errorResult("METHOD_NOT_FOUND", `Unknown Telegram Bot API method: ${requestedMethod}`);
    if (!allowed(method.name, context.config.methodAllowlist)) {
      return errorResult("METHOD_NOT_ALLOWED", `${method.name} is not permitted by TELEGRAM_METHOD_ALLOWLIST`);
    }
    if (destructiveMethod.test(method.name) && !confirm) {
      return errorResult("CONFIRMATION_REQUIRED", `${method.name} is destructive; repeat the call with confirm=true`);
    }
    if (!context.client) return errorResult("BOT_TOKEN_MISSING", "Set TELEGRAM_BOT_TOKEN before calling Telegram methods");

    try {
      const validation = validateMethodParameters(method, parameters, context.store, context.config.allowUnknownParameters);
      if (!validation.valid) throw new ParameterValidationError(validation.issues);
      const prepared = await new UploadProcessor(context.store, context.config.localFileRoots, context.config.maxUploadBytes)
        .prepare(parameters, method.parameters);
      const response = await context.client.call(method.name, prepared.parameters, prepared.uploads);
      return toolResult(response as unknown as Record<string, unknown>);
    } catch (error) {
      if (error instanceof ParameterValidationError) {
        return errorResult("VALIDATION_ERROR", error.message, { issues: error.issues });
      }
      if (error instanceof TelegramApiError) {
        return toolResult({ ...error.toJSON(), error: "TELEGRAM_API_ERROR" }, true);
      }
      const description = error instanceof Error ? error.message : "Unknown request error";
      return errorResult("REQUEST_ERROR", description);
    }
  });
}
