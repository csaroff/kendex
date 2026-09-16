import assert from "node:assert/strict";
import { mock, test } from "bun:test";

const loaded: string[] = [];

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

	skillsManager(pi as never);

	assert.deepEqual(loaded, []);
	assert.equal(typeof handler, "function");

	await handler!("", {
		cwd: process.cwd(),
		hasUI: true,
		ui: { notify() {}, pasteToEditor() {} },
	});

	assert.deepEqual(new Set(loaded), new Set(["creation", "dialog"]));
});
