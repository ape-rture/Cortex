import { test } from "node:test";
import assert from "node:assert/strict";
import { interceptCommandShortcut } from "./command-interceptor.js";

test("interceptCommandShortcut maps digest and queue shortcuts", () => {
  assert.deepEqual(interceptCommandShortcut("eod"), {
    prompt: "/digest",
    intercepted: true,
    reason: "shortcut:digest",
  });

  assert.deepEqual(interceptCommandShortcut("queue"), {
    prompt: "/queue status",
    intercepted: true,
    reason: "shortcut:queue-status",
  });

  assert.deepEqual(interceptCommandShortcut("retry failed"), {
    prompt: "/queue retry failed",
    intercepted: true,
    reason: "shortcut:queue-retry-failed",
  });
});

test("interceptCommandShortcut maps orchestrate shortcut", () => {
  assert.deepEqual(interceptCommandShortcut("orchestrate"), {
    prompt: "/orchestrate",
    intercepted: true,
    reason: "shortcut:orchestrate",
  });
});

test("interceptCommandShortcut leaves normal prompts untouched", () => {
  const natural = "project heartbeat is still failing on prod";
  assert.deepEqual(interceptCommandShortcut(natural), {
    prompt: natural,
    intercepted: false,
  });
});
