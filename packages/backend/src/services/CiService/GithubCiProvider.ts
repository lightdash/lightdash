import {
    CiCheckState,
    CiMergeState,
    CiProviderType,
    type CiCheck,
} from '@lightdash/common';
// Type-only import: the concrete client fn is injected so it can be faked in
// tests without module mocking (mirrors WritebackPreviewService).
import type * as GithubClient from '../../clients/github/Github';
import type { CiProvider } from './CiProvider';

/** The slice of the GitHub client this adapter needs, injected for testability. */
export type GithubCiClient = Pick<typeof GithubClient, 'listCheckRunsForRef'>;

/** Map a GitHub Actions check run onto the provider-agnostic CI state. */
export const mapCheckRunToState = (
    run: GithubClient.GithubCheckRun,
): CiCheckState => {
    if (run.status !== 'completed') {
        return CiCheckState.PENDING;
    }
    switch (run.conclusion) {
        case 'success':
            return CiCheckState.SUCCESS;
        case 'failure':
        case 'timed_out':
            return CiCheckState.FAILURE;
        case 'cancelled':
            return CiCheckState.CANCELLED;
        case 'skipped':
            return CiCheckState.SKIPPED;
        // neutral, action_required, stale, or null (no conclusion recorded)
        default:
            return CiCheckState.NEUTRAL;
    }
};

/**
 * Map GitHub's `mergeable_state` onto the provider-agnostic merge verdict.
 * `mergeable_state` already reflects the repo's branch protection (required
 * checks + reviews), so `unstable` (failing non-required checks) stays
 * mergeable while `blocked` does not — which is exactly the distinction the
 * naive "any check failed → can't merge" heuristic gets wrong.
 */
export const mapGithubMergeState = (
    mergeableState: string,
    draft: boolean,
): CiMergeState => {
    if (draft) {
        return CiMergeState.DRAFT;
    }
    switch (mergeableState) {
        case 'clean':
        case 'has_hooks': // clean, just has pre-receive hooks — still mergeable
            return CiMergeState.READY;
        case 'unstable':
            return CiMergeState.UNSTABLE;
        case 'blocked':
            return CiMergeState.BLOCKED;
        case 'dirty':
            return CiMergeState.CONFLICTS;
        case 'behind':
            return CiMergeState.BEHIND;
        case 'draft':
            return CiMergeState.DRAFT;
        // 'unknown' (GitHub still computing) or anything unexpected
        default:
            return CiMergeState.UNKNOWN;
    }
};

export class GithubCiProvider implements CiProvider {
    readonly provider = CiProviderType.GITHUB;

    private readonly githubClient: GithubCiClient;

    constructor(deps: { githubClient: GithubCiClient }) {
        this.githubClient = deps.githubClient;
    }

    async getChecksForRef({
        owner,
        repo,
        ref,
        auth,
    }: {
        owner: string;
        repo: string;
        ref: string;
        auth: { installationId?: string; token?: string };
    }): Promise<CiCheck[]> {
        const runs = await this.githubClient.listCheckRunsForRef({
            owner,
            repo,
            ref,
            installationId: auth.installationId,
            token: auth.token,
        });
        // The same check name can appear multiple times on a ref (e.g. a
        // workflow that runs on both `push` and `pull_request`, or a re-run).
        // Mirror GitHub's own PR UI: keep only the most recently started run
        // per check name.
        const latestByName = new Map<string, GithubClient.GithubCheckRun>();
        for (const run of runs) {
            const existing = latestByName.get(run.name);
            if (
                !existing ||
                (run.startedAt ?? '') >= (existing.startedAt ?? '')
            ) {
                latestByName.set(run.name, run);
            }
        }
        return [...latestByName.values()].map((run) => ({
            name: run.name,
            state: mapCheckRunToState(run),
            url: run.htmlUrl,
        }));
    }
}
