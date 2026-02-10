import { route, navigate } from "../router";

interface NavItem {
  path: string;
  icon: string;
  label: string;
  badge?: boolean;
}

const items: NavItem[] = [
  { path: "/chat", icon: "\u{1F4AC}", label: "Chat" },
  { path: "/dashboard", icon: "\u{1F4CA}", label: "Overview" },
  { path: "/projects", icon: "\u{1F4C1}", label: "Projects" },
  { path: "/monitor", icon: "\u{1F50D}", label: "Monitor" },
  { path: "/review", icon: "\u{1F514}", label: "Review" },
];

export function Nav() {
  const current = route.value;

  return (
    <nav class="shell-nav">
      {items.map((item) => (
        <button
          key={item.path}
          class={`nav-item${current === item.path ? " active" : ""}`}
          onClick={() => navigate(item.path)}
          title={item.label}
        >
          {item.icon}
          {item.badge && <span class="nav-badge" />}
        </button>
      ))}
    </nav>
  );
}
