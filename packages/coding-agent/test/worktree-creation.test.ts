/**
 * Tests for worktree creation, removal, and gitignore management.
 * Uses a temporary bare git repo + clone to test real git worktree operations.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorktree, removeWorktree } from "../src/core/worktree/worktree.js";

describe("createWorktree", () => {
	let tempDir: string;
	let repoDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-worktree-test-"));

		// Create a bare repo and clone it so we have a remote "origin"
		const bareDir = path.join(tempDir, "bare.git");
		repoDir = path.join(tempDir, "repo");

		execFileSync("git", ["init", "--bare", bareDir]);
		execFileSync("git", ["clone", bareDir, repoDir]);

		// Create an initial commit so branches work
		execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });
		execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
		fs.writeFileSync(path.join(repoDir, "README.md"), "init");
		execFileSync("git", ["add", "."], { cwd: repoDir });
		execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir });
		execFileSync("git", ["push", "origin", "main"], { cwd: repoDir });
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("should create a worktree at .zota/worktrees/<flattenedSlug>", async () => {
		const info = await createWorktree("my-feature", repoDir);

		expect(info.worktreePath).toBe(path.join(repoDir, ".zota", "worktrees", "my-feature"));
		expect(info.branch).toBe("zota/my-feature");
		expect(info.originCwd).toBe(repoDir);
		expect(fs.existsSync(info.worktreePath)).toBe(true);
		// The worktree should have a .git file (pointer to parent repo)
		expect(fs.existsSync(path.join(info.worktreePath, ".git"))).toBe(true);
	});

	it("should create a worktree based on specified baseBranch", async () => {
		// Create a branch with a distinctive file
		execFileSync("git", ["checkout", "-b", "dev"], { cwd: repoDir });
		fs.writeFileSync(path.join(repoDir, "dev-file.txt"), "dev content");
		execFileSync("git", ["add", "."], { cwd: repoDir });
		execFileSync("git", ["commit", "-m", "dev commit"], { cwd: repoDir });
		execFileSync("git", ["checkout", "main"], { cwd: repoDir });

		const info = await createWorktree("from-dev", repoDir, { baseBranch: "dev" });

		expect(fs.existsSync(info.worktreePath)).toBe(true);
		// The worktree should have the file from the dev branch
		expect(fs.existsSync(path.join(info.worktreePath, "dev-file.txt"))).toBe(true);
	});

	it("should return existing worktree info on re-run (idempotent)", async () => {
		const first = await createWorktree("idempotent", repoDir);
		// Write a marker file into the worktree
		fs.writeFileSync(path.join(first.worktreePath, "marker.txt"), "present");

		const second = await createWorktree("idempotent", repoDir);

		expect(second.worktreePath).toBe(first.worktreePath);
		expect(second.branch).toBe(first.branch);
		// The marker file should still be there (we didn't recreate the worktree)
		expect(fs.existsSync(path.join(second.worktreePath, "marker.txt"))).toBe(true);
	});

	it("should add .zota/worktrees/ to .gitignore", async () => {
		await createWorktree("gitignore-test", repoDir);

		const gitignore = fs.readFileSync(path.join(repoDir, ".gitignore"), "utf-8");
		expect(gitignore).toContain(".zota/worktrees/");
	});

	it("should not duplicate .gitignore entry on re-run", async () => {
		await createWorktree("first", repoDir);
		// Force a second worktree that triggers ensureGitignoreEntry again
		await createWorktree("second", repoDir);

		const gitignore = fs.readFileSync(path.join(repoDir, ".gitignore"), "utf-8");
		const matches = gitignore.match(/\.zota\/worktrees\//g);
		expect(matches).toHaveLength(1);
	});

	it("should flatten nested slug in worktree path", async () => {
		const info = await createWorktree("user/feature", repoDir);

		expect(info.worktreePath).toBe(path.join(repoDir, ".zota", "worktrees", "user+feature"));
		expect(info.branch).toBe("zota/user+feature");
	});

	it("should use custom worktreeDir when provided", async () => {
		const customDir = path.join(tempDir, "custom-worktrees");
		const info = await createWorktree("custom", repoDir, { worktreeDir: customDir });

		expect(info.worktreePath).toBe(path.join(customDir, "custom"));
		expect(fs.existsSync(info.worktreePath)).toBe(true);
	});
});

describe("removeWorktree", () => {
	let tempDir: string;
	let repoDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-worktree-rm-test-"));

		const bareDir = path.join(tempDir, "bare.git");
		repoDir = path.join(tempDir, "repo");

		execFileSync("git", ["init", "--bare", bareDir]);
		execFileSync("git", ["clone", bareDir, repoDir]);
		execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });
		execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
		fs.writeFileSync(path.join(repoDir, "README.md"), "init");
		execFileSync("git", ["add", "."], { cwd: repoDir });
		execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir });
		execFileSync("git", ["push", "origin", "main"], { cwd: repoDir });
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("should remove worktree directory and delete branch", async () => {
		const info = await createWorktree("to-remove", repoDir);
		expect(fs.existsSync(info.worktreePath)).toBe(true);

		await removeWorktree(info.worktreePath);

		expect(fs.existsSync(info.worktreePath)).toBe(false);

		// Branch should be deleted
		try {
			execFileSync("git", ["rev-parse", "--verify", info.branch], { cwd: repoDir });
			expect.fail("Branch should have been deleted");
		} catch {
			// expected
		}
	});

	it("should throw when removing non-existent worktree", async () => {
		const fakePath = path.join(repoDir, ".zota", "worktrees", "nonexistent");
		await expect(removeWorktree(fakePath)).rejects.toThrow("Failed to remove worktree");
	});
});
