/**
 * Continuous-integration status for a pull request, abstracted across CI
 * providers. GitHub Actions is the first (and currently only) adapter, but the
 * vocabulary here is deliberately host-agnostic so GitLab pipelines, Buildkite,
 * etc. can be added behind the same interface without changing consumers.
 */

export enum CiProviderType {
    GITHUB = 'github',
}

/**
 * Provider-agnostic outcome of a single CI check. Each host's native states are
 * mapped onto these by its adapter (e.g. GitHub's `queued`/`in_progress` →
 * `pending`; `timed_out` → `failure`).
 */
export enum CiCheckState {
    SUCCESS = 'success',
    FAILURE = 'failure',
    /** Queued or running — not yet concluded. */
    PENDING = 'pending',
    CANCELLED = 'cancelled',
    SKIPPED = 'skipped',
    /** Concluded without a pass/fail signal (e.g. manual/neutral checks). */
    NEUTRAL = 'neutral',
}

/** A single CI check (one GitHub Actions job/check run, or equivalent). */
export type CiCheck = {
    name: string;
    state: CiCheckState;
    /** Link to the run on the provider, when available. */
    url: string | null;
};

/**
 * Whether the PR may actually be merged, per the repo's own policy (branch
 * protection: required checks + required reviews). This is distinct from the
 * CI roll-up: a check can fail yet the PR still be mergeable when that check
 * isn't *required* — so the merge verdict must come from the provider, never
 * be inferred from check states. Maps GitHub's `mergeable_state`.
 */
export enum CiMergeState {
    /** All requirements met — safe to merge. */
    READY = 'ready',
    /** Mergeable, but some non-required checks are failing or still running. */
    UNSTABLE = 'unstable',
    /** Blocked by the repo policy — a required check failed or a review is missing. */
    BLOCKED = 'blocked',
    /** Merge conflicts must be resolved first. */
    CONFLICTS = 'conflicts',
    /** The branch is behind its base and must be updated first. */
    BEHIND = 'behind',
    /** The PR is still a draft. */
    DRAFT = 'draft',
    /** The provider hasn't finished computing mergeability yet. */
    UNKNOWN = 'unknown',
}

/**
 * The CI checks for a pull request, plus a single rolled-up state for an
 * at-a-glance summary. `checks` is empty when the ref has no CI configured.
 */
export type CiChecks = {
    provider: CiProviderType;
    /** CI-only rollup of the check states. Drives the summary bar. */
    overall: CiCheckState;
    /**
     * Whether the PR can actually be merged per the repo's policy — resolved
     * from the provider, NOT inferred from `overall`. Drives the merge-
     * readiness verdict so a failing-but-not-required check doesn't read as
     * "blocked".
     */
    mergeState: CiMergeState;
    checks: CiCheck[];
};

/**
 * CI checks for a PR, or null when CI status can't be resolved (project isn't
 * connected to a supported provider, no app installation, PR not found, etc.) —
 * distinct from a resolved result with an empty `checks` array ("no CI runs").
 */
export type ApiCiChecksResponse = {
    status: 'ok';
    results: CiChecks | null;
};
