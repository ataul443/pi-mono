const VALID_WORKTREE_SLUG_SEGMENT = /^[a-zA-Z0-9._-]+$/;
const MAX_WORKTREE_SLUG_LENGTH = 64;

/**
 * Validates a worktree slug to prevent path traversal and directory escape.
 *
 * The slug is joined into `.zota/worktrees/<slug>` via path.join, which
 * normalizes `..` segments — so `../../../target` would escape the worktrees
 * directory. Similarly, an absolute path (leading `/` or `C:\`) would discard
 * the prefix entirely.
 *
 * Forward slashes are allowed for nesting (e.g. `user/feature`); each
 * segment is validated independently against the allowlist, so `.` / `..`
 * segments and drive-spec characters are still rejected.
 *
 * Throws synchronously — callers rely on this running before any side effects
 * (git commands, chdir).
 */
export function validateWorktreeSlug(slug: string): void {
	if (slug.length > MAX_WORKTREE_SLUG_LENGTH) {
		throw new Error(
			`Invalid worktree name: must be ${MAX_WORKTREE_SLUG_LENGTH} characters or fewer (got ${slug.length})`,
		);
	}
	// Leading or trailing `/` would make path.join produce an absolute path
	// or a dangling segment. Splitting and validating each segment rejects
	// both (empty segments fail the regex) while allowing `user/feature`.
	for (const segment of slug.split("/")) {
		if (segment === "." || segment === "..") {
			throw new Error(`Invalid worktree name "${slug}": must not contain "." or ".." path segments`);
		}
		if (!VALID_WORKTREE_SLUG_SEGMENT.test(segment)) {
			throw new Error(
				`Invalid worktree name "${slug}": each "/"-separated segment must be non-empty and contain only letters, digits, dots, underscores, and dashes`,
			);
		}
	}
}

// Flatten nested slugs (`user/feature` → `user+feature`) for both the branch
// name and the directory path. Nesting in either location is unsafe:
//   - git refs: `zota/user` (file) vs `zota/user/feature` (needs dir)
//     is a D/F conflict that git rejects.
//   - directory: `.zota/worktrees/user/feature/` lives inside the `user`
//     worktree; `git worktree remove` on the parent deletes children with
//     uncommitted work.
// `+` is valid in git branch names and filesystem paths but NOT in the
// slug-segment allowlist ([a-zA-Z0-9._-]), so the mapping is injective.
export function flattenSlug(slug: string): string {
	return slug.replaceAll("/", "+");
}

export function worktreeBranchName(slug: string): string {
	return `zota/${flattenSlug(slug)}`;
}
