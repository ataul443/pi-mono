import { isDangerousPath } from "./dangerous.js";
import { getPathsForPermissionCheck, isWithinDirectory } from "./paths.js";
import type { PermissionResult, WorkingDirectorySet } from "./types.js";
import { hasSuspiciousWindowsPattern } from "./windows.js";

/**
 * Main permission pipeline for a file path and operation.
 *
 * Pipeline order (first match wins):
 * 1. Null byte in path → deny
 * 2. Windows suspicious patterns → deny
 * 3. Resolve symlinks, check all resolved paths against boundary → deny if any outside
 * 4. Dangerous file/directory → ask
 * 5. Inside working directories → allow
 * 6. Outside working directories → ask
 */
export function checkPermission(
	path: string,
	operation: "read" | "write" | "execute",
	workingDirs: WorkingDirectorySet,
): PermissionResult {
	// 1. Null byte check
	if (path.includes("\0")) {
		return { decision: "deny", reason: "Path contains null byte" };
	}

	// 2. Windows suspicious patterns
	if (hasSuspiciousWindowsPattern(path)) {
		return {
			decision: "deny",
			reason: "Path contains a suspicious Windows path pattern that could bypass security checks",
		};
	}

	// 3. Resolve symlinks and check all resolved paths against working directory boundary
	const pathsToCheck = getPathsForPermissionCheck(path);
	const dirs = [workingDirs.cwd, ...workingDirs.additional.keys()];

	// If any resolved path is outside all working directories, deny
	const allWithinBoundary = pathsToCheck.every((p) => dirs.some((dir) => isWithinDirectory(p, dir)));
	if (!allWithinBoundary) {
		// Check if the original path is within working dirs
		const originalPathInBoundary = dirs.some((dir) => isWithinDirectory(path, dir));
		if (!originalPathInBoundary) {
			// Outside working directories entirely — ask
			return {
				decision: "ask",
				path,
				operation,
				reason: "Path is outside the working directory",
			};
		}
		// Original is inside but a resolved symlink target is outside — deny
		return {
			decision: "deny",
			reason: "Path resolves via symlink to a location outside the working directory",
		};
	}

	// 4. Dangerous file/directory check
	for (const p of pathsToCheck) {
		if (isDangerousPath(p)) {
			return {
				decision: "ask",
				path,
				operation,
				reason: "Path refers to a sensitive file or directory",
			};
		}
	}

	// 5. Inside working directories → allow
	return { decision: "allow" };
}
