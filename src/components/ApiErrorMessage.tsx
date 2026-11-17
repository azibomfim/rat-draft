"use client";

import { useTranslations } from "next-intl";
import type { ApiError } from "@/lib/use-api";

const KNOWN = new Set(["not_found", "timeout", "network", "bad_response", "unavailable", "invalid_request"]);

export function ApiErrorMessage({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const t = useTranslations("Errors");
  const code = KNOWN.has(error.code) ? error.code : "network";
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">
      <span>{t(code)}</span>
      {onRetry && code !== "not_found" && code !== "invalid_request" && (
        <button type="button" onClick={onRetry} className="underline">
          {t("retry")}
        </button>
      )}
    </div>
  );
}
