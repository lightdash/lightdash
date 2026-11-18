import {
    assertUnreachable,
    type SemanticStudioBranchCompile,
} from '@lightdash/common';
import { type FC } from 'react';
import {
    Task,
    type TaskState,
} from '../../../../../features/semanticStudio/TaskRow';
import { useDraftCheckout } from '../../../../../features/semanticStudio/useSemanticLayerModel';
import { useStudioWorkspaces } from '../../../../../features/semanticStudio/useStudioWorkspaces';
import { useStudioPullRequest } from './useStudioPullRequest';

const compileTask = (
    compile: SemanticStudioBranchCompile | null,
): { state: TaskState; label: string } => {
    if (!compile) return { state: 'todo', label: 'Compile' };
    switch (compile.status) {
        case 'compiling':
            return { state: 'running', label: 'Compiling' };
        case 'failed':
            return { state: 'failed', label: 'Compile failed' };
        case 'ready':
            return { state: 'done', label: 'Compiled' };
        default:
            return assertUnreachable(compile.status, 'Unknown compile status');
    }
};

/** The compile of the checked-out draft's latest save, while it runs or once it fails. */
export const DraftProgress: FC<{
    projectUuid: string;
    prUrl: string;
    commitSha: string | null;
}> = ({ projectUuid, prUrl, commitSha }) => {
    const pullRequest = useStudioPullRequest(projectUuid);
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const { data: checkout } = useDraftCheckout(projectUuid);
    const draft = workspaces?.mine.find(
        ({ pullRequest: pr }) => pr?.url === prUrl,
    );
    // Only the latest save of the draft you have checked out has a compile to follow.
    if (
        !draft ||
        !checkout ||
        checkout.workspaceUuid !== draft.workspaceUuid ||
        pullRequest?.prUrl !== prUrl ||
        pullRequest.commitSha !== commitSha
    ) {
        return null;
    }
    const compile = compileTask(checkout.branchCompile);
    // The card says it is saved and the toolbar says when it can be tried; only a compile under way or failed is news.
    return compile.state === 'running' || compile.state === 'failed' ? (
        <Task state={compile.state} label={compile.label} />
    ) : null;
};
