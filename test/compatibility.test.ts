import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { Logger } from "../src/logger.js";
import { packageVersion } from "../src/version.js";
import { loadConfig } from "../src/config.js";
import { SchemaStore } from "../src/schema-store.js";
const store = new SchemaStore();
await store.load();
const context = { store, config: loadConfig({}, process.cwd()), logger: new Logger("error") };

describe("portable MCP contract", () => {
  it("negotiates identity, discovers five tools, and preserves structured/text error parity without credentials", async () => {
    const server = createServer(context);
    const client = new Client({ name: "provider-neutral-conformance", version: "1.0.0" }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect(client.getServerVersion()?.version).toBe(packageVersion);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "telegram_search_methods", "telegram_get_method", "telegram_get_type", "telegram_call_method", "telegram_refresh_schema"
      ].sort());
      expect(tools.find((tool) => tool.name === "telegram_get_method")?.annotations?.readOnlyHint).toBe(true);
      expect(tools.find((tool) => tool.name === "telegram_call_method")?.annotations?.readOnlyHint).toBe(false);
      const result = await client.callTool({ name: "telegram_get_method", arguments: { method: "__unknown_contract_fixture__" } });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ ok: false });
      const first = (result.content as Array<{ type: string; text?: string }>)[0];
      expect(first?.type).toBe("text");
      expect(JSON.parse(first?.text ?? "{}")).toEqual(result.structuredContent);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("aligns registry identity and versions with the installed package", () => {
    const load = (name: string) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
    const pkg = load("package.json");
    const registry = load("server.json");
    expect(registry.name).toBe(pkg.mcpName);
    expect(registry.version).toBe(pkg.version);
    expect(registry.packages[0].version).toBe(pkg.version);
    expect(registry.packages[0].identifier).toBe(pkg.name);
    expect(registry.packages[0].transport.type).toBe("stdio");
  });
});

