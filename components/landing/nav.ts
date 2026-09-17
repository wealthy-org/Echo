// ponytail: server-safe, tanpa "use client" — dipakai DesktopNav (server) + MobileMenu (client).
export type NavItem = { href: string; label: string };

export const NAV: NavItem[] = [
  { href: "#concept", label: "Concept" },
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
];
