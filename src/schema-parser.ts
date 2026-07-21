import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import {
  TELEGRAM_BOT_API_URL,
  type SchemaField,
  type TelegramEnum,
  type TelegramMethod,
  type TelegramSchema,
  type TelegramType,
} from "./schema.js";

const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();

function sectionNodes(heading: AnyNode): AnyNode[] {
  const result: AnyNode[] = [];
  let current = heading.nextSibling;
  while (current) {
    if (current.type === "tag" && (current.name === "h3" || current.name === "h4")) break;
    result.push(current);
    current = current.nextSibling;
  }
  return result;
}

function sectionText($: cheerio.CheerioAPI, nodes: AnyNode[]): string {
  const paragraphs: string[] = [];
  for (const node of nodes) {
    if (node.type !== "tag") continue;
    const element = $(node);
    if (["p", "blockquote", "ul", "ol"].includes(node.name)) {
      const text = normalize(element.text());
      if (text) paragraphs.push(text);
    }
  }
  return paragraphs.join("\n");
}

function extractEnum(description: string): string[] | undefined {
  if (!/(?:must be|can be|one of|always|currently)/i.test(description)) return undefined;
  const values = new Set<string>();
  for (const match of description.matchAll(/[“\"]([^”\"]+)[”\"]/g)) {
    const value = match[1]?.trim();
    if (value && /^[a-zA-Z0-9_+.-]{1,80}$/.test(value)) values.add(value);
  }
  // Unquoted fixed values are useful for discriminator fields ("Type of ..., must be photo"),
  // but a general "must be" match misclassifies constraints such as "must be between 1 and 10".
  const fixedValue = description.match(/\bType of [^.]{0,140}?,\s*must be\s+([a-z][a-z0-9_+.-]{0,79})(?:\b|$)/i)?.[1];
  if (fixedValue) values.add(fixedValue);
  return values.size ? [...values] : undefined;
}

function tableFields($: cheerio.CheerioAPI, nodes: AnyNode[], isMethod: boolean): SchemaField[] {
  const tableNode = nodes.find((node) => node.type === "tag" && node.name === "table");
  if (!tableNode) return [];
  const result: SchemaField[] = [];
  $(tableNode)
    .find("tr")
    .slice(1)
    .each((_index, row) => {
      const cells = $(row).find("td").toArray().map((cell) => normalize($(cell).text()));
      const expected = isMethod ? 4 : 3;
      if (cells.length < expected) return;
      const name = cells[0] ?? "";
      const type = cells[1] ?? "";
      const requiredText = isMethod ? cells[2] ?? "" : "";
      const description = cells[isMethod ? 3 : 2] ?? "";
      if (!name || !type) return;
      const enumValues = extractEnum(description);
      const field: SchemaField = {
        name,
        type,
        required: isMethod ? /^yes$/i.test(requiredText) : !/^optional\b/i.test(description),
        description,
      };
      if (enumValues) field.enum = enumValues;
      result.push(field);
    });
  return result;
}

function nearestCategory($: cheerio.CheerioAPI, heading: AnyNode): string {
  let current = heading.previousSibling;
  while (current) {
    if (current.type === "tag" && current.name === "h3") return normalize($(current).text());
    current = current.previousSibling;
  }
  return "General";
}

function extractReturnType(description: string): string {
  const patterns = [
    /Returns? (.+?) on success(?:\.|$)/i,
    /On success, (?:a |an )?(.+?) is returned(?:\.|$)/i,
    /On success, returns? (.+?)(?:\.|$)/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]) return normalize(match[1]);
  }
  const returnSentences = description.split(/(?<=\.)\s+/).filter((sentence) => /\breturns?\b/i.test(sentence)).reverse();
  for (const sentence of returnSentences) {
    const array = sentence.match(/\bReturns? an Array of ([A-Z][A-Za-z0-9]+) objects/i)?.[1];
    if (array) return `Array of ${array}`;
    const object = sentence.match(/\bReturns?.*?\b(?:as|form of) (?:a |an )?([A-Z][A-Za-z0-9]+) object/i)?.[1]
      ?? sentence.match(/\bReturns? (?:a |an )?([A-Z][A-Za-z0-9]+) object/i)?.[1];
    if (object) return object;
  }
  return "Unknown";
}

function examples($: cheerio.CheerioAPI, nodes: AnyNode[]): string[] | undefined {
  const values = nodes
    .filter((node) => node.type === "tag" && node.name === "pre")
    .map((node) => $(node).text().trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

function variants($: cheerio.CheerioAPI, nodes: AnyNode[], description: string): string[] | undefined {
  if (!/(?:one of|any of|can be|following\s+\d*\s*types|types? (?:are|is) supported)/i.test(description)) return undefined;
  const values = new Set<string>();
  for (const node of nodes) {
    if (node.type !== "tag" || !["p", "ul", "ol"].includes(node.name)) continue;
    $(node)
      .find("a")
      .each((_index, anchor) => {
        const value = normalize($(anchor).text());
        if (/^[A-Z][A-Za-z0-9]+$/.test(value)) values.add(value);
      });
  }
  return values.size ? [...values] : undefined;
}

function schemaEnums(methods: TelegramMethod[], types: TelegramType[]): TelegramEnum[] {
  const result: TelegramEnum[] = [];
  for (const owner of [...methods, ...types]) {
    const fields = "parameters" in owner ? owner.parameters : owner.fields;
    for (const field of fields) {
      if (!field.enum?.length) continue;
      result.push({
        name: `${owner.name}.${field.name}`,
        values: field.enum,
        description: field.description,
      });
    }
  }
  return result;
}

/** Parse the official Bot API HTML into a stable, transport-independent catalog. */
export function parseTelegramSchema(
  html: string,
  retrievedAt = new Date().toISOString(),
  minimumEntries: { methods: number; types: number } = { methods: 100, types: 100 },
): TelegramSchema {
  const $ = cheerio.load(html);
  const content = $("#dev_page_content, .dev_page_content").first();
  if (!content.length) throw new Error("Official Telegram documentation has no Bot API content element");

  const recentText = normalize(content.find("h3").filter((_i, item) => /recent changes/i.test($(item).text())).first().nextAll().slice(0, 8).text());
  const version = recentText.match(/Bot API\s+([0-9]+(?:\.[0-9]+)?)/i)?.[1] ?? "unknown";
  const methods: TelegramMethod[] = [];
  const types: TelegramType[] = [];

  content.find("h4").each((_index, element) => {
    const name = normalize($(element).text());
    if (!/^[A-Za-z][A-Za-z0-9]+$/.test(name)) return;
    const nodes = sectionNodes(element);
    const description = sectionText($, nodes);
    const category = nearestCategory($, element);
    const isMethod = /^[a-z]/.test(name);
    const sampleValues = examples($, nodes);

    if (isMethod) {
      const method: TelegramMethod = {
        name,
        category,
        description,
        parameters: tableFields($, nodes, true),
        returnType: extractReturnType(description),
      };
      if (sampleValues) method.examples = sampleValues;
      methods.push(method);
    } else {
      const type: TelegramType = {
        name,
        category,
        description,
        fields: tableFields($, nodes, false),
      };
      const typeVariants = variants($, nodes, description);
      if (typeVariants) type.variants = typeVariants;
      if (sampleValues) type.examples = sampleValues;
      types.push(type);
    }
  });

  if (methods.length < minimumEntries.methods || types.length < minimumEntries.types) {
    throw new Error(`Parsed schema is unexpectedly small (${methods.length} methods, ${types.length} types)`);
  }

  return {
    source: TELEGRAM_BOT_API_URL,
    retrievedAt,
    version,
    methods,
    types,
    enums: schemaEnums(methods, types),
  };
}

export async function fetchTelegramSchema(
  fetchImplementation: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<TelegramSchema> {
  const response = await fetchImplementation(TELEGRAM_BOT_API_URL, {
    headers: { "user-agent": "dynamic-telegram-bot-api-mcp/1.0 (+schema-refresh)" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Telegram documentation returned HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 20 * 1024 * 1024) throw new Error("Telegram documentation exceeds the 20 MB safety limit");
  const html = await response.text();
  if (html.length > 20 * 1024 * 1024) throw new Error("Telegram documentation exceeds the 20 MB safety limit");
  return parseTelegramSchema(html);
}
