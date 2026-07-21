import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { fetchTelegramSchema } from "./schema-parser.js";
import type { TelegramMethod, TelegramSchema, TelegramType } from "./schema.js";

const fieldSchema = z.object({
  name: z.string(), type: z.string(), required: z.boolean(), description: z.string(), enum: z.array(z.string()).optional(),
});
const catalogSchema = z.object({
  source: z.string().url(), retrievedAt: z.string().datetime(), version: z.string(),
  methods: z.array(z.object({
    name: z.string(), category: z.string(), description: z.string(), parameters: z.array(fieldSchema), returnType: z.string(), examples: z.array(z.string()).optional(),
  })),
  types: z.array(z.object({
    name: z.string(), category: z.string(), description: z.string(), fields: z.array(fieldSchema), variants: z.array(z.string()).optional(), examples: z.array(z.string()).optional(),
  })),
  enums: z.array(z.object({ name: z.string(), values: z.array(z.string()), description: z.string() })),
});

export const defaultSchemaPath = resolve(fileURLToPath(new URL("../data/telegram-bot-api.json", import.meta.url)));

export class SchemaStore {
  private schema?: TelegramSchema;
  private methods = new Map<string, TelegramMethod>();
  private types = new Map<string, TelegramType>();
  private refreshInFlight: Promise<TelegramSchema> | undefined;

  constructor(readonly filePath = defaultSchemaPath, private readonly fetcher: typeof fetchTelegramSchema = fetchTelegramSchema) {}

  async load(): Promise<TelegramSchema> {
    const raw = await readFile(this.filePath, "utf8");
    const parsed = catalogSchema.parse(JSON.parse(raw)) as TelegramSchema;
    this.install(parsed);
    return parsed;
  }

  async initialize(maxAgeMs: number): Promise<{ schema: TelegramSchema; refreshed: boolean; refreshError?: string }> {
    let local: TelegramSchema | undefined;
    try { local = await this.load(); } catch { /* refresh below */ }
    const stale = !local || Date.now() - Date.parse(local.retrievedAt) > maxAgeMs;
    if (!stale) return { schema: local!, refreshed: false };
    try {
      return { schema: await this.refresh(), refreshed: true };
    } catch (error) {
      if (!local) throw error;
      return { schema: local, refreshed: false, refreshError: error instanceof Error ? error.message : String(error) };
    }
  }

  async refresh(): Promise<TelegramSchema> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.fetcher().then(async (schema) => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(schema, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
      await rename(temporary, this.filePath);
      this.install(schema);
      return schema;
    }).finally(() => { this.refreshInFlight = undefined; });
    return this.refreshInFlight;
  }

  getSchema(): TelegramSchema {
    if (!this.schema) throw new Error("Telegram schema is not initialized");
    return this.schema;
  }

  getMethod(name: string): TelegramMethod | undefined { return this.methods.get(name.toLowerCase()); }
  getType(name: string): TelegramType | undefined { return this.types.get(name.toLowerCase()); }

  private install(schema: TelegramSchema): void {
    this.schema = schema;
    this.methods = new Map(schema.methods.map((method) => [method.name.toLowerCase(), method]));
    this.types = new Map(schema.types.map((type) => [type.name.toLowerCase(), type]));
  }
}
