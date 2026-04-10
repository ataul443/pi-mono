import { execFile } from "node:child_process";
import { access, appendFile, readFile } from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { flattenSlug, validateWorktreeSlug, worktreeBranchName } from "./validation.js";

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
	worktreePath: string;
	branch: string;
	originCwd: string;
}

export interface WorktreeOptions {
	/** Base directory for worktrees. Default: <git-root>/.zota/worktrees/ */
	worktreeDir?: string;
	/** Branch to base the worktree on. Default: auto-detected default branch (main/master). */
	baseBranch?: string;
}

async function getGitRoot(cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
		return stdout.trim();
	} catch (error) {
		throw new Error(`Failed to find git root from "${cwd}": ${(error as Error).message}`);
	}
}

async function getDefaultBranch(cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
		return stdout.trim() || "main";
	} catch {
		return "main";
	}
}

async function worktreeExists(worktreePath: string): Promise<boolean> {
	try {
		await access(worktreePath);
		return true;
	} catch {
		return false;
	}
}

async function ensureGitignoreEntry(gitRoot: string, entry: string): Promise<void> {
	const gitignorePath = path.join(gitRoot, ".gitignore");
	let content = "";
	try {
		content = await readFile(gitignorePath, "utf-8");
	} catch {
		// File may not exist; we'll create/append it
	}
	const lines = content.split("\n");
	if (!lines.some((line) => line.trim() === entry)) {
		const suffix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
		await appendFile(gitignorePath, `${suffix}${entry}\n`);
	}
}

/**
 * Creates a new git worktree for the given slug, or returns existing info if
 * a worktree at that path already exists.
 */
export async function createWorktree(
	slug: string,
	originCwd: string,
	options?: WorktreeOptions,
): Promise<WorktreeInfo> {
	validateWorktreeSlug(slug);

	const gitRoot = await getGitRoot(originCwd);
	const worktreeBaseDir = options?.worktreeDir ?? path.join(gitRoot, ".zota", "worktrees");
	const worktreePath = path.join(worktreeBaseDir, flattenSlug(slug));
	const branch = worktreeBranchName(slug);

	// Fast resume path: if the worktree already exists, return without creating.
	if (await worktreeExists(worktreePath)) {
		return { worktreePath, branch, originCwd };
	}

	const base = options?.baseBranch ?? (await getDefaultBranch(gitRoot));

	try {
		await execFileAsync("git", ["worktree", "add", "-B", branch, worktreePath, base], { cwd: originCwd });
	} catch (error) {
		throw new Error(`Failed to create worktree at "${worktreePath}": ${(error as Error).message}`);
	}

	// Ensure .zota/worktrees/ is in .gitignore
	await ensureGitignoreEntry(gitRoot, ".zota/worktrees/");

	return { worktreePath, branch, originCwd };
}

/**
 * Removes a git worktree and deletes the associated branch.
 */
export async function removeWorktree(worktreePath: string, options?: { force?: boolean }): Promise<void> {
	const removeArgs = ["worktree", "remove", worktreePath];
	if (options?.force) {
		removeArgs.push("--force");
	}

	// We need the git root to run git commands after removing the worktree dir.
	// Find it from the worktree path (walk up until we find .git pointer or dir).
	// Simpler: run git worktree remove from the worktree's parent dir perspective.
	// Since worktreePath itself will be deleted, we need a sibling or parent cwd.
	const cwd = path.dirname(worktreePath);

	try {
		await execFileAsync("git", removeArgs, { cwd });
	} catch (error) {
		throw new Error(`Failed to remove worktree at "${worktreePath}": ${(error as Error).message}`);
	}

	// Extract the branch name from the path (last path segment is the flattened slug)
	// The branch is worktree-<flattenedSlug> where flattenedSlug is the directory name.
	const dirName = path.basename(worktreePath);
	const branch = `worktree-${dirName}`;

	try {
		await execFileAsync("git", ["branch", "-D", branch], { cwd });
	} catch {
		// Branch deletion is best-effort: it may have been deleted already or
		// the branch name may not match if the worktree was created externally.
	}
}
