import { checkPermission } from "./check.js";
import type { PermissionContext } from "./types.js";

/**
 * Enforces permission for a file operation.
 *
 * If permissions is undefined, permission checking is disabled and all operations are allowed.
 * Otherwise, runs the permission pipeline and handles ask prompts by calling requestPermission.
 * If the user responds with allow_session, adds the directory to workingDirs.additional.
 */
export async function enforcePermission(
	absolutePath: string,
	operation: "read" | "write" | "execute",
	toolName: string,
	permissions: PermissionContext | undefined,
): Promise<void> {
	if (permissions === undefined) {
		return;
	}

	const result = checkPermission(absolutePath, operation, permissions.workingDirs);

	if (result.decision === "deny") {
		throw new Error(`Permission denied: ${result.reason}`);
	}

	if (result.decision === "allow") {
		return;
	}

	// decision === "ask": prompt the user
	const response = await permissions.requestPermission({
		path: result.path,
		operation: result.operation,
		tool: toolName,
		reason: result.reason,
	});

	if (response.decision === "deny") {
		throw new Error(`Permission denied for ${operation} on ${absolutePath}`);
	}

	if (response.decision === "allow_session") {
		permissions.workingDirs.additional.set(response.directory, { source: "user_approved" });
	}
}
