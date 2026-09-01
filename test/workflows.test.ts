import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("npm publication workflow", () => {
  it("publishes every new GitHub release using its tag and prerelease status", async () => {
    const workflow = await readFile(".github/workflows/publish-npm.yml", "utf8");

    expect(workflow).toContain("release:\n    types: [published]");
    expect(workflow).toContain("github.event.release.tag_name || inputs.release_tag");
    expect(workflow).toContain("github.event.release.prerelease || inputs.prerelease");
  });
});
