<p align="center">
  <img width="640" alt="Dynamic Telegram Bot API MCP Server" src="https://github.com/user-attachments/assets/ed2b38bc-6160-4288-a7c5-1f09f5f9bb6f" />
</p>

# Dynamic Telegram Bot API MCP Server

<p align="center">
  <a href="https://github.com/PrimeUpYourLife/dynamic-telegram-bot-api-mcp/actions/workflows/refresh-schema.yml"><img alt="Refresh Telegram Bot API schema" src="https://github.com/PrimeUpYourLife/dynamic-telegram-bot-api-mcp/actions/workflows/refresh-schema.yml/badge.svg" /></a>
  <a href="https://github.com/PrimeUpYourLife/dynamic-telegram-bot-api-mcp/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/PrimeUpYourLife/dynamic-telegram-bot-api-mcp?logo=github" /></a>
  <a href="https://www.npmjs.com/package/dynamic-telegram-bot-api-mcp"><img alt="npm version" src="https://img.shields.io/npm/v/dynamic-telegram-bot-api-mcp?logo=npm" /></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/PrimeUpYourLife/dynamic-telegram-bot-api-mcp" /></a>
</p>

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

## Requirements and installation

- Node.js 20.18.1 or later
- A bot token from [@BotFather](https://t.me/BotFather) for API calls (catalog tools work without one)

### Install from npm

Run the published [npm package](https://www.npmjs.com/package/dynamic-telegram-bot-api-mcp) directly with `npx`—no repository checkout or build is required:

Create a `.env` in each project with that project's bot token:

```dotenv
TELEGRAM_BOT_TOKEN=YOUR_PROJECT_BOT_TOKEN
TELEGRAM_METHOD_ALLOWLIST=get*,sendMessage,sendPhoto
```

Then set the MCP server's working directory to the project root:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["-y", "dynamic-telegram-bot-api-mcp"],
      "cwd": "/absolute/path/to/project"
    }
  }
}
```

Alternatively, install it globally with `npm install -g dynamic-telegram-bot-api-mcp` and use `"command": "telegram-bot-api-mcp"` in the configuration above, omitting `args`.

### Install from GitHub

Clone and build the [GitHub repository](https://github.com/PrimeUpYourLife/dynamic-telegram-bot-api-mcp):

```bash
git clone https://github.com/PrimeUpYourLife/dynamic-telegram-bot-api-mcp.git
cd dynamic-telegram-bot-api-mcp
npm ci
npm run build
```

Then configure an MCP client to start the built stdio server. Use an absolute repository path:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["/absolute/path/dynamic-telegram-bot-api-mcp/dist/index.js"],
      "cwd": "/absolute/path/to/project"
    }
  }
}
```

At startup, the server loads `.env` from its current working directory. This lets the same MCP server configuration use a different token for each project. It does not search parent directories; set `cwd` explicitly if the MCP client does not launch the server from the project root. Variables supplied by the MCP client or exported in the process environment take precedence over `.env`.

For local development from the GitHub checkout, run `npm run dev`; the checkout's `.env` is loaded automatically. Never commit a token.

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

Descriptors also work inside nested media objects. For fields documented with `attach://`, local paths are replaced with attachment references and the request is sent as `multipart/form-data`. Upload bytes are normalized to an `ArrayBuffer`-backed copy before constructing each multipart file. Paths are resolved through `realpath`, restricted to configured roots, required to be regular files, and size-limited.

## Configuration

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | unset | Bot token loaded from the process environment or current project `.env`; required only by `telegram_call_method` |
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

- The bot token is read only from the process environment or the current project `.env`. It is never included in tool output or audit fields, and defensive redaction is applied to Telegram descriptions.
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

## Publishing

Publishing to npm requires manually dispatching `.github/workflows/publish-npm.yml` with a Git tag that matches the package version (for example, `v1.1.0` for version `1.1.0`). The workflow checks that version, runs the type-check, test, and build commands, then publishes to npm with provenance. Leave the prerelease option disabled to use the `latest` npm tag, or enable it to use `next`.

Configure npm trusted publishing for this repository and the `publish-npm.yml` workflow before publishing. Allow the trusted publisher to run `npm publish`; leave its environment name empty because the workflow does not use a GitHub environment. The workflow deliberately omits `NODE_AUTH_TOKEN` so npm uses the short-lived OIDC credential granted by its `id-token: write` permission. If the package does not exist on npm yet, create it with a one-time manual publication using secure npm authentication, then configure trusted publishing for subsequent publications. Update the version in both `package.json` and `package-lock.json` and create the matching Git tag before dispatching the workflow.

## Architecture

```text
src/
  config.ts                process and project-local .env configuration
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
