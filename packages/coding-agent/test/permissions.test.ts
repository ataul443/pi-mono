import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkPermission } from "../src/core/permissions/check.js";
import { isDangerousPath } from "../src/core/permissions/dangerous.js";
import { getPathsForPermissionCheck, isWithinDirectory } from "../src/core/permissions/paths.js";
import type { WorkingDirectorySet } from "../src/core/permissions/types.js";
import { hasSuspiciousWindowsPattern } from "../src/core/permissions/windows.js";

function makeWorkingDirs(
	cwd: string,
	additional?: Map<string, { source: "cli" | "config" | "user_approved" }>,
): WorkingDirectorySet {
	return { cwd, additional: additional ?? new Map() };
}

describe("checkPermission", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "perm-check-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("should deny path with null byte", () => {
		const result = checkPermission(`${tempDir}/file\0.txt`, "read", makeWorkingDirs(tempDir));
		expect(result.decision).toBe("deny");
		if (result.decision === "deny") {
			expect(result.reason).toBe("Path contains null byte");
		}
	});

	it("should deny 8.3 short name pattern", () => {
		const result = checkPermission(`${tempDir}/GIT~1`, "read", makeWorkingDirs(tempDir));
		expect(result.decision).toBe("deny");
	});

	it("should deny trailing dot path", () => {
		const result = checkPermission(`${tempDir}/.git.`, "read", makeWorkingDirs(tempDir));
		expect(result.decision).toBe("deny");
	});

	it("should deny DOS device name suffix", () => {
		const result = checkPermission(`${tempDir}/file.CON`, "read", makeWorkingDirs(tempDir));
		expect(result.decision).toBe("deny");
	});

	it("should deny triple dots path component", () => {
		const result = checkPermission(`${tempDir}/.../foo`, "read", makeWorkingDirs(tempDir));
		expect(result.decision).toBe("deny");
	});

	it("should deny UNC backslash path", () => {
		const result = checkPermission("\\\\server\\share", "read", makeWorkingDirs(tempDir));
		expect(result.decision).toBe("deny");
	});

	it("should deny UNC forward slash path", () => {
		const result = checkPermission("//server/share", "read", makeWorkingDirs(tempDir));
		expect(result.decision).toBe("deny");
	});

	it("should deny symlink resolving outside boundary", () => {
		const outsideDir = mkdtempSync(join(tmpdir(), "perm-outside-"));
		const outsideFile = join(outsideDir, "secret.txt");
		writeFileSync(outsideFile, "secret");

		const linkPath = join(tempDir, "sneaky-link");
		symlinkSync(outsideFile, linkPath);

		const result = checkPermission(linkPath, "read", makeWorkingDirs(tempDir));
		// Original is inside but resolves outside — deny
		expect(result.decision).toBe("deny");
		if (result.decision === "deny") {
			expect(result.reason).toContain("symlink");
		}

		rmSync(outsideDir, { recursive: true, force: true });
	});

	it("should ask for dangerous files inside CWD", () => {
		const dangerousFiles = [".gitconfig", ".bashrc", ".env", ".env.local"];
		for (const file of dangerousFiles) {
			const filePath = join(tempDir, file);
			writeFileSync(filePath, "");
			const result = checkPermission(filePath, "read", makeWorkingDirs(tempDir));
			expect(result.decision).toBe("ask");
			if (result.decision === "ask") {
				expect(result.reason).toContain("sensitive");
			}
		}
	});

	it("should ask for .ssh/id_rsa inside CWD", () => {
		const sshDir = join(tempDir, ".ssh");
		mkdirSync(sshDir);
		const keyFile = join(sshDir, "id_rsa");
		writeFileSync(keyFile, "");
		const result = checkPermission(keyFile, "read", makeWorkingDirs(tempDir));
		expect(result.decision).toBe("ask");
	});

	it("should allow regular file inside working directory", () => {
		const filePath = join(tempDir, "safe-file.txt");
		writeFileSync(filePath, "content");
		const result = checkPermission(filePath, "read", makeWorkingDirs(tempDir));
		expect(result.decision).toBe("allow");
	});

	it("should ask for path outside working directory", () => {
		const outsidePath = "/etc/passwd";
		const result = checkPermission(outsidePath, "read", makeWorkingDirs(tempDir));
		expect(result.decision).toBe("ask");
		if (result.decision === "ask") {
			expect(result.reason).toContain("outside");
		}
	});

	if (process.platform === "darwin") {
		it("should handle case-insensitive matching on macOS", () => {
			const subDir = join(tempDir, "SubDir");
			mkdirSync(subDir);
			const filePath = join(subDir, "file.txt");
			writeFileSync(filePath, "");

			// Use lowercase version of the tempDir
			const lowerCwd = tempDir.toLowerCase();
			const result = checkPermission(filePath, "read", makeWorkingDirs(lowerCwd));
			expect(result.decision).toBe("allow");
		});
	}
});

describe("isWithinDirectory", () => {
	it("should return true for path at directory", () => {
		expect(isWithinDirectory("/home/user/project", "/home/user/project")).toBe(true);
	});

	it("should return true for path under directory", () => {
		expect(isWithinDirectory("/home/user/project/src/file.ts", "/home/user/project")).toBe(true);
	});

	it("should return false for path outside via ..", () => {
		expect(isWithinDirectory("/home/user/other", "/home/user/project")).toBe(false);
	});

	it("should return false for absolute path outside", () => {
		expect(isWithinDirectory("/etc/passwd", "/home/user/project")).toBe(false);
	});

	if (process.platform === "darwin") {
		it("should normalize /private/tmp on macOS", () => {
			expect(isWithinDirectory("/private/tmp/test/file.txt", "/tmp/test")).toBe(true);
		});

		it("should normalize /tmp to /private/tmp on macOS", () => {
			expect(isWithinDirectory("/tmp/test/file.txt", "/private/tmp/test")).toBe(true);
		});
	}
});

describe("getPathsForPermissionCheck", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "perm-paths-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("should return single path for regular file", () => {
		const filePath = join(tempDir, "regular.txt");
		writeFileSync(filePath, "content");
		const paths = getPathsForPermissionCheck(filePath);
		expect(paths).toContain(filePath);
		expect(paths.length).toBeGreaterThanOrEqual(1);
	});

	it("should return both original and resolved paths for symlink", () => {
		const targetFile = join(tempDir, "target.txt");
		writeFileSync(targetFile, "content");
		const linkPath = join(tempDir, "link.txt");
		symlinkSync(targetFile, linkPath);

		const paths = getPathsForPermissionCheck(linkPath);
		expect(paths).toContain(linkPath);
		// Should contain resolved target
		expect(paths.some((p) => p.includes("target.txt"))).toBe(true);
	});

	it("should return original path for non-existent file", () => {
		const nonExistent = join(tempDir, "does-not-exist.txt");
		const paths = getPathsForPermissionCheck(nonExistent);
		expect(paths).toContain(nonExistent);
	});

	it("should collect intermediate paths for nested symlinks", () => {
		const realFile = join(tempDir, "real.txt");
		writeFileSync(realFile, "content");

		const link1 = join(tempDir, "link1.txt");
		symlinkSync(realFile, link1);

		const link2 = join(tempDir, "link2.txt");
		symlinkSync(link1, link2);

		const paths = getPathsForPermissionCheck(link2);
		expect(paths).toContain(link2);
		// Should have collected intermediate paths
		expect(paths.length).toBeGreaterThanOrEqual(2);
	});
});

describe("isDangerousPath", () => {
	it("should flag .gitconfig", () => {
		expect(isDangerousPath(`/home/user/.gitconfig`)).toBe(true);
	});

	it("should flag .env", () => {
		expect(isDangerousPath(`/project/.env`)).toBe(true);
	});

	it("should flag .env.local", () => {
		expect(isDangerousPath(`/project/.env.local`)).toBe(true);
	});

	it("should flag .env.production", () => {
		expect(isDangerousPath(`/project/.env.production`)).toBe(true);
	});

	it("should flag .ssh/id_rsa", () => {
		expect(isDangerousPath(`/home/user/.ssh/id_rsa`)).toBe(true);
	});

	it("should flag .aws/credentials", () => {
		expect(isDangerousPath(`/home/user/.aws/credentials`)).toBe(true);
	});

	it("should flag .git/config", () => {
		expect(isDangerousPath(`/project/.git/config`)).toBe(true);
	});

	it("should flag .vscode/settings.json", () => {
		expect(isDangerousPath(`/project/.vscode/settings.json`)).toBe(true);
	});

	it("should not flag .zota/worktrees/foo", () => {
		expect(isDangerousPath(`/project/.zota/worktrees/foo`)).toBe(false);
	});

	it("should not flag regular file", () => {
		expect(isDangerousPath(`/project/src/index.ts`)).toBe(false);
	});

	it("should flag .bashrc", () => {
		expect(isDangerousPath(`/home/user/.bashrc`)).toBe(true);
	});

	it("should flag .npmrc", () => {
		expect(isDangerousPath(`/home/user/.npmrc`)).toBe(true);
	});

	it("should flag .mcp.json", () => {
		expect(isDangerousPath(`/project/.mcp.json`)).toBe(true);
	});

	if (process.platform !== "linux") {
		it("should flag case variants on case-insensitive platforms", () => {
			expect(isDangerousPath(`/project/.GIT/config`)).toBe(true);
			expect(isDangerousPath(`/home/user/.Bashrc`)).toBe(true);
		});
	}
});

describe("hasSuspiciousWindowsPattern", () => {
	it("should detect 8.3 short name (tilde + digit)", () => {
		expect(hasSuspiciousWindowsPattern("file~1.txt")).toBe(true);
	});

	it("should detect trailing dot", () => {
		expect(hasSuspiciousWindowsPattern("file.txt.")).toBe(true);
	});

	it("should detect DOS device name suffix", () => {
		expect(hasSuspiciousWindowsPattern("file.txt.CON")).toBe(true);
		expect(hasSuspiciousWindowsPattern("settings.json.PRN")).toBe(true);
		expect(hasSuspiciousWindowsPattern(".bashrc.AUX")).toBe(true);
		expect(hasSuspiciousWindowsPattern("file.NUL")).toBe(true);
		expect(hasSuspiciousWindowsPattern("file.COM1")).toBe(true);
		expect(hasSuspiciousWindowsPattern("file.LPT9")).toBe(true);
	});

	it("should detect triple dots path component", () => {
		expect(hasSuspiciousWindowsPattern(".../foo")).toBe(true);
		expect(hasSuspiciousWindowsPattern("foo/.../bar")).toBe(true);
	});

	it("should detect UNC backslash path", () => {
		expect(hasSuspiciousWindowsPattern("\\\\server\\share")).toBe(true);
	});

	it("should detect UNC forward slash path", () => {
		expect(hasSuspiciousWindowsPattern("//server/share")).toBe(true);
	});

	it("should detect long path prefix backslash", () => {
		expect(hasSuspiciousWindowsPattern("\\\\?\\C:\\")).toBe(true);
	});

	it("should detect long path prefix forward slash", () => {
		expect(hasSuspiciousWindowsPattern("//?/C:/")).toBe(true);
	});

	it("should detect device path prefix", () => {
		expect(hasSuspiciousWindowsPattern("\\\\.\\C:\\")).toBe(true);
		expect(hasSuspiciousWindowsPattern("//./C:/")).toBe(true);
	});

	it("should not flag normal paths", () => {
		expect(hasSuspiciousWindowsPattern("/home/user/project/file.txt")).toBe(false);
		expect(hasSuspiciousWindowsPattern("src/main.ts")).toBe(false);
		expect(hasSuspiciousWindowsPattern("../parent/file.txt")).toBe(false);
		expect(hasSuspiciousWindowsPattern("file-with-dash.txt")).toBe(false);
	});

	it("should detect trailing space", () => {
		expect(hasSuspiciousWindowsPattern("file.txt ")).toBe(true);
	});
});
