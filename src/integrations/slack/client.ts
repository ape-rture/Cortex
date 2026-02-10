/**
 * Slack Bot Client
 *
 * Creates and configures a Slack Bolt app with Socket Mode.
 * Socket Mode connects outbound via WebSocket -- no public URL needed.
 */

import { App } from "@slack/bolt";
import type { SlackConfig } from "./types.js";

const DEFAULT_ORCHESTRATOR_CONFIG = "context/orchestrator.json";

/**
 * Read Slack configuration from environment variables.
 * Throws if required variables are missing.
 */
export function readSlackConfig(): SlackConfig {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const cortexChannelId = process.env.SLACK_CORTEX_CHANNEL_ID;

  const missing: string[] = [];
  if (!botToken) missing.push("SLACK_BOT_TOKEN");
  if (!appToken) missing.push("SLACK_APP_TOKEN");
  if (!cortexChannelId) missing.push("SLACK_CORTEX_CHANNEL_ID");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "See SYSTEM.md Phase 7 for Slack app setup instructions.",
    );
  }

  return {
    botToken: botToken!,
    appToken: appToken!,
    cortexChannelId: cortexChannelId!,
    orchestratorConfigPath:
      process.env.ORCHESTRATOR_CONFIG_PATH ?? DEFAULT_ORCHESTRATOR_CONFIG,
  };
}

/**
 * Create a Slack Bolt app configured for Socket Mode.
 */
export function createSlackApp(config: SlackConfig): App {
  return new App({
    token: config.botToken,
    appToken: config.appToken,
    socketMode: true,
  });
}
