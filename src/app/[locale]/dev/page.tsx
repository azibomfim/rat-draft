import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense, use } from "react";
import { ChampionDataLoader } from "@/components/champions/ChampionDataLoader";
import { ComponentPreview } from "@/components/dev/ComponentPreview";

/** Development-only page to review shared components (404 in production). */
export default function DevPage({ params }: PageProps<"/[locale]/dev">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Common");
  return (
    <Suspense fallback={<p className="animate-pulse opacity-70">{t("loading")}</p>}>
      <ChampionDataLoader locale={locale}>
        <ComponentPreview />
      </ChampionDataLoader>
    </Suspense>
  );
}
