export class RateLimiter {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(private readonly ratePerSecond: number, private readonly burst: number) {
    this.tokens = burst;
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const delay = Math.max(1, Math.ceil(1000 / this.ratePerSecond));
      await new Promise<void>((resolvePromise, reject) => {
        const timer = setTimeout(resolvePromise, delay);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason ?? new Error("Request aborted"));
        }, { once: true });
      });
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsedSeconds * this.ratePerSecond);
    this.lastRefill = now;
  }
}
