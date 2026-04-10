import { basename, sep } from "node:path";
import { normalizeCaseForComparison } from "./paths.js";

export const DANGEROUS_FILES = [
	".gitconfig",
	".gitmodules",
	".bashrc",
	".bash_profile",
	".zshrc",
	".zprofile",
	".profile",
	".env",
	".npmrc",
	".pypirc",
	".netrc",
	".mcp.json",
] as const;

export const DANGEROUS_DIRECTORIES = [".git", ".vscode", ".idea", ".ssh"] as const;

/**
 * Checks if a path refers to a dangerous file or directory that should require
 * explicit user permission before access.
 *
 * Dangerous means:
 * - A path segment matches a DANGEROUS_DIRECTORIES entry (case-insensitive)
 * - The filename matches a DANGEROUS_FILES entry (case-insensitive)
 * - The filename matches the .env.* pattern (e.g. .env.local, .env.production)
 * - The path is under .ssh/, .aws/, .azure/, or .gcloud/
 *
 * Special carve-out: .zota/worktrees/ paths are allowed (not dangerous).
 */
export function isDangerousPath(absolutePath: string): boolean {
	const segments = absolutePath.split(sep).filter((s) => s.length > 0);
	const fileName = basename(absolutePath);

	// Special carve-out: .zota/worktrees/ is the worktree storage path — not dangerous
	for (let i = 0; i < segments.length - 1; i++) {
		const seg = normalizeCaseForComparison(segments[i] ?? "");
		const next = normalizeCaseForComparison(segments[i + 1] ?? "");
		if (seg === ".zota" && next === "worktrees") {
			return false;
		}
	}

	// Check each path segment against DANGEROUS_DIRECTORIES
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i] ?? "";
		const normalizedSegment = normalizeCaseForComparison(segment);

		for (const dir of DANGEROUS_DIRECTORIES) {
			if (normalizedSegment === normalizeCaseForComparison(dir)) {
				return true;
			}
		}

		// Check .ssh/*, .aws/*, .azure/*, .gcloud/* patterns
		if (
			normalizedSegment === ".ssh" ||
			normalizedSegment === ".aws" ||
			normalizedSegment === ".azure" ||
			normalizedSegment === ".gcloud"
		) {
			// Only dangerous if there are path components after this (i.e., accessing files inside)
			if (i < segments.length - 1) {
				return true;
			}
			// Accessing the directory itself is also dangerous
			return true;
		}
	}

	// Check filename against DANGEROUS_FILES
	if (fileName) {
		const normalizedFileName = normalizeCaseForComparison(fileName);
		for (const dangerousFile of DANGEROUS_FILES) {
			if (normalizedFileName === normalizeCaseForComparison(dangerousFile)) {
				return true;
			}
		}

		// Match .env.* pattern (e.g. .env.local, .env.production)
		if (/^\.env\..+$/i.test(fileName)) {
			return true;
		}
	}

	return false;
}
