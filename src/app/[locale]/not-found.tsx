import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <section className="py-12 text-center">
      <p className="mb-2 text-5xl font-bold opacity-30">404</p>
      <h1 className="mb-2 text-2xl font-bold">{t("title")}</h1>
      <p className="mb-6 opacity-80">{t("body")}</p>
      <Link href="/" className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background">
        {t("backHome")}
      </Link>
    </section>
  );
}
