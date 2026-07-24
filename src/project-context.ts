import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectConfig, type AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { RateLimiter } from "./rate-limiter.js";
import { TelegramClient } from "./telegram-client.js";

type ProjectContextErrorCode =
  | "PROJECT_ROOT_AMBIGUOUS"
  | "PROJECT_ROOT_UNAVAILABLE"
  | "PROJECT_ROOT_UNSUPPORTED";

type RootProvider = Pick<Server, "getClientCapabilities" | "listRoots">;

export interface ResolvedProjectContext {
  config: AppConfig;
  client?: TelegramClient;
  projectRoot?: string;
}

interface CachedClient {
  config: AppConfig;
  client: TelegramClient;
}

interface ProjectContextResolverOptions {
  rootProvider: RootProvider;
  fallbackConfig: AppConfig;
  environment: NodeJS.ProcessEnv;
  logger: Logger;
  createClient?: (config: AppConfig) => TelegramClient;
}

export class ProjectContextError extends Error {
  constructor(readonly code: ProjectContextErrorCode, message: string) {
    super(message);
    this.name = "ProjectContextError";
  }
}

function sameClientConfiguration(first: AppConfig, second: AppConfig): boolean {
  return first.token === second.token
    && first.apiBaseUrl === second.apiBaseUrl
    && first.requestTimeoutMs === second.requestTimeoutMs
    && first.requestRetries === second.requestRetries
    && first.rateLimitPerSecond === second.rateLimitPerSecond
    && first.rateLimitBurst === second.rateLimitBurst;
}

export class ProjectContextResolver {
  private readonly clients = new Map<string, CachedClient>();
  private readonly createClient: (config: AppConfig) => TelegramClient;

  constructor(private readonly options: ProjectContextResolverOptions) {
    this.createClient = options.createClient ?? ((config) => {
      if (!config.token) throw new Error("Cannot create a Telegram client without a bot token");
      return new TelegramClient({
        token: config.token,
        baseUrl: config.apiBaseUrl,
        timeoutMs: config.requestTimeoutMs,
        retries: config.requestRetries,
        limiter: new RateLimiter(config.rateLimitPerSecond, config.rateLimitBurst),
        logger: options.logger,
      });
    });
  }

  async resolve(): Promise<ResolvedProjectContext> {
    if (!this.options.rootProvider.getClientCapabilities()?.roots) {
      return this.contextFor(this.options.fallbackConfig);
    }

    let roots: Awaited<ReturnType<RootProvider["listRoots"]>>["roots"];
    try {
      ({ roots } = await this.options.rootProvider.listRoots());
    } catch {
      throw new ProjectContextError(
        "PROJECT_ROOT_UNAVAILABLE",
        "The MCP client did not provide its current workspace root",
      );
    }

    if (roots.length === 0) return this.contextFor(this.options.fallbackConfig);
    if (roots.length > 1) {
      throw new ProjectContextError(
        "PROJECT_ROOT_AMBIGUOUS",
        "The MCP client exposed multiple workspace roots; use a single-root workspace for Telegram calls",
      );
    }

    const root = roots[0];
    if (!root) {
      throw new ProjectContextError("PROJECT_ROOT_UNAVAILABLE", "The MCP client did not provide its current workspace root");
    }

    let projectRoot: string;
    try {
      const rootUrl = new URL(root.uri);
      if (rootUrl.protocol !== "file:") throw new Error("Unsupported root protocol");
      projectRoot = resolve(fileURLToPath(rootUrl));
      if (!statSync(projectRoot).isDirectory()) throw new Error("Workspace root is not a directory");
    } catch {
      throw new ProjectContextError(
        "PROJECT_ROOT_UNSUPPORTED",
        "The MCP workspace root must be a local file URI",
      );
    }

    return this.contextFor(loadProjectConfig(this.options.environment, projectRoot), projectRoot);
  }

  private contextFor(config: AppConfig, projectRoot?: string): ResolvedProjectContext {
    const cacheKey = projectRoot ?? "\0fallback";
    if (!config.token) {
      this.clients.delete(cacheKey);
      return { config, ...(projectRoot ? { projectRoot } : {}) };
    }

    const cached = this.clients.get(cacheKey);
    const client = cached && sameClientConfiguration(cached.config, config)
      ? cached.client
      : this.createAndCacheClient(cacheKey, config);
    return { config, client, ...(projectRoot ? { projectRoot } : {}) };
  }

  private createAndCacheClient(cacheKey: string, config: AppConfig): TelegramClient {
    const client = this.createClient(config);
    this.clients.set(cacheKey, { config, client });
    return client;
  }
}
