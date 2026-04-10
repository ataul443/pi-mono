/**
 * Tests for ExtensionRunner.createContext() projectCwd propagation.
 *
 * Verifies that when an ExtensionRunner is constructed with a projectCwd
 * different from cwd (worktree scenario), createContext() exposes both correctly.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { discoverAndLoadExtensions } from "../src/core/extensions/loader.js";
import { ExtensionRunner } from "../src/core/extensions/runner.js";
import type { ExtensionActions, ExtensionContextActions } from "../src/core/extensions/types.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";

describe("ExtensionRunner projectCwd", () => {
	let tempDir: string;
	let extensionsDir: string;
	let sessionManager: SessionManager;
	let modelRegistry: ModelRegistry;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ext-projectcwd-test-"));
		extensionsDir = path.join(tempDir, "extensions");
		fs.mkdirSync(extensionsDir);
		sessionManager = SessionManager.inMemory();
		const authStorage = AuthStorage.create(path.join(tempDir, "auth.json"));
		modelRegistry = ModelRegistry.create(authStorage);
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	const extensionActions: ExtensionActions = {
		sendMessage: () => {},
		sendUserMessage: () => {},
		appendEntry: () => {},
		setSessionName: () => {},
		getSessionName: () => undefined,
		setLabel: () => {},
		getActiveTools: () => [],
		getAllTools: () => [],
		setActiveTools: () => {},
		refreshTools: () => {},
		getCommands: () => [],
		setModel: async () => false,
		getThinkingLevel: () => "off",
		setThinkingLevel: () => {},
	};

	const extensionContextActions: ExtensionContextActions = {
		getModel: () => undefined,
		isIdle: () => true,
		getSignal: () => undefined,
		abort: () => {},
		hasPendingMessages: () => false,
		shutdown: () => {},
		getContextUsage: () => undefined,
		compact: () => {},
		getSystemPrompt: () => "",
	};

	it("should default projectCwd to cwd when not provided", async () => {
		const cwd = "/some/project/path";
		const result = await discoverAndLoadExtensions([], tempDir, tempDir);
		const runner = new ExtensionRunner(result.extensions, result.runtime, cwd, sessionManager, modelRegistry);
		runner.bindCore(extensionActions, extensionContextActions);

		const ctx = runner.createContext();

		expect(ctx.cwd).toBe(cwd);
		expect(ctx.projectCwd).toBe(cwd);
	});

	it("should expose separate projectCwd when provided (worktree scenario)", async () => {
		const cwd = "/tmp/worktree/path";
		const projectCwd = "/original/project/root";
		const result = await discoverAndLoadExtensions([], tempDir, tempDir);
		const runner = new ExtensionRunner(
			result.extensions,
			result.runtime,
			cwd,
			sessionManager,
			modelRegistry,
			projectCwd,
		);
		runner.bindCore(extensionActions, extensionContextActions);

		const ctx = runner.createContext();

		expect(ctx.cwd).toBe(cwd);
		expect(ctx.projectCwd).toBe(projectCwd);
	});

	it("should pass projectCwd to event handler context", async () => {
		const cwd = "/tmp/worktree/path";
		const projectCwd = "/original/project/root";

		const extCode = `
			export default function(pi) {
				pi.on("context", async (event, ctx) => {
					// We'll capture these via the test mechanism below
					globalThis.__testCapture = { cwd: ctx.cwd, projectCwd: ctx.projectCwd };
				});
			}
		`;
		fs.writeFileSync(path.join(extensionsDir, "capture.ts"), extCode);

		const result = await discoverAndLoadExtensions([], tempDir, tempDir);
		const runner = new ExtensionRunner(
			result.extensions,
			result.runtime,
			cwd,
			sessionManager,
			modelRegistry,
			projectCwd,
		);
		runner.bindCore(extensionActions, extensionContextActions);

		await runner.emitContext([]);

		// The extension wrote to globalThis.__testCapture
		const captured = (globalThis as any).__testCapture;
		expect(captured).toBeDefined();
		expect(captured.cwd).toBe(cwd);
		expect(captured.projectCwd).toBe(projectCwd);

		// Cleanup global
		delete (globalThis as any).__testCapture;
	});

	it("should include projectCwd in command context", async () => {
		const cwd = "/tmp/worktree/path";
		const projectCwd = "/original/project/root";
		const result = await discoverAndLoadExtensions([], tempDir, tempDir);
		const runner = new ExtensionRunner(
			result.extensions,
			result.runtime,
			cwd,
			sessionManager,
			modelRegistry,
			projectCwd,
		);
		runner.bindCore(extensionActions, extensionContextActions);

		const cmdCtx = runner.createCommandContext();

		expect(cmdCtx.cwd).toBe(cwd);
		expect(cmdCtx.projectCwd).toBe(projectCwd);
	});
});
