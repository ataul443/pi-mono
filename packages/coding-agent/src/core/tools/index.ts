export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	bashTool,
	bashToolDefinition,
	createBashTool,
	createBashToolDefinition,
	createLocalBashOperations,
} from "./bash.js";
export {
	createEditTool,
	createEditToolDefinition,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
	editTool,
	editToolDefinition,
} from "./edit.js";
export { withFileMutationQueue } from "./file-mutation-queue.js";
export {
	createFindTool,
	createFindToolDefinition,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
	findTool,
	findToolDefinition,
} from "./find.js";
export {
	createGrepTool,
	createGrepToolDefinition,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
	grepTool,
	grepToolDefinition,
} from "./grep.js";
export {
	createLsTool,
	createLsToolDefinition,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
	lsTool,
	lsToolDefinition,
} from "./ls.js";
export {
	createReadTool,
	createReadToolDefinition,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
	readTool,
	readToolDefinition,
} from "./read.js";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.js";
export {
	createWriteTool,
	createWriteToolDefinition,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
	writeTool,
	writeToolDefinition,
} from "./write.js";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "../extensions/types.js";
import type { PermissionContext } from "../permissions/types.js";
import {
	type BashToolOptions,
	bashTool,
	bashToolDefinition,
	createBashTool,
	createBashToolDefinition,
} from "./bash.js";
import { createEditTool, createEditToolDefinition, editTool, editToolDefinition } from "./edit.js";
import { createFindTool, createFindToolDefinition, findTool, findToolDefinition } from "./find.js";
import { createGrepTool, createGrepToolDefinition, grepTool, grepToolDefinition } from "./grep.js";
import { createLsTool, createLsToolDefinition, lsTool, lsToolDefinition } from "./ls.js";
import {
	createReadTool,
	createReadToolDefinition,
	type ReadToolOptions,
	readTool,
	readToolDefinition,
} from "./read.js";
import { createWriteTool, createWriteToolDefinition, writeTool, writeToolDefinition } from "./write.js";

export type Tool = AgentTool<any>;
export type ToolDef = ToolDefinition<any, any>;

export const codingTools: Tool[] = [readTool, bashTool, editTool, writeTool];
export const readOnlyTools: Tool[] = [readTool, grepTool, findTool, lsTool];

export const allTools = {
	Read: readTool,
	Bash: bashTool,
	Edit: editTool,
	Write: writeTool,
	Grep: grepTool,
	Glob: findTool,
	List: lsTool,
};

export const allToolDefinitions = {
	Read: readToolDefinition,
	Bash: bashToolDefinition,
	Edit: editToolDefinition,
	Write: writeToolDefinition,
	Grep: grepToolDefinition,
	Glob: findToolDefinition,
	List: lsToolDefinition,
};

export type ToolName = keyof typeof allTools;

export interface ToolsOptions {
	Read?: ReadToolOptions;
	Bash?: BashToolOptions;
	permissions?: PermissionContext;
}

export function createCodingToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createReadToolDefinition(cwd, options?.Read, options?.permissions),
		createBashToolDefinition(cwd, options?.Bash, options?.permissions),
		createEditToolDefinition(cwd, undefined, options?.permissions),
		createWriteToolDefinition(cwd, undefined, options?.permissions),
	];
}

export function createReadOnlyToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createReadToolDefinition(cwd, options?.Read, options?.permissions),
		createGrepToolDefinition(cwd, undefined, options?.permissions),
		createFindToolDefinition(cwd, undefined, options?.permissions),
		createLsToolDefinition(cwd, undefined, options?.permissions),
	];
}

export function createAllToolDefinitions(cwd: string, options?: ToolsOptions): Record<ToolName, ToolDef> {
	return {
		Read: createReadToolDefinition(cwd, options?.Read, options?.permissions),
		Bash: createBashToolDefinition(cwd, options?.Bash, options?.permissions),
		Edit: createEditToolDefinition(cwd, undefined, options?.permissions),
		Write: createWriteToolDefinition(cwd, undefined, options?.permissions),
		Grep: createGrepToolDefinition(cwd, undefined, options?.permissions),
		Glob: createFindToolDefinition(cwd, undefined, options?.permissions),
		List: createLsToolDefinition(cwd, undefined, options?.permissions),
	};
}

export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.Read, options?.permissions),
		createBashTool(cwd, options?.Bash, options?.permissions),
		createEditTool(cwd, undefined, options?.permissions),
		createWriteTool(cwd, undefined, options?.permissions),
	];
}

export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.Read, options?.permissions),
		createGrepTool(cwd, undefined, options?.permissions),
		createFindTool(cwd, undefined, options?.permissions),
		createLsTool(cwd, undefined, options?.permissions),
	];
}

export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
	return {
		Read: createReadTool(cwd, options?.Read, options?.permissions),
		Bash: createBashTool(cwd, options?.Bash, options?.permissions),
		Edit: createEditTool(cwd, undefined, options?.permissions),
		Write: createWriteTool(cwd, undefined, options?.permissions),
		Grep: createGrepTool(cwd, undefined, options?.permissions),
		Glob: createFindTool(cwd, undefined, options?.permissions),
		List: createLsTool(cwd, undefined, options?.permissions),
	};
}
