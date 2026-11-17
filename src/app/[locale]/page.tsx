import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";

const FEATURES = [
  { key: "team", href: "/time", icon: "👥" },
  { key: "simulator", href: "/simulador", icon: "⚔️" },
  { key: "analyze", href: "/analisar", icon: "📊" },
] as const;

const STEPS = ["one", "two", "three"] as const;

export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Home");

  return (
    <div className="space-y-10">
      <section className="pt-4">
        <h1 className="mb-3 text-3xl font-bold sm:text-4xl">{t("title")}</h1>
        <p className="max-w-2xl text-lg opacity-80">{t("subtitle")}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {FEATURES.map(({ key, href, icon }) => (
          <article key={key} className="flex flex-col rounded-lg border border-black/10 p-5 dark:border-white/15">
            <p className="mb-2 text-2xl" aria-hidden>
              {icon}
            </p>
            <h2 className="mb-2 text-lg font-semibold">{t(`features.${key}.title`)}</h2>
            <p className="mb-4 flex-1 text-sm opacity-80">{t(`features.${key}.description`)}</p>
            <Link
              href={href}
              className="self-start rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              {t(`features.${key}.cta`)}
            </Link>
          </article>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("howTitle")}</h2>
        <ol className="max-w-2xl list-decimal space-y-1.5 pl-5 text-sm opacity-90">
          {STEPS.map((s) => (
            <li key={s}>{t(`steps.${s}`)}</li>
          ))}
        </ol>
      </section>

      <p className="max-w-3xl text-xs opacity-60">{t("dataNote")}</p>
    </div>
  );
}
