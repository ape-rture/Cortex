import { signal } from "@preact/signals";

function currentHash(): string {
  const hash = location.hash.slice(1);
  return hash || "/chat";
}

export const route = signal(currentHash());

window.addEventListener("hashchange", () => {
  route.value = currentHash();
});

export function navigate(path: string): void {
  location.hash = path;
}
