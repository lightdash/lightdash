import {
    isPullRequestOpen,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { pullRequestNumberOf } from './urls';

/** Where a workspace's changes stand, from first proposed to live. */
export type StudioStage =
    | { step: 'proposed' }
    | { step: 'saving' }
    | { step: 'in_review'; pullRequestNumber: string | null }
    | { step: 'closed'; pullRequestNumber: string | null }
    | {
          step: 'live';
          /** How its update for everyone is going, when this tab merged it. */
          update: 'unknown' | 'running' | 'failed' | 'done';
      };

export const STUDIO_STEPS = [
    'Proposed',
    'Saved',
    'In review',
    'Published',
] as const;

/** Where a workspace stands by its own record; null while nothing has been sent. */
export const stageOfWorkspace = (
    workspace: SemanticStudioWorkspace | null,
): StudioStage | null => {
    const pullRequest = workspace?.pullRequest ?? null;
    if (isPullRequestOpen(pullRequest)) {
        return {
            step: 'in_review',
            pullRequestNumber: pullRequestNumberOf(pullRequest.url),
        };
    }
    if (
        workspace?.publishedLive ||
        workspace?.pullRequest?.state === 'merged'
    ) {
        return { step: 'live', update: 'done' };
    }
    if (workspace?.pullRequest?.state === 'closed') {
        return {
            step: 'closed',
            pullRequestNumber: pullRequestNumberOf(workspace.pullRequest.url),
        };
    }
    // Finished without a merge or a publish: it was discarded.
    if (workspace?.finishedAt) {
        return { step: 'closed', pullRequestNumber: null };
    }
    return null;
};
