import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "bun:test";

const pathsSource = readFileSync(new URL("../extensions/skills-manager/paths.ts", import.meta.url), "utf8");

test("startup path resolution does not load Pi's public module barrel", () => {
	assert.doesNotMatch(pathsSource, /import\s+\{[^}]*getAgentDir[^}]*\}\s+from\s+"@earendil-works\/pi-coding-agent"/s);
});
