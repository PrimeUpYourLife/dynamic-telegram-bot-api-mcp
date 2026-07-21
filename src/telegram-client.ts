import type { Logger } from "./logger.js";
import { RateLimiter } from "./rate-limiter.js";
import type { UploadPart } from "./uploads.js";

export interface TelegramSuccess<T = unknown> { ok: true; result: T }
export interface TelegramFailure {
  ok: false;
  error_code?: number;
  description: string;
  parameters?: Record<string, unknown>;
}
export type TelegramResponse<T = unknown> = TelegramSuccess<T> | TelegramFailure;

export class TelegramApiError extends Error {
  readonly ok = false;
  constructor(readonly errorCode: number | undefined, description: string, readonly parameters?: Record<string, unknown>) {
    super(description);
    this.name = "TelegramApiError";
  }
  toJSON(): TelegramFailure {
    const result: TelegramFailure = { ok: false, description: this.message };
    if (this.errorCode !== undefined) result.error_code = this.errorCode;
    if (this.parameters) result.parameters = this.parameters;
    return result;
  }
}

export interface TelegramClientOptions {
  token: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  limiter: RateLimiter;
  logger: Logger;
  fetchImplementation?: typeof fetch;
}

const wait = (milliseconds: number): Promise<void> => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export class TelegramClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: TelegramClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async call<T = unknown>(method: string, parameters: Record<string, unknown>, uploads: UploadPart[] = []): Promise<TelegramSuccess<T>> {
    await this.options.limiter.acquire();
    const started = Date.now();
    for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("Telegram request timed out")), this.options.timeoutMs);
      try {
        const response = await this.fetchImplementation(this.endpoint(method), {
          method: "POST",
          ...this.body(parameters, uploads),
          signal: controller.signal,
        });
        const payload = await this.parseResponse<T>(response);
        if (payload.ok) {
          this.audit(method, Object.keys(parameters), true, started, attempt);
          return payload;
        }
        if (attempt < this.options.retries && this.retryable(response.status, payload.error_code)) {
          const retryAfter = Number(payload.parameters?.retry_after);
          await wait(Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt);
          continue;
        }
        this.audit(method, Object.keys(parameters), false, started, attempt, payload.error_code);
        throw new TelegramApiError(payload.error_code, this.redact(payload.description), payload.parameters);
      } catch (error) {
        if (error instanceof TelegramApiError) throw error;
        if (attempt < this.options.retries) {
          await wait(250 * 2 ** attempt);
          continue;
        }
        this.audit(method, Object.keys(parameters), false, started, attempt);
        const description = controller.signal.aborted ? "Telegram request timed out" : "Telegram network request failed";
        throw new TelegramApiError(undefined, description);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new TelegramApiError(undefined, "Telegram request failed");
  }

  private endpoint(method: string): string {
    return `${this.options.baseUrl}/bot${this.options.token}/${encodeURIComponent(method)}`;
  }

  private body(parameters: Record<string, unknown>, uploads: UploadPart[]): { headers?: HeadersInit; body: BodyInit } {
    if (!uploads.length) return { headers: { "content-type": "application/json" }, body: JSON.stringify(parameters) };
    const form = new FormData();
    for (const [key, value] of Object.entries(parameters)) {
      form.append(key, typeof value === "object" && value !== null ? JSON.stringify(value) : String(value));
    }
    for (const upload of uploads) form.append(upload.name, new Blob([upload.data], { type: upload.contentType }), upload.filename);
    return { body: form };
  }

  private async parseResponse<T>(response: Response): Promise<TelegramResponse<T>> {
    let value: unknown;
    try { value = await response.json(); } catch { throw new TelegramApiError(response.status, `Telegram returned a non-JSON response (HTTP ${response.status})`); }
    if (!value || typeof value !== "object" || typeof (value as { ok?: unknown }).ok !== "boolean") {
      throw new TelegramApiError(response.status, "Telegram returned a malformed response");
    }
    return value as TelegramResponse<T>;
  }

  private retryable(status: number, errorCode?: number): boolean { return status === 429 || status >= 500 || errorCode === 429; }
  private redact(value: string): string { return value.split(this.options.token).join("[REDACTED]"); }
  private audit(method: string, parameterNames: string[], ok: boolean, started: number, retries: number, errorCode?: number): void {
    this.options.logger.info("telegram_api_call", { method, parameterNames, ok, durationMs: Date.now() - started, retries, errorCode });
  }
}
