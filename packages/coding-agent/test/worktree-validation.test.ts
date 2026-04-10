import { describe, expect, it } from "vitest";
import { flattenSlug, validateWorktreeSlug, worktreeBranchName } from "../src/core/worktree/validation.js";

describe("validateWorktreeSlug", () => {
	it("should accept simple slug", () => {
		expect(() => validateWorktreeSlug("my-feature")).not.toThrow();
	});

	it("should accept nested slug with forward slash", () => {
		expect(() => validateWorktreeSlug("user/feature")).not.toThrow();
	});

	it("should accept slug with dots", () => {
		expect(() => validateWorktreeSlug("fix.123")).not.toThrow();
	});

	it("should accept slug with underscores", () => {
		expect(() => validateWorktreeSlug("my_feature")).not.toThrow();
	});

	it("should accept slug at max length (64 chars)", () => {
		const slug = "a".repeat(64);
		expect(() => validateWorktreeSlug(slug)).not.toThrow();
	});

	it("should reject slug over max length (65 chars)", () => {
		const slug = "a".repeat(65);
		expect(() => validateWorktreeSlug(slug)).toThrow("must be 64 characters or fewer");
	});

	it("should reject path traversal with ..", () => {
		expect(() => validateWorktreeSlug("../escape")).toThrow('must not contain "." or ".."');
	});

	it("should reject single dot segment", () => {
		expect(() => validateWorktreeSlug(".")).toThrow('must not contain "." or ".."');
	});

	it("should reject double dot segment", () => {
		expect(() => validateWorktreeSlug("..")).toThrow('must not contain "." or ".."');
	});

	it("should reject leading slash (empty first segment)", () => {
		expect(() => validateWorktreeSlug("/leading")).toThrow("must be non-empty");
	});

	it("should reject trailing slash (empty last segment)", () => {
		expect(() => validateWorktreeSlug("trailing/")).toThrow("must be non-empty");
	});

	it("should reject double slash (empty segment)", () => {
		expect(() => validateWorktreeSlug("double//slash")).toThrow("must be non-empty");
	});

	it("should reject invalid characters", () => {
		expect(() => validateWorktreeSlug("invalid chars!")).toThrow("must be non-empty and contain only");
	});

	it("should reject spaces in slug", () => {
		expect(() => validateWorktreeSlug("spaces in slug")).toThrow("must be non-empty and contain only");
	});

	it("should reject dot-dot in nested path", () => {
		expect(() => validateWorktreeSlug("foo/../bar")).toThrow('must not contain "." or ".."');
	});

	it("should accept multi-level nesting", () => {
		expect(() => validateWorktreeSlug("a/b/c")).not.toThrow();
	});
});

describe("flattenSlug", () => {
	it("should replace forward slashes with plus signs", () => {
		expect(flattenSlug("user/feature")).toBe("user+feature");
	});

	it("should return simple slug unchanged", () => {
		expect(flattenSlug("simple")).toBe("simple");
	});

	it("should flatten multiple levels", () => {
		expect(flattenSlug("a/b/c")).toBe("a+b+c");
	});
});

describe("worktreeBranchName", () => {
	it("should prefix with zota/", () => {
		expect(worktreeBranchName("my-feature")).toBe("zota/my-feature");
	});

	it("should flatten nested slugs in branch name", () => {
		expect(worktreeBranchName("user/feature")).toBe("zota/user+feature");
	});
});
