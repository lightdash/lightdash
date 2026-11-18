import {
    assertUnreachable,
    CiMergeState,
    type CiChecks,
} from '@lightdash/common';
import { canWriteProjectBranch } from '../../../../../features/semanticStudio/permissions';
import {
    describeBranchCompile,
    useDraftCheckout,
} from '../../../../../features/semanticStudio/useSemanticLayerModel';
import { useProject } from '../../../../../hooks/useProject';
import useApp from '../../../../../providers/App/useApp';
import { isMergeable } from '../ChatElements/ToolCalls/pullRequestActions';

/** Why an open pull request cannot be merged yet. */
const getBlockedReason = (ciChecks: CiChecks | null): string => {
    const mergeState = ciChecks?.mergeState;
    switch (mergeState) {
        case undefined:
        case CiMergeState.READY:
        case CiMergeState.UNSTABLE:
        case CiMergeState.UNKNOWN:
            return 'Checking whether the draft can be published.';
        case CiMergeState.BLOCKED:
            return 'A required check failed or a review is missing.';
        case CiMergeState.CONFLICTS:
            return 'The draft has conflicts to resolve first.';
        case CiMergeState.BEHIND:
            return 'The branch is behind its base and needs updating first.';
        case CiMergeState.DRAFT:
            return 'Mark the pull request ready for review first.';
        default:
            return assertUnreachable(mergeState, 'Unknown merge state');
    }
};

/** Where publishing a dbt draft's pull request merges it, and why it cannot yet. */
export const useStudioPublish = (
    projectUuid: string,
    prUrl: string,
    ciChecks: CiChecks | null,
) => {
    const { data: project } = useProject(projectUuid);
    const { user } = useApp();
    const { data: checkout } = useDraftCheckout(projectUuid);
    const number = /\/(\d+)\/?$/.exec(prUrl)?.[1];
    const name = number ? `pull request #${number}` : 'the pull request';
    const branch =
        project?.dbtConnection && 'branch' in project.dbtConnection
            ? project.dbtConnection.branch
            : null;
    const canWriteBranch =
        !!user.data?.organizationUuid &&
        canWriteProjectBranch(
            user.data.ability,
            user.data.organizationUuid,
            projectUuid,
        );
    const compile = checkout?.branchCompile ?? null;
    // Publishing merges straight into the branch, so it waits on the right to write there and on a passing compile.
    const blocker = !canWriteBranch
        ? `Only people who can write to ${branch ?? "the project's branch"} can publish. Open ${name} for review.`
        : compile?.status !== 'ready'
          ? ((compile && describeBranchCompile(compile)) ??
            'Publish once the latest edit compiles.')
          : isMergeable(ciChecks)
            ? null
            : getBlockedReason(ciChecks);
    return {
        name,
        destination: `${name}${branch ? ` into ${branch}` : ''}`,
        compile,
        blocker,
    };
};
