import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { TelegramMethod, TelegramSchema } from "../src/schema.js";
import { SchemaStore } from "../src/schema-store.js";
import { validateMethodParameters } from "../src/validation.js";

const method: TelegramMethod = {
  name: "sendMessage", category: "Messages", description: "Send text", returnType: "Message",
  parameters: [
    { name: "chat_id", type: "Integer or String", required: true, description: "Chat" },
    { name: "text", type: "String", required: true, description: "Text" },
    { name: "reply_markup", type: "Markup", required: false, description: "Markup" },
  ],
};
const schema: TelegramSchema = {
  source: "https://core.telegram.org/bots/api", retrievedAt: "2026-07-21T00:00:00.000Z", version: "10.2", methods: [method],
  types: [{ name: "Markup", category: "Types", description: "Markup", fields: [{ name: "enabled", type: "Boolean", required: true, description: "Enabled" }] }], enums: [],
};

describe("validateMethodParameters", () => {
  let store: SchemaStore;
  beforeEach(async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-schema-"));
    const file = join(directory, "schema.json");
    await writeFile(file, JSON.stringify(schema));
    store = new SchemaStore(file);
    await store.load();
  });

  it("accepts valid primitive and nested object values", () => {
    expect(validateMethodParameters(method, { chat_id: 1, text: "hello", reply_markup: { enabled: true } }, store).valid).toBe(true);
  });

  it("reports required, primitive, nested, and unknown parameter errors", () => {
    const result = validateMethodParameters(method, { chat_id: false, reply_markup: { surprise: 1 }, surprise: 1 }, store);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(["chat_id", "text", "reply_markup.enabled", "reply_markup.surprise", "surprise"]));
  });
});
