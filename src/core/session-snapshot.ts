import { promises as fs } from "node:fs";
import path from "node:path";
import type { SessionSnapshot, SessionSnapshotStore } from "./types/session.js";

const DEFAULT_SNAPSHOT_PATH = path.resolve(".cortex", "snapshot.md");

function nowIso(): string {
  return new Date().toISOString();
}

function parseList(lines: string[], startIndex: number): { items: string[]; nextIndex: number } {
  const items: string[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith("## ")) break;
    if (line.startsWith("- ")) {
      items.push(line.replace(/^[-]\s+/, "").trim());
    }
    i += 1;
  }
  return { items, nextIndex: i };
}

function parseSnapshot(content: string): SessionSnapshot | undefined {
  const lines = content.split(/\r?\n/);
  let agent: SessionSnapshot["agent"] | undefined;
  let endedAt: string | undefined;
  let branch: string | undefined;
  let workingOn = "";
  let unfinished: string[] = [];
  let nextSteps: string[] = [];
  let openQuestions: string[] = [];
  let keyFiles: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith("**Agent**:")) {
      agent = line.replace("**Agent**:", "").trim() as SessionSnapshot["agent"];
    } else if (line.startsWith("**Ended**:")) {
      endedAt = line.replace("**Ended**:", "").trim();
    } else if (line.startsWith("**Branch**:")) {
      branch = line.replace("**Branch**:", "").trim();
    } else if (line.startsWith("**Working On**:")) {
      workingOn = line.replace("**Working On**:", "").trim();
    } else if (line.startsWith("## Unfinished")) {
      const result = parseList(lines, i + 1);
      unfinished = result.items;
      i = result.nextIndex - 1;
    } else if (line.startsWith("## Next Steps")) {
      const result = parseList(lines, i + 1);
      nextSteps = result.items;
      i = result.nextIndex - 1;
    } else if (line.startsWith("## Open Questions")) {
      const result = parseList(lines, i + 1);
      openQuestions = result.items;
      i = result.nextIndex - 1;
    } else if (line.startsWith("## Key Files")) {
      const result = parseList(lines, i + 1);
      keyFiles = result.items;
      i = result.nextIndex - 1;
    }
    i += 1;
  }

  if (!agent || !endedAt || !workingOn) return undefined;

  return {
    agent,
    ended_at: endedAt,
    branch,
    working_on: workingOn,
    unfinished,
    next_steps: nextSteps,
    open_questions: openQuestions,
    key_files: keyFiles,
  };
}

function serializeSnapshot(snapshot: SessionSnapshot): string {
  const lines: string[] = [];
  lines.push("# Session Snapshot");
  lines.push("");
  lines.push(`**Agent**: ${snapshot.agent}`);
  lines.push(`**Ended**: ${snapshot.ended_at}`);
  if (snapshot.branch) {
    lines.push(`**Branch**: ${snapshot.branch}`);
  }
  lines.push(`**Working On**: ${snapshot.working_on}`);
  lines.push("");

  const sections: Array<{ title: string; items: readonly string[] }> = [
    { title: "Unfinished", items: snapshot.unfinished },
    { title: "Next Steps", items: snapshot.next_steps },
    { title: "Open Questions", items: snapshot.open_questions },
    { title: "Key Files", items: snapshot.key_files },
  ];

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    if (section.items.length === 0) {
      lines.push("- (none)");
    } else {
      for (const item of section.items) {
        lines.push(`- ${item}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export class MarkdownSessionSnapshotStore implements SessionSnapshotStore {
  private readonly snapshotPath: string;

  constructor(snapshotPath: string = DEFAULT_SNAPSHOT_PATH) {
    this.snapshotPath = snapshotPath;
  }

  async capture(snapshot: SessionSnapshot): Promise<void> {
    const fullSnapshot: SessionSnapshot = {
      ...snapshot,
      ended_at: snapshot.ended_at || nowIso(),
    };
    const content = serializeSnapshot(fullSnapshot);
    await fs.writeFile(this.snapshotPath, content, "utf8");
  }

  async load(): Promise<SessionSnapshot | undefined> {
    try {
      const raw = await fs.readFile(this.snapshotPath, "utf8");
      return parseSnapshot(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw err;
    }
  }
}
