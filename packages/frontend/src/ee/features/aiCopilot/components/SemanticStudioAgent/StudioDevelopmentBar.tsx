import {
    assertUnreachable,
    CiMergeState,
    type CiChecks,
} from '@lightdash/common';
import { ActionIcon, Button, Group, Menu, Text, Tooltip } from '@mantine/core';
import { IconDots, IconExternalLink } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { DevelopmentBar } from '../../../../../features/semanticStudio/DevelopmentBar';
import {
    getDevelopmentPreview,
    isDevelopmentViewPinned,
    useDevelopmentView,
} from '../../../../../features/semanticStudio/developmentView';
import { canWriteProjectBranch } from '../../../../../features/semanticStudio/permissions';
import { rememberGoingLive } from '../../../../../features/semanticStudio/useGoingLive';
import {
    describeBranchCompile,
    useDraftCheckout,
} from '../../../../../features/semanticStudio/useSemanticLayerModel';
import { usePublishCheckout } from '../../../../../features/semanticStudio/useStudioWorkspaces';
import { useProject } from '../../../../../hooks/useProject';
import useApp from '../../../../../providers/App/useApp';
import { useClosePullRequest } from '../../hooks/useClosePullRequest';
import {
    useElapsed,
    useWritebackProgress,
} from '../../hooks/useWritebackProgress';
import { isMergeable } from '../ChatElements/ToolCalls/pullRequestActions';
import { WRITEBACK_STEPS } from '../ChatElements/ToolCalls/writebackProgress';
import { WritebackSegments } from '../ChatElements/ToolCalls/WritebackProgressCard';
import { TryItButton } from './TryItButton';
import { useFinishDiscardedWork } from './useSemanticStudioChat';
import {
    type StudioPendingChange,
    type StudioPullRequest,
} from './useStudioPullRequest';

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

/** What a dbt project's Studio conversation has saved so far: its pull request, a look at the result, and publishing it. */
export const StudioDevelopmentBar: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
}> = ({ projectUuid, pullRequest }) => {
    const { prUrl, previewProjectUuid, ciChecks, isMine } = pullRequest;
    const { data: project } = useProject(projectUuid);
    const queryClient = useQueryClient();
    const { user } = useApp();
    const { data: checkout } = useDraftCheckout(projectUuid);
    const { mutate: publish, isLoading: isPublishing } =
        usePublishCheckout(projectUuid);
    const { mutate: close, isLoading: isClosing } =
        useClosePullRequest(projectUuid);
    const [publishing, setPublishing] = useState(false);
    const [discarding, setDiscarding] = useState(false);
    const [isTrying, setIsTrying] = useDevelopmentView();
    const finishDiscardedWork = useFinishDiscardedWork(projectUuid);
    const number = /\/(\d+)\/?$/.exec(prUrl)?.[1];
    const name = number ? `pull request #${number}` : 'the pull request';
    // The preview is the truer source once it is built, so a view switched on before then moves to it.
    useEffect(() => {
        if (
            isTrying &&
            !isDevelopmentViewPinned() &&
            previewProjectUuid &&
            getDevelopmentPreview() !== previewProjectUuid
        ) {
            setIsTrying(true, previewProjectUuid);
        }
    }, [isTrying, previewProjectUuid, setIsTrying]);
    const branch =
        project?.dbtConnection && 'branch' in project.dbtConnection
            ? project.dbtConnection.branch
            : null;
    const destination = `${name}${branch ? ` into ${branch}` : ''}`;
    const canWriteBranch =
        !!user.data?.organizationUuid &&
        canWriteProjectBranch(
            user.data.ability,
            user.data.organizationUuid,
            projectUuid,
        );
    const compile = checkout?.branchCompile ?? null;
    // Publishing merges straight into the branch, so it waits on the right to write there and on a passing compile.
    const publishBlocker = !canWriteBranch
        ? `Only people who can write to ${branch ?? "the project's branch"} can publish. Open ${name} for review.`
        : compile?.status !== 'ready'
          ? ((compile && describeBranchCompile(compile)) ??
            'Publish once the latest edit compiles.')
          : isMergeable(ciChecks)
            ? null
            : getBlockedReason(ciChecks);
    return (
        <DevelopmentBar summary={null}>
            <TryItButton
                projectUuid={projectUuid}
                pullRequest={pullRequest}
                look="primary"
            />
            {isMine ? (
                <Tooltip
                    multiline
                    w={240}
                    label={publishBlocker ?? `Merges ${destination}.`}
                >
                    <Button
                        size="xs"
                        variant="default"
                        data-disabled={!!publishBlocker || undefined}
                        aria-disabled={!!publishBlocker}
                        onClick={() => {
                            if (!publishBlocker) setPublishing(true);
                        }}
                    >
                        Publish
                    </Button>
                </Tooltip>
            ) : null}
            <Menu position="bottom-end">
                <Menu.Target>
                    <ActionIcon
                        size="md"
                        aria-label="More actions"
                        variant="default"
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    {previewProjectUuid ? (
                        <Menu.Item
                            component={Link}
                            to={`/projects/${previewProjectUuid}/semantic-layer`}
                            target="_blank"
                            leftSection={
                                <MantineIcon icon={IconExternalLink} />
                            }
                        >
                            Open preview project
                        </Menu.Item>
                    ) : null}
                    <Menu.Item
                        component="a"
                        href={prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        leftSection={<MantineIcon icon={IconExternalLink} />}
                    >
                        Open {name}
                    </Menu.Item>
                    {isMine ? (
                        <>
                            <Menu.Divider />
                            <Menu.Item
                                color="red"
                                onClick={() => setDiscarding(true)}
                            >
                                Discard changes
                            </Menu.Item>
                        </>
                    ) : null}
                </Menu.Dropdown>
            </Menu>
            {publishing ? (
                <MantineModal
                    opened
                    title="Publish draft"
                    description={`This merges ${destination}, and everyone sees the changes once the project compiles.`}
                    confirmLabel="Publish"
                    confirmLoading={isPublishing}
                    onClose={() => setPublishing(false)}
                    onConfirm={() =>
                        publish(
                            { prUrl },
                            {
                                // A failed publish keeps the dialog, under the toast that says why.
                                onSuccess: ({ compileJobUuid }) => {
                                    setPublishing(false);
                                    rememberGoingLive(
                                        queryClient,
                                        projectUuid,
                                        prUrl,
                                        compileJobUuid,
                                    );
                                },
                            },
                        )
                    }
                />
            ) : null}
            {discarding ? (
                <MantineModal
                    opened
                    variant="delete"
                    title="Discard changes"
                    description={`This closes ${name} without merging it, so these changes never go live. The pull request can be reopened from the repository.`}
                    confirmLabel="Discard changes"
                    confirmLoading={isClosing}
                    onClose={() => setDiscarding(false)}
                    onConfirm={() =>
                        close(
                            { prUrl },
                            {
                                onSuccess: () => {
                                    setDiscarding(false);
                                    setIsTrying(false, null);
                                    // Discarded work leaves the list and stays as history.
                                    finishDiscardedWork();
                                },
                            },
                        )
                    }
                />
            ) : null}
        </DevelopmentBar>
    );
};

/** A dbt change still running in the background, in the toolbar: the step it is on and how long it has been. */
export const StudioSavingBar: FC<{
    projectUuid: string;
    change: StudioPendingChange;
    /** The open pull request this save adds to; null when the save opens the first one. */
    pullRequest: StudioPullRequest | null;
}> = ({ projectUuid, change, pullRequest }) => {
    const progress = useWritebackProgress(
        projectUuid,
        change.aiWritebackRunUuid,
    );
    const { step, state } = progress;
    const elapsed = useElapsed(change.startedAt);
    return (
        <DevelopmentBar
            summary={
                <Group gap="xs" wrap="nowrap" miw={0}>
                    <WritebackSegments progress={progress} size="sm" />
                    <Text fz="xs" c="dimmed" truncate>
                        {state === 'running'
                            ? `${WRITEBACK_STEPS[step]}, step ${step + 1} of ${WRITEBACK_STEPS.length}`
                            : state === 'done'
                              ? 'Saved'
                              : 'The change stopped'}
                    </Text>
                </Group>
            }
        >
            {/* An earlier save can still be tried while this one runs. */}
            {pullRequest ? (
                <TryItButton
                    projectUuid={projectUuid}
                    pullRequest={pullRequest}
                    look="primary"
                />
            ) : null}
            <Tooltip label="Usually takes 2 to 3 minutes. The draft shows up here once it is saved.">
                <Text fz="xs" c="dimmed" ff="monospace">
                    {elapsed}
                </Text>
            </Tooltip>
        </DevelopmentBar>
    );
};
