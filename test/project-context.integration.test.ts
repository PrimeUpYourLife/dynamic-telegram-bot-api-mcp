import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { Logger } from "../src/logger.js";
import { ProjectContextResolver } from "../src/project-context.js";
import { RateLimiter } from "../src/rate-limiter.js";
import { SchemaStore } from "../src/schema-store.js";
import { createServer } from "../src/server.js";
import { TelegramClient } from "../src/telegram-client.js";
import type { ToolContext } from "../src/tools/context.js";

const temporaryDirectories: string[] = [];

async function createDirectory(prefix: string, environment?: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  if (environment !== undefined) await writeFile(join(directory, ".env"), environment, "utf8");
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("MCP roots integration", () => {
  it("routes a Telegram tool call through the active repository's bot token", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const projectDirectory = await createDirectory("telegram-mcp-project-", "TELEGRAM_BOT_TOKEN=project-token\n");
    const requestedUrls: string[] = [];
    const logger = new Logger("error");
    const store = new SchemaStore();
    await store.load();
    const config = loadConfig({}, fallbackDirectory);
    const context: ToolContext = { config, logger, store };
    const server = createServer(context);
    const resolver = new ProjectContextResolver({
      rootProvider: server.server,
      fallbackConfig: config,
      environment: {},
      logger,
      createClient: (projectConfig) => new TelegramClient({
        token: projectConfig.token ?? "",
        baseUrl: projectConfig.apiBaseUrl,
        timeoutMs: projectConfig.requestTimeoutMs,
        retries: projectConfig.requestRetries,
        limiter: new RateLimiter(projectConfig.rateLimitPerSecond, projectConfig.rateLimitBurst),
        logger,
        fetchImplementation: async (input) => {
          requestedUrls.push(String(input));
          return new Response(JSON.stringify({ ok: true, result: { id: 42, is_bot: true } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      }),
    });
    context.resolveProjectContext = () => resolver.resolve();

    const client = new Client(
      { name: "roots-test-client", version: "1.0.0" },
      { capabilities: { roots: {} } },
    );
    client.setRequestHandler(ListRootsRequestSchema, () => ({
      roots: [{ uri: pathToFileURL(projectDirectory).href }],
    }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "telegram_call_method",
        arguments: { method: "getMe" },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ ok: true });
      expect(requestedUrls).toEqual(["https://api.telegram.org/botproject-token/getMe"]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
