/**
 * Telegram Bot Client
 *
 * Creates and configures a Telegraf bot instance.
 */

import { Telegraf } from "telegraf";
import type { Context } from "telegraf";
import type { TelegramConfig } from "./types.js";

const DEFAULT_ORCHESTRATOR_CONFIG = "context/orchestrator.json";

function parseAllowedUserIds(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Read Telegram configuration from environment variables.
 * Throws if required variables are missing.
 */
export function readTelegramConfig(): TelegramConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUserIdsRaw = process.env.TELEGRAM_ALLOWED_USER_IDS;

  const missing: string[] = [];
  if (!botToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!allowedUserIdsRaw) missing.push("TELEGRAM_ALLOWED_USER_IDS");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}.`,
    );
  }

  const allowedUserIds = parseAllowedUserIds(allowedUserIdsRaw!);
  if (allowedUserIds.length === 0) {
    throw new Error(
      "TELEGRAM_ALLOWED_USER_IDS must contain at least one user ID.",
    );
  }

  return {
    botToken: botToken!,
    allowedUserIds,
    orchestratorConfigPath:
      process.env.ORCHESTRATOR_CONFIG_PATH ?? DEFAULT_ORCHESTRATOR_CONFIG,
  };
}

/**
 * Create a Telegraf app configured for a Telegram bot.
 */
export function createTelegramBot(config: TelegramConfig): Telegraf<Context> {
  return new Telegraf(config.botToken);
}

/**
 * Check whether the incoming Telegram user is allowed.
 */
export function isAllowedUser(
  userId: string | number | undefined,
  allowedUserIds: readonly string[],
): boolean {
  if (userId === undefined) return false;
  return allowedUserIds.includes(String(userId));
}
