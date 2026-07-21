import type { SchemaField, TelegramMethod, TelegramType } from "./schema.js";
import type { SchemaStore } from "./schema-store.js";

export interface ValidationIssue { path: string; message: string }
export interface ValidationResult { valid: boolean; issues: ValidationIssue[] }

const primitives = new Set(["String", "Integer", "Float", "Boolean", "True", "InputFile"]);
const uploadKeys = new Set(["path", "data", "base64", "encoding", "filename", "contentType"]);

export function isUploadDescriptor(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !uploadKeys.has(key))) return false;
  return typeof object.path === "string" || typeof object.base64 === "string" || (object.encoding === "base64" && typeof object.data === "string");
}

function unionParts(type: string): string[] {
  return type.split(/\s+or\s+/i).map((part) => part.trim()).filter(Boolean);
}

function validatePrimitive(value: unknown, type: string): boolean {
  switch (type) {
    case "String": return typeof value === "string";
    case "Integer": return typeof value === "number" && Number.isSafeInteger(value);
    case "Float": return typeof value === "number" && Number.isFinite(value);
    case "Boolean": return typeof value === "boolean";
    case "True": return value === true;
    case "InputFile": return typeof value === "string" || isUploadDescriptor(value);
    default: return false;
  }
}

function validateObject(
  value: unknown,
  definition: TelegramType,
  store: SchemaStore,
  path: string,
  seen: WeakSet<object>,
  allowUnknown: boolean,
): ValidationIssue[] {
  if (!value || typeof value !== "object" || Array.isArray(value) || isUploadDescriptor(value)) {
    return [{ path, message: `expected ${definition.name} object` }];
  }
  if (seen.has(value)) return [];
  seen.add(value);
  const object = value as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  for (const field of definition.fields) {
    if (field.required && (object[field.name] === undefined || object[field.name] === null)) {
      issues.push({ path: `${path}.${field.name}`, message: "required field is missing" });
    } else if (object[field.name] !== undefined) {
      issues.push(...validateValue(object[field.name], field.type, store, `${path}.${field.name}`, seen, allowUnknown, field.enum, /InputFile|attach:\/\/|upload a new/i.test(`${field.type} ${field.description}`)));
    }
  }
  const exclusive = definition.description.match(/Exactly one of the fields? ([^.]+?) must be (?:used|specified|provided)/i)?.[1];
  if (exclusive) {
    const alternatives = definition.fields.filter((field) => new RegExp(`\\b${field.name}\\b`).test(exclusive)).map((field) => field.name);
    const supplied = alternatives.filter((name) => object[name] !== undefined && object[name] !== null);
    if (alternatives.length > 1 && supplied.length !== 1) {
      issues.push({ path, message: `exactly one of ${alternatives.join(", ")} must be provided` });
    }
  }
  if (!allowUnknown) {
    const known = new Set(definition.fields.map((field) => field.name));
    for (const name of Object.keys(object)) {
      if (!known.has(name)) issues.push({ path: `${path}.${name}`, message: `unknown field for ${definition.name}` });
    }
  }
  return issues;
}

function validateValue(
  value: unknown,
  rawType: string,
  store: SchemaStore,
  path: string,
  seen: WeakSet<object>,
  allowUnknown: boolean,
  enumValues?: string[],
  allowUpload = false,
): ValidationIssue[] {
  if (allowUpload && isUploadDescriptor(value)) return [];
  if (enumValues?.length && !enumValues.includes(String(value))) {
    return [{ path, message: `expected one of: ${enumValues.join(", ")}` }];
  }
  const arrayMatch = rawType.match(/^Array of (.+)$/i);
  if (arrayMatch?.[1]) {
    if (!Array.isArray(value)) return [{ path, message: `expected ${rawType}` }];
    return value.flatMap((entry, index) => validateValue(entry, arrayMatch[1]!, store, `${path}[${index}]`, seen, allowUnknown, undefined, allowUpload));
  }
  const parts = unionParts(rawType);
  if (parts.length > 1) {
    const attempts = parts.map((part) => validateValue(value, part, store, path, new WeakSet<object>(), allowUnknown, enumValues, allowUpload));
    if (attempts.some((issues) => issues.length === 0)) return [];
    return attempts.sort((left, right) => left.length - right.length)[0] ?? [{ path, message: `expected ${rawType}` }];
  }
  const type = rawType.trim();
  if (primitives.has(type)) {
    return validatePrimitive(value, type) ? [] : [{ path, message: `expected ${type}` }];
  }
  const definition = store.getType(type);
  if (definition) {
    if (definition.variants?.length) {
      const attempts = definition.variants
        .map((variant) => store.getType(variant))
        .filter((candidate): candidate is TelegramType => Boolean(candidate))
        .map((candidate) => validateObject(value, candidate, store, path, new WeakSet<object>(), allowUnknown));
      if (attempts.some((issues) => issues.length === 0)) return [];
      if (attempts.length) return attempts.sort((left, right) => left.length - right.length)[0]!;
    }
    return validateObject(value, definition, store, path, seen, allowUnknown);
  }
  // Telegram occasionally uses descriptive pseudo-types. Keep the gateway forward-compatible.
  return [];
}

export function validateMethodParameters(
  method: TelegramMethod,
  parameters: Record<string, unknown>,
  store: SchemaStore,
  allowUnknown = false,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const fields = new Map(method.parameters.map((parameter) => [parameter.name, parameter]));
  for (const parameter of method.parameters) {
    if (parameter.required && (parameters[parameter.name] === undefined || parameters[parameter.name] === null)) {
      issues.push({ path: parameter.name, message: "required parameter is missing" });
    } else if (parameters[parameter.name] !== undefined) {
      issues.push(...validateValue(parameters[parameter.name], parameter.type, store, parameter.name, new WeakSet<object>(), allowUnknown, parameter.enum, /InputFile|attach:\/\/|upload a new/i.test(`${parameter.type} ${parameter.description}`)));
    }
  }
  if (!allowUnknown) {
    for (const name of Object.keys(parameters)) {
      if (!fields.has(name)) issues.push({ path: name, message: `unknown parameter for ${method.name}` });
    }
  }
  return { valid: issues.length === 0, issues };
}

export class ParameterValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "ParameterValidationError";
  }
}
