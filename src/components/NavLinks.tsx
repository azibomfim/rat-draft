"use client";

import { Link, usePathname } from "@/i18n/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="underline-offset-4 hover:underline aria-[current=page]:underline aria-[current=page]:decoration-2"
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
