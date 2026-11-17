import { useTranslations } from "next-intl";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { ChampionDataLoader } from "@/components/champions/ChampionDataLoader";
import { TeamPage } from "@/components/team/TeamPage";

export async function generateMetadata({ params }: PageProps<"/[locale]/time">): Promise<Metadata> {
  const { locale } = await params;
  const [t, tm] = await Promise.all([
    getTranslations({ locale, namespace: "PageTitles" }),
    getTranslations({ locale, namespace: "Metadata" }),
  ]);
  return { title: `${t("team")} · ${tm("title")}` };
}

export default function Page({ params }: PageProps<"/[locale]/time">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Common");
  return (
    <Suspense fallback={<p className="animate-pulse opacity-70">{t("loading")}</p>}>
      <ChampionDataLoader locale={locale}>
        <TeamPage />
      </ChampionDataLoader>
    </Suspense>
  );
}
