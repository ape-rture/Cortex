import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  SENSITIVE_FILE_PATTERNS,
  normalizePathForSecurity,
  checkFileAccess,
} from "./path-security.js";

const BASE = path.resolve("d:\\test-project");

// ── normalizePathForSecurity ─────────────────────────────────────────

test("normalizePathForSecurity converts backslashes to forward slashes", () => {
  const result = normalizePathForSecurity(
    path.join(BASE, "src", "core", "routing.ts"),
    BASE,
  );
  assert.equal(result, "src/core/routing.ts");
});

test("normalizePathForSecurity handles relative paths", () => {
  const result = normalizePathForSecurity("src/core/routing.ts", BASE);
  assert.equal(result, "src/core/routing.ts");
});

test("normalizePathForSecurity resolves .. segments", () => {
  const result = normalizePathForSecurity(
    path.join(BASE, "src", "core", "..", "utils", "markdown.ts"),
    BASE,
  );
  assert.equal(result, "src/utils/markdown.ts");
});

// ── Deny list matching ───────────────────────────────────────────────

test("blocks .env files", () => {
  assert.ok(checkFileAccess(".env", BASE, ["**/*"]).blocked);
  assert.ok(checkFileAccess(".env.local", BASE, ["**/*"]).blocked);
  assert.ok(checkFileAccess(".env.production", BASE, ["**/*"]).blocked);
});

test("blocks key and certificate files", () => {
  assert.ok(checkFileAccess("service.key", BASE, ["**/*"]).blocked);
  assert.ok(checkFileAccess("ssl/server.pem", BASE, ["**/*"]).blocked);
  assert.ok(checkFileAccess("cert.p12", BASE, ["**/*"]).blocked);
  assert.ok(checkFileAccess("store.pfx", BASE, ["**/*"]).blocked);
});

test("blocks credentials.json at any depth", () => {
  assert.ok(checkFileAccess("credentials.json", BASE, ["**/*"]).blocked);
  assert.ok(checkFileAccess("config/credentials.json", BASE, ["**/*"]).blocked);
});

test("blocks secrets/ directory", () => {
  assert.ok(checkFileAccess("secrets/api-key.txt", BASE, ["**/*"]).blocked);
  assert.ok(checkFileAccess("secrets/nested/token.json", BASE, ["**/*"]).blocked);
});

test("blocks .git/config", () => {
  assert.ok(checkFileAccess(".git/config", BASE, ["**/*"]).blocked);
  assert.ok(checkFileAccess(".git/credentials", BASE, ["**/*"]).blocked);
});

// ── Allow list matching ──────────────────────────────────────────────

test("allows files matching can_read patterns", () => {
  const patterns = ["src/**", "context/**", "package.json"];
  assert.equal(checkFileAccess("src/core/routing.ts", BASE, patterns).blocked, false);
  assert.equal(checkFileAccess("context/weekly-focus.md", BASE, patterns).blocked, false);
  assert.equal(checkFileAccess("package.json", BASE, patterns).blocked, false);
});

test("blocks files outside can_read patterns", () => {
  const patterns = ["src/**"];
  const result = checkFileAccess("node_modules/foo/index.js", BASE, patterns);
  assert.ok(result.blocked);
  if (result.blocked) {
    assert.match(result.reason, /does not match allowed read patterns/i);
  }
});

// ── Deny-over-allow rule ─────────────────────────────────────────────

test("deny list wins over can_read: ['**/*']", () => {
  const result = checkFileAccess(".env", BASE, ["**/*"]);
  assert.ok(result.blocked);
  if (result.blocked) {
    assert.match(result.reason, /sensitive file/i);
  }
});

test("deny list wins over explicit pattern", () => {
  // Even if someone adds .env to can_read, it should still be blocked
  const result = checkFileAccess(".env", BASE, [".env", "**/*"]);
  assert.ok(result.blocked);
});

// ── Normal files pass ────────────────────────────────────────────────

test("allows normal source files with broad permissions", () => {
  assert.equal(checkFileAccess("src/index.ts", BASE, ["**/*"]).blocked, false);
  assert.equal(checkFileAccess("context/weekly-focus.md", BASE, ["**/*"]).blocked, false);
  assert.equal(checkFileAccess("package.json", BASE, ["**/*"]).blocked, false);
});

// ── SENSITIVE_FILE_PATTERNS is populated ─────────────────────────────

test("SENSITIVE_FILE_PATTERNS includes expected entries", () => {
  assert.ok(SENSITIVE_FILE_PATTERNS.includes(".env"));
  assert.ok(SENSITIVE_FILE_PATTERNS.includes("**/*.key"));
  assert.ok(SENSITIVE_FILE_PATTERNS.includes("**/*.pem"));
  assert.ok(SENSITIVE_FILE_PATTERNS.includes("**/credentials.json"));
  assert.ok(SENSITIVE_FILE_PATTERNS.includes("secrets/**"));
});
