import { spawn } from "node:child_process";
import type { BoardTask } from "../ui/handlers/tasks.js";

export interface GateExecution {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly passed: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export interface QualityGateReport {
  readonly passed: boolean;
  readonly bypassed: boolean;
  readonly gates: readonly GateExecution[];
  readonly feedbackMessage: string;
}

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

type RunCommand = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<CommandResult>;

interface QualityGateRunnerDeps {
  readonly runCommandImpl?: RunCommand;
}

interface GateDefinition {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
}

function firstNonEmptyLine(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "(no output)";
}

function commandToString(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}

async function runCommandDefault(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

export function shouldBypassQualityGates(task: Pick<BoardTask, "title" | "description" | "rawLine">): boolean {
  const text = [task.title, task.description ?? "", task.rawLine].join(" ").toLowerCase();

  const codeSignals = ["src/", ".ts", "test", "api", "endpoint", "integration", "backend", "orchestration"];
  if (codeSignals.some((token) => text.includes(token))) {
    return false;
  }

  const nonCodeSignals = ["context", "docs", "documentation", "decision", "meeting", "contact", ".md", "task board", "log.md", "active.md"];
  return nonCodeSignals.some((token) => text.includes(token));
}

export function buildQualityGateFeedback(report: QualityGateReport): string {
  if (report.bypassed) {
    return "Quality gates bypassed (non-code task).";
  }

  const lines: string[] = ["Quality gate results:"];
  for (const gate of report.gates) {
    const status = gate.passed ? "PASS" : "FAIL";
    const output = firstNonEmptyLine(gate.stderr || gate.stdout);
    lines.push(`- ${status} ${gate.name} (${commandToString(gate.command, gate.args)}): ${output}`);
  }

  if (!report.passed) {
    lines.push("Fix the failing checks, then mark the task done again.");
  }

  return lines.join("\n");
}

export class QualityGateRunner {
  private readonly runCommandImpl: RunCommand;

  constructor(deps: QualityGateRunnerDeps = {}) {
    this.runCommandImpl = deps.runCommandImpl ?? runCommandDefault;
  }

  async run(task: BoardTask, cwd: string): Promise<QualityGateReport> {
    if (shouldBypassQualityGates(task)) {
      const report: QualityGateReport = {
        passed: true,
        bypassed: true,
        gates: [],
        feedbackMessage: "Quality gates bypassed (non-code task).",
      };
      return report;
    }

    const definitions: readonly GateDefinition[] = [
      {
        name: "typecheck",
        command: "npm",
        args: ["run", "typecheck"],
      },
      {
        name: "unit-tests",
        command: "npm",
        args: ["run", "test:unit"],
      },
      {
        name: "diff-stat",
        command: "git",
        args: ["diff", "--stat"],
      },
    ];

    const gates: GateExecution[] = [];

    for (const gate of definitions) {
      const result = await this.runCommandImpl(gate.command, gate.args, cwd);
      gates.push({
        name: gate.name,
        command: gate.command,
        args: gate.args,
        exitCode: result.exitCode,
        passed: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    }

    const report: QualityGateReport = {
      passed: gates.every((gate) => gate.passed),
      bypassed: false,
      gates,
      feedbackMessage: "",
    };

    return {
      ...report,
      feedbackMessage: buildQualityGateFeedback(report),
    };
  }
}
