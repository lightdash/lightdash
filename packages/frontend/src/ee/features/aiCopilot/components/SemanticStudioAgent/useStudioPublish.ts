import { CiMergeState, DbtProjectType, type CiChecks } from '@lightdash/common';
import { canWriteProjectBranch } from '../../../../../features/semanticStudio/permissions';
import { HAS_CONFLICTS } from '../../../../../features/semanticStudio/studioRuns';
import { pullRequestNumberOf } from '../../../../../features/semanticStudio/urls';
import { describeBranchCompile } from '../../../../../features/semanticStudio/useSemanticLayerModel';
import { useCheckoutCompile } from '../../../../../features/semanticStudio/useStudioCheckout';
import { isMergeable } from '../../../../../features/writeback/pullRequestActions';
import { useProject } from '../../../../../hooks/useProject';
import useApp from '../../../../../providers/App/useApp';

const CHECKING = {
    label: 'Checking',
    reason: 'Checking whether the draft can be published.',
};

/** Why an open pull request cannot be merged yet, short and in full. */
const BLOCKED: Record<CiMergeState, { label: string; reason: string }> = {
    [CiMergeState.READY]: CHECKING,
    [CiMergeState.UNSTABLE]: CHECKING,
    [CiMergeState.UNKNOWN]: CHECKING,
    [CiMergeState.BLOCKED]: {
        label: 'Blocked',
        reason: 'A required check failed or a review is missing.',
    },
    [CiMergeState.CONFLICTS]: {
        label: HAS_CONFLICTS,
        reason: 'The draft has conflicts to resolve first.',
    },
    [CiMergeState.BEHIND]: {
        label: 'Behind base',
        reason: 'The branch is behind its base and needs updating first.',
    },
    [CiMergeState.DRAFT]: {
        label: 'Not ready for review',
        reason: 'Mark the pull request ready for review first.',
    },
};

const blockedOf = (ciChecks: CiChecks | null) =>
    BLOCKED[ciChecks?.mergeState ?? CiMergeState.UNKNOWN];

export const onlyWritersCanPublish = (branch: string | null) =>
    `Only people who can write to ${branch ?? "the project's branch"} can publish.`;

/** The step a draft is on towards being published, as its button: compile, then checks, then publish. */
type PublishStep = {
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
    const number = pullRequestNumberOf(prUrl);
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
    const compile = useCheckoutCompile(projectUuid, prUrl);
    // Checks are read, and pull requests merged, on GitHub only.
    const mergesHere = project?.dbtConnection.type === DbtProjectType.GITHUB;
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
                hint: describeBranchCompile(compile) ?? '',
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
                label: blockedOf(ciChecks).label,
                hint: blockedOf(ciChecks).reason,
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
        canWriteBranch: canWriteBranch && mergesHere,
        mergesHere,
        branch,
        step,
    };
};
