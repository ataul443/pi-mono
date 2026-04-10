import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPathsFromCommand, isDangerousRemoval } from "../src/core/permissions/bash-paths.js";

describe("extractPathsFromCommand", () => {
	const cwd = "/home/user/project";

	it("should extract absolute read path from cat", () => {
		const paths = extractPathsFromCommand("cat /etc/passwd", cwd);
		expect(paths).toEqual([{ path: "/etc/passwd", operation: "read" }]);
	});

	it("should extract relative read path from head", () => {
		const paths = extractPathsFromCommand("head -n 10 file.txt", cwd);
		// skipFlags treats "10" as a non-flag arg (simple parser, no flag-value pairing)
		expect(paths).toContainEqual({ path: resolve(cwd, "file.txt"), operation: "read" });
	});

	it("should extract write path from rm -rf", () => {
		const paths = extractPathsFromCommand("rm -rf /tmp/foo", cwd);
		expect(paths).toEqual([{ path: "/tmp/foo", operation: "write" }]);
	});

	it("should extract source as read and dest as write for mv", () => {
		const paths = extractPathsFromCommand("mv source.txt dest.txt", cwd);
		expect(paths).toContainEqual({ path: resolve(cwd, "source.txt"), operation: "read" });
		expect(paths).toContainEqual({ path: resolve(cwd, "dest.txt"), operation: "write" });
	});

	it("should extract source as read and dest as write for cp -r", () => {
		const paths = extractPathsFromCommand("cp -r src/ dst/", cwd);
		expect(paths).toContainEqual({ path: resolve(cwd, "src/"), operation: "read" });
		expect(paths).toContainEqual({ path: resolve(cwd, "dst/"), operation: "write" });
	});

	it("should extract directory from grep", () => {
		const paths = extractPathsFromCommand("grep pattern dir/", cwd);
		expect(paths).toEqual([{ path: resolve(cwd, "dir/"), operation: "read" }]);
	});

	it("should extract write path from sed -i", () => {
		const paths = extractPathsFromCommand("sed -i 's/foo/bar/' file.txt", cwd);
		expect(paths).toContainEqual({ path: resolve(cwd, "file.txt"), operation: "write" });
	});

	it("should extract write path from mkdir -p", () => {
		const paths = extractPathsFromCommand("mkdir -p new/dir", cwd);
		expect(paths).toEqual([{ path: resolve(cwd, "new/dir"), operation: "write" }]);
	});

	it("should extract write path from output redirection >", () => {
		const paths = extractPathsFromCommand("echo hello > output.txt", cwd);
		expect(paths).toContainEqual({ path: resolve(cwd, "output.txt"), operation: "write" });
	});

	it("should extract write path from append redirection >>", () => {
		const paths = extractPathsFromCommand("echo hello >> output.txt", cwd);
		expect(paths).toContainEqual({ path: resolve(cwd, "output.txt"), operation: "write" });
	});

	it("should return empty array for unknown commands", () => {
		const paths = extractPathsFromCommand("unknown-command arg1 arg2", cwd);
		// Unknown commands have no extractor, only redirections would be caught
		expect(paths).toEqual([]);
	});

	it("should handle quoted paths with spaces", () => {
		const paths = extractPathsFromCommand('cat "file with spaces.txt"', cwd);
		expect(paths).toEqual([{ path: resolve(cwd, "file with spaces.txt"), operation: "read" }]);
	});

	it("should extract read path from cd", () => {
		const paths = extractPathsFromCommand("cd /some/dir", cwd);
		expect(paths).toEqual([{ path: "/some/dir", operation: "read" }]);
	});

	it("should extract paths from ls", () => {
		const paths = extractPathsFromCommand("ls /tmp", cwd);
		expect(paths).toEqual([{ path: "/tmp", operation: "read" }]);
	});

	it("should extract paths from find", () => {
		const paths = extractPathsFromCommand("find /var/log", cwd);
		expect(paths).toEqual([{ path: "/var/log", operation: "read" }]);
	});

	it("should extract paths from touch", () => {
		const paths = extractPathsFromCommand("touch newfile.txt", cwd);
		expect(paths).toEqual([{ path: resolve(cwd, "newfile.txt"), operation: "write" }]);
	});

	it("should handle single-quoted paths", () => {
		const paths = extractPathsFromCommand("cat 'file with spaces.txt'", cwd);
		expect(paths).toEqual([{ path: resolve(cwd, "file with spaces.txt"), operation: "read" }]);
	});

	it("should handle pipeline segments", () => {
		const paths = extractPathsFromCommand("cat /etc/hosts | grep localhost", cwd);
		expect(paths).toContainEqual({ path: "/etc/hosts", operation: "read" });
	});
});

describe("isDangerousRemoval", () => {
	it("should flag rm -rf /", () => {
		expect(isDangerousRemoval("rm -rf /")).toBe(true);
	});

	it("should flag rm -rf ~", () => {
		expect(isDangerousRemoval("rm -rf ~")).toBe(true);
	});

	it("should flag rm -rf /home", () => {
		expect(isDangerousRemoval("rm -rf /home")).toBe(true);
	});

	it("should flag rm -rf /Users", () => {
		expect(isDangerousRemoval("rm -rf /Users")).toBe(true);
	});

	it("should not flag rm -rf /tmp/safe", () => {
		expect(isDangerousRemoval("rm -rf /tmp/safe")).toBe(false);
	});

	it("should not flag rm file.txt", () => {
		expect(isDangerousRemoval("rm file.txt")).toBe(false);
	});

	it("should not flag rm -rf ./local-dir", () => {
		expect(isDangerousRemoval("rm -rf ./local-dir")).toBe(false);
	});

	it("should flag rm -r /", () => {
		expect(isDangerousRemoval("rm -r /")).toBe(true);
	});

	it("should flag rm -f /", () => {
		expect(isDangerousRemoval("rm -f /")).toBe(true);
	});

	it("should handle leading whitespace", () => {
		expect(isDangerousRemoval("  rm -rf /  ")).toBe(true);
	});
});
