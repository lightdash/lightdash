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

const getBlockedLabel = (ciChecks: CiChecks | null): string => {
    const mergeState = ciChecks?.mergeState;
    switch (mergeState) {
        case undefined:
        case CiMergeState.READY:
        case CiMergeState.UNSTABLE:
        case CiMergeState.UNKNOWN:
            return 'Checking';
        case CiMergeState.BLOCKED:
            return 'Blocked';
        case CiMergeState.CONFLICTS:
            return 'Has conflicts';
        case CiMergeState.BEHIND:
            return 'Behind base';
        case CiMergeState.DRAFT:
            return 'Not ready for review';
        default:
            return assertUnreachable(mergeState, 'Unknown merge state');
    }
};

/** The step a draft is on towards being published, as its button: compile, then checks, then publish. */
export type PublishStep = {
    label: string;
    hint: string;
    /** What a click does; null while there is nothing to do but wait or fix it elsewhere. */
    action: 'compile' | 'publish' | null;
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
    const destination = `${name}${branch ? ` into ${branch}` : ''}`;
    const step = ((): PublishStep => {
        if (!compile) {
            return {
                label: 'Compile',
                hint: 'Not compiled yet.',
                action: 'compile',
            };
        }
        if (compile.status === 'compiling') {
            return {
                label: 'Compiling',
                hint:
                    describeBranchCompile(compile) ??
                    'Publish once the latest edit compiles.',
                action: null,
            };
        }
        if (compile.status === 'failed') {
            return {
                label: 'Compile failed',
                hint: `${compile.error ?? 'The latest compile failed.'} Click to compile again.`,
                action: 'compile',
            };
        }
        if (!isMergeable(ciChecks)) {
            return {
                label: getBlockedLabel(ciChecks),
                hint: getBlockedReason(ciChecks),
                action: null,
            };
        }
        return {
            label: 'Publish',
            hint: `Merges ${destination}.`,
            action: 'publish',
        };
    })();
    return {
        name,
        destination,
        compile,
        blocker,
        canWriteBranch,
        branch,
        step,
    };
};
