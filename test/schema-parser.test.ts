import { describe, expect, it } from "vitest";
import { parseTelegramSchema } from "../src/schema-parser.js";

const fixture = `<!doctype html><div id="dev_page_content">
<h3>Recent changes</h3><h4>July 14, 2026</h4><p>Bot API 10.2</p>
<h3>Available types</h3>
<h4><a>User</a></h4><p>This object represents a user.</p>
<table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td>id</td><td>Integer</td><td>Unique id</td></tr>
<tr><td>kind</td><td>String</td><td>Optional. Must be “human” or “bot”</td></tr></table>
<h3>Available methods</h3>
<h4><a>getUsers</a></h4><p>Use this method. Returns an Array of User objects.</p>
<table><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
<tr><td>limit</td><td>Integer</td><td>Yes</td><td>Maximum count</td></tr></table>
</div>`;

describe("parseTelegramSchema", () => {
  it("normalizes methods, types, return types, and enums", () => {
    const schema = parseTelegramSchema(fixture, "2026-07-21T00:00:00.000Z", { methods: 1, types: 1 });
    expect(schema.version).toBe("10.2");
    expect(schema.methods[0]).toMatchObject({ name: "getUsers", returnType: "Array of User" });
    expect(schema.methods[0]?.parameters[0]).toMatchObject({ name: "limit", required: true });
    expect(schema.types[0]?.fields[1]?.enum).toEqual(["human", "bot"]);
    expect(schema.enums[0]?.name).toBe("User.kind");
  });

  it("rejects suspiciously incomplete source documents", () => {
    expect(() => parseTelegramSchema(fixture)).toThrow(/unexpectedly small/);
  });
});
