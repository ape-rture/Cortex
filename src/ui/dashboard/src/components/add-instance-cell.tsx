import { useState, useEffect, useRef } from "preact/hooks";
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

interface AddInstanceCellProps {
  onAdd: (type: InstanceType) => void;
}

export function AddInstanceCell({ onAdd }: AddInstanceCellProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  return (
    <div class="add-instance-cell" ref={menuRef}>
      <button
        class="add-instance-cell-btn"
        onClick={() => setShowMenu(!showMenu)}
        title="Add CLI instance"
      >
        <span class="add-instance-cell-icon">+</span>
        <span class="add-instance-cell-label">Add instance</span>
      </button>

      {showMenu && (
        <div class="add-instance-cell-menu">
          {(["claude", "codex", "shell"] as InstanceType[]).map((t) => (
            <button
              key={t}
              class="add-instance-cell-option"
              onClick={() => {
                onAdd(t);
                setShowMenu(false);
              }}
            >
              {TYPE_ICONS[t]} {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
