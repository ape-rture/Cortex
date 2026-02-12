/**
 * Security utilities for agent file access control.
 *
 * Deny list takes precedence over allow list — sensitive files are blocked
 * even if the agent's `can_read` patterns would otherwise match.
 *
 * Paths are normalized to forward slashes and made relative to basePath
 * for consistent matching across Windows and Unix.
 */

import path from "node:path";

// ── Deny list ────────────────────────────────────────────────────────

/** Glob patterns for files that agents must never read. */
export const SENSITIVE_FILE_PATTERNS: readonly string[] = [
  ".env",
  ".env.*",
  "**/*.key",
  "**/*.pem",
  "**/*.p12",
  "**/*.pfx",
  "**/credentials.json",
  "secrets/**",
  ".git/config",
  ".git/credentials",
  "**/.npmrc",
  "**/.pypirc",
  "**/id_rsa",
  "**/id_dsa",
  "**/id_ecdsa",
  "**/id_ed25519",
  "**/*.keystore",
  "**/*.jks",
];

// ── Glob matching ────────────────────────────────────────────────────

function toRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex =
    "^" +
    escaped
      .replace(/\*\*\//g, "(?:.*/)?") // **/ → optional directory prefix (zero or more dirs)
      .replace(/\*\*/g, "\0STAR\0") // remaining ** → placeholder (avoid mangling by next step)
      .replace(/\*/g, "[^/]*") // single * → match within one directory
      .replace(/\0STAR\0/g, ".*") // restore ** → match everything
    + "$";
  return new RegExp(regex, "i");
}

function matchesAnyPattern(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => toRegex(pattern).test(filePath));
}

// ── Path normalization ───────────────────────────────────────────────

/**
 * Normalize a file path for security checking.
 * Resolves to absolute, makes relative to basePath, converts `\` to `/`.
 */
export function normalizePathForSecurity(filePath: string, basePath: string): string {
  const absolute = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(basePath, filePath);
  const relative = path.relative(basePath, absolute);
  return relative.replaceAll("\\", "/");
}

// ── Access check ─────────────────────────────────────────────────────

/**
 * Check whether an agent should be allowed to read a file.
 *
 * 1. If the path matches the deny list → blocked (sensitive file).
 * 2. If the path does not match any `allowPatterns` → blocked (out of scope).
 * 3. Otherwise → allowed.
 */
export function checkFileAccess(
  filePath: string,
  basePath: string,
  allowPatterns: readonly string[],
): { blocked: false } | { blocked: true; reason: string } {
  const normalized = normalizePathForSecurity(filePath, basePath);

  if (matchesAnyPattern(normalized, SENSITIVE_FILE_PATTERNS)) {
    return {
      blocked: true,
      reason: `Access denied: ${path.basename(filePath)} is a sensitive file (credentials, keys, secrets)`,
    };
  }

  if (!matchesAnyPattern(normalized, allowPatterns)) {
    return {
      blocked: true,
      reason: `Permission denied: file path does not match allowed read patterns`,
    };
  }

  return { blocked: false };
}
