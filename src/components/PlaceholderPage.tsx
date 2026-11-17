import { useTranslations } from "next-intl";

/** Temporary page body until each feature phase is implemented. */
export function PlaceholderPage({ namespace }: { namespace: "Team" | "Simulator" | "Analyze" }) {
  const t = useTranslations(namespace);
  const tp = useTranslations("Placeholder");
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">{t("title")}</h1>
      <p className="opacity-70">{tp("comingSoon")}</p>
    </section>
  );
}
