/** Team summary for the Team page: combined pool per role + alerts (seção 8.1). */
import { ROLES, type PlayerChampion, type PlayerProfile, type Role } from "./data/types";

export const TEAM_SUMMARY = {
  /** A champion counts as "comfortable" from this comfort score on. */
  COMFORT_MIN: 45,
  /** Fewer comfortable champions than this → shallow pool. */
  SHALLOW_POOL_BELOW: 3,
  /** Top champion share of the player's pool games for a one-trick… */
  ONE_TRICK_SHARE: 0.6,
  /** …with at least this many games on it. */
  ONE_TRICK_MIN_GAMES: 15,
} as const;

export interface TeamMember {
  key: string;
  role: Role | null;
  profile: PlayerProfile | null;
}

export type TeamAlert =
  | { code: "missing_role"; role: Role }
  | { code: "duplicate_role"; role: Role }
  | { code: "shallow_pool"; role: Role; playerKey: string; count: number }
  | { code: "one_trick"; role: Role; playerKey: string; championId: string; share: number };

export interface TeamSummary {
  poolByRole: Record<Role, { playerKey: string; champions: PlayerChampion[] }[]>;
  alerts: TeamAlert[];
}

/** Player's champions that fit a role (champions with unknown role are kept). */
export function poolForRole(profile: PlayerProfile, role: Role): PlayerChampion[] {
  return profile.champions.filter((c) => !c.role || c.role === role);
}

export function summarizeTeam(members: TeamMember[]): TeamSummary {
  const poolByRole = Object.fromEntries(ROLES.map((r) => [r, []])) as unknown as TeamSummary["poolByRole"];
  const alerts: TeamAlert[] = [];

  for (const role of ROLES) {
    const inRole = members.filter((m) => m.role === role);
    if (inRole.length === 0) alerts.push({ code: "missing_role", role });
    if (inRole.length > 1) alerts.push({ code: "duplicate_role", role });

    for (const m of inRole) {
      if (!m.profile) continue;
      const pool = poolForRole(m.profile, role);
      const comfortable = pool.filter((c) => c.comfort >= TEAM_SUMMARY.COMFORT_MIN);
      poolByRole[role].push({ playerKey: m.key, champions: comfortable });

      if (comfortable.length < TEAM_SUMMARY.SHALLOW_POOL_BELOW) {
        alerts.push({ code: "shallow_pool", role, playerKey: m.key, count: comfortable.length });
      }

      const total = m.profile.champions.reduce((s, c) => s + c.games, 0);
      const top = [...m.profile.champions].sort((a, b) => b.games - a.games)[0];
      if (top && total > 0) {
        const share = top.games / total;
        if (share >= TEAM_SUMMARY.ONE_TRICK_SHARE && top.games >= TEAM_SUMMARY.ONE_TRICK_MIN_GAMES) {
          alerts.push({ code: "one_trick", role, playerKey: m.key, championId: top.championId, share });
        }
      }
    }
  }
  return { poolByRole, alerts };
}

/**
 * Picks the default role for each player: first main role not yet taken, then
 * the free roles in order. Players without a profile (fetch failed) get none.
 */
export function assignDefaultRoles(profiles: (PlayerProfile | null)[]): (Role | null)[] {
  const taken = new Set<Role>();
  const result: (Role | null)[] = profiles.map((p) => {
    const role = p?.mainRoles.find((r) => !taken.has(r)) ?? null;
    if (role) taken.add(role);
    return role;
  });
  return result.map((r, i) => {
    if (r || !profiles[i]) return r;
    const free = ROLES.find((x) => !taken.has(x)) ?? null;
    if (free) taken.add(free);
    return free;
  });
}
