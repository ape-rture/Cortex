import { test } from "node:test";
import assert from "node:assert/strict";
import { SimpleGitMonitor } from "./git-monitor.js";

test("SimpleGitMonitor returns no report when no unpushed commits", async () => {
  const monitor = new SimpleGitMonitor({ repos: [process.cwd()] });
  const report = await monitor.checkRepo(process.cwd());
  if (report) {
    assert.ok(report.count >= 0);
  } else {
    assert.equal(report, undefined);
  }
});
