import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mock } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

const agentDir = process.env.PI_CODING_AGENT_DIR;
assert(agentDir);
mkdirSync(agentDir, { recursive: true });
const loaded: string[] = [];
const mode = process.argv[2];
const settings = {
  quietStartup: mode === "header" ? "header" : mode === "quiet",
  kendex: { extensionManager: { config: { "@vanillagreen/pi-skills-manager": {
    enabled: mode !== "disabled",
    hideStartupSkillsBlock: mode !== "visible",
  } } } },
};
writeFileSync(join(agentDir, "settings.json"), JSON.stringify(settings));

mock.module("@earendil-works/pi-coding-agent", () => {
  loaded.push("host-sdk");
  return { getAgentDir: () => agentDir, InteractiveMode: class { showLoadedResources() {} } };
});
mock.module("../../extensions/skills-manager/creation.js", () => {
  loaded.push("creation");
  return { createSkillFromAnswers: async () => undefined };
});
mock.module("../../extensions/skills-manager/dialog.js", () => {
  loaded.push("dialog");
  return { showSkillsManager: async () => ({ name: "sample" }) };
});
mock.module("../../extensions/skills-manager/registry.js", () => {
  loaded.push("registry");
  return { loadSkillRegistry: async () => ({ skills: [] }), deleteSkill: async () => undefined };
});
mock.module("../../extensions/skills-manager/toggle.js", () => {
  loaded.push("toggle");
  return { setSkillEnabled: async () => undefined };
});

const { default: skillsManager } = await import("../../extensions/skills-manager.ts");
const { clearPackageConfigCache } = await import("../../extensions/skills-manager/package-config.ts");
const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
const sessionHandlers: Array<(event: unknown, ctx: ExtensionContext) => unknown> = [];
const pi = {
  registerCommand(name: string, command: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) {
    commands.set(name, command);
  },
  on(name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) {
    if (name === "session_start") sessionHandlers.push(handler);
  },
  events: { on: () => () => {} },
};
await skillsManager(pi as unknown as ExtensionAPI);
const needsStartupPatch = mode === "resources" || mode === "header";
assert.deepEqual(loaded, needsStartupPatch ? ["host-sdk"] : []);
const handler = commands.get("skill")?.handler;
assert(handler);

if (mode === "disabled") {
  assert(commands.has("skill:enable"));
} else {
  // Non-UI calls and command arguments must not load a menu the user cannot open.
  const inserted: string[] = [];
  const ctx = { cwd: process.cwd(), hasUI: false, ui: { notify() {}, pasteToEditor: (text: string) => inserted.push(text) } } as unknown as ExtensionCommandContext;
  await handler("", ctx);
  await handler("invalid-argument", { ...ctx, hasUI: true });
  assert.deepEqual(loaded, needsStartupPatch ? ["host-sdk"] : []);

  // The first interactive command still opens the manager; later commands reuse the modules.
  await handler("", { ...ctx, hasUI: true });
  assert.deepEqual(new Set(loaded.filter((name) => name !== "host-sdk")), new Set(["creation", "dialog", "registry", "toggle"]));
  assert.deepEqual(inserted, ["/skill:sample\n"]);
  const count = loaded.length;
  await handler("", { ...ctx, hasUI: true });
  assert.equal(loaded.length, count);

  if (mode === "quiet") {
    // A later session with resources visible still gets startup-list hiding.
    settings.quietStartup = false;
    writeFileSync(join(agentDir, "settings.json"), JSON.stringify(settings));
    clearPackageConfigCache();
    for (const callback of sessionHandlers) await callback({}, ctx);
    assert(loaded.includes("host-sdk"));
  }
}
