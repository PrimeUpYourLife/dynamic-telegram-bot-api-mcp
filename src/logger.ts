export type LogLevel = "debug" | "info" | "warn" | "error";

const priorities: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class Logger {
  private readonly minimum: number;

  constructor(level: LogLevel = "info") {
    this.minimum = priorities[level];
  }

  log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
    if (priorities[level] < this.minimum) return;
    process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields })}\n`);
  }

  debug(event: string, fields?: Record<string, unknown>): void { this.log("debug", event, fields); }
  info(event: string, fields?: Record<string, unknown>): void { this.log("info", event, fields); }
  warn(event: string, fields?: Record<string, unknown>): void { this.log("warn", event, fields); }
  error(event: string, fields?: Record<string, unknown>): void { this.log("error", event, fields); }
}
