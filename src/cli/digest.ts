import "dotenv/config";
import { MarkdownDigestGenerator } from "../core/daily-digest.js";

export async function runDailyDigest(): Promise<string> {
  const generator = new MarkdownDigestGenerator();
  const digest = await generator.generate();
  return generator.toMarkdown(digest);
}

import { fileURLToPath } from "node:url";

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const generator = new MarkdownDigestGenerator();
  generator
    .generate()
    .then((digest) => generator.write(digest))
    .then((filePath) => {
      console.log(`Wrote daily digest to ${filePath}`);
    })
    .catch((err) => {
      console.error("Failed to generate daily digest:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
