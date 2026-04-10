import { existsSync, lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { WorkingDirectorySet } from "./types.js";

/**
 * Normalizes a path for case-insensitive comparison.
 * On macOS and Windows filesystems, paths are case-insensitive.
 * We always lowercase for consistent security enforcement.
 */
export function normalizeCaseForComparison(p: string): string {
	if (process.platform === "linux") {
		return p;
	}
	return p.toLowerCase();
}

/**
 * Checks if filePath is within (at or under) directory.
 * Normalizes macOS /private/var and /private/tmp symlinks.
 * Uses case-normalized comparison.
 */
export function isWithinDirectory(filePath: string, directory: string): boolean {
	// Normalize macOS path aliases: /private/var -> /var, /private/tmp -> /tmp (and vice versa)
	function normalizeMacOSPath(p: string): string {
		return p
			.replace(/^\/private\/var\//, "/var/")
			.replace(/^\/private\/tmp(\/|$)/, "/tmp$1")
			.replace(/^\/var\//, "/private/var/")
			.replace(/^\/tmp(\/|$)/, "/private/tmp$1");
	}

	const normalizedFile = normalizeCaseForComparison(filePath);
	const normalizedDir = normalizeCaseForComparison(directory);

	// Direct match or under directory
	if (normalizedFile === normalizedDir || normalizedFile.startsWith(`${normalizedDir}/`)) {
		return true;
	}

	// Try macOS normalization variants
	const macNormFile = normalizeCaseForComparison(normalizeMacOSPath(filePath));
	const macNormDir = normalizeCaseForComparison(normalizeMacOSPath(directory));

	if (macNormFile === macNormDir || macNormFile.startsWith(`${macNormDir}/`)) {
		return true;
	}

	// Use relative path check as final approach
	const rel = relative(normalizedDir, normalizedFile);
	if (rel === "") return true;
	if (rel.startsWith("..")) return false;
	return !isAbsolute(rel);
}

/**
 * Resolves deepest existing ancestor of a path, following symlinks.
 * Used for non-existent files (e.g., new file writes) to find where
 * the write would actually land.
 */
function resolveDeepestExistingAncestor(absolutePath: string): string | undefined {
	let dir = absolutePath;
	const segments: string[] = [];

	while (dir !== dirname(dir)) {
		let st: ReturnType<typeof lstatSync> | undefined;
		try {
			st = lstatSync(dir);
		} catch {
			segments.unshift(dir.split("/").pop() ?? "");
			dir = dirname(dir);
			continue;
		}

		if (st.isSymbolicLink()) {
			try {
				const resolved = realpathSync(dir);
				return segments.length === 0 ? resolved : join(resolved, ...segments);
			} catch {
				const target = readlinkSync(dir);
				const absTarget = isAbsolute(target) ? target : resolve(dirname(dir), target);
				return segments.length === 0 ? absTarget : join(absTarget, ...segments);
			}
		}

		// Existing non-symlink: resolve ancestors
		try {
			const resolved = realpathSync(dir);
			if (resolved !== dir) {
				return segments.length === 0 ? resolved : join(resolved, ...segments);
			}
		} catch {
			// Cannot resolve further
		}
		return undefined;
	}
	return undefined;
}

/**
 * Gets all paths that should be checked for permissions.
 * Walks the symlink chain collecting ALL intermediate targets (TOCTOU defense).
 * For non-existent files, resolves deepest existing ancestor.
 * Guards against FIFOs, sockets, and devices.
 */
export function getPathsForPermissionCheck(filePath: string): string[] {
	const pathSet = new Set<string>();

	// Always include original path
	pathSet.add(filePath);

	// Block UNC paths before any filesystem access
	if (filePath.startsWith("//") || filePath.startsWith("\\\\")) {
		return Array.from(pathSet);
	}

	try {
		let currentPath = filePath;
		const visited = new Set<string>();
		const maxDepth = 40; // Matches typical SYMLOOP_MAX

		for (let depth = 0; depth < maxDepth; depth++) {
			if (visited.has(currentPath)) break;
			visited.add(currentPath);

			if (!existsSync(currentPath)) {
				// Non-existent: resolve deepest existing ancestor to find real destination
				if (currentPath === filePath) {
					const resolved = resolveDeepestExistingAncestor(filePath);
					if (resolved !== undefined) {
						pathSet.add(resolved);
					}
				}
				break;
			}

			const stats = lstatSync(currentPath);

			// Skip special file types that can cause hangs or confusion
			if (stats.isFIFO() || stats.isSocket() || stats.isCharacterDevice() || stats.isBlockDevice()) {
				break;
			}

			if (!stats.isSymbolicLink()) {
				break;
			}

			// Get immediate symlink target
			const target = readlinkSync(currentPath);
			const absoluteTarget = isAbsolute(target) ? target : resolve(dirname(currentPath), target);

			// Add intermediate target
			pathSet.add(absoluteTarget);
			currentPath = absoluteTarget;
		}
	} catch {
		// If anything fails, continue with what we have
	}

	// Add final realpath for completeness (resolves symlinks in directory components)
	try {
		const realPath = realpathSync(filePath);
		if (realPath !== filePath) {
			pathSet.add(realPath);
		}
	} catch {
		// If realpath fails (file doesn't exist, etc.), skip
	}

	return Array.from(pathSet);
}

/**
 * Checks that ALL symlink-resolved paths for filePath are within SOME working directory.
 * This prevents symlink attacks where a path inside the working dir points outside.
 */
export function isWithinAnyWorkingDirectory(filePath: string, workingDirs: WorkingDirectorySet): boolean {
	const pathsToCheck = getPathsForPermissionCheck(filePath);
	const dirs = [workingDirs.cwd, ...workingDirs.additional.keys()];

	// All resolved paths must be within at least one working directory
	return pathsToCheck.every((p) => dirs.some((dir) => isWithinDirectory(p, dir)));
}
