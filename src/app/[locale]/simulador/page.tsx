import { useTranslations } from "next-intl";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { ChampionDataLoader } from "@/components/champions/ChampionDataLoader";
import { SimulatorPage } from "@/components/simulator/SimulatorPage";

export async function generateMetadata({ params }: PageProps<"/[locale]/simulador">): Promise<Metadata> {
  const { locale } = await params;
  const [t, tm] = await Promise.all([
    getTranslations({ locale, namespace: "PageTitles" }),
    getTranslations({ locale, namespace: "Metadata" }),
  ]);
  return { title: `${t("simulator")} · ${tm("title")}` };
}

export default function Page({ params }: PageProps<"/[locale]/simulador">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Common");
  return (
    <Suspense fallback={<p className="animate-pulse opacity-70">{t("loading")}</p>}>
      <ChampionDataLoader locale={locale}>
        <SimulatorPage />
      </ChampionDataLoader>
    </Suspense>
  );
}
