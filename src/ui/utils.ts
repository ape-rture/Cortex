import { promises as fs } from "node:fs";
import path from "node:path";
import type { Context } from "hono";

const STATIC_ROOT = path.resolve("src", "ui", "static");
const DIST_ROOT = path.resolve("src", "ui", "dist");

export async function readStaticFile(fileName: string): Promise<string> {
  const filePath = path.join(STATIC_ROOT, fileName);
  return await fs.readFile(filePath, "utf8");
}

/** Try to read a file from the Vite dist/ directory. Returns null if not found. */
export async function readDistFile(fileName: string): Promise<Buffer | null> {
  const filePath = path.join(DIST_ROOT, fileName);
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

/** Check if the Vite dashboard has been built. */
export async function hasDashboardBuild(): Promise<boolean> {
  try {
    await fs.access(path.join(DIST_ROOT, "index.html"));
    return true;
  } catch {
    return false;
  }
}

export function jsonError(c: Context, message: string, status = 400): Response {
  c.status(status as never);
  return c.json({ error: message });
}

export function buildConversation(messages: readonly { role: string; content: string }[]): string {
  return messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n");
}
