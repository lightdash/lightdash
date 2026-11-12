import {
    assertUnreachable,
    CiMergeState,
    type CiChecks,
} from '@lightdash/common';
import { ActionIcon, Button, Menu, Text, Tooltip } from '@mantine/core';
import { IconDots, IconExternalLink } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { DevelopmentBar } from '../../../../../features/semanticStudio/DevelopmentBar';
import {
    getDevelopmentPreview,
    useDevelopmentView,
} from '../../../../../features/semanticStudio/developmentView';
import { ChangesSwitch } from '../../../../../features/semanticStudio/SemanticLayerDraft';
import { useTryInExplore } from '../../../../../features/semanticStudio/useTryInExplore';
import { useProject } from '../../../../../hooks/useProject';
import { useClosePullRequest } from '../../hooks/useClosePullRequest';
import { useMergePullRequest } from '../../hooks/useMergePullRequest';
import {
    useElapsed,
    useWritebackProgress,
} from '../../hooks/useWritebackProgress';
import { isMergeable } from '../ChatElements/ToolCalls/pullRequestActions';
import { WRITEBACK_STEPS } from '../ChatElements/ToolCalls/writebackProgress';
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
            return 'Checking whether the pull request can be merged.';
        case CiMergeState.BLOCKED:
            return 'A required check failed or a review is missing.';
        case CiMergeState.CONFLICTS:
            return 'The pull request has conflicts to resolve first.';
        case CiMergeState.BEHIND:
            return 'The branch is behind its base and needs updating first.';
        case CiMergeState.DRAFT:
            return 'The pull request is still a draft.';
        default:
            return assertUnreachable(mergeState, 'Unknown merge state');
    }
};

/** What a dbt project's Studio conversation has saved so far: its pull request, a look at the result, and merging it. */
export const StudioDevelopmentBar: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
}> = ({ projectUuid, pullRequest }) => {
    const { prUrl, commitSha, changedModels, previewProjectUuid, ciChecks } =
        pullRequest;
    const { data: project } = useProject(projectUuid);
    const { mutate: merge, isLoading: isMerging } =
        useMergePullRequest(projectUuid);
    const { mutate: close, isLoading: isClosing } =
        useClosePullRequest(projectUuid);
    const [merging, setMerging] = useState(false);
    const [discarding, setDiscarding] = useState(false);
    const [isTrying, setIsTrying] = useDevelopmentView();
    const tryInExplore = useTryInExplore(projectUuid);
    const number = /\/(\d+)\/?$/.exec(prUrl)?.[1];
    const name = number ? `pull request #${number}` : 'the pull request';
    // The preview is the truer source once it is built, so a view switched on before then moves to it.
    useEffect(() => {
        if (
            isTrying &&
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
    const canMerge = isMergeable(ciChecks);
    const destination = `${name}${branch ? ` into ${branch}` : ''}`;
    return (
        <DevelopmentBar summary={null}>
            {/* Once on, the dock says so on every page and holds the way back. */}
            {isTrying ? null : (
                <ChangesSwitch
                    isOnMyChanges={false}
                    onChange={(next) => setIsTrying(next, previewProjectUuid)}
                />
            )}
            <Tooltip
                multiline
                w={240}
                label={
                    canMerge
                        ? `Merges ${destination}.`
                        : getBlockedReason(ciChecks)
                }
            >
                <Button
                    size="xs"
                    data-disabled={!canMerge || undefined}
                    aria-disabled={!canMerge}
                    onClick={() => {
                        if (canMerge) setMerging(true);
                    }}
                >
                    Merge
                </Button>
            </Tooltip>
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
                    {changedModels.length > 0 ? (
                        <Menu.Item
                            onClick={() =>
                                tryInExplore(
                                    changedModels[0],
                                    previewProjectUuid,
                                )
                            }
                        >
                            Try in Explore
                        </Menu.Item>
                    ) : null}
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
                    <Menu.Divider />
                    <Menu.Item color="red" onClick={() => setDiscarding(true)}>
                        Discard changes
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            {merging ? (
                <MantineModal
                    opened
                    title="Merge pull request"
                    description={`This merges ${destination}, and everyone sees the changes once the project compiles.`}
                    confirmLabel="Merge"
                    confirmLoading={isMerging}
                    onClose={() => setMerging(false)}
                    onConfirm={() =>
                        merge(
                            { prUrl, sha: commitSha },
                            { onSettled: () => setMerging(false) },
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
    const { step, state } = useWritebackProgress(
        projectUuid,
        change.aiWritebackRunUuid,
    );
    const elapsed = useElapsed(change.startedAt);
    const [isOnMyChanges, setIsOnMyChanges] = useDevelopmentView();
    return (
        <DevelopmentBar
            summary={
                <Text fz="xs" c="dimmed" truncate>
                    {state === 'running'
                        ? `${WRITEBACK_STEPS[step]}, step ${step + 1} of ${WRITEBACK_STEPS.length}`
                        : state === 'done'
                          ? 'Saved'
                          : 'The change stopped'}
                </Text>
            }
        >
            {/* An earlier save can still be tried, and left, while this one runs. */}
            <ChangesSwitch
                isOnMyChanges={isOnMyChanges}
                onChange={(next) =>
                    setIsOnMyChanges(
                        next,
                        pullRequest?.previewProjectUuid ?? null,
                    )
                }
                unavailableReason={
                    pullRequest
                        ? undefined
                        : 'Available when the pull request opens.'
                }
            />
            <Tooltip label="Usually takes 2 to 3 minutes. The pull request shows up here when it is ready.">
                <Text fz="xs" c="dimmed" ff="monospace">
                    {elapsed}
                </Text>
            </Tooltip>
        </DevelopmentBar>
    );
};
