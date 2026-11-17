import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { AnalyzePage } from "@/components/analyze/AnalyzePage";
import { ChampionDataLoader } from "@/components/champions/ChampionDataLoader";

export default function Page({ params }: PageProps<"/[locale]/analisar">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Common");
  return (
    <Suspense fallback={<p className="animate-pulse opacity-70">{t("loading")}</p>}>
      <ChampionDataLoader locale={locale}>
        <AnalyzePage />
      </ChampionDataLoader>
    </Suspense>
  );
}
