/**
 * Provider-agnostic helpers shared by every {@link RepoSource} implementation
 * (GitHub, GitLab, …): the secret-path denylist and the latency-timing event
 * shape. Kept out of any one provider file so a new source can reuse them
 * without importing a sibling provider.
 */

/**
 * Paths that must never be exposed through the read-only shell. Removing the
 * `subPath` confinement (so the whole repo is readable for an explicit
 * `exploreRepo` target) widens the blast radius to secrets that previously lived
 * outside the dbt subdirectory, so deny common credential/secret files at the
 * source layer — they're filtered from listings and read back as absent.
 */
const DENIED_PATH_PATTERNS: RegExp[] = [
    /(^|\/)\.env(\..*)?$/i, // .env, .env.local, .env.production, ...
    /\.pem$/i,
    /\.key$/i,
    /\.p12$/i,
    /\.pfx$/i,
    /(^|\/)id_rsa(\.pub)?$/i,
    /(^|\/)id_ed25519(\.pub)?$/i,
    /(^|\/)\.npmrc$/i,
    /(^|\/)\.pypirc$/i,
    /(^|\/)credentials$/i,
    /\.keyfile(\.json)?$/i,
];

export const isDeniedRepoPath = (path: string): boolean =>
    DENIED_PATH_PATTERNS.some((re) => re.test(path));

/**
 * Latency signal for each backing repo-host call, so a caller (e.g. the agent
 * service) can record metrics without coupling this layer to Prometheus.
 */
export type RepoFsTimingEvent =
    | { kind: 'tree'; durationMs: number }
    | {
          kind: 'file';
          durationMs: number;
          outcome: 'found' | 'missing' | 'error';
      }
    | { kind: 'search'; durationMs: number };

export type RepoFsTimingCallback = (event: RepoFsTimingEvent) => void;
