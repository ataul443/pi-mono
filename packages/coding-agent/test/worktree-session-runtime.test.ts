/**
 * Tests for AgentSessionRuntime CWD propagation with worktree paths.
 *
 * Verifies that newSession(), fork(), and switchSession() pass the correct cwd
 * to the createRuntime factory -- particularly that worktree CWDs (stored in
 * SessionManager) are preserved across session lifecycle operations.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../src/core/agent-session.js";
import {
	AgentSessionRuntime,
	type CreateAgentSessionRuntimeFactory,
	type CreateAgentSessionRuntimeResult,
} from "../src/core/agent-session-runtime.js";
import type { AgentSessionServices } from "../src/core/agent-session-services.js";
import type { ExtensionRunner } from "../src/core/extensions/runner.js";
import { SessionManager } from "../src/core/session-manager.js";

/**
 * Build a minimal mock AgentSession with the given SessionManager.
 * Only the fields accessed by AgentSessionRuntime are provided.
 */
function mockSession(sm: SessionManager, sessionFile?: string): AgentSession {
	return {
		sessionManager: sm,
		get sessionFile() {
			return sessionFile ?? sm.getSessionFile();
		},
		extensionRunner: undefined as unknown as ExtensionRunner,
		agent: { state: { messages: [] } } as any,
		dispose: vi.fn(),
	} as unknown as AgentSession;
}

function mockServices(cwd: string): AgentSessionServices {
	return {
		cwd,
		agentDir: "/fake/agentDir",
		authStorage: {} as any,
		settingsManager: {} as any,
		modelRegistry: {} as any,
		resourceLoader: {} as any,
		diagnostics: [],
	};
}

describe("AgentSessionRuntime CWD propagation", () => {
	let tempDir: string;
	let sessionDir: string;
	const originalCwd = process.cwd();

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-runtime-cwd-test-"));
		sessionDir = path.join(tempDir, "sessions");
		fs.mkdirSync(sessionDir, { recursive: true });
	});

	afterEach(() => {
		// Restore process.cwd since AgentSessionRuntime.apply() may have changed it
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	/**
	 * Creates a factory that records all calls and returns a mock runtime result.
	 * The returned services.cwd is set to the cwd passed to the factory so
	 * AgentSessionRuntime.apply() does not throw.
	 */
	function createSpyFactory() {
		const calls: Array<{ cwd: string; agentDir: string }> = [];
		const factory: CreateAgentSessionRuntimeFactory = vi.fn(async (options) => {
			calls.push({ cwd: options.cwd, agentDir: options.agentDir });
			const sm = options.sessionManager;
			return {
				session: mockSession(sm),
				services: mockServices(options.cwd),
				extensionsResult: { extensions: [], errors: [], runtime: {} as any },
				diagnostics: [],
			} as CreateAgentSessionRuntimeResult;
		});
		return { factory, calls };
	}

	describe("newSession()", () => {
		it("should pass worktree CWD to createRuntime, not services.cwd", async () => {
			const projectCwd = path.join(tempDir, "project");
			const worktreeCwd = path.join(tempDir, "worktree");
			fs.mkdirSync(projectCwd, { recursive: true });
			fs.mkdirSync(worktreeCwd, { recursive: true });

			const { factory, calls } = createSpyFactory();

			// SessionManager stores worktree CWD
			const sm = SessionManager.inMemory(worktreeCwd);
			const session = mockSession(sm);
			const services = mockServices(projectCwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			await runtime.newSession();

			expect(calls).toHaveLength(1);
			expect(calls[0].cwd).toBe(worktreeCwd);
		});

		it("should NOT use services.cwd when worktree CWD differs", async () => {
			const projectCwd = path.join(tempDir, "project");
			const worktreeCwd = path.join(tempDir, "worktree");
			fs.mkdirSync(projectCwd, { recursive: true });
			fs.mkdirSync(worktreeCwd, { recursive: true });

			const { factory, calls } = createSpyFactory();

			const sm = SessionManager.inMemory(worktreeCwd);
			const session = mockSession(sm);
			const services = mockServices(projectCwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			await runtime.newSession();

			// The CWD passed must be the worktree CWD, not the project CWD
			expect(calls[0].cwd).not.toBe(projectCwd);
			expect(calls[0].cwd).toBe(worktreeCwd);
		});

		it("should use services.cwd when no worktree (CWDs match)", async () => {
			const cwd = path.join(tempDir, "project");
			fs.mkdirSync(cwd, { recursive: true });

			const { factory, calls } = createSpyFactory();

			const sm = SessionManager.inMemory(cwd);
			const session = mockSession(sm);
			const services = mockServices(cwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			await runtime.newSession();

			expect(calls).toHaveLength(1);
			expect(calls[0].cwd).toBe(cwd);
		});
	});

	describe("fork()", () => {
		function setupForFork(worktreeCwd: string) {
			const sm = SessionManager.inMemory(worktreeCwd);
			// Add a user message to fork from
			const entryId = sm.appendMessage({
				role: "user",
				content: "test prompt",
				timestamp: Date.now(),
			});
			return { sm, entryId };
		}

		it("should pass worktree CWD for root-entry fork (in-memory, no parentId)", async () => {
			const projectCwd = path.join(tempDir, "project");
			const worktreeCwd = path.join(tempDir, "worktree");
			fs.mkdirSync(projectCwd, { recursive: true });
			fs.mkdirSync(worktreeCwd, { recursive: true });

			const { factory, calls } = createSpyFactory();
			const { sm, entryId } = setupForFork(worktreeCwd);
			const session = mockSession(sm);
			const services = mockServices(projectCwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			const result = await runtime.fork(entryId);

			expect(result.cancelled).toBe(false);
			expect(calls).toHaveLength(1);
			expect(calls[0].cwd).toBe(worktreeCwd);
		});

		it("should pass worktree CWD for in-memory fork with parentId", async () => {
			const projectCwd = path.join(tempDir, "project");
			const worktreeCwd = path.join(tempDir, "worktree");
			fs.mkdirSync(projectCwd, { recursive: true });
			fs.mkdirSync(worktreeCwd, { recursive: true });

			const { factory, calls } = createSpyFactory();

			const sm = SessionManager.inMemory(worktreeCwd);
			// Create a chain: first message -> second message (so second has parentId)
			sm.appendMessage({
				role: "user",
				content: "first prompt",
				timestamp: Date.now(),
			});
			sm.appendMessage({
				role: "assistant",
				content: "response",
				provider: "test",
				model: "test-model",
				timestamp: Date.now(),
			} as any);
			const secondId = sm.appendMessage({
				role: "user",
				content: "second prompt",
				timestamp: Date.now(),
			});

			const session = mockSession(sm);
			const services = mockServices(projectCwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			const result = await runtime.fork(secondId);

			expect(result.cancelled).toBe(false);
			expect(calls).toHaveLength(1);
			expect(calls[0].cwd).toBe(worktreeCwd);
		});

		it("should pass worktree CWD for persisted root-entry fork", async () => {
			const projectCwd = path.join(tempDir, "project");
			const worktreeCwd = path.join(tempDir, "worktree");
			fs.mkdirSync(projectCwd, { recursive: true });
			fs.mkdirSync(worktreeCwd, { recursive: true });

			const { factory, calls } = createSpyFactory();

			const sm = SessionManager.create(worktreeCwd, sessionDir);
			const entryId = sm.appendMessage({
				role: "user",
				content: "test prompt",
				timestamp: Date.now(),
			});
			// Persist: need an assistant message
			sm.appendMessage({
				role: "assistant",
				content: "response",
				provider: "test",
				model: "test-model",
				timestamp: Date.now(),
			} as any);

			const session = mockSession(sm);
			const services = mockServices(projectCwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			const result = await runtime.fork(entryId);

			expect(result.cancelled).toBe(false);
			expect(calls).toHaveLength(1);
			expect(calls[0].cwd).toBe(worktreeCwd);
		});

		it("should return selectedText from forked entry", async () => {
			const cwd = path.join(tempDir, "project");
			fs.mkdirSync(cwd, { recursive: true });

			const { factory } = createSpyFactory();
			const { sm, entryId } = setupForFork(cwd);
			const session = mockSession(sm);
			const services = mockServices(cwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			const result = await runtime.fork(entryId);

			expect(result.cancelled).toBe(false);
			expect(result.selectedText).toBe("test prompt");
		});

		it("should throw for invalid entry ID", async () => {
			const cwd = path.join(tempDir, "project");
			fs.mkdirSync(cwd, { recursive: true });

			const { factory } = createSpyFactory();
			const sm = SessionManager.inMemory(cwd);
			const session = mockSession(sm);
			const services = mockServices(cwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			await expect(runtime.fork("nonexistent")).rejects.toThrow("Invalid entry ID for forking");
		});
	});

	describe("switchSession()", () => {
		it("should use session header CWD from the opened session file", async () => {
			const projectCwd = path.join(tempDir, "project");
			const sessionCwd = path.join(tempDir, "session-cwd");
			fs.mkdirSync(projectCwd, { recursive: true });
			fs.mkdirSync(sessionCwd, { recursive: true });

			const { factory, calls } = createSpyFactory();

			// Create a session file with a specific CWD
			const targetSm = SessionManager.create(sessionCwd, sessionDir);
			targetSm.appendMessage({
				role: "user",
				content: "test",
				timestamp: Date.now(),
			});
			targetSm.appendMessage({
				role: "assistant",
				content: "response",
				provider: "test",
				model: "test-model",
				timestamp: Date.now(),
			} as any);
			const targetSessionFile = targetSm.getSessionFile()!;

			// Current session on a different CWD
			const currentSm = SessionManager.inMemory(projectCwd);
			const session = mockSession(currentSm);
			const services = mockServices(projectCwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			await runtime.switchSession(targetSessionFile);

			expect(calls).toHaveLength(1);
			expect(calls[0].cwd).toBe(sessionCwd);
		});

		it("should use cwdOverride when provided", async () => {
			const projectCwd = path.join(tempDir, "project");
			const overrideCwd = path.join(tempDir, "override");
			fs.mkdirSync(projectCwd, { recursive: true });
			fs.mkdirSync(overrideCwd, { recursive: true });

			const { factory, calls } = createSpyFactory();

			// Create a session file
			const targetSm = SessionManager.create(projectCwd, sessionDir);
			targetSm.appendMessage({
				role: "user",
				content: "test",
				timestamp: Date.now(),
			});
			targetSm.appendMessage({
				role: "assistant",
				content: "response",
				provider: "test",
				model: "test-model",
				timestamp: Date.now(),
			} as any);
			const targetSessionFile = targetSm.getSessionFile()!;

			const currentSm = SessionManager.inMemory(projectCwd);
			const session = mockSession(currentSm);
			const services = mockServices(projectCwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			await runtime.switchSession(targetSessionFile, overrideCwd);

			expect(calls).toHaveLength(1);
			expect(calls[0].cwd).toBe(overrideCwd);
		});
	});

	describe("sequential operations preserve worktree CWD", () => {
		it("should preserve worktree CWD across newSession then newSession", async () => {
			const projectCwd = path.join(tempDir, "project");
			const worktreeCwd = path.join(tempDir, "worktree");
			fs.mkdirSync(projectCwd, { recursive: true });
			fs.mkdirSync(worktreeCwd, { recursive: true });

			const { factory, calls } = createSpyFactory();

			const sm = SessionManager.inMemory(worktreeCwd);
			const session = mockSession(sm);
			const services = mockServices(projectCwd);

			const runtime = new AgentSessionRuntime(session, services, factory);

			await runtime.newSession();
			await runtime.newSession();

			expect(calls).toHaveLength(2);
			expect(calls[0].cwd).toBe(worktreeCwd);
			expect(calls[1].cwd).toBe(worktreeCwd);
		});
	});
});
