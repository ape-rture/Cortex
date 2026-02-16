/**
 * Telegram Integration Types
 *
 * Configuration and context types for the Cortex Telegram bot.
 */

export interface TelegramConfig {
  /** Telegram Bot token */
  readonly botToken: string;

  /** Whitelisted Telegram user IDs */
  readonly allowedUserIds: readonly string[];

  /** Path to orchestrator config */
  readonly orchestratorConfigPath: string;
}

export interface TelegramCommandContext {
  /** Raw message text */
  readonly text: string;

  /** Telegram user ID */
  readonly userId: string;

  /** Telegram chat ID */
  readonly chatId: string;

  /** Telegram message ID */
  readonly messageId: string;

  /** Replied-to message ID when available */
  readonly replyToMessageId?: string;
}
