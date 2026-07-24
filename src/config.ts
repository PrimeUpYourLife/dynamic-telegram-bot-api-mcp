import { readFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import type { LogLevel } from "./logger.js";

const positiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const environmentSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_API_BASE_URL: z.string().url().default("https://api.telegram.org"),
  TELEGRAM_METHOD_ALLOWLIST: z.string().optional(),
  TELEGRAM_REQUEST_TIMEOUT_MS: positiveInteger(30_000),
  TELEGRAM_REQUEST_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  TELEGRAM_RATE_LIMIT_PER_SECOND: positiveInteger(25),
  TELEGRAM_RATE_LIMIT_BURST: positiveInteger(30),
  TELEGRAM_SCHEMA_MAX_AGE_HOURS: positiveInteger(24),
  TELEGRAM_SCHEMA_PATH: z.string().optional(),
  TELEGRAM_LOCAL_FILE_ROOTS: z.string().optional(),
  TELEGRAM_MAX_UPLOAD_BYTES: positiveInteger(50 * 1024 * 1024),
  TELEGRAM_ALLOW_UNKNOWN_PARAMETERS: z.enum(["true", "false"]).default("false"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface AppConfig {
  token?: string;
  apiBaseUrl: string;
  methodAllowlist: string[];
  requestTimeoutMs: number;
  requestRetries: number;
  rateLimitPerSecond: number;
  rateLimitBurst: number;
  schemaMaxAgeMs: number;
  schemaPath?: string;
  localFileRoots: string[];
  maxUploadBytes: number;
  allowUnknownParameters: boolean;
  logLevel: LogLevel;
}

function readProjectEnvironment(workingDirectory: string): NodeJS.ProcessEnv {
  let projectEnvironment: NodeJS.ProcessEnv = {};
  try {
    projectEnvironment = parseEnv(readFileSync(resolve(workingDirectory, ".env"), "utf8"));
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return projectEnvironment;
}

function parseConfig(environment: NodeJS.ProcessEnv, workingDirectory: string): AppConfig {
  const value = environmentSchema.parse(environment);
  const localFileRoots = (value.TELEGRAM_LOCAL_FILE_ROOTS ?? workingDirectory)
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolve(workingDirectory, entry));
  const config: AppConfig = {
    apiBaseUrl: value.TELEGRAM_API_BASE_URL.replace(/\/$/, ""),
    methodAllowlist: (value.TELEGRAM_METHOD_ALLOWLIST ?? "*").split(",").map((item) => item.trim()).filter(Boolean),
    requestTimeoutMs: value.TELEGRAM_REQUEST_TIMEOUT_MS,
    requestRetries: value.TELEGRAM_REQUEST_RETRIES,
    rateLimitPerSecond: value.TELEGRAM_RATE_LIMIT_PER_SECOND,
    rateLimitBurst: value.TELEGRAM_RATE_LIMIT_BURST,
    schemaMaxAgeMs: value.TELEGRAM_SCHEMA_MAX_AGE_HOURS * 60 * 60 * 1000,
    localFileRoots,
    maxUploadBytes: value.TELEGRAM_MAX_UPLOAD_BYTES,
    allowUnknownParameters: value.TELEGRAM_ALLOW_UNKNOWN_PARAMETERS === "true",
    logLevel: value.LOG_LEVEL,
  };
  if (value.TELEGRAM_BOT_TOKEN) config.token = value.TELEGRAM_BOT_TOKEN;
  if (value.TELEGRAM_SCHEMA_PATH) config.schemaPath = resolve(workingDirectory, value.TELEGRAM_SCHEMA_PATH);
  return config;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory: string = process.cwd(),
): AppConfig {
  return parseConfig({ ...readProjectEnvironment(workingDirectory), ...environment }, workingDirectory);
}

export function loadProjectConfig(
  environment: NodeJS.ProcessEnv,
  projectDirectory: string,
): AppConfig {
  return parseConfig({ ...environment, ...readProjectEnvironment(projectDirectory) }, projectDirectory);
}
