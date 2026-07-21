import type { TelegramMethod } from "./schema.js";

const normalize = (value: string): string => value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value: string): string[] => normalize(value).split(/\s+/).filter(Boolean);

function subsequenceScore(needle: string, haystack: string): number {
  let cursor = 0;
  for (const character of haystack) if (character === needle[cursor]) cursor += 1;
  return cursor === needle.length ? needle.length / Math.max(haystack.length, 1) : 0;
}

export function searchMethods(methods: TelegramMethod[], query: string, limit = 10): Array<TelegramMethod & { score: number }> {
  const normalizedQuery = normalize(query);
  const queryTokens = tokens(query);
  return methods
    .map((method) => {
      const name = normalize(method.name);
      const parameters = normalize(method.parameters.map((parameter) => parameter.name).join(" "));
      const category = normalize(method.category);
      const description = normalize(method.description);
      let score = normalizedQuery ? 0 : 1;
      if (name === normalizedQuery) score += 100;
      if (name.startsWith(normalizedQuery)) score += 50;
      if (name.includes(normalizedQuery)) score += 30;
      if (parameters.includes(normalizedQuery)) score += 18;
      if (category.includes(normalizedQuery)) score += 12;
      if (description.includes(normalizedQuery)) score += 10;
      for (const token of queryTokens) {
        if (name.includes(token)) score += 12;
        else if (parameters.includes(token)) score += 7;
        else if (category.includes(token)) score += 5;
        else if (description.includes(token)) score += 3;
        else score += subsequenceScore(token, name) * 2;
      }
      return { ...method, score };
    })
    .filter((method) => method.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, limit);
}
