import { promises as fs } from "node:fs";
import path from "node:path";
import type { WorkspaceConfig } from "./types.js";

const DEFAULT_CONFIG_PATH = path.resolve("context", "workspaces.json");

const EMPTY_CONFIG: WorkspaceConfig = { version: 1, projects: [] };

export class WorkspaceConfigStore {
  private readonly configPath: string;

  constructor(configPath = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath;
  }

  async load(): Promise<WorkspaceConfig> {
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      return JSON.parse(raw) as WorkspaceConfig;
    } catch {
      return EMPTY_CONFIG;
    }
  }

  async save(config: WorkspaceConfig): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), "utf8");
  }
}
