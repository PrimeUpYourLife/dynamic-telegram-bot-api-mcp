import { readFile, realpath, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve, sep } from "node:path";
import type { SchemaField, TelegramType } from "./schema.js";
import type { SchemaStore } from "./schema-store.js";
import { isUploadDescriptor } from "./validation.js";

export interface UploadPart { name: string; filename: string; contentType: string; data: Uint8Array }
export interface PreparedParameters { parameters: Record<string, unknown>; uploads: UploadPart[] }

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".pdf": "application/pdf",
  ".json": "application/json", ".txt": "text/plain",
};

function fileCapable(field?: SchemaField): boolean {
  return Boolean(field && (/InputFile/i.test(field.type) || /attach:\/\/|upload a new/i.test(field.description)));
}

function looksLikeLocalPath(value: string): boolean {
  return isAbsolute(value) || value.startsWith("./") || value.startsWith("../") || value.includes("/") || value.includes("\\");
}

function isInside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

export class UploadProcessor {
  private counter = 0;
  private uploads: UploadPart[] = [];

  constructor(private readonly store: SchemaStore, private readonly roots: string[], private readonly maxBytes: number) {}

  async prepare(parameters: Record<string, unknown>, fields: SchemaField[]): Promise<PreparedParameters> {
    this.counter = 0;
    this.uploads = [];
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const fieldMap = new Map(fields.map((field) => [field.name, field]));
    for (const [key, value] of Object.entries(parameters)) result[key] = await this.process(value, fieldMap.get(key));
    return { parameters: result, uploads: this.uploads };
  }

  private async process(value: unknown, field?: SchemaField): Promise<unknown> {
    if (isUploadDescriptor(value)) return this.addDescriptor(value as Record<string, unknown>);
    if (typeof value === "string" && fileCapable(field)) {
      if (/^https?:\/\//i.test(value) || value.startsWith("attach://")) return value;
      if (looksLikeLocalPath(value)) return this.addFile(value);
      return value;
    }
    if (Array.isArray(value)) {
      const itemType = field?.type.match(/^Array of (.+)$/i)?.[1];
      const itemField = itemType ? { name: field?.name ?? "item", type: itemType, required: true, description: field?.description ?? "" } : undefined;
      return Promise.all(value.map((item) => this.process(item, itemField)));
    }
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      const definition = field ? this.resolveType(field.type, object) : undefined;
      const fields = new Map(definition?.fields.map((item) => [item.name, item]) ?? []);
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const [key, child] of Object.entries(object)) result[key] = await this.process(child, fields.get(key));
      return result;
    }
    return value;
  }

  private resolveType(rawType: string, value: Record<string, unknown>): TelegramType | undefined {
    const candidates = rawType.split(/\s+or\s+/i).map((part) => this.store.getType(part.trim())).filter((item): item is TelegramType => Boolean(item));
    for (const candidate of candidates) {
      if (!candidate.variants?.length) return candidate;
      for (const variant of candidate.variants) {
        const definition = this.store.getType(variant);
        const discriminator = definition?.fields.find((field) => field.name === "type" && field.enum?.includes(String(value.type)));
        if (definition && discriminator) return definition;
      }
    }
    return candidates[0];
  }

  private async addDescriptor(value: Record<string, unknown>): Promise<string> {
    if (typeof value.path === "string") return this.addFile(value.path, typeof value.filename === "string" ? value.filename : undefined, typeof value.contentType === "string" ? value.contentType : undefined);
    const encoded = (typeof value.base64 === "string" ? value.base64 : String(value.data ?? "")).replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) throw new Error("Binary upload data is not valid base64");
    if (encoded.length > Math.ceil(this.maxBytes / 3) * 4 + 4) throw new Error(`Binary upload must be at most ${this.maxBytes} bytes`);
    const data = Buffer.from(encoded, "base64");
    if (!encoded || data.length > this.maxBytes) throw new Error(`Binary upload must be non-empty and at most ${this.maxBytes} bytes`);
    const filename = typeof value.filename === "string" ? basename(value.filename) : "upload.bin";
    return this.addPart(filename, typeof value.contentType === "string" ? value.contentType : "application/octet-stream", data);
  }

  private async addFile(path: string, requestedName?: string, requestedType?: string): Promise<string> {
    const resolved = await realpath(resolve(path));
    const realRoots = await Promise.all(this.roots.map((root) => realpath(root)));
    if (!realRoots.some((root) => isInside(resolved, root))) throw new Error("Local file is outside TELEGRAM_LOCAL_FILE_ROOTS");
    const metadata = await stat(resolved);
    if (!metadata.isFile()) throw new Error("Local upload path is not a regular file");
    if (metadata.size > this.maxBytes) throw new Error(`Local file exceeds TELEGRAM_MAX_UPLOAD_BYTES (${this.maxBytes})`);
    const filename = basename(requestedName ?? resolved);
    const contentType = requestedType ?? mimeTypes[extname(filename).toLowerCase()] ?? "application/octet-stream";
    return this.addPart(filename, contentType, await readFile(resolved));
  }

  private addPart(filename: string, contentType: string, data: Uint8Array): string {
    const name = `file_${++this.counter}`;
    this.uploads.push({ name, filename, contentType, data });
    return `attach://${name}`;
  }
}
