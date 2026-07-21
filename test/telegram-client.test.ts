import { describe, expect, it, vi } from "vitest";
import { Logger } from "../src/logger.js";
import { RateLimiter } from "../src/rate-limiter.js";
import { TelegramApiError, TelegramClient } from "../src/telegram-client.js";

describe("TelegramClient", () => {
  it("returns typed success JSON", async () => {
    const mockedFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { id: 1 } }), { status: 200 }));
    const client = new TelegramClient({ token: "secret", baseUrl: "https://api.telegram.org", timeoutMs: 1000, retries: 0, limiter: new RateLimiter(100, 100), logger: new Logger("error"), fetchImplementation: mockedFetch });
    await expect(client.call("getMe", {})).resolves.toEqual({ ok: true, result: { id: 1 } });
    expect(mockedFetch.mock.calls[0]?.[0]).toBe("https://api.telegram.org/botsecret/getMe");
  });

  it("preserves structured Telegram errors and redacts a leaked token", async () => {
    const mockedFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: false, error_code: 400, description: "bad secret", parameters: { migrate_to_chat_id: 2 } }), { status: 400 }));
    const client = new TelegramClient({ token: "secret", baseUrl: "https://api.telegram.org", timeoutMs: 1000, retries: 0, limiter: new RateLimiter(100, 100), logger: new Logger("error"), fetchImplementation: mockedFetch });
    const error = await client.call("sendMessage", {}).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(TelegramApiError);
    expect((error as TelegramApiError).toJSON()).toEqual({ ok: false, error_code: 400, description: "bad [REDACTED]", parameters: { migrate_to_chat_id: 2 } });
  });
});
