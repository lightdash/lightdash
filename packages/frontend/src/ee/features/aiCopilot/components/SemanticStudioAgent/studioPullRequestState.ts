import {
    pullRequestStateOf,
    type CiChecks,
    type SemanticStudioWorkspacePullRequestState,
} from '@lightdash/common';

export const resolveStudioPullRequestState = (
    stored: SemanticStudioWorkspacePullRequestState | null,
    checks: Pick<CiChecks, 'merged' | 'state'> | null,
): SemanticStudioWorkspacePullRequestState => {
    if (stored === 'merged' || stored === 'closed') {
        return checks?.merged ? 'merged' : stored;
    }
    return checks ? pullRequestStateOf(checks) : (stored ?? 'open');
};
