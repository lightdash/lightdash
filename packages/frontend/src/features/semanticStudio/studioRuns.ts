import {
    assertUnreachable,
    CiCheckState,
    CiMergeState,
    type CiChecks,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { isMergeable } from '../../ee/features/aiCopilot/components/ChatElements/ToolCalls/pullRequestActions';
import { WRITEBACK_STEPS } from '../../ee/features/aiCopilot/components/ChatElements/ToolCalls/writebackProgress';
import { pullRequestNumberOf } from './urls';

/** Where one of your workspaces stands right now. */
export type StudioRun =
    | { kind: 'saving'; step: number }
    | { kind: 'ready'; pullRequestNumber: string | null }
    | { kind: 'failing'; pullRequestNumber: string | null; reason: string }
    | {
          kind: 'in_review';
          pullRequestNumber: string | null;
          checks: 'running' | 'passed' | null;
      }
    | { kind: 'draft' };

/** A workspace that has not landed or been dropped yet. */
export const isInFlight = (workspace: SemanticStudioWorkspace): boolean =>
    !workspace.finishedAt &&
    workspace.pullRequest?.state !== 'merged' &&
    workspace.pullRequest?.state !== 'closed';

export const toStudioRun = (
    workspace: SemanticStudioWorkspace,
    {
        savingStep,
        ciChecks,
    }: { savingStep: number | null; ciChecks: CiChecks | null },
): StudioRun => {
    if (savingStep !== null) return { kind: 'saving', step: savingStep };
    if (!workspace.pullRequest) return { kind: 'draft' };
    const pullRequestNumber = pullRequestNumberOf(workspace.pullRequest.url);
    if (isMergeable(ciChecks)) return { kind: 'ready', pullRequestNumber };
    if (ciChecks?.mergeState === CiMergeState.CONFLICTS) {
        return { kind: 'failing', pullRequestNumber, reason: 'Has conflicts' };
    }
    if (ciChecks?.overall === CiCheckState.FAILURE) {
        return { kind: 'failing', pullRequestNumber, reason: 'Checks failed' };
    }
    return {
        kind: 'in_review',
        pullRequestNumber,
        checks: !ciChecks
            ? null
            : ciChecks.overall === CiCheckState.PENDING
              ? 'running'
              : 'passed',
    };
};

export const needsYou = (run: StudioRun): boolean =>
    run.kind === 'ready' || run.kind === 'failing';

/** How far along the way to live, out of 100, for the ring. */
export const studioRunProgress = (run: StudioRun): number => {
    switch (run.kind) {
        case 'draft':
            return 20;
        case 'saving':
            return 20 + (50 * run.step) / WRITEBACK_STEPS.length;
        case 'in_review':
        case 'failing':
            return 70;
        case 'ready':
            return 90;
        default:
            return assertUnreachable(run, 'Unknown run');
    }
};
