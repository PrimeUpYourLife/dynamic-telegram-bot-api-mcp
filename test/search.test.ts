import { describe, expect, it } from "vitest";
import { searchMethods } from "../src/search.js";
import type { TelegramMethod } from "../src/schema.js";

const methods: TelegramMethod[] = [
  { name: "sendPhoto", category: "Available methods", description: "Send an image", parameters: [{ name: "photo", type: "InputFile", required: true, description: "Photo" }], returnType: "Message" },
  { name: "deleteMessage", category: "Updating messages", description: "Delete a message", parameters: [{ name: "message_id", type: "Integer", required: true, description: "Message" }], returnType: "True" },
];

describe("searchMethods", () => {
  it("finds camel-case names using natural language", () => {
    expect(searchMethods(methods, "send photo")[0]?.name).toBe("sendPhoto");
  });

  it("searches parameter names", () => {
    expect(searchMethods(methods, "message id")[0]?.name).toBe("deleteMessage");
  });
});
