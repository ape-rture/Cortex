import type { ComponentChildren } from "preact";
import { Nav } from "./nav";

interface LayoutProps {
  children: ComponentChildren;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div class="shell">
      <Nav />
      <div class="shell-content">{children}</div>
    </div>
  );
}
