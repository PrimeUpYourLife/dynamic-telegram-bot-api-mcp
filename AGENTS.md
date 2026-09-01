# Repository Instructions

These instructions apply to the entire repository. More specific `AGENTS.md` files, if added in subdirectories, may refine them for their subtree.

## Repository Overview

This project is a Node.js 20+ Model Context Protocol server written in strict TypeScript. It exposes the Telegram Bot API through a small, stable set of MCP tools backed by a generated local schema.

Key locations:

- `src/config.ts`: process environment and current-project `.env` loading, validation, and path resolution.
- `src/index.ts`: stdio entrypoint and startup schema refresh.
- `src/project-context.ts`: MCP roots resolution, per-project configuration precedence, and Telegram client caching.
- `src/server.ts`: MCP server composition and tool registration.
- `src/tools/`: implementations of the five public MCP tools.
- `src/telegram-client.ts`: Telegram HTTP calls, retries, errors, auditing, and `ArrayBuffer`-backed multipart file construction.
- `src/schema-parser.ts`, `src/schema-store.ts`, and `src/schema.ts`: schema parsing, validation, persistence, and types.
- `src/validation.ts`: runtime validation of Telegram method arguments.
- `src/uploads.ts`: local-file validation and multipart upload handling.
- `data/telegram-bot-api.json`: generated, checked-in Telegram API catalog.
- `scripts/refresh-schema.ts`: command-line schema refresh.
- `test/`: Vitest test suite.
- `.github/workflows/refresh-schema.yml`: refreshes the schema, synchronizes release versions, creates GitHub releases, and dispatches npm publication.
- `.github/workflows/publish-npm.yml`: validates and publishes a matching Git tag to npm when a GitHub release is published, or when dispatched manually or by the schema refresh workflow.

## Setup and Commands

Use the package scripts as the source of truth:

```bash
npm ci                 # Install exactly from package-lock.json
npm run dev            # Run the TypeScript entrypoint locally
npm run refresh-schema # Refresh the checked-in Telegram schema
npm run check          # Type-check without emitting files
npm test               # Run the Vitest suite once
npm run build          # Compile TypeScript into dist/
```

Use `npm install` instead of `npm ci` only when intentionally changing dependencies and the lockfile.

The scheduled schema refresh maps Telegram Bot API `major.minor` to npm `major.minor.0`, keeps `package.json` and `package-lock.json` synchronized, creates a matching `v<version>` GitHub release, and dispatches `publish-npm.yml` when npm lacks that version. Every published GitHub release also triggers `publish-npm.yml`; prereleases publish with the `next` npm tag. Manual dispatch remains available with the same prerelease option. Configure npm trusted publishing for the workflow and allow it to run `npm publish`. The workflow intentionally omits `NODE_AUTH_TOKEN` so npm uses GitHub OIDC. If the package does not exist on npm yet, create it with a one-time manual publication using secure npm authentication before configuring trusted publishing.

## Change Workflow

1. Inspect the relevant source, tests, documentation, and current Git status before editing. Preserve unrelated user changes.
2. Keep changes focused and follow the existing architecture. Extend the generic catalog/tool design instead of generating one tool per Telegram method.
3. Every code change must add or update an automated test in `test/`. Bug fixes require a regression test that fails without the fix. A code change is not complete without test coverage.
4. Whenever code changes, always update both `README.md` and this `AGENTS.md` in the same change. Keep the README accurate for users and keep this file accurate for contributors and agents. Do not skip these updates because the code appears self-explanatory.
5. Run the narrowest relevant tests while developing, then run the complete validation suite before handing off or committing:

   ```bash
   npm run check
   npm test
   npm run build
   ```

6. Report what changed and which validation commands passed. If a command cannot run, state the reason clearly.

Documentation-only changes do not require a new test, but must still be checked for correctness and consistency.

## Implementation Conventions

- Preserve strict TypeScript settings, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Avoid `any`; narrow `unknown` values explicitly.
- Keep ESM/NodeNext imports compatible with the current codebase, including `.js` extensions in TypeScript import specifiers where the existing code uses them.
- Validate external and schema-derived data at boundaries. Fail closed when no valid schema is available.
- Keep MCP errors structured and actionable. Do not expose raw response bodies, stack traces, secrets, tokens, or parameter values in errors or audit logs.
- Preserve method allowlisting, destructive-method confirmation, retry, timeout, rate-limit, and upload-root protections when changing request behavior.
- Resolve project-specific Telegram configuration only from a single local MCP workspace root. Never guess between multiple roots or silently fall back after a roots request fails.
- Keep network behavior deterministic in tests. Mock HTTP calls and use temporary directories or fixtures for file operations; tests must not call the live Telegram API.
- Avoid unrelated refactors, generated build output, or dependency changes in focused fixes.
- Never edit `dist/` or other ignored build artifacts by hand.

## Schema Changes

- Treat `data/telegram-bot-api.json` as generated data. Update it with `npm run refresh-schema`, not by manually editing individual entries.
- When Telegram changes documentation structure, update parser logic and its fixture/regression tests before accepting a regenerated catalog.
- Preserve the parser's integrity guards so incomplete upstream documentation cannot replace a known-good catalog.
- Review generated schema diffs for unexpected removals, large count changes, or malformed descriptions.

## Tests

- Place tests in `test/` and name them `*.test.ts`.
- Cover success, validation failure, boundary conditions, and security-sensitive behavior relevant to the change.
- Prefer observable behavior over implementation details.
- Keep tests isolated, deterministic, and independent of real credentials, the public network, execution order, and developer-specific paths.
- For configuration changes, test parsing, defaults, invalid values, and security implications.
- For upload changes, test root confinement, symlink handling, file type/size checks, and multipart construction as applicable.
- For Telegram client changes, test retry eligibility, timeout behavior, redaction, structured errors, and audit metadata as applicable.

## Documentation and Configuration

- Document every added or changed environment variable in `README.md` and `.env.example`.
- Never commit bot tokens, credentials, local `.env` files, or sensitive request data.
- Keep public tool names, parameters, examples, and error formats in `README.md` synchronized with implementation changes.
- Update this file whenever commands, repository layout, architecture, testing expectations, or contributor workflow changes.

## Git and Local Commits

- Use the connected GitHub MCP server for GitHub operations, including issues, pull requests, workflows, releases, and repository metadata. Do not use the GitHub CLI or direct GitHub API calls when the MCP server supports the operation.
- Always create a local commit for every completed change. No additional approval is required.
- When automated tests or validation are required, create the local commit only after all required checks pass for the final working tree. Do not commit with failing or skipped required checks; if a required check is unavailable, leave the changes uncommitted and report why.
- When no automated test or validation is required, such as for a documentation-only change, still create a local commit after checking the change for correctness and consistency.
- Stage only files that belong to the requested change. Do not overwrite, discard, or include unrelated worktree changes.
- Use a concise, imperative commit subject consistent with the repository history, such as `feat: ...`, `fix: ...`, `test: ...`, `docs: ...`, or `chore: ...`.
- Do not amend, rewrite history, force-push, or push to a remote unless the user explicitly requests it.
