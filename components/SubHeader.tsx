// The top bar on the dashboard and screen setup pages.

import Link from "next/link";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/#try", label: "Rack stops" },
  { href: "/dashboard", label: "Pickups" },
  { href: "/screen", label: "Screens" },
];

export default function SubHeader({ active }: { active: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Almost home">
          <span className="relative flex size-7 items-center justify-center rounded-md border border-amber/60">
            <span className="size-2 rounded-full bg-amber" />
          </span>
          <span className="display text-xl tracking-tight">Almost</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted sm:gap-7">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`transition hover:text-fg ${active === l.href ? "text-fg" : ""} ${l.href === "/" || l.href === "/#try" ? "hidden sm:inline" : ""}`}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
