export interface WorkingDirectorySet {
	cwd: string;
	additional: Map<string, { source: "cli" | "config" | "user_approved" }>;
}

export function allWorkingDirectories(set: WorkingDirectorySet): string[] {
	return [set.cwd, ...set.additional.keys()];
}

export type PermissionResult =
	| { decision: "allow" }
	| { decision: "deny"; reason: string }
	| { decision: "ask"; path: string; operation: "read" | "write" | "execute"; reason: string };

export interface PermissionRequest {
	path: string;
	operation: "read" | "write" | "execute";
	tool: string;
	reason: string;
}

export type PermissionResponse =
	| { decision: "allow" }
	| { decision: "allow_session"; directory: string }
	| { decision: "deny" };

export interface PermissionContext {
	workingDirs: WorkingDirectorySet;
	requestPermission: (req: PermissionRequest) => Promise<PermissionResponse>;
}
