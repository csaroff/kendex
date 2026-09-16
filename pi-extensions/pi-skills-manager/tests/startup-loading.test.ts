import assert from "node:assert/strict";
import { mock, test } from "bun:test";

const loaded: string[] = [];
const startup = { quiet: true };

mock.module("../extensions/skills-manager/settings.js", () => ({
	piQuietStartup: () => startup.quiet,
	settingBoolean: () => true,
	updatePackageConfig() {},
}));
mock.module("../extensions/skills-manager/startup.js", () => {
	loaded.push("startup-patch");
	return {
		patchInteractiveModeStartupSkillsBlock() {},
		setStartupHideEnabled() {},
	};
});
mock.module("../extensions/skills-manager/registry.js", () => {
	loaded.push("registry");
	return {
		deleteSkill: async () => undefined,
		loadSkillRegistry: async () => ({ skills: [] }),
	};
});
mock.module("../extensions/skills-manager/toggle.js", () => {
	loaded.push("toggle");
	return { setSkillEnabled: async () => undefined };
});
mock.module("../extensions/skills-manager/creation.js", () => {
	loaded.push("creation");
	return { createSkillFromAnswers: async () => undefined };
});
mock.module("../extensions/skills-manager/dialog.js", () => {
	loaded.push("dialog");
	return { showSkillsManager: async () => undefined };
});

const { default: skillsManager } = await import("../extensions/skills-manager.ts");

test("startup registers the skill manager without loading its interactive UI", async () => {
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	const pi = {
		registerCommand(name: string, command: { handler: typeof handler }) {
			if (name === "skill") handler = command.handler;
		},
		on() {},
	};

	await skillsManager(pi as never);

	assert.deepEqual(loaded, []);
	assert.equal(typeof handler, "function");

	await handler!("", {
		cwd: process.cwd(),
		hasUI: true,
		ui: { notify() {}, pasteToEditor() {} },
	});

	assert.deepEqual(new Set(loaded), new Set(["registry", "toggle", "creation", "dialog"]));

	startup.quiet = false;
	await skillsManager({ registerCommand() {}, on() {} } as never);
	assert.deepEqual(new Set(loaded), new Set(["registry", "toggle", "creation", "dialog", "startup-patch"]));
});
