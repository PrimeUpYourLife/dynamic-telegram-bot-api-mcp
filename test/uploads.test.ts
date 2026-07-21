import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { SchemaField, TelegramSchema } from "../src/schema.js";
import { SchemaStore } from "../src/schema-store.js";
import { UploadProcessor } from "../src/uploads.js";

const inputFile: SchemaField = { name: "photo", type: "InputFile or String", required: true, description: "Photo to upload" };
const schema: TelegramSchema = {
  source: "https://core.telegram.org/bots/api", retrievedAt: "2026-07-21T00:00:00.000Z", version: "10.2", methods: [], types: [], enums: [],
};

describe("UploadProcessor", () => {
  let root: string;
  let store: SchemaStore;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "telegram-upload-"));
    const catalog = join(root, "schema.json");
    await writeFile(catalog, JSON.stringify(schema));
    store = new SchemaStore(catalog);
    await store.load();
  });

  it("converts local files into multipart attachments", async () => {
    const file = join(root, "photo.jpg");
    await writeFile(file, "image-data");
    const prepared = await new UploadProcessor(store, [root], 1024).prepare({ photo: file }, [inputFile]);
    expect(prepared.parameters.photo).toBe("attach://file_1");
    expect(prepared.uploads[0]).toMatchObject({ name: "file_1", filename: "photo.jpg", contentType: "image/jpeg" });
  });

  it("accepts base64 descriptors", async () => {
    const prepared = await new UploadProcessor(store, [root], 1024).prepare({ photo: { base64: Buffer.from("abc").toString("base64"), filename: "a.bin" } }, [inputFile]);
    expect(Buffer.from(prepared.uploads[0]!.data).toString()).toBe("abc");
  });

  it("rejects files outside configured roots", async () => {
    const outside = join(await mkdtemp(join(tmpdir(), "telegram-outside-")), "secret.txt");
    await writeFile(outside, "secret");
    await expect(new UploadProcessor(store, [root], 1024).prepare({ photo: outside }, [inputFile])).rejects.toThrow(/outside/);
  });
});
