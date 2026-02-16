export interface CommandInterception {
  readonly prompt: string;
  readonly intercepted: boolean;
  readonly reason?: string;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function interceptCommandShortcut(prompt: string): CommandInterception {
  const trimmed = normalized(prompt);
  if (!trimmed) {
    return { prompt, intercepted: false };
  }

  const lower = trimmed.toLowerCase();

  // Digest shortcuts
  if (lower === "eod" || lower === "digest" || lower === "daily digest" || lower === "end of day") {
    return { prompt: "/digest", intercepted: true, reason: "shortcut:digest" };
  }

  // Queue shortcuts
  if (lower === "queue" || lower === "queue status" || lower === "task queue" || lower === "tasks") {
    return { prompt: "/queue status", intercepted: true, reason: "shortcut:queue-status" };
  }
  if (lower === "queue failed" || lower === "failed queue") {
    return { prompt: "/queue failed", intercepted: true, reason: "shortcut:queue-failed" };
  }
  if (lower === "retry failed" || lower === "retry failed queue") {
    return { prompt: "/queue retry failed", intercepted: true, reason: "shortcut:queue-retry-failed" };
  }

  // Inbox shortcut
  if (lower === "inbox") {
    return { prompt: "/inbox", intercepted: true, reason: "shortcut:inbox" };
  }

  // Orchestrate shortcut (for transport layers with streaming special-case)
  if (lower === "orchestrate") {
    return { prompt: "/orchestrate", intercepted: true, reason: "shortcut:orchestrate" };
  }

  return { prompt, intercepted: false };
}
