import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function versionForCatalog(current, catalog) {
  if (!/^\d+\.\d+\.\d+$/.test(current) || !/^\d+(\.\d+)?$/.test(catalog)) throw new Error("Expected stable package and Bot API versions");
  const [major, minor] = catalog.split(".").map(Number);
  const [packageMajor, packageMinor] = current.split(".").map(Number);
  const apiMinor = minor ?? 0;
  return major > packageMajor || (major === packageMajor && apiMinor > packageMinor) ? `${major}.${apiMinor}.0` : current;
}

export async function syncVersion(root = new URL("../", import.meta.url)) {
  const load = async (name) => JSON.parse(await readFile(new URL(name, root), "utf8"));
  const [pkg, lock, registry, catalog] = await Promise.all([load("package.json"), load("package-lock.json"), load("server.json"), load("data/telegram-bot-api.json")]);
  const version = versionForCatalog(pkg.version, catalog.version);
  pkg.version = lock.version = lock.packages[""].version = registry.version = version;
  for (const entry of registry.packages) if (entry.identifier === pkg.name) entry.version = version;
  for (const [name, value] of [["package.json", pkg], ["package-lock.json", lock], ["server.json", registry]]) {
    await writeFile(new URL(name, root), `${JSON.stringify(value, null, 2)}\n`);
  }
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${await syncVersion()}\n`);
}
