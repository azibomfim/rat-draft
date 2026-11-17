import { DataSourceError } from "./data/errors";

/** Shared CDN cache header for public, slow-changing data (6 h, matches the in-memory TTL). */
export const PUBLIC_DATA_CACHE = "public, s-maxage=21600, stale-while-revalidate=3600";

const STATUS: Record<DataSourceError["code"], number> = {
  not_found: 404,
  timeout: 504,
  network: 502,
  bad_response: 502,
  unavailable: 503,
};

/** Turns any thrown error into a typed JSON error the UI can translate. */
export function dataErrorResponse(err: unknown): Response {
  const e =
    err instanceof DataSourceError
      ? err
      : new DataSourceError("opgg", "bad_response", err instanceof Error ? err.message : String(err));
  return Response.json({ error: e.toJSON() }, { status: STATUS[e.code] });
}

export function badRequest(issues: unknown): Response {
  return Response.json({ error: { code: "invalid_request", issues } }, { status: 400 });
}
