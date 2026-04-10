export {
	type ExtractedPath,
	extractPathsFromCommand,
	isDangerousRemoval,
} from "./bash-paths.js";
export { checkPermission } from "./check.js";
export { DANGEROUS_DIRECTORIES, DANGEROUS_FILES, isDangerousPath } from "./dangerous.js";
export { enforcePermission } from "./enforce.js";
export {
	getPathsForPermissionCheck,
	isWithinAnyWorkingDirectory,
	isWithinDirectory,
	normalizeCaseForComparison,
} from "./paths.js";
export {
	allWorkingDirectories,
	type PermissionContext,
	type PermissionRequest,
	type PermissionResponse,
	type PermissionResult,
	type WorkingDirectorySet,
} from "./types.js";
export { hasSuspiciousWindowsPattern } from "./windows.js";
