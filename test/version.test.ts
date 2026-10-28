import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packageVersion } from "../src/version.js";
import { versionForCatalog } from "../scripts/sync-version.mjs";

describe("release identity", () => {
  it("preserves patch releases on equal or older catalog refreshes", () => {
    expect(versionForCatalog("10.3.5", "10.3")).toBe("10.3.5");
    expect(versionForCatalog("10.3.5", "10.2")).toBe("10.3.5");
    expect(versionForCatalog("10.3.5", "10.4")).toBe("10.4.0");
    expect(() => versionForCatalog("10.3.5", "untrusted")).toThrow();
  });
  it("keeps installed, lock and registry versions consistent", () => {
    const load = (file: string) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
    const pkg = load("package.json");
    const lock = load("package-lock.json");
    const registry = load("server.json");
    expect(packageVersion).toBe(pkg.version);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
    expect(registry.version).toBe(pkg.version);
    expect(registry.packages[0].version).toBe(pkg.version);
  });
});
