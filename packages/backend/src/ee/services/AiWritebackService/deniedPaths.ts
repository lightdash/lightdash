/**
 * Host-enforced denylist for paths a coding-agent commit may touch. This is the
 * commit-time counterpart to the read-side {@link isDeniedRepoPath} (repoFs):
 * the agent runs with no Bash and commits host-side via the GitHub/GitLab API,
 * so this is the single place we can hard-stop a malicious or mistaken change
 * before it reaches a pull request.
 *
 * Two classes:
 * - SECRET paths (`.env*`, private keys, credential files): denied for EVERY
 *   coding-agent commit (dbt writeback included) — secrets must never land in a
 *   PR (R6).
 * - CI/workflow paths (`.github/**`, `.gitlab-ci.yml`, `Jenkinsfile`,
 *   `.circleci/**`): denied for the GENERAL agent only (R3 — a malicious
 *   workflow file is RCE in the customer's CI). The dbt-writeback path legitimately
 *   adds `.github/workflows` when setting up Lightdash preview deploys, so CI
 *   denial is opt-in via `denyCiPaths`.
 */

/** Secret/credential files — denied on every coding-agent commit. */
const SECRET_PATH_PATTERNS: RegExp[] = [
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

/** CI/workflow files — denied for the general agent (RCE in customer CI). */
const CI_PATH_PATTERNS: RegExp[] = [
    /(^|\/)\.github\/workflows\//i,
    /(^|\/)\.github\/actions\//i,
    /(^|\/)\.gitlab-ci\.yml$/i,
    /(^|\/)Jenkinsfile$/i,
    /(^|\/)\.circleci\//i,
    /(^|\/)azure-pipelines\.yml$/i,
    /(^|\/)bitbucket-pipelines\.yml$/i,
];

/** Thrown when a staged commit touches a denied path; no PR is opened. */
export class DeniedPathError extends Error {
    /** The offending repo-relative paths. */
    readonly paths: string[];

    constructor(paths: string[]) {
        super(
            `Refused to open a pull request: the change touches files that may not be edited (CI/workflow or secret files): ${paths.join(
                ', ',
            )}`,
        );
        this.name = 'DeniedPathError';
        this.paths = paths;
    }
}

/**
 * Return the subset of `paths` that a coding-agent commit must not touch.
 * Secrets are always denied; CI/workflow paths are denied only when
 * `denyCiPaths` is set (the general agent).
 */
export const findDeniedCommitPaths = (
    paths: string[],
    { denyCiPaths }: { denyCiPaths: boolean },
): string[] => {
    const patterns = denyCiPaths
        ? [...SECRET_PATH_PATTERNS, ...CI_PATH_PATTERNS]
        : SECRET_PATH_PATTERNS;
    return paths.filter((path) => patterns.some((re) => re.test(path)));
};
