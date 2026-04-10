import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforcePermission } from "../src/core/permissions/enforce.js";
import type { PermissionContext, PermissionResponse, WorkingDirectorySet } from "../src/core/permissions/types.js";

function makeWorkingDirs(cwd: string): WorkingDirectorySet {
	return { cwd, additional: new Map() };
}

function makeContext(cwd: string, responseFn: () => Promise<PermissionResponse>): PermissionContext {
	return {
		workingDirs: makeWorkingDirs(cwd),
		requestPermission: vi.fn(responseFn),
	};
}

describe("enforcePermission", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "enforce-perm-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("should always allow when permissions is undefined", async () => {
		const result = await enforcePermission("/etc/passwd", "read", "read_file", undefined);
		expect(result.allowed).toBe(true);
		expect(result.error).toBeUndefined();
	});

	it("should allow path inside CWD without prompting", async () => {
		const filePath = join(tempDir, "safe.txt");
		writeFileSync(filePath, "content");

		const requestPermission = vi.fn();
		const ctx: PermissionContext = {
			workingDirs: makeWorkingDirs(tempDir),
			requestPermission,
		};

		const result = await enforcePermission(filePath, "read", "read_file", ctx);
		expect(result.allowed).toBe(true);
		expect(requestPermission).not.toHaveBeenCalled();
	});

	it("should call requestPermission for path outside CWD and respect deny", async () => {
		const ctx = makeContext(tempDir, async () => ({ decision: "deny" }));

		const result = await enforcePermission("/etc/passwd", "read", "read_file", ctx);
		expect(result.allowed).toBe(false);
		expect(result.error).toContain("Permission denied");
		expect(ctx.requestPermission).toHaveBeenCalledTimes(1);
	});

	it("should call requestPermission for path outside CWD and respect allow", async () => {
		const ctx = makeContext(tempDir, async () => ({ decision: "allow" }));

		const result = await enforcePermission("/etc/passwd", "read", "read_file", ctx);
		expect(result.allowed).toBe(true);
		expect(ctx.requestPermission).toHaveBeenCalledTimes(1);
	});

	it("should add directory to additional on allow_session response", async () => {
		const approvedDir = "/etc";
		const ctx = makeContext(tempDir, async () => ({
			decision: "allow_session",
			directory: approvedDir,
		}));

		const result = await enforcePermission("/etc/passwd", "read", "read_file", ctx);
		expect(result.allowed).toBe(true);
		expect(ctx.workingDirs.additional.has(approvedDir)).toBe(true);
		expect(ctx.workingDirs.additional.get(approvedDir)).toEqual({ source: "user_approved" });
	});

	it("should call requestPermission for dangerous file inside CWD", async () => {
		const envFile = join(tempDir, ".env");
		writeFileSync(envFile, "SECRET=value");

		const ctx = makeContext(tempDir, async () => ({ decision: "allow" }));

		const result = await enforcePermission(envFile, "read", "read_file", ctx);
		expect(result.allowed).toBe(true);
		expect(ctx.requestPermission).toHaveBeenCalledTimes(1);
	});

	it("should return error message when denied", async () => {
		const ctx = makeContext(tempDir, async () => ({ decision: "deny" }));

		const result = await enforcePermission("/outside/path", "write", "write_file", ctx);
		expect(result.allowed).toBe(false);
		expect(result.error).toContain("Permission denied");
		expect(result.error).toContain("/outside/path");
	});

	it("should pass correct tool name and operation in permission request", async () => {
		const ctx = makeContext(tempDir, async () => ({ decision: "allow" }));

		await enforcePermission("/outside/file.txt", "write", "write_file", ctx);
		expect(ctx.requestPermission).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "/outside/file.txt",
				operation: "write",
				tool: "write_file",
			}),
		);
	});
});
