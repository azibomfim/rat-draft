import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Home");

  return (
    <section>
      <h1 className="mb-2 text-3xl font-bold">{t("title")}</h1>
      <p className="max-w-2xl opacity-80">{t("subtitle")}</p>
    </section>
  );
}
