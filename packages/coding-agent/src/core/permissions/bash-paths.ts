import { isAbsolute, resolve } from "node:path";

export interface ExtractedPath {
	path: string;
	operation: "read" | "write";
}

type PathExtractor = (args: string[], cwd: string) => ExtractedPath[];

/**
 * Tokenize a shell command string, handling single and double quoted strings.
 * This is not a full shell AST parser — it handles basic quoting but not
 * subshells, variable expansion, or other complex shell constructs.
 */
function tokenize(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let i = 0;

	while (i < command.length) {
		const ch = command[i];

		if (ch === "'") {
			// Single-quoted string: take everything until next '
			i++;
			while (i < command.length && command[i] !== "'") {
				current += command[i];
				i++;
			}
			i++; // skip closing quote
		} else if (ch === '"') {
			// Double-quoted string: take everything until next " (simplified, no escape handling)
			i++;
			while (i < command.length && command[i] !== '"') {
				current += command[i];
				i++;
			}
			i++; // skip closing quote
		} else if (ch === " " || ch === "\t") {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			i++;
		} else {
			current += ch;
			i++;
		}
	}

	if (current.length > 0) {
		tokens.push(current);
	}

	return tokens;
}

/**
 * Resolve a path argument relative to cwd if it's not absolute.
 */
function resolvePath(p: string, cwd: string): string {
	if (isAbsolute(p)) return p;
	return resolve(cwd, p);
}

/**
 * Skip flag arguments (starting with -) from an argument list.
 * Returns the remaining non-flag arguments.
 */
function skipFlags(args: string[]): string[] {
	const result: string[] = [];
	let i = 0;
	while (i < args.length) {
		const arg = args[i] ?? "";
		if (arg === "--") {
			// Everything after -- is a path argument
			result.push(...args.slice(i + 1));
			break;
		}
		if (!arg.startsWith("-")) {
			result.push(arg);
		}
		i++;
	}
	return result;
}

/**
 * Extract read paths from a list of arguments (skipping flags).
 */
function extractReadPaths(args: string[], cwd: string): ExtractedPath[] {
	return skipFlags(args)
		.filter((a) => a.length > 0)
		.map((a) => ({ path: resolvePath(a, cwd), operation: "read" as const }));
}

/**
 * Extract write paths from a list of arguments (skipping flags).
 */
function extractWritePaths(args: string[], cwd: string): ExtractedPath[] {
	return skipFlags(args)
		.filter((a) => a.length > 0)
		.map((a) => ({ path: resolvePath(a, cwd), operation: "write" as const }));
}

// Dangerous removal patterns that should always be hard-denied
const DANGEROUS_REMOVALS: RegExp[] = [
	/^rm\s+(-[rf]+\s+)*\/\s*$/,
	/^rm\s+(-[rf]+\s+)*~\s*$/,
	/^rm\s+(-[rf]+\s+)*\/home\s*$/,
	/^rm\s+(-[rf]+\s+)*\/Users\s*$/,
];

/**
 * Check if a command matches a known dangerous removal pattern.
 * These are hard denies that should never be executed.
 */
export function isDangerousRemoval(command: string): boolean {
	const trimmed = command.trim();
	return DANGEROUS_REMOVALS.some((pattern) => pattern.test(trimmed));
}

const COMMAND_EXTRACTORS: Map<string, PathExtractor> = new Map([
	// Read operations: extract args after flags
	["cat", (args, cwd) => extractReadPaths(args, cwd)],
	["head", (args, cwd) => extractReadPaths(args, cwd)],
	["tail", (args, cwd) => extractReadPaths(args, cwd)],
	["less", (args, cwd) => extractReadPaths(args, cwd)],
	["file", (args, cwd) => extractReadPaths(args, cwd)],
	["stat", (args, cwd) => extractReadPaths(args, cwd)],
	["wc", (args, cwd) => extractReadPaths(args, cwd)],
	["ls", (args, cwd) => extractReadPaths(args, cwd)],
	["find", (args, cwd) => extractReadPaths(args, cwd)],
	["tree", (args, cwd) => extractReadPaths(args, cwd)],

	// Read (search dir): last non-flag arg is the search directory
	[
		"grep",
		(args, cwd) => {
			const nonFlags = skipFlags(args);
			// grep pattern [file/dir...]  — everything after the pattern is a path
			const paths = nonFlags.slice(1);
			return paths.map((p) => ({ path: resolvePath(p, cwd), operation: "read" as const }));
		},
	],
	[
		"rg",
		(args, cwd) => {
			const nonFlags = skipFlags(args);
			const paths = nonFlags.slice(1);
			return paths.map((p) => ({ path: resolvePath(p, cwd), operation: "read" as const }));
		},
	],
	[
		"ag",
		(args, cwd) => {
			const nonFlags = skipFlags(args);
			const paths = nonFlags.slice(1);
			return paths.map((p) => ({ path: resolvePath(p, cwd), operation: "read" as const }));
		},
	],

	// Write operations: extract args after flags
	["rm", (args, cwd) => extractWritePaths(args, cwd)],
	["rmdir", (args, cwd) => extractWritePaths(args, cwd)],
	["mkdir", (args, cwd) => extractWritePaths(args, cwd)],
	["touch", (args, cwd) => extractWritePaths(args, cwd)],
	["chmod", (args, cwd) => extractWritePaths(args, cwd)],
	["chown", (args, cwd) => extractWritePaths(args, cwd)],

	// mv/cp: last arg is write destination, rest are read sources
	[
		"mv",
		(args, cwd) => {
			const nonFlags = skipFlags(args);
			if (nonFlags.length < 2) return extractReadPaths(nonFlags, cwd);
			const dest = nonFlags[nonFlags.length - 1]!;
			const sources = nonFlags.slice(0, -1);
			return [
				...sources.map((s) => ({ path: resolvePath(s, cwd), operation: "read" as const })),
				{ path: resolvePath(dest, cwd), operation: "write" as const },
			];
		},
	],
	[
		"cp",
		(args, cwd) => {
			const nonFlags = skipFlags(args);
			if (nonFlags.length < 2) return extractReadPaths(nonFlags, cwd);
			const dest = nonFlags[nonFlags.length - 1]!;
			const sources = nonFlags.slice(0, -1);
			return [
				...sources.map((s) => ({ path: resolvePath(s, cwd), operation: "read" as const })),
				{ path: resolvePath(dest, cwd), operation: "write" as const },
			];
		},
	],

	// sed -i: in-place edit — file args after pattern
	[
		"sed",
		(args, cwd) => {
			// Check for -i flag (in-place edit)
			const hasInPlace = args.some((a) => a === "-i" || a.startsWith("-i") || a === "-n" || a.includes("i"));
			if (!hasInPlace) return [];
			// Find the pattern (first non-flag arg) and then all subsequent args are files
			const nonFlags = skipFlags(args);
			const files = nonFlags.slice(1); // skip the sed script/pattern
			return files.map((f) => ({ path: resolvePath(f, cwd), operation: "write" as const }));
		},
	],

	// cd: read operation on target directory
	[
		"cd",
		(args, cwd) => {
			const nonFlags = skipFlags(args);
			if (nonFlags.length === 0) return [];
			const target = nonFlags.join(" ");
			return [{ path: resolvePath(target, cwd), operation: "read" as const }];
		},
	],
]);

/**
 * Extract file paths from a shell command string.
 *
 * Handles:
 * - Common commands via registry pattern
 * - Output redirections (> and >>)
 * - Unknown commands pass through without path extraction
 *
 * This is not a full shell AST parser — complex pipelines, subshells,
 * and variable expansion are not handled.
 */
export function extractPathsFromCommand(command: string, cwd: string): ExtractedPath[] {
	const results: ExtractedPath[] = [];

	// Handle output redirections: > file and >> file
	// Match > or >> followed by whitespace and a path (not another redirect)
	const redirectPattern = />{1,2}\s+(\S+)/g;
	for (const redirectMatch of command.matchAll(redirectPattern)) {
		const target = redirectMatch[1];
		if (target) {
			results.push({ path: resolvePath(target, cwd), operation: "write" });
		}
	}

	// Process each command in a pipeline (split on |, &&, ||, ;)
	// This is simplified — we just split and process each segment independently
	const segments = command.split(/[|;&]/).map((s) => s.trim());

	for (const segment of segments) {
		if (!segment) continue;

		const tokens = tokenize(segment);
		if (tokens.length === 0) continue;

		// Strip any leading environment variable assignments (KEY=value cmd ...)
		let cmdStart = 0;
		while (cmdStart < tokens.length) {
			const token = tokens[cmdStart] ?? "";
			if (/^[A-Z_][A-Z0-9_]*=/.test(token)) {
				cmdStart++;
			} else {
				break;
			}
		}

		const cmdName = tokens[cmdStart] ?? "";
		const cmdArgs = tokens.slice(cmdStart + 1);

		const extractor = COMMAND_EXTRACTORS.get(cmdName);
		if (extractor) {
			results.push(...extractor(cmdArgs, cwd));
		}
	}

	return results;
}
