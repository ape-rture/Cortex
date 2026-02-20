import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { executeCodexCliAgent } from "./codex-process.js";

interface FakeChild extends EventEmitter {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: (signal?: NodeJS.Signals | number) => boolean;
}

function createFakeChild(onKill?: () => void): FakeChild {
  const emitter = new EventEmitter() as FakeChild;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  emitter.stdin = stdin;
  emitter.stdout = stdout;
  emitter.stderr = stderr;
  emitter.kill = () => {
    if (onKill) onKill();
    return true;
  };

  return emitter;
}

test("executeCodexCliAgent pipes prompt, parses JSONL, and reads last message", async () => {
  let seenCommand = "";
  let seenArgs: readonly string[] = [];
  let prompt = "";
  const child = createFakeChild();
  child.stdin.on("data", (chunk) => {
    prompt += chunk.toString();
  });

  const eventsSeen: string[] = [];
  const run = executeCodexCliAgent(
    {
      prompt: "run task",
      workingDir: "D:/repo",
      sandboxMode: "workspace-write",
      model: "gpt-5",
      timeoutMs: 1000,
      codexPath: "codex-bin",
    },
    (event) => {
      if (typeof event.type === "string") eventsSeen.push(event.type);
    },
    {
      spawnImpl: (command, args) => {
        seenCommand = command;
        seenArgs = args;

        queueMicrotask(() => {
          child.stdout.write("{\"type\":\"started\"}\n");
          child.stdout.write("not-json\n");
          child.stdout.write("{\"type\":\"completed\",\"ok\":true}\n");
          child.emit("close", 0, null);
        });

        return child as unknown as ChildProcessWithoutNullStreams;
      },
      mkdtempImpl: async () => "D:/tmp/codex-run",
      readFileImpl: async () => "final message",
      rmImpl: async () => undefined,
    },
  );

  const result = await run;
  assert.equal(seenCommand, "codex-bin");
  assert.equal(prompt, "run task");
  assert.equal(seenArgs.includes("exec"), true);
  assert.equal(seenArgs.includes("--json"), true);
  assert.equal(seenArgs.includes("--sandbox"), true);
  assert.equal(seenArgs.includes("workspace-write"), true);
  assert.equal(seenArgs.includes("--model"), true);
  assert.equal(seenArgs.includes("gpt-5"), true);

  assert.equal(result.exitCode, 0);
  assert.equal(result.lastMessage, "final message");
  assert.equal(result.events.length, 2);
  assert.deepEqual(eventsSeen, ["started", "completed"]);
});

test("executeCodexCliAgent resolves non-zero exits", async () => {
  const child = createFakeChild();

  const result = await executeCodexCliAgent(
    {
      prompt: "run",
      workingDir: "D:/repo",
      timeoutMs: 1000,
    },
    undefined,
    {
      spawnImpl: () => {
        queueMicrotask(() => {
          child.emit("close", 2, null);
        });
        return child as unknown as ChildProcessWithoutNullStreams;
      },
      mkdtempImpl: async () => "D:/tmp/codex-run",
      readFileImpl: async () => "",
      rmImpl: async () => undefined,
    },
  );

  assert.equal(result.exitCode, 2);
  assert.equal(result.events.length, 0);
});

test("executeCodexCliAgent falls back to agent_message event when output file is unavailable", async () => {
  const child = createFakeChild();

  const resultPromise = executeCodexCliAgent(
    {
      prompt: "run",
      workingDir: "D:/repo",
      timeoutMs: 1000,
    },
    undefined,
    {
      spawnImpl: () => {
        queueMicrotask(() => {
          child.stdout.write("{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"from event\"}}\n");
          child.emit("close", 0, null);
        });
        return child as unknown as ChildProcessWithoutNullStreams;
      },
      mkdtempImpl: async () => "D:/tmp/codex-run",
      readFileImpl: async () => {
        throw new Error("missing output file");
      },
      rmImpl: async () => undefined,
    },
  );

  const result = await resultPromise;
  assert.equal(result.exitCode, 0);
  assert.equal(result.lastMessage, "from event");
  assert.equal(result.events.length, 1);
});

test("executeCodexCliAgent times out and terminates process", async () => {
  let killed = false;
  const child = createFakeChild(() => {
    killed = true;
    queueMicrotask(() => {
      child.emit("close", null, "SIGTERM");
    });
  });

  const result = await executeCodexCliAgent(
    {
      prompt: "run",
      workingDir: "D:/repo",
      timeoutMs: 5,
    },
    undefined,
    {
      spawnImpl: () => child as unknown as ChildProcessWithoutNullStreams,
      mkdtempImpl: async () => "D:/tmp/codex-run",
      readFileImpl: async () => "",
      rmImpl: async () => undefined,
    },
  );

  assert.equal(killed, true);
  assert.equal(result.exitCode, -1);
});
