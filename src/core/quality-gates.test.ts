import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QualityGateRunner,
  buildQualityGateFeedback,
  shouldBypassQualityGates,
  type GateExecution,
  type QualityGateReport,
} from "./quality-gates.js";
import type { BoardTask } from "../ui/handlers/tasks.js";

function makeTask(title: string, rawLine = `- **${title}** -- Agent: codex`): BoardTask {
  return {
    title,
    status: "done",
    agent: "codex",
    rawLine,
    lineNumber: 1,
  };
}

test("QualityGateRunner passes when all gates succeed", async () => {
  const calls: string[] = [];
  const runner = new QualityGateRunner({
    runCommandImpl: async (command, args) => {
      calls.push([command, ...args].join(" "));
      return {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      };
    },
  });

  const report = await runner.run(makeTask("Implement src/core/runner.ts"), process.cwd());
  assert.equal(report.bypassed, false);
  assert.equal(report.passed, true);
  assert.equal(report.gates.length, 3);
  assert.deepEqual(calls, [
    "npm run typecheck",
    "npm run test:unit",
    "git diff --stat",
  ]);
});

test("QualityGateRunner reports failures and builds feedback message", async () => {
  let callIndex = 0;
  const runner = new QualityGateRunner({
    runCommandImpl: async (command, args) => {
      callIndex += 1;
      if (callIndex === 2) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "tests failed",
        };
      }
      return {
        exitCode: 0,
        stdout: `${command} ${args.join(" ")} ok`,
        stderr: "",
      };
    },
  });

  const report = await runner.run(makeTask("Add integration tests in src/core"), process.cwd());
  assert.equal(report.passed, false);
  assert.equal(report.bypassed, false);
  assert.equal(report.gates.length, 3);
  assert.ok(report.feedbackMessage.includes("FAIL unit-tests"));
  assert.ok(report.feedbackMessage.includes("Fix the failing checks"));
});

test("QualityGateRunner bypasses non-code tasks", async () => {
  const runner = new QualityGateRunner({
    runCommandImpl: async () => {
      throw new Error("should not run");
    },
  });

  const report = await runner.run(
    makeTask("Update context/working-memory.md", "- **Update context/working-memory.md** -- Agent: codex"),
    process.cwd(),
  );

  assert.equal(report.bypassed, true);
  assert.equal(report.passed, true);
  assert.equal(report.gates.length, 0);
});

test("shouldBypassQualityGates distinguishes code and non-code tasks", () => {
  assert.equal(
    shouldBypassQualityGates(makeTask("Refresh docs", "- **Refresh docs** update context/notes.md")),
    true,
  );

  assert.equal(
    shouldBypassQualityGates(makeTask("Fix src/core/router.ts")),
    false,
  );
});

test("buildQualityGateFeedback formats bypass and per-gate output", () => {
  const bypass: QualityGateReport = {
    passed: true,
    bypassed: true,
    gates: [],
    feedbackMessage: "",
  };
  assert.equal(buildQualityGateFeedback(bypass), "Quality gates bypassed (non-code task)."
  );

  const gates: GateExecution[] = [
    {
      name: "typecheck",
      command: "npm",
      args: ["run", "typecheck"],
      exitCode: 0,
      passed: true,
      stdout: "ok",
      stderr: "",
    },
    {
      name: "unit-tests",
      command: "npm",
      args: ["run", "test:unit"],
      exitCode: 1,
      passed: false,
      stdout: "",
      stderr: "failing test",
    },
  ];

  const report: QualityGateReport = {
    passed: false,
    bypassed: false,
    gates,
    feedbackMessage: "",
  };

  const text = buildQualityGateFeedback(report);
  assert.ok(text.includes("PASS typecheck"));
  assert.ok(text.includes("FAIL unit-tests"));
});
