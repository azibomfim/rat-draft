import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { ChampionDataLoader } from "@/components/champions/ChampionDataLoader";
import { SimulatorPage } from "@/components/simulator/SimulatorPage";

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
