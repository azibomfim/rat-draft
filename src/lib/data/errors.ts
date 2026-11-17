export type DataSource = "opgg" | "ddragon" | "ai";
export type DataErrorCode = "timeout" | "network" | "not_found" | "bad_response" | "unavailable";

/**
 * Typed error the UI can turn into a translated message
 * ("Não foi possível buscar X agora").
 */
export class DataSourceError extends Error {
  constructor(
    public readonly source: DataSource,
    public readonly code: DataErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DataSourceError";
  }

  toJSON() {
    return { source: this.source, code: this.code, message: this.message };
  }
}

export const DEFAULT_TIMEOUT_MS = 15_000;

/** Rejects with a DataSourceError("timeout") if the promise takes longer than `ms`. */
export async function withTimeout<T>(
  promise: Promise<T>,
  source: DataSource,
  ms: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DataSourceError(source, "timeout", `${source} timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
