import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, type Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { AgentSession } from "../src/core/agent-session.js";
import { AuthStorage } from "../src/core/auth-storage.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import { SERVER_TOOL_NAMES, serverToolDefinitions } from "../src/core/tools/server-tools.js";
import { createTestResourceLoader } from "./utilities.js";

const anthropicModel = getModel("anthropic", "claude-sonnet-4-5")!;
const openaiModel = getModel("openai", "gpt-4o")!;

function createSession(options: { initialActiveToolNames?: string[]; model?: Model<any> } = {}) {
	const settingsManager = SettingsManager.inMemory();
	const sessionManager = SessionManager.inMemory();
	const authStorage = AuthStorage.inMemory();
	authStorage.setRuntimeApiKey("anthropic", "test-key");
	authStorage.setRuntimeApiKey("openai", "test-key");
	const modelRegistry = ModelRegistry.inMemory(authStorage);

	const model = options.model ?? anthropicModel;

	const session = new AgentSession({
		agent: new Agent({
			getApiKey: () => "test-key",
			initialState: {
				model,
				systemPrompt: "You are a helpful assistant.",
				tools: [],
			},
		}),
		sessionManager,
		settingsManager,
		cwd: process.cwd(),
		modelRegistry,
		resourceLoader: createTestResourceLoader(),
		...(options.initialActiveToolNames ? { initialActiveToolNames: options.initialActiveToolNames } : {}),
	});

	return { session, sessionManager, settingsManager };
}

describe("server tools", () => {
	describe("server tool definitions", () => {
		it("exports web_search and web_fetch tool names", () => {
			expect(SERVER_TOOL_NAMES.has("web_search")).toBe(true);
			expect(SERVER_TOOL_NAMES.has("web_fetch")).toBe(true);
			expect(SERVER_TOOL_NAMES.size).toBe(2);
		});

		it("exports tool definitions with correct names and descriptions", () => {
			expect(serverToolDefinitions).toHaveLength(2);

			const webSearch = serverToolDefinitions.find((d) => d.name === "web_search")!;
			expect(webSearch.label).toBe("web_search");
			expect(webSearch.promptSnippet).toBe("Search the web for current information");

			const webFetch = serverToolDefinitions.find((d) => d.name === "web_fetch")!;
			expect(webFetch.label).toBe("web_fetch");
			expect(webFetch.promptSnippet).toBe("Fetch and read web page content");
		});

		it("throws when execute is called on server tools", async () => {
			for (const def of serverToolDefinitions) {
				await expect(def.execute("test-id", {} as never, undefined, undefined, {} as never)).rejects.toThrow(
					"server-side tool",
				);
			}
		});
	});

	describe("default (no --tools), Anthropic model", () => {
		it("includes server tools in registry and active set", () => {
			const { session } = createSession({ model: anthropicModel });
			try {
				const allToolNames = session.getAllTools().map((t) => t.name);
				const activeToolNames = session.getActiveToolNames();

				expect(allToolNames).toContain("web_search");
				expect(allToolNames).toContain("web_fetch");
				expect(activeToolNames).toContain("web_search");
				expect(activeToolNames).toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});

		it("includes server tools in system prompt", () => {
			const { session } = createSession({ model: anthropicModel });
			try {
				expect(session.systemPrompt).toContain("web_search");
				expect(session.systemPrompt).toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});

		it("has correct sourceInfo for server tools", () => {
			const { session } = createSession({ model: anthropicModel });
			try {
				const webSearch = session.getAllTools().find((t) => t.name === "web_search");
				expect(webSearch?.sourceInfo).toMatchObject({
					path: "<server:web_search>",
					source: "builtin",
				});

				const webFetch = session.getAllTools().find((t) => t.name === "web_fetch");
				expect(webFetch?.sourceInfo).toMatchObject({
					path: "<server:web_fetch>",
					source: "builtin",
				});
			} finally {
				session.dispose();
			}
		});
	});

	describe("default (no --tools), non-Anthropic model", () => {
		it("does not include server tools in registry or active set", () => {
			const { session } = createSession({ model: openaiModel });
			try {
				const allToolNames = session.getAllTools().map((t) => t.name);
				const activeToolNames = session.getActiveToolNames();

				expect(allToolNames).not.toContain("web_search");
				expect(allToolNames).not.toContain("web_fetch");
				expect(activeToolNames).not.toContain("web_search");
				expect(activeToolNames).not.toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});

		it("does not include server tools in system prompt", () => {
			const { session } = createSession({ model: openaiModel });
			try {
				expect(session.systemPrompt).not.toContain("web_search");
				expect(session.systemPrompt).not.toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});
	});

	describe("explicit --tools without server tools, Anthropic model", () => {
		it("has server tools in registry but not in active set", () => {
			const { session } = createSession({
				model: anthropicModel,
				initialActiveToolNames: ["Read", "Bash", "Edit", "Write"],
			});
			try {
				const allToolNames = session.getAllTools().map((t) => t.name);
				const activeToolNames = session.getActiveToolNames();

				// Server tools should be in the registry (getAllTools)
				expect(allToolNames).toContain("web_search");
				expect(allToolNames).toContain("web_fetch");

				// But NOT in the active set since --tools didn't include them
				expect(activeToolNames).not.toContain("web_search");
				expect(activeToolNames).not.toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});

		it("does not include server tools in system prompt when not active", () => {
			const { session } = createSession({
				model: anthropicModel,
				initialActiveToolNames: ["Read", "Bash", "Edit", "Write"],
			});
			try {
				expect(session.systemPrompt).not.toContain("- web_search:");
				expect(session.systemPrompt).not.toContain("- web_fetch:");
			} finally {
				session.dispose();
			}
		});
	});

	describe("explicit --tools WITH server tools, Anthropic model", () => {
		it("includes server tools in active set when explicitly listed", () => {
			const { session } = createSession({
				model: anthropicModel,
				initialActiveToolNames: ["Read", "Bash", "Edit", "Write", "web_search", "web_fetch"],
			});
			try {
				const activeToolNames = session.getActiveToolNames();

				expect(activeToolNames).toContain("web_search");
				expect(activeToolNames).toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});

		it("includes server tools in system prompt when explicitly active", () => {
			const { session } = createSession({
				model: anthropicModel,
				initialActiveToolNames: ["Read", "Bash", "Edit", "Write", "web_search", "web_fetch"],
			});
			try {
				expect(session.systemPrompt).toContain("web_search");
				expect(session.systemPrompt).toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});
	});

	describe("model switching", () => {
		it("removes server tools from registry and active set when switching Anthropic -> non-Anthropic", async () => {
			const { session } = createSession({ model: anthropicModel });
			try {
				// Verify server tools are present initially
				expect(session.getActiveToolNames()).toContain("web_search");
				expect(session.getActiveToolNames()).toContain("web_fetch");

				await session.setModel(openaiModel);

				const allToolNames = session.getAllTools().map((t) => t.name);
				const activeToolNames = session.getActiveToolNames();

				expect(allToolNames).not.toContain("web_search");
				expect(allToolNames).not.toContain("web_fetch");
				expect(activeToolNames).not.toContain("web_search");
				expect(activeToolNames).not.toContain("web_fetch");
				expect(session.systemPrompt).not.toContain("web_search");
				expect(session.systemPrompt).not.toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});

		it("adds server tools to registry and active set when switching non-Anthropic -> Anthropic (no explicit --tools)", async () => {
			const { session } = createSession({ model: openaiModel });
			try {
				// Verify no server tools initially
				expect(session.getActiveToolNames()).not.toContain("web_search");
				expect(session.getActiveToolNames()).not.toContain("web_fetch");

				await session.setModel(anthropicModel);

				const allToolNames = session.getAllTools().map((t) => t.name);
				const activeToolNames = session.getActiveToolNames();

				expect(allToolNames).toContain("web_search");
				expect(allToolNames).toContain("web_fetch");
				expect(activeToolNames).toContain("web_search");
				expect(activeToolNames).toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});

		it("adds server tools to registry but not active set when switching non-Anthropic -> Anthropic (explicit --tools without server tools)", async () => {
			const { session } = createSession({
				model: openaiModel,
				initialActiveToolNames: ["Read", "Bash", "Edit", "Write"],
			});
			try {
				// Verify no server tools initially
				expect(session.getAllTools().map((t) => t.name)).not.toContain("web_search");

				await session.setModel(anthropicModel);

				const allToolNames = session.getAllTools().map((t) => t.name);
				const activeToolNames = session.getActiveToolNames();

				// In registry
				expect(allToolNames).toContain("web_search");
				expect(allToolNames).toContain("web_fetch");

				// But NOT active since explicit --tools didn't include them
				expect(activeToolNames).not.toContain("web_search");
				expect(activeToolNames).not.toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});

		it("does not refresh tools when switching between models of the same API type", async () => {
			const { session } = createSession({ model: anthropicModel });
			try {
				const activeBeforeSwitch = session.getActiveToolNames();
				expect(activeBeforeSwitch).toContain("web_search");

				// Switch to another Anthropic model (same api type)
				const anotherAnthropic = getModel("anthropic", "claude-3-5-haiku-latest")!;
				await session.setModel(anotherAnthropic);

				// Server tools should still be present
				expect(session.getActiveToolNames()).toContain("web_search");
				expect(session.getActiveToolNames()).toContain("web_fetch");
			} finally {
				session.dispose();
			}
		});
	});
});
