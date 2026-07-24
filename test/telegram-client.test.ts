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

  it("constructs multipart uploads from ArrayBufferLike-backed bytes", async () => {
    const mockedFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }));
    const client = new TelegramClient({ token: "secret", baseUrl: "https://api.telegram.org", timeoutMs: 1000, retries: 0, limiter: new RateLimiter(100, 100), logger: new Logger("error"), fetchImplementation: mockedFetch });
    const data = new Uint8Array(new SharedArrayBuffer(3));
    data.set([1, 2, 3]);

    await client.call("sendDocument", { document: "attach://file_1" }, [{ name: "file_1", filename: "file.bin", contentType: "application/octet-stream", data }]);

    const body = mockedFetch.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    const file = (body as FormData).get("file_1");
    expect(file).toBeInstanceOf(Blob);
    expect(Array.from(new Uint8Array(await (file as Blob).arrayBuffer()))).toEqual([1, 2, 3]);
  });
});
