import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const temporaryDirectories: string[] = [];

async function createProjectEnvironment(contents?: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "telegram-mcp-config-"));
  temporaryDirectories.push(directory);
  if (contents !== undefined) await writeFile(join(directory, ".env"), contents, "utf8");
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("loadConfig", () => {
  it("loads configuration from the current project's .env file", async () => {
    const projectDirectory = await createProjectEnvironment([
      "TELEGRAM_BOT_TOKEN=project-specific-token",
      "TELEGRAM_REQUEST_TIMEOUT_MS=1234",
      "",
    ].join("\n"));

    const config = loadConfig({}, projectDirectory);

    expect(config.token).toBe("project-specific-token");
    expect(config.requestTimeoutMs).toBe(1234);
    expect(config.localFileRoots).toEqual([projectDirectory]);
  });

  it("keeps explicitly exported environment values ahead of project .env values", async () => {
    const projectDirectory = await createProjectEnvironment([
      "TELEGRAM_BOT_TOKEN=project-token",
      "TELEGRAM_REQUEST_TIMEOUT_MS=1234",
      "",
    ].join("\n"));

    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: "exported-token",
      TELEGRAM_REQUEST_TIMEOUT_MS: "5678",
    }, projectDirectory);

    expect(config.token).toBe("exported-token");
    expect(config.requestTimeoutMs).toBe(5678);
  });

  it("uses defaults when the project has no .env file", async () => {
    const projectDirectory = await createProjectEnvironment();

    const config = loadConfig({}, projectDirectory);

    expect(config.token).toBeUndefined();
    expect(config.requestTimeoutMs).toBe(30_000);
  });

  it("rejects invalid configuration loaded from the project .env file", async () => {
    const projectDirectory = await createProjectEnvironment("TELEGRAM_REQUEST_RETRIES=11\n");

    expect(() => loadConfig({}, projectDirectory)).toThrow();
  });
});
