/**
 * Capture classification types used at intake/triage time.
 *
 * These categories are broader than queue capture_type because some classes
 * route outside actions/queue.md (project_task, action_item, needs_review).
 */

export type CaptureType =
  | "research"
  | "content_idea"
  | "project_task"
  | "cortex_feature"
  | "project_seed"
  | "action_item"
  | "needs_review";

/**
 * Tag prefixes recognized in capture input.
 * Used by both CLI and Telegram parsers.
 */
export const CAPTURE_TAG_MAP: Record<string, CaptureType> = {
  "#research": "research",
  "#content": "content_idea",
  "#task": "project_task",
  "#feature": "cortex_feature",
  "#seed": "project_seed",
  "#action": "action_item",
  research: "research",
  content: "content_idea",
  task: "project_task",
  feature: "cortex_feature",
  seed: "project_seed",
  action: "action_item",
};

export type CaptureSource = "telegram" | "cli" | "slack" | "agent" | "web";
