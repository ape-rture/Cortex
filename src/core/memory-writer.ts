/**
 * Memory Writer
 *
 * Applies validated memory updates to the markdown file system.
 * Handles append, update (section replace), and flag operations.
 *
 * Design source: decisions/2026-02-02-dennett-architecture.md
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { MemoryUpdate } from "./types/agent-output.js";
import { appendToFile } from "../utils/markdown.js";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export interface ApplyResult {
  readonly applied: number;
  readonly flagged: number;
  readonly errors: readonly { readonly update: MemoryUpdate; readonly error: string }[];
}

// ---------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------

const REVIEW_QUEUE_PATH = path.resolve("actions", "review-queue.md");

export class MemoryWriter {
  private readonly basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
  }

  async applyUpdates(updates: readonly MemoryUpdate[]): Promise<ApplyResult> {
    let applied = 0;
    let flagged = 0;
    const errors: { update: MemoryUpdate; error: string }[] = [];

    for (const update of updates) {
      try {
        switch (update.operation) {
          case "append":
            await this.applyAppend(update);
            applied++;
            break;
          case "update":
            await this.applyUpdate(update);
            applied++;
            break;
          case "flag":
            await this.applyFlag(update);
            flagged++;
            break;
          default:
            errors.push({ update, error: `Unknown operation: ${update.operation}` });
        }
      } catch (err) {
        errors.push({
          update,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { applied, flagged, errors };
  }

  private resolvePath(filePath: string): string {
    return path.resolve(this.basePath, filePath);
  }

  private async applyAppend(update: MemoryUpdate): Promise<void> {
    const fullPath = this.resolvePath(update.file);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await appendToFile(fullPath, update.content.endsWith("\n") ? update.content : `${update.content}\n`);
  }

  private async applyUpdate(update: MemoryUpdate): Promise<void> {
    const fullPath = this.resolvePath(update.file);

    let existing: string;
    try {
      existing = await fs.readFile(fullPath, "utf8");
    } catch {
      // File doesn't exist — fall back to append
      await this.applyAppend(update);
      return;
    }

    // Try to find a matching heading and replace that section
    const lines = update.content.split(/\r?\n/);
    const firstLine = lines[0]?.trim();

    if (firstLine && /^#{1,6}\s/.test(firstLine)) {
      const headingLevel = firstLine.match(/^(#{1,6})\s/)?.[1]?.length ?? 0;
      const existingLines = existing.split(/\r?\n/);
      const headingIndex = existingLines.findIndex(
        (line) => line.trim() === firstLine,
      );

      if (headingIndex !== -1) {
        // Find end of section (next heading of same or higher level, or EOF)
        let endIndex = existingLines.length;
        for (let i = headingIndex + 1; i < existingLines.length; i++) {
          const match = existingLines[i].match(/^(#{1,6})\s/);
          if (match && (match[1]?.length ?? 999) <= headingLevel) {
            endIndex = i;
            break;
          }
        }

        existingLines.splice(headingIndex, endIndex - headingIndex, ...lines);
        await fs.writeFile(fullPath, existingLines.join("\n"), "utf8");
        return;
      }
    }

    // No matching heading — append
    await this.applyAppend(update);
  }

  private async applyFlag(update: MemoryUpdate): Promise<void> {
    const snippet = update.content.slice(0, 100).replace(/\n/g, " ");
    const entry = `- [ ] **Flagged**: ${snippet} (file: ${update.file})\n`;
    await fs.mkdir(path.dirname(REVIEW_QUEUE_PATH), { recursive: true });
    await appendToFile(REVIEW_QUEUE_PATH, entry);
  }
}
