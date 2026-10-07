import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearPackageConfigCache, recordProjectTrust } from "../extensions/skills-manager/package-config.ts";
import { piQuietStartup, settingString, updatePackageConfig } from "../extensions/skills-manager/settings.ts";

const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const cleanups: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
	clearPackageConfigCache();
});

test("startup hiding follows quiet settings only from trusted scopes", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-skills-manager-quiet-"));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const cwd = join(root, "work");
	const agent = join(root, "agent");
	mkdirSync(agent);
	mkdirSync(join(cwd, ".pi"), { recursive: true });
	process.env.PI_CODING_AGENT_DIR = agent;
	// An untrusted checkout cannot override the user's quiet startup. Once trusted,
	// its false or header-only setting still requires resource-list hiding.
	for (const { user, project, trusted, quiet } of [
		{ user: true, project: false, trusted: false, quiet: true },
		{ user: true, project: false, trusted: true, quiet: false },
		{ user: true, project: "header", trusted: true, quiet: false },
		{ user: false, project: true, trusted: true, quiet: true },
	]) {
		writeFileSync(join(agent, "settings.json"), JSON.stringify({ quietStartup: user }));
		writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ quietStartup: project }));
		clearPackageConfigCache();
		recordProjectTrust({ cwd, isProjectTrusted: () => trusted });
		expect(piQuietStartup(cwd)).toBe(quiet);
	}
});

// Settings reads are memoized for a window. The clock is held still, so the
// read after the write sees it only because the write dropped the memo.
test("a setting written through updatePackageConfig is read back inside the settings window", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-skills-manager-settings-"));
	const clock = spyOn(performance, "now").mockImplementation(() => 0);
	cleanups.push(() => clock.mockRestore(), () => rmSync(root, { recursive: true, force: true }));
	const cwd = join(root, "work");
	mkdirSync(join(root, "agent"), { recursive: true });
	mkdirSync(cwd, { recursive: true });
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	clearPackageConfigCache();
	expect(settingString("popupMaxHeight", "unset", cwd)).toBe("unset");
	updatePackageConfig(cwd, { popupMaxHeight: "40%" }, "global");
	expect(settingString("popupMaxHeight", "unset", cwd)).toBe("40%");
});
