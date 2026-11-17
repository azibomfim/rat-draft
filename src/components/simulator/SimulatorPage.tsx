"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { DraftView } from "./DraftView";
import { SimulatorSetup, type SimulatorConfig } from "./SimulatorSetup";

export function SimulatorPage() {
  const t = useTranslations("Simulator");
  const [config, setConfig] = useState<SimulatorConfig | null>(null);
  const [lastConfig, setLastConfig] = useState<SimulatorConfig | undefined>();
  const [run, setRun] = useState(0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="mb-2 text-2xl font-bold">{t("title")}</h1>
        <p className="max-w-3xl opacity-80">{t("intro")}</p>
      </header>
      {config ? (
        <DraftView
          key={run}
          config={config}
          onChangeSetup={() => {
            setLastConfig(config);
            setConfig(null);
          }}
        />
      ) : (
        <SimulatorSetup
          initial={lastConfig}
          onStart={(c) => {
            setConfig(c);
            setRun((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
