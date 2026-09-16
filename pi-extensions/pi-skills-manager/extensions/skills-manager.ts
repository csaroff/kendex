/**
 * kendex Pi Skills Manager.
 *
 * A polished /skill manager view for browsing, previewing, inserting, creating,
 * editing, renaming, deleting, and enabling/disabling Pi skills.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { INSTALL_SYMBOL } from "./skills-manager/constants.js";
import { recordProjectTrust } from "./skills-manager/paths.js";
import { piQuietStartup, settingBoolean, updatePackageConfig } from "./skills-manager/settings.js";
import type { SkillEntry } from "./skills-manager/types.js";

function errorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.length > 180 ? `${message.slice(0, 179)}…` : message;
}

function insertNativeSkillCommand(ctx: ExtensionContext, skill: SkillEntry): void {
	ctx.ui.pasteToEditor(`/skill:${skill.name}\n`);
}

type StartupModule = typeof import("./skills-manager/startup.js");
let startupModule: StartupModule | undefined;

async function configureStartupSkillsBlock(cwd = process.cwd()): Promise<void> {
	const hideSkills = settingBoolean("enabled", true, cwd) && settingBoolean("hideStartupSkillsBlock", true, cwd);
	if (!hideSkills || piQuietStartup(cwd)) {
		startupModule?.setStartupHideEnabled(false);
		return;
	}
	startupModule ??= await import("./skills-manager/startup.js");
	startupModule.patchInteractiveModeStartupSkillsBlock();
	startupModule.setStartupHideEnabled(true);
}

export default async function skillsManager(pi: ExtensionAPI): Promise<void> {
	const guard = pi as unknown as Record<PropertyKey, unknown>;
	if (guard[INSTALL_SYMBOL]) return;
	guard[INSTALL_SYMBOL] = true;

	await configureStartupSkillsBlock();

	const enabledAtLoad = settingBoolean("enabled", true);

	if (!enabledAtLoad) {
		const enableRecovery = async (ctx: ExtensionCommandContext) => {
			updatePackageConfig(ctx.cwd, { enabled: true });
			ctx.ui.notify("Skills Manager enabled. Reloading...", "info");
			await ctx.reload();
		};
		pi.registerCommand("skill", {
			description: "Skills manager recovery command.",
			handler: async (args, ctx) => {
				if (args.trim().toLowerCase() !== "enable") {
					ctx.ui.notify("Skills Manager is disabled. Run /skill:enable, then /reload.", "warning");
					return;
				}
				await enableRecovery(ctx);
			},
		});
		pi.registerCommand("skill:enable", {
			description: "Re-enable the skills manager",
			handler: async (_args, ctx) => enableRecovery(ctx),
		});
		return;
	}

	async function prepareSession(ctx: ExtensionContext): Promise<boolean> {
		recordProjectTrust(ctx);
		await configureStartupSkillsBlock(ctx.cwd);
		return false;
	}

	pi.registerCommand("skill", {
		description: "Pi skills manager view. Native skills remain /skill:name.",
		handler: async (args, ctx) => {
			const rawArgs = args.trim();
			const trimmed = rawArgs.toLowerCase();
			if (trimmed === "enable") {
				updatePackageConfig(ctx.cwd, { enabled: true });
				ctx.ui.notify("Skills Manager already enabled.", "info");
				return;
			}
			if (trimmed === "disable") {
				updatePackageConfig(ctx.cwd, { enabled: false });
				ctx.ui.notify("Skills Manager disabled. Run /reload to unload commands/hooks.", "info");
				return;
			}
			if (rawArgs) {
				ctx.ui.notify("Use /skill:name for native skill invocation, or /skill with no arguments for the manager.", "warning");
				return;
			}
			if (!ctx.hasUI) {
				ctx.ui.notify("/skill manager requires interactive mode", "warning");
				return;
			}
			try {
				const [
					{ createSkillFromAnswers },
					{ showSkillsManager },
					{ deleteSkill, loadSkillRegistry },
					{ setSkillEnabled },
				] = await Promise.all([
					import("./skills-manager/creation.js"),
					import("./skills-manager/dialog.js"),
					import("./skills-manager/registry.js"),
					import("./skills-manager/toggle.js"),
				]);
				let registry = await loadSkillRegistry(ctx.cwd);
				const refreshRegistry = async () => {
					registry = await loadSkillRegistry(ctx.cwd);
					return registry;
				};
				const selection = await showSkillsManager(ctx, registry, {
					onCreate: async (answers, signal) => await createSkillFromAnswers(ctx, answers, { thinkingLevel: pi.getThinkingLevel(), signal }),
					onDelete: async (skill) => await deleteSkill(ctx, skill),
					onToggle: async (skill, enabled) => await setSkillEnabled(ctx.cwd, skill, enabled),
					onRefresh: refreshRegistry,
				});
				if (selection) insertNativeSkillCommand(ctx, selection);
			} catch (error) {
				ctx.ui.notify(`Failed to load skills manager: ${errorMessage(error)}`, "error");
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => { await prepareSession(ctx); });
}
