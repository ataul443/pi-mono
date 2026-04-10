import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { removeWorktree } from "./worktree.js";

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_AGE_DAYS = 30;

/**
 * Slug prefixes that identify throwaway worktrees created by automated agents
 * or task runners. Only worktrees whose directory names start with one of
 * these prefixes are candidates for automatic cleanup.
 */
const EPHEMERAL_SLUG_PREFIXES = ["agent-", "task-"];

async function getGitRoot(cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
		return stdout.trim();
	} catch (error) {
		throw new Error(`Failed to find git root from "${cwd}": ${(error as Error).message}`);
	}
}

/**
 * Remove stale agent/task worktrees older than maxAgeDays.
 *
 * Safety:
 * - Only touches directory names starting with "agent-" or "task-"
 * - Fail-closed: skips if git status fails or shows tracked changes
 * - Fail-closed: skips if any commits aren't reachable from a remote
 */
export async function cleanupStaleWorktrees(
	originCwd: string,
	options?: { maxAgeDays?: number; worktreeDir?: string },
): Promise<{ removed: string[]; skipped: string[] }> {
	const gitRoot = await getGitRoot(originCwd);
	const worktreeBaseDir = options?.worktreeDir ?? path.join(gitRoot, ".zota", "worktrees");
	const maxAgeDays = options?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
	const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

	let entries: string[];
	try {
		entries = await readdir(worktreeBaseDir);
	} catch {
		// Directory doesn't exist or is unreadable — nothing to clean up.
		return { removed: [], skipped: [] };
	}

	const removed: string[] = [];
	const skipped: string[] = [];

	for (const entry of entries) {
		// Only clean up ephemeral worktrees (agent-* or task-*)
		if (!EPHEMERAL_SLUG_PREFIXES.some((prefix) => entry.startsWith(prefix))) {
			continue;
		}

		const worktreePath = path.join(worktreeBaseDir, entry);

		// Check age
		let mtimeMs: number;
		try {
			mtimeMs = (await stat(worktreePath)).mtimeMs;
		} catch {
			skipped.push(worktreePath);
			continue;
		}

		if (mtimeMs >= cutoffMs) {
			skipped.push(worktreePath);
			continue;
		}

		// Skip if uncommitted changes exist (fail-closed)
		try {
			const { stdout: statusOutput, stderr: statusErr } = await execFileAsync(
				"git",
				["--no-optional-locks", "status", "--porcelain", "-uno"],
				{ cwd: worktreePath },
			);
			if (statusErr || statusOutput.trim().length > 0) {
				skipped.push(worktreePath);
				continue;
			}
		} catch {
			skipped.push(worktreePath);
			continue;
		}

		// Skip if unpushed commits exist (fail-closed)
		try {
			const { stdout: unpushedOutput } = await execFileAsync("git", ["rev-list", "HEAD", "--not", "--remotes"], {
				cwd: worktreePath,
			});
			if (unpushedOutput.trim().length > 0) {
				skipped.push(worktreePath);
				continue;
			}
		} catch {
			skipped.push(worktreePath);
			continue;
		}

		// Safe to remove
		try {
			await removeWorktree(worktreePath, { force: true });
			removed.push(worktreePath);
		} catch {
			skipped.push(worktreePath);
		}
	}

	// Prune stale worktree metadata regardless of how many we removed
	try {
		await execFileAsync("git", ["worktree", "prune"], { cwd: gitRoot });
	} catch {
		// Non-fatal: prune failure doesn't affect our results
	}

	return { removed, skipped };
}
