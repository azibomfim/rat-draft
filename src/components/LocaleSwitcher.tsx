"use client";

import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

export function LocaleSwitcher({ label }: { label: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: AppLocale) {
    startTransition(() => {
      // Keeps the current page; params are forwarded for dynamic routes.
      router.replace(
        // @ts-expect-error -- pathname and params always belong to the current route
        { pathname, params },
        { locale: next },
      );
    });
  }

  return (
    <div role="group" aria-label={label} className="flex gap-1 text-xs">
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          disabled={isPending || l === locale}
          aria-pressed={l === locale}
          onClick={() => switchTo(l)}
          className="rounded border border-black/20 px-2 py-1 uppercase disabled:opacity-60 aria-pressed:bg-black aria-pressed:text-white dark:border-white/20 dark:aria-pressed:bg-white dark:aria-pressed:text-black"
        >
          {l}
        </button>
      ))}
    </div>
  );
}
