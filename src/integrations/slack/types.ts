/**
 * Slack Integration Types
 *
 * Configuration and context types for the Cortex Slack bot.
 * The bot connects via Socket Mode (no public URL needed).
 */

export interface SlackConfig {
  /** Slack Bot Token (xoxb-...) */
  readonly botToken: string;

  /** Slack App Token for Socket Mode (xapp-...) */
  readonly appToken: string;

  /** Channel ID for #cortex (bot only listens here) */
  readonly cortexChannelId: string;

  /** Path to orchestrator config */
  readonly orchestratorConfigPath: string;
}

export interface SlackCommandContext {
  /** Raw message text */
  readonly text: string;

  /** Slack user ID who sent the message */
  readonly userId: string;

  /** Channel ID where the message was sent */
  readonly channelId: string;

  /** Message timestamp (used for threading and updates) */
  readonly messageTs: string;

  /** Thread timestamp if this is a threaded reply */
  readonly threadTs?: string;
}
