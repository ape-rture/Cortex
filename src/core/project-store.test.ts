import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownProjectStore } from "./project-store.js";

async function createFixture(): Promise<{
  root: string;
  registryPath: string;
  store: MarkdownProjectStore;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-project-store-"));
  const registryPath = path.join(root, "projects", "project-registry.md");
  const store = new MarkdownProjectStore({ registryPath });
  return { root, registryPath, store };
}

test("MarkdownProjectStore returns empty list when registry file is missing", async () => {
  const fixture = await createFixture();
  try {
    const projects = await fixture.store.loadProjects();
    assert.equal(projects.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("MarkdownProjectStore add/find/update/filter/remove flow", async () => {
  const fixture = await createFixture();
  try {
    const firstPath = path.join(fixture.root, "cortex");
    const secondPath = path.join(fixture.root, "cortex-v2");

    const id1 = await fixture.store.addProject({
      name: "Cortex",
      path: firstPath,
      gitRemote: "https://example.com/cortex.git",
      status: "active",
      techStack: ["typescript", "node"],
      lastActivity: "2026-02-09",
      notes: "Main workspace",
    });

    const id2 = await fixture.store.addProject({
      name: "Cortex",
      path: secondPath,
      gitRemote: undefined,
      status: "paused",
      techStack: ["go"],
      lastActivity: "2026-02-08",
      notes: undefined,
    });

    assert.equal(id1, "cortex");
    assert.equal(id2, "cortex-2");

    const projects = await fixture.store.loadProjects();
    assert.equal(projects.length, 2);
    assert.equal(projects[0].path, path.resolve(firstPath));
    assert.equal(projects[1].path, path.resolve(secondPath));

    const byId = await fixture.store.findById(id1);
    assert.ok(byId);
    assert.equal(byId?.name, "Cortex");

    const byPath = await fixture.store.findByPath(firstPath);
    assert.ok(byPath);
    assert.equal(byPath?.id, id1);

    await fixture.store.updateProject(id1, {
      status: "archived",
      notes: "Completed migration",
      techStack: ["typescript", "node", "hono"],
    });

    const archived = await fixture.store.filterByStatus("archived");
    assert.equal(archived.length, 1);
    assert.equal(archived[0].notes, "Completed migration");
    assert.deepEqual(archived[0].techStack, ["typescript", "node", "hono"]);

    await fixture.store.removeProject(id2);
    const remaining = await fixture.store.loadProjects();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, id1);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("MarkdownProjectStore throws when updating/removing unknown project", async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      async () => await fixture.store.updateProject("missing-id", { status: "paused" }),
      /Project not found: missing-id/,
    );
    await assert.rejects(
      async () => await fixture.store.removeProject("missing-id"),
      /Project not found: missing-id/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
