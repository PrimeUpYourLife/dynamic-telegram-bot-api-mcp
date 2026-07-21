# Dynamic Telegram Bot API MCP Server

A production-oriented [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes the complete Telegram Bot API through five stable tools. It parses Telegram's official documentation into a normalized local catalog, so new Bot API methods and objects become available after a schema refresh without source-code changes.

The checked-in catalog currently targets Telegram Bot API 10.2 and contains every method and type published in the official documentation.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `telegram_search_methods` | Fuzzy-search names, descriptions, categories, and parameter names |
| `telegram_get_method` | Retrieve a method's parameters, required flags, descriptions, return type, and examples |
| `telegram_get_type` | Retrieve an object's fields, union variants, descriptions, and enums |
| `telegram_call_method` | Validate and execute any cataloged Bot API method |
| `telegram_refresh_schema` | Fetch and atomically install the latest official schema |

There is deliberately no generated tool per Bot API method. The catalog and generic call tool are the API surface.

## Requirements and setup

- Node.js 20.18.1 or later
- A bot token from [@BotFather](https://t.me/BotFather) for API calls (catalog tools work without one)

```bash
npm install
npm run build
```

Configure an MCP client to start the built stdio server. Use an absolute repository path:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["/absolute/path/dynamic-telegram-bot-api-mcp/dist/index.js"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "YOUR_BOT_TOKEN",
        "TELEGRAM_METHOD_ALLOWLIST": "get*,sendMessage,sendPhoto"
      }
    }
  }
}
```

For local development, run `npm run dev`. Never commit the token; `.env` is ignored, but environment files are not loaded automatically.

## Tool examples

Search:

```json
{ "search": "send photo", "limit": 10 }
```

Inspect a method or object:

```json
{ "method": "sendPhoto" }
```

```json
{ "type": "InlineKeyboardMarkup" }
```

Call any method:

```json
{
  "method": "sendMessage",
  "parameters": {
    "chat_id": 123456789,
    "text": "Hello"
  }
}
```

Method lookup is case-insensitive. Parameter names follow Telegram's official `snake_case` contract.

### File uploads

File IDs and HTTP URLs pass through unchanged. A local path may be supplied for an InputFile-capable field:

```json
{
  "method": "sendPhoto",
  "parameters": {
    "chat_id": 123456789,
    "photo": "./uploads/photo.jpg"
  }
}
```

For an explicit local upload descriptor or in-memory binary payload:

```json
{ "path": "./uploads/photo.jpg", "filename": "photo.jpg", "contentType": "image/jpeg" }
```

```json
{ "base64": "iVBORw0KGgo...", "filename": "photo.png", "contentType": "image/png" }
```

Descriptors also work inside nested media objects. For fields documented with `attach://`, local paths are replaced with attachment references and the request is sent as `multipart/form-data`. Paths are resolved through `realpath`, restricted to configured roots, required to be regular files, and size-limited.

## Configuration

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | unset | Bot token; required only by `telegram_call_method` |
| `TELEGRAM_API_BASE_URL` | `https://api.telegram.org` | API origin, including for a local Bot API server |
| `TELEGRAM_METHOD_ALLOWLIST` | `*` | Comma-separated exact names or `*` glob patterns |
| `TELEGRAM_REQUEST_TIMEOUT_MS` | `30000` | Per-attempt timeout |
| `TELEGRAM_REQUEST_RETRIES` | `2` | Retries for transport failures, HTTP 429, and 5xx responses |
| `TELEGRAM_RATE_LIMIT_PER_SECOND` | `25` | Process-local token refill rate |
| `TELEGRAM_RATE_LIMIT_BURST` | `30` | Process-local burst capacity |
| `TELEGRAM_SCHEMA_MAX_AGE_HOURS` | `24` | Startup refresh threshold |
| `TELEGRAM_SCHEMA_PATH` | bundled `data/telegram-bot-api.json` | Alternate catalog location |
| `TELEGRAM_LOCAL_FILE_ROOTS` | current directory | Platform-delimited upload root allowlist |
| `TELEGRAM_MAX_UPLOAD_BYTES` | `52428800` | Per-file memory and local upload limit |
| `TELEGRAM_ALLOW_UNKNOWN_PARAMETERS` | `false` | Forward-compatibility escape hatch during a stale-schema incident |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |

## Validation and error behavior

The gateway validates method existence, unknown and required parameters, primitive types, arrays, nested Telegram objects, union variants, and cataloged enum values before sending a request. Telegram's prose contains some conditional rules that cannot be represented mechanically; Telegram remains authoritative for those constraints.

Tool failures are marked as MCP errors and return structured content:

```json
{
  "ok": false,
  "error": "VALIDATION_ERROR",
  "description": "text: required parameter is missing",
  "parameters": {
    "issues": [{ "path": "text", "message": "required parameter is missing" }]
  }
}
```

Telegram error codes, descriptions, and response parameters such as `retry_after` and `migrate_to_chat_id` are preserved. HTTP error bodies and stack traces are not exposed.

## Security model

- The bot token is read only from the environment. It is never included in tool output or audit fields, and defensive redaction is applied to Telegram descriptions.
- Audit records are JSON lines on stderr and contain method name, parameter names, timing, retry count, and status—not parameter values.
- Destructive method families (for example `delete*`, `ban*`, `revoke*`, `refund*`, and `stop*`) require `confirm: true`.
- `TELEGRAM_METHOD_ALLOWLIST` can limit methods available to the call tool. Prefer a narrow production allowlist.
- Local files are confined to `TELEGRAM_LOCAL_FILE_ROOTS`; symlink escapes and non-regular files are rejected.
- Rate limiting is process-local. Use an external distributed limiter when running multiple replicas.

Retries can duplicate non-idempotent operations if the network fails after Telegram accepts a request. Set `TELEGRAM_REQUEST_RETRIES=0` for workloads where that risk outweighs availability.

## Schema updates

At startup, the server refreshes catalogs older than 24 hours. If an existing catalog is available and Telegram cannot be reached or the documentation shape fails integrity checks, startup continues with the last valid catalog. A first startup without any valid catalog fails closed.

Refresh manually with the MCP tool or:

```bash
npm run refresh-schema
```

The daily GitHub Actions workflow refreshes the catalog, tests and builds the project, and commits only when `data/telegram-bot-api.json` changes. Writes are atomic, and concurrent in-process refreshes are coalesced.

## Architecture

```text
src/
  index.ts                 stdio entrypoint and startup refresh
  server.ts                MCP server composition
  telegram-client.ts       HTTP, timeout, retry, error, and audit behavior
  schema-store.ts          validated catalog loading and atomic refresh
  schema-parser.ts         official-documentation parser
  validation.ts            recursive runtime validation
  uploads.ts               safe InputFile and multipart handling
  tools/                   five stable MCP tool registrations
data/
  telegram-bot-api.json    normalized generated catalog
scripts/
  refresh-schema.ts        command-line refresh entrypoint
```

## Development

```bash
npm run check
npm test
npm run build
```

The parser has minimum method/type count guards to prevent a changed or partial documentation page from replacing a good catalog. When Telegram changes the HTML presentation rather than merely adding API entries, update the parser and its fixture test.

## License

[MIT](LICENSE)
