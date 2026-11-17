import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { NavLinks } from "./NavLinks";

const NAV_ITEMS = [
  { href: "/", key: "home" },
  { href: "/time", key: "team" },
  { href: "/simulador", key: "simulator" },
  { href: "/analisar", key: "analyze" },
] as const;

export function Header() {
  const t = useTranslations("Nav");

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <NavLinks items={NAV_ITEMS.map((i) => ({ href: i.href, label: t(i.key) }))} />
        <LocaleSwitcher label={t("language")} />
      </div>
    </header>
  );
}
