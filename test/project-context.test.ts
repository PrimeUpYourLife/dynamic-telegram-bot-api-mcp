import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { Logger } from "../src/logger.js";
import { ProjectContextError, ProjectContextResolver } from "../src/project-context.js";
import type { TelegramClient } from "../src/telegram-client.js";

const temporaryDirectories: string[] = [];

async function createDirectory(prefix: string, environment?: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  if (environment !== undefined) await writeFile(join(directory, ".env"), environment, "utf8");
  return directory;
}

function clientStub(): TelegramClient {
  return Object.create(null) as TelegramClient;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ProjectContextResolver", () => {
  it("uses the connected client's repository token instead of the shared fallback", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const projectDirectory = await createDirectory("telegram-mcp-project-", [
      "TELEGRAM_BOT_TOKEN=project-token",
      "TELEGRAM_METHOD_ALLOWLIST=getMe,sendMessage",
      "",
    ].join("\n"));
    const createdTokens: string[] = [];
    const resolver = new ProjectContextResolver({
      rootProvider: {
        getClientCapabilities: () => ({ roots: {} }),
        listRoots: vi.fn().mockResolvedValue({
          roots: [{ uri: pathToFileURL(projectDirectory).href }],
        }),
      },
      fallbackConfig: loadConfig({ TELEGRAM_BOT_TOKEN: "shared-token" }, fallbackDirectory),
      environment: { TELEGRAM_BOT_TOKEN: "shared-token" },
      logger: new Logger("error"),
      createClient: (config) => {
        createdTokens.push(config.token ?? "");
        return clientStub();
      },
    });

    const context = await resolver.resolve();

    expect(context.projectRoot).toBe(resolve(projectDirectory));
    expect(context.config.token).toBe("project-token");
    expect(context.config.methodAllowlist).toEqual(["getMe", "sendMessage"]);
    expect(context.config.localFileRoots).toEqual([resolve(projectDirectory)]);
    expect(createdTokens).toEqual(["project-token"]);
  });

  it("switches clients when the connected client's root changes", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const firstProject = await createDirectory("telegram-mcp-first-", "TELEGRAM_BOT_TOKEN=first-token\n");
    const secondProject = await createDirectory("telegram-mcp-second-", "TELEGRAM_BOT_TOKEN=second-token\n");
    const listRoots = vi.fn()
      .mockResolvedValueOnce({ roots: [{ uri: pathToFileURL(firstProject).href }] })
      .mockResolvedValueOnce({ roots: [{ uri: pathToFileURL(secondProject).href }] });
    const createdTokens: string[] = [];
    const resolver = new ProjectContextResolver({
      rootProvider: {
        getClientCapabilities: () => ({ roots: { listChanged: true } }),
        listRoots,
      },
      fallbackConfig: loadConfig({}, fallbackDirectory),
      environment: {},
      logger: new Logger("error"),
      createClient: (config) => {
        createdTokens.push(config.token ?? "");
        return clientStub();
      },
    });

    const firstContext = await resolver.resolve();
    const secondContext = await resolver.resolve();

    expect(firstContext.config.token).toBe("first-token");
    expect(secondContext.config.token).toBe("second-token");
    expect(createdTokens).toEqual(["first-token", "second-token"]);
  });

  it("reloads a repository client after its token changes", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const projectDirectory = await createDirectory("telegram-mcp-project-", "TELEGRAM_BOT_TOKEN=first-token\n");
    const createdTokens: string[] = [];
    const resolver = new ProjectContextResolver({
      rootProvider: {
        getClientCapabilities: () => ({ roots: {} }),
        listRoots: vi.fn().mockResolvedValue({
          roots: [{ uri: pathToFileURL(projectDirectory).href }],
        }),
      },
      fallbackConfig: loadConfig({}, fallbackDirectory),
      environment: {},
      logger: new Logger("error"),
      createClient: (config) => {
        createdTokens.push(config.token ?? "");
        return clientStub();
      },
    });

    await resolver.resolve();
    await writeFile(join(projectDirectory, ".env"), "TELEGRAM_BOT_TOKEN=second-token\n", "utf8");
    await resolver.resolve();

    expect(createdTokens).toEqual(["first-token", "second-token"]);
  });

  it("reuses the repository client while its configuration is unchanged", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const projectDirectory = await createDirectory("telegram-mcp-project-", "TELEGRAM_BOT_TOKEN=project-token\n");
    const createClient = vi.fn(() => clientStub());
    const resolver = new ProjectContextResolver({
      rootProvider: {
        getClientCapabilities: () => ({ roots: {} }),
        listRoots: vi.fn().mockResolvedValue({
          roots: [{ uri: pathToFileURL(projectDirectory).href }],
        }),
      },
      fallbackConfig: loadConfig({}, fallbackDirectory),
      environment: {},
      logger: new Logger("error"),
      createClient,
    });

    const firstContext = await resolver.resolve();
    const secondContext = await resolver.resolve();

    expect(firstContext.client).toBe(secondContext.client);
    expect(createClient).toHaveBeenCalledOnce();
  });

  it("uses startup configuration when the client does not support roots", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const createClient = vi.fn(() => clientStub());
    const fallbackConfig = loadConfig({ TELEGRAM_BOT_TOKEN: "fallback-token" }, fallbackDirectory);
    const resolver = new ProjectContextResolver({
      rootProvider: {
        getClientCapabilities: () => undefined,
        listRoots: vi.fn(),
      },
      fallbackConfig,
      environment: {},
      logger: new Logger("error"),
      createClient,
    });

    const context = await resolver.resolve();

    expect(context.config).toBe(fallbackConfig);
    expect(context.projectRoot).toBeUndefined();
    expect(createClient).toHaveBeenCalledOnce();
  });

  it("returns no client when neither the repository nor fallback has a token", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const projectDirectory = await createDirectory("telegram-mcp-project-");
    const createClient = vi.fn(() => clientStub());
    const resolver = new ProjectContextResolver({
      rootProvider: {
        getClientCapabilities: () => ({ roots: {} }),
        listRoots: vi.fn().mockResolvedValue({
          roots: [{ uri: pathToFileURL(projectDirectory).href }],
        }),
      },
      fallbackConfig: loadConfig({}, fallbackDirectory),
      environment: {},
      logger: new Logger("error"),
      createClient,
    });

    const context = await resolver.resolve();

    expect(context.client).toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects multiple roots instead of guessing which bot token to use", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const firstProject = await createDirectory("telegram-mcp-first-", "TELEGRAM_BOT_TOKEN=first-token\n");
    const secondProject = await createDirectory("telegram-mcp-second-", "TELEGRAM_BOT_TOKEN=second-token\n");
    const resolver = new ProjectContextResolver({
      rootProvider: {
        getClientCapabilities: () => ({ roots: {} }),
        listRoots: vi.fn().mockResolvedValue({
          roots: [
            { uri: pathToFileURL(firstProject).href },
            { uri: pathToFileURL(secondProject).href },
          ],
        }),
      },
      fallbackConfig: loadConfig({}, fallbackDirectory),
      environment: {},
      logger: new Logger("error"),
    });

    await expect(resolver.resolve()).rejects.toMatchObject<ProjectContextError>({
      code: "PROJECT_ROOT_AMBIGUOUS",
    });
  });

  it("rejects non-file roots", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const resolver = new ProjectContextResolver({
      rootProvider: {
        getClientCapabilities: () => ({ roots: {} }),
        listRoots: vi.fn().mockResolvedValue({
          roots: [{ uri: "https://example.com/repository" }],
        }),
      },
      fallbackConfig: loadConfig({}, fallbackDirectory),
      environment: {},
      logger: new Logger("error"),
    });

    await expect(resolver.resolve()).rejects.toMatchObject<ProjectContextError>({
      code: "PROJECT_ROOT_UNSUPPORTED",
    });
  });

  it("rejects file roots because project configuration requires a directory", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const rootFile = join(fallbackDirectory, "workspace.txt");
    await writeFile(rootFile, "not a directory", "utf8");
    const resolver = new ProjectContextResolver({
      rootProvider: {
        getClientCapabilities: () => ({ roots: {} }),
        listRoots: vi.fn().mockResolvedValue({
          roots: [{ uri: pathToFileURL(rootFile).href }],
        }),
      },
      fallbackConfig: loadConfig({}, fallbackDirectory),
      environment: {},
      logger: new Logger("error"),
    });

    await expect(resolver.resolve()).rejects.toMatchObject<ProjectContextError>({
      code: "PROJECT_ROOT_UNSUPPORTED",
    });
  });

  it("does not fall back silently when roots lookup fails", async () => {
    const fallbackDirectory = await createDirectory("telegram-mcp-fallback-");
    const resolver = new ProjectContextResolver({
      rootProvider: {
        getClientCapabilities: () => ({ roots: {} }),
        listRoots: vi.fn().mockRejectedValue(new Error("transport disconnected")),
      },
      fallbackConfig: loadConfig({ TELEGRAM_BOT_TOKEN: "fallback-token" }, fallbackDirectory),
      environment: {},
      logger: new Logger("error"),
    });

    await expect(resolver.resolve()).rejects.toMatchObject<ProjectContextError>({
      code: "PROJECT_ROOT_UNAVAILABLE",
    });
  });
});
