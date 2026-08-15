import { ForbiddenError } from '@lightdash/common';

/**
 * Host-enforced denylist for paths a coding-agent commit may touch. This is the
 * commit-time counterpart to the read-side {@link isDeniedRepoPath} (repoFs):
 * the agent runs with no Bash and commits host-side via the GitHub/GitLab API,
 * so this is the single place we can hard-stop a malicious or mistaken change
 * before it reaches a pull request.
 *
 * Two classes, both denied for every coding-agent commit:
 * - SECRET paths (`.env*`, private keys, credential files) must never land in a
 *   PR (R6).
 * - CI/workflow paths (`.github/**`, `.gitlab-ci.yml`, `Jenkinsfile`,
 *   `.circleci/**`) can execute code in the customer's CI (R3). Trusted preview
 *   workflows are generated outside the coding agent by PreviewDeploySetupService.
 */

/** Secret/credential files — denied on every coding-agent commit. */
const SECRET_PATH_PATTERNS: RegExp[] = [
    // Dotfile envs AND `<name>.env` files: .env, .env.local, prod.env, app.env.local
    /(^|\/)[^/]*\.env(\.[^/]*)?$/i,
    /\.pem$/i,
    /\.key$/i,
    /\.p12$/i,
    /\.pfx$/i,
    /\.keystore$/i,
    /\.jks$/i,
    /(^|\/)id_rsa(\.pub)?$/i,
    /(^|\/)id_ed25519(\.pub)?$/i,
    /(^|\/)\.npmrc$/i,
    /(^|\/)\.pypirc$/i,
    /(^|\/)credentials(\.[^/]*)?$/i,
    /\.keyfile(\.json)?$/i,
];

/**
 * CI/workflow files — denied for every coding agent (RCE in customer CI). Every
 * single-file CI config matches both `.yml` and `.yaml` (`ya?ml`); a malicious
 * workflow under the alternate extension must not slip the gate (R3).
 */
const CI_PATH_PATTERNS: RegExp[] = [
    /(^|\/)\.github\/workflows\//i,
    /(^|\/)\.github\/actions\//i,
    /(^|\/)\.gitlab-ci\.ya?ml$/i,
    /(^|\/)Jenkinsfile(\.[^/]*)?$/i,
    /(^|\/)\.circleci\//i,
    /(^|\/)azure-pipelines\.ya?ml$/i,
    /(^|\/)bitbucket-pipelines\.ya?ml$/i,
];

const DENIED_PATH_PATTERNS = [...SECRET_PATH_PATTERNS, ...CI_PATH_PATTERNS];

/**
 * Thrown when a staged commit touches a denied path; no PR is opened. Extends
 * {@link ForbiddenError} so it flows through the project's error categorisation
 * (Sentry filtering, logging) — `editRepo`'s classifier checks `DeniedPathError`
 * before `ForbiddenError`, so it still maps to the `denied_path` card code.
 */
export class DeniedPathError extends ForbiddenError {
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
 */
export const findDeniedCommitPaths = (paths: string[]): string[] =>
    paths.filter((path) => {
        // The patterns anchor each name on `^` or `/`, so whitespace hugging a
        // path separator hides a name from them. Trim every segment, not just
        // the ends of the whole path — the agent writes into directories, so a
        // nested name is the common case, not the edge one.
        //
        // This only ever widens what matches. The patterns still require a dot
        // or a segment boundary, so ordinary files stay allowed:
        // `credentials-setup.md`, `environment.sql`, and directories with
        // interior spaces like `my docs/notes.md` are all untouched.
        const normalizedPath = path
            .split('/')
            .map((segment) => segment.trim())
            .join('/');
        return DENIED_PATH_PATTERNS.some((pattern) =>
            pattern.test(normalizedPath),
        );
    });
