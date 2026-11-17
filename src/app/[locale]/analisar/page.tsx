import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export default function Page({ params }: PageProps<"/[locale]/analisar">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <PlaceholderPage namespace="Analyze" />;
}
