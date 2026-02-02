import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigRouter } from "./routing.js";

test("ConfigRouter blocks local-only policy violations", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-routing-"));
  const configPath = path.join(tempDir, "model-routing.json");
  const config = {
    version: "1.0",
    updated_at: "2026-02-02",
    routing_mode: "hybrid",
    providers: {
      anthropic: { enabled: false, models: {} },
      openai: { enabled: true, models: { codex: { api_model_id: "test-model" } } },
      local: { enabled: false, models: {} },
    },
    task_types: { quick_capture: { description: "test" } },
    routes: { quick_capture: { primary: "openai:codex", fallback: [] } },
    fallback_rules: { on_error: true, on_timeout_ms: 1000, on_low_confidence: true },
    data_classes: { contacts: { local_only: true, examples: ["contacts/**"] } },
    policy_rules: [
      {
        id: "local_only_personal",
        description: "local only",
        match: { data_classes: ["contacts"] },
        allowed_providers: ["local"],
        requires_user_approval_for_cloud: true,
      },
    ],
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  const router = new ConfigRouter(configPath);
  await assert.rejects(
    () =>
      router.route({
        task_type: "quick_capture",
        prompt: "hello",
        touches_files: ["contacts/jane.md"],
      }),
    /Policy violation/,
  );
});

test("ConfigRouter classify returns a task type", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-routing-"));
  const configPath = path.join(tempDir, "model-routing.json");
  const config = {
    version: "1.0",
    updated_at: "2026-02-02",
    routing_mode: "hybrid",
    providers: {
      anthropic: { enabled: false, models: {} },
      openai: { enabled: false, models: {} },
      local: { enabled: false, models: {} },
    },
    task_types: { complex_reasoning: { description: "test" } },
    routes: { complex_reasoning: { primary: "openai:codex", fallback: [] } },
    fallback_rules: { on_error: true, on_timeout_ms: 1000, on_low_confidence: true },
    data_classes: {},
    policy_rules: [],
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  const router = new ConfigRouter(configPath);
  const result = await router.classify("Analyze this architecture");
  assert.ok(result.task_type);
  assert.ok(result.confidence >= 0);
});
