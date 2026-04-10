/**
 * Tests for CWD option propagation in file-processor.ts and bash-executor.ts.
 *
 * Verifies that these modules use the provided cwd option for path resolution
 * and command execution, rather than defaulting to process.cwd().
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processFileArguments } from "../src/cli/file-processor.js";
import { executeBash } from "../src/core/bash-executor.js";

describe("processFileArguments CWD option", () => {
	let tempDir: string;
	let subDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-fileproc-cwd-test-"));
		subDir = path.join(tempDir, "subdir");
		fs.mkdirSync(subDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("should resolve relative path against options.cwd", async () => {
		// Create a file in tempDir
		fs.writeFileSync(path.join(tempDir, "test.txt"), "hello from test");

		const result = await processFileArguments(["test.txt"], { cwd: tempDir });

		expect(result.text).toContain("hello from test");
		expect(result.text).toContain(path.join(tempDir, "test.txt"));
	});

	it("should resolve relative path against a different cwd than process.cwd()", async () => {
		// Create a file in subDir (not in process.cwd())
		fs.writeFileSync(path.join(subDir, "nested.txt"), "nested content");

		const result = await processFileArguments(["nested.txt"], { cwd: subDir });

		expect(result.text).toContain("nested content");
		expect(result.text).toContain(path.join(subDir, "nested.txt"));
	});

	it("should handle absolute path regardless of cwd", async () => {
		const filePath = path.join(tempDir, "absolute.txt");
		fs.writeFileSync(filePath, "absolute content");

		const result = await processFileArguments([filePath], { cwd: subDir });

		expect(result.text).toContain("absolute content");
	});

	it("should return empty result for empty fileArgs", async () => {
		const result = await processFileArguments([], { cwd: tempDir });

		expect(result.text).toBe("");
		expect(result.images).toHaveLength(0);
	});
});

describe("executeBash CWD option", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-bash-cwd-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("should execute command in provided cwd", async () => {
		const result = await executeBash("pwd", tempDir);

		expect(result.exitCode).toBe(0);
		// pwd output should match the tempDir (resolving symlinks on macOS)
		expect(result.output.trim()).toBe(fs.realpathSync(tempDir));
	});

	it("should execute in different cwd than process.cwd()", async () => {
		const subDir = path.join(tempDir, "sub");
		fs.mkdirSync(subDir);

		const result = await executeBash("pwd", subDir);

		expect(result.exitCode).toBe(0);
		expect(result.output.trim()).toBe(fs.realpathSync(subDir));
	});

	it("should access files relative to provided cwd", async () => {
		fs.writeFileSync(path.join(tempDir, "marker.txt"), "found it");

		const result = await executeBash("cat marker.txt", tempDir);

		expect(result.exitCode).toBe(0);
		expect(result.output.trim()).toBe("found it");
	});

	it("should default to process.cwd() when cwd is undefined", async () => {
		const result = await executeBash("pwd");

		expect(result.exitCode).toBe(0);
		expect(result.output.trim()).toBe(fs.realpathSync(process.cwd()));
	});

	it("should support cancellation via signal", async () => {
		const controller = new AbortController();
		// Abort immediately
		controller.abort();

		const result = await executeBash("sleep 10", tempDir, { signal: controller.signal });

		expect(result.cancelled).toBe(true);
		expect(result.exitCode).toBeUndefined();
	});
});
