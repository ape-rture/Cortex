import { useEffect, useRef, useCallback, useState } from "preact/hooks";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { CanvasAddon } from "@xterm/addon-canvas";
import { useWebSocket } from "../hooks/use-websocket";
import type { InstanceType } from "../types";

const TYPE_LABELS: Record<InstanceType, string> = {
  claude: "Claude",
  codex: "Codex",
  shell: "Shell",
};

const TYPE_ICONS: Record<InstanceType, string> = {
  claude: "\u{1F9E0}",
  codex: "\u{1F4BB}",
  shell: ">_",
};

function formatRss(kb: number): string {
  if (kb >= 1_048_576) return `${(kb / 1_048_576).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`;
  return `${kb} KB`;
}

interface TerminalPaneProps {
  sessionId: string;
  instanceType: InstanceType;
  alive: boolean;
  rssKb?: number | null;
  onClose: (sessionId: string) => void;
  onRestart: (sessionId: string) => void;
  onExit: (sessionId: string) => void;
}

export function TerminalPane({
  sessionId,
  instanceType,
  alive,
  rssKb,
  onClose,
  onRestart,
  onExit,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const canvasRef = useRef<CanvasAddon | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  // Input bar mode: when true, a textarea captures input instead of the terminal
  const [inputBarMode, setInputBarMode] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const inputBarModeRef = useRef(inputBarMode);
  inputBarModeRef.current = inputBarMode;

  const onMessage = useCallback((data: any) => {
    const term = termRef.current;
    if (!term) return;

    switch (data.type) {
      case "scrollback":
      case "output":
        term.write(data.data);
        break;
      case "session_ended":
        term.write(`\r\n\x1b[31m[Process exited with code ${data.exitCode}]\x1b[0m\r\n`);
        onExitRef.current(data.sessionId);
        break;
      case "error":
        term.write(`\r\n\x1b[31m[Error: ${data.message}]\x1b[0m\r\n`);
        break;
    }
  }, []);

  // Each pane gets its own WebSocket connection
  const { connected, send } = useWebSocket("/ws/terminal", onMessage, [sessionId]);

  // Create terminal on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "Cascadia Code, Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#1a1a1a",
        foreground: "#e0e0e0",
        cursor: "#4a9eff",
      },
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Use canvas addon (safe for multiple terminals)
    try {
      const canvas = new CanvasAddon();
      term.loadAddon(canvas);
      canvasRef.current = canvas;
    } catch {
      // Canvas not available, fall back to default renderer
    }

    // When input bar is active, block all keyboard input to the terminal so the
    // textarea handles editing. Allow clipboard shortcuts through in both modes.
    term.attachCustomKeyEventHandler((event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "v") return false;
      if ((event.ctrlKey || event.metaKey) && event.key === "c" && term.hasSelection()) return false;
      // In input bar mode, block all other keys from reaching the terminal
      if (inputBarModeRef.current) return false;
      return true;
    });

    // Register resize handler BEFORE fitting so all resizes are forwarded
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      send({ type: "resize", sessionId, cols, rows });
    });

    // Fit to container — triggers onResize (may not send if WS isn't connected yet)
    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;

    // User input -> server (only in raw mode; input bar mode sends via textarea)
    term.onData((data) => {
      if (!inputBarModeRef.current) {
        send({ type: "input", sessionId, data });
      }
    });

    // Resize observer for container changes
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon.fit());
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeDisposable.dispose();
      resizeObserver.disconnect();
      canvasRef.current?.dispose();
      canvasRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Auto-attach when WS connects + send current dimensions so PTY matches xterm
  useEffect(() => {
    if (!connected) return;
    const term = termRef.current;
    send({ type: "attach", sessionId });
    // Sync PTY size to match the fitted terminal — the initial fit() may have
    // fired before the WS was connected, so the PTY could still be at defaults
    if (term) {
      send({ type: "resize", sessionId, cols: term.cols, rows: term.rows });
    }
  }, [connected, sessionId, send]);

  const rssWarning = rssKb != null && rssKb >= 1_048_576;

  const sendInput = useCallback(() => {
    if (!inputValue) return;
    send({ type: "input", sessionId, data: inputValue + "\r" });
    setInputValue("");
    // Re-focus the textarea after sending
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [inputValue, sessionId, send]);

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendInput();
      }
    },
    [sendInput],
  );

  const toggleInputBar = useCallback(() => {
    setInputBarMode((prev) => {
      if (prev) {
        // Switching to raw mode — focus the terminal
        requestAnimationFrame(() => {
          termRef.current?.focus();
          fitRef.current?.fit();
        });
      } else {
        // Switching to input bar — focus the textarea, refit terminal
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          fitRef.current?.fit();
        });
      }
      return !prev;
    });
  }, []);

  return (
    <div class="terminal-cell">
      <div class="terminal-cell-header">
        <span
          class="status-dot"
          style={{ background: alive ? "var(--status-ok)" : "var(--status-error)" }}
        />
        <span class="terminal-cell-label">
          {TYPE_ICONS[instanceType]} {TYPE_LABELS[instanceType]}
        </span>
        {rssKb != null && (
          <span class={`terminal-cell-rss${rssWarning ? " warning" : ""}`}>
            {formatRss(rssKb)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          class={`terminal-cell-btn mode-toggle${inputBarMode ? " active" : ""}`}
          onClick={toggleInputBar}
          title={inputBarMode ? "Switch to raw terminal input" : "Switch to input bar"}
        >
          {inputBarMode ? "INPUT" : "RAW"}
        </button>
        {!connected && (
          <span class="terminal-cell-status disconnected">reconnecting</span>
        )}
        {!alive && (
          <button
            class="terminal-cell-btn restart"
            onClick={() => onRestart(sessionId)}
            title="Restart"
          >
            ↻
          </button>
        )}
        <button
          class="terminal-cell-btn close"
          onClick={() => onClose(sessionId)}
          title="Close"
        >
          x
        </button>
      </div>
      <div ref={containerRef} class="terminal-cell-body" />
      {inputBarMode && (
        <div class="terminal-input-bar">
          <textarea
            ref={inputRef}
            class="terminal-input-textarea"
            value={inputValue}
            onInput={(e) => setInputValue((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a command... (Enter to send, Shift+Enter for newline)"
            rows={3}
          />
          <button class="terminal-input-send" onClick={sendInput} title="Send (Enter)">
            &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
