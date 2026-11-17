"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Link } from "@/i18n/navigation";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("ErrorPage");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section role="alert" className="py-12 text-center">
      <h1 className="mb-2 text-2xl font-bold">{t("title")}</h1>
      <p className="mx-auto mb-6 max-w-md opacity-80">{t("body")}</p>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={() => retry()} className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background">
          {t("retry")}
        </button>
        <Link href="/" className="rounded border border-black/20 px-4 py-2 text-sm dark:border-white/20">
          {t("backHome")}
        </Link>
      </div>
    </section>
  );
}
