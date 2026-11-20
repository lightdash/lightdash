import {
    type CiChecks,
    type SemanticStudioWorkspacePullRequestState,
} from '@lightdash/common';

export const resolveStudioPullRequestState = (
    stored: SemanticStudioWorkspacePullRequestState | null,
    checks: Pick<CiChecks, 'merged' | 'state'> | null,
): SemanticStudioWorkspacePullRequestState => {
    if (stored === 'merged' || checks?.merged) return 'merged';
    if (stored === 'closed') return 'closed';
    return checks?.state ?? stored ?? 'open';
};
