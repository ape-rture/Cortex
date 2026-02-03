import { promises as fs } from "node:fs";
import path from "node:path";
import type { Context } from "hono";

const STATIC_ROOT = path.resolve("src", "ui", "static");

export async function readStaticFile(fileName: string): Promise<string> {
  const filePath = path.join(STATIC_ROOT, fileName);
  return await fs.readFile(filePath, "utf8");
}

export function jsonError(c: Context, message: string, status = 400): Response {
  return c.json({ error: message }, status);
}

export function buildConversation(messages: readonly { role: string; content: string }[]): string {
  return messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n");
}
