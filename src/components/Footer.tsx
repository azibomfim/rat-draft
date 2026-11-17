import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("Footer");
  return (
    <footer className="border-t border-black/10 px-4 py-4 text-center text-xs opacity-70 dark:border-white/10">
      {t("disclaimer")}
    </footer>
  );
}
