import {
    assertUnreachable,
    CiMergeState,
    type CiChecks,
} from '@lightdash/common';
import { ActionIcon, Anchor, Button, Menu, Text, Tooltip } from '@mantine/core';
import { IconDots, IconExternalLink } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { DevelopmentBar } from '../../../../../features/semanticStudio/DevelopmentBar';
import { useDevelopmentView } from '../../../../../features/semanticStudio/developmentView';
import { PreviewToggle } from '../../../../../features/semanticStudio/SemanticLayerDraft';
import { useProject } from '../../../../../hooks/useProject';
import { useClosePullRequest } from '../../hooks/useClosePullRequest';
import { useMergePullRequest } from '../../hooks/useMergePullRequest';
import { isMergeable } from '../ChatElements/ToolCalls/pullRequestActions';
import { type StudioPullRequest } from './useStudioPullRequest';

/** Why an open pull request cannot be published yet. */
const getBlockedReason = (ciChecks: CiChecks | null): string => {
    if (!ciChecks) return 'Checking whether the pull request can be merged.';
    switch (ciChecks.mergeState) {
        case CiMergeState.READY:
        case CiMergeState.UNSTABLE:
            return '';
        case CiMergeState.BLOCKED:
            return 'A required check failed or a review is missing.';
        case CiMergeState.CONFLICTS:
            return 'The pull request has conflicts to resolve first.';
        case CiMergeState.BEHIND:
            return 'The branch is behind its base and needs updating first.';
        case CiMergeState.DRAFT:
            return 'The pull request is still a draft.';
        case CiMergeState.UNKNOWN:
            return 'Checking whether the pull request can be merged.';
        default:
            return assertUnreachable(
                ciChecks.mergeState,
                'Unknown merge state',
            );
    }
};

const summarizeModels = (models: string[]) =>
    models.length <= 2
        ? models.join(', ')
        : `${models.slice(0, 2).join(', ')} and ${models.length - 2} more`;

/** What a dbt project's Studio conversation has saved so far: its pull request, a look at the result, and publishing it. */
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
    const [armed, setArmed] = useState(false);
    const [discarding, setDiscarding] = useState(false);
    const [isTrying, setIsTrying] = useDevelopmentView();
    const number = /\/(\d+)\/?$/.exec(prUrl)?.[1];
    const name = number ? `pull request #${number}` : 'the pull request';
    const branch =
        project?.dbtConnection && 'branch' in project.dbtConnection
            ? project.dbtConnection.branch
            : null;
    const canPublish = isMergeable(ciChecks);
    const canTry = !!previewProjectUuid || pullRequest.isOpen;
    return (
        <DevelopmentBar
            summary={
                <Text fz="xs" c="dimmed" truncate>
                    {changedModels.length > 0
                        ? `${summarizeModels(changedModels)} in `
                        : null}
                    <Anchor
                        href={prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        fz="xs"
                        c="dimmed"
                        underline="always"
                    >
                        {name}
                    </Anchor>
                </Text>
            }
        >
            {canTry ? (
                <PreviewToggle
                    isPreviewing={isTrying}
                    onChange={(next) => setIsTrying(next, previewProjectUuid)}
                />
            ) : null}
            <Tooltip
                multiline
                w={240}
                label={
                    canPublish
                        ? `Merges ${name}${branch ? ` into ${branch}` : ''}.`
                        : getBlockedReason(ciChecks)
                }
            >
                <Button
                    size="xs"
                    loading={isMerging}
                    data-disabled={!canPublish || undefined}
                    onBlur={() => setArmed(false)}
                    onClick={() => {
                        if (!canPublish) return;
                        if (armed) merge({ prUrl, sha: commitSha });
                        else setArmed(true);
                    }}
                >
                    {armed ? 'Confirm publish' : 'Publish'}
                </Button>
            </Tooltip>
            <Menu position="bottom-end" withinPortal>
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
                    <Menu.Divider />
                    <Menu.Item color="red" onClick={() => setDiscarding(true)}>
                        Discard all changes
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            {discarding ? (
                <MantineModal
                    opened
                    variant="delete"
                    title="Discard all changes"
                    description={`This closes ${name} without merging it. Nothing live changes.`}
                    confirmLabel="Discard"
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
