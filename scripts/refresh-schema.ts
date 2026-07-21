#!/usr/bin/env node
import { resolve } from "node:path";
import { SchemaStore } from "../src/schema-store.js";

const output = resolve(process.argv[2] ?? "data/telegram-bot-api.json");
const schema = await new SchemaStore(output).refresh();
process.stdout.write(`Telegram Bot API ${schema.version}: ${schema.methods.length} methods, ${schema.types.length} types, ${schema.enums.length} enums\n`);
