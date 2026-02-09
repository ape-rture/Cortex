/**
 * Permission Validator
 *
 * Validates agent memory updates against permission envelopes.
 * Ensures agents can only write to files they are authorized to access.
 *
 * Design source: decisions/2026-02-02-dennett-architecture.md
 */

import type { AgentOutput, MemoryUpdate } from "./types/agent-output.js";
import type { PermissionEnvelope } from "./types/permission.js";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export interface ValidatedUpdates {
  readonly approved: readonly MemoryUpdate[];
  readonly rejected: readonly { readonly update: MemoryUpdate; readonly reason: string }[];
}

// ---------------------------------------------------------------------
// Glob matching (duplicated from routing.ts — it's private there)
// ---------------------------------------------------------------------

function toRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = "^" + escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$";
  return new RegExp(regex, "i");
}

function matchesAnyPattern(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => toRegex(pattern).test(filePath));
}

// ---------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------

export class PermissionValidator {
  /**
   * Validate all memory updates from an agent output against its permissions.
   * - "flag" operations are always approved (they write to review queue, not target).
   * - Other operations must match can_write glob patterns.
   */
  validate(output: AgentOutput, permissions: PermissionEnvelope): ValidatedUpdates {
    const approved: MemoryUpdate[] = [];
    const rejected: { update: MemoryUpdate; reason: string }[] = [];

    for (const update of output.memory_updates) {
      // Flag operations always allowed — they go to the review queue
      if (update.operation === "flag") {
        approved.push(update);
        continue;
      }

      if (matchesAnyPattern(update.file, permissions.can_write)) {
        approved.push(update);
      } else {
        rejected.push({
          update,
          reason: `Permission denied: ${permissions.agent} cannot write to ${update.file}`,
        });
      }
    }

    return { approved, rejected };
  }
}
