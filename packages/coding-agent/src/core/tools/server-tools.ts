import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../extensions/types.js";

/**
 * Names of Anthropic server-side tools.
 * These are executed server-side by Anthropic, not locally.
 * Used to filter them out of the regular tools array sent to the API.
 */
export const SERVER_TOOL_NAMES = new Set(["web_search", "web_fetch"]);

/**
 * Server tool definitions for Anthropic's server-side tools.
 * These are virtual tools — they exist in the tool registry for system prompt inclusion
 * and active tool management, but are never executed locally. Anthropic handles them
 * server-side and returns results as content blocks in the assistant message stream.
 */
export const serverToolDefinitions: ToolDefinition[] = [
	{
		name: "web_search",
		label: "web_search",
		description: "Search the web for current information using Anthropic's built-in web search.",
		promptSnippet: "Search the web for current information",
		parameters: Type.Object({}),
		async execute() {
			throw new Error("web_search is an Anthropic server-side tool and cannot be executed locally");
		},
	},
	{
		name: "web_fetch",
		label: "web_fetch",
		description: "Fetch and read web page content using Anthropic's built-in web fetch.",
		promptSnippet: "Fetch and read web page content",
		parameters: Type.Object({}),
		async execute() {
			throw new Error("web_fetch is an Anthropic server-side tool and cannot be executed locally");
		},
	},
];
