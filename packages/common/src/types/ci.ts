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
    /**
     * Whether the PR is already merged. Once merged the provider's
     * `mergeState` is no longer meaningful, so consumers show a terminal
     * "Merged" state and suppress the merge action.
     */
    merged: boolean;
    /**
     * Whether the PR is open or closed. A closed-but-not-merged PR is terminal
     * too, so the card shows "Closed" and offers neither merge nor close.
     */
    state: 'open' | 'closed';
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

/** Body for merging a write-back pull request from the chat PR card. */
export type MergePullRequestRequestBody = {
    /** The PR/MR URL of the write-back pull request to merge. */
    prUrl: string;
    /**
     * The commit the card is pinned to. When set the merge only proceeds if the
     * PR's head still points at this SHA, so a user never merges a commit they
     * haven't seen (a later turn may have pushed a newer head).
     */
    sha?: string;
};

/** Outcome of a pull request merge. */
export type MergePullRequestResult = {
    merged: boolean;
    /** The resulting merge commit SHA, when the provider returns one. */
    sha: string | null;
};

export type ApiMergePullRequestResponse = {
    status: 'ok';
    results: MergePullRequestResult;
};

/** Body for closing a write-back pull request from the chat PR card. */
export type ClosePullRequestRequestBody = {
    /** The PR/MR URL of the write-back pull request to close. */
    prUrl: string;
};

/** Outcome of closing a pull request. */
export type ClosePullRequestResult = {
    state: 'open' | 'closed';
};

export type ApiClosePullRequestResponse = {
    status: 'ok';
    results: ClosePullRequestResult;
};

/**
 * The raw unified diff of a write-back pull request (or a single pinned commit
 * within it), for the chat card's diff viewer. Null when it can't be resolved
 * (unsupported source control, no app installation, PR not found, diff too
 * large for the provider to return).
 */
export type ApiPullRequestDiffResponse = {
    status: 'ok';
    results: { diff: string } | null;
};
