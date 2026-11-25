import {
    ActionIcon,
    Button,
    Group,
    Loader,
    Menu,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconDots,
    IconExternalLink,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { Link } from 'react-router';
import { useGithubUserCredential } from '../../../../../components/common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { DevelopmentBar } from '../../../../../features/semanticStudio/DevelopmentBar';
import {
    getDevelopmentPreview,
    isDevelopmentViewPinned,
    useDevelopmentView,
} from '../../../../../features/semanticStudio/developmentView';
import {
    type StudioPendingChange,
    type StudioPullRequest,
} from '../../../../../features/semanticStudio/studioChange';
import { TryItButton } from '../../../../../features/semanticStudio/TryItButton';
import { getSemanticStudioUrl } from '../../../../../features/semanticStudio/urls';
import { useCompileCheckout } from '../../../../../features/semanticStudio/useSemanticLayerModel';
import { useTryItMenuItem } from '../../../../../features/semanticStudio/useTryIt';
import { useWritebackProgress } from '../../../../../features/writeback/useWritebackProgress';
import { useClosePullRequest } from '../../hooks/useClosePullRequest';
import { PublishDraftModal } from './PublishDraftModal';
import { useFinishDiscardedWork } from './useSemanticStudioChat';
import { onlyWritersCanPublish, useStudioPublish } from './useStudioPublish';

/** What a dbt project's Studio conversation has saved so far: its pull request, a look at the result, and publishing it. */
export const StudioDevelopmentBar: FC<{
    projectUuid: string;
    pullRequest: StudioPullRequest;
}> = ({ projectUuid, pullRequest }) => {
    const { prUrl, previewProjectUuid, ciChecks, isMine } = pullRequest;
    const {
        name,
        destination,
        compile,
        canWriteBranch,
        mergesHere,
        branch,
        step,
        isAgentWorking,
    } = useStudioPublish(projectUuid, prUrl, ciChecks);
    const compileAgain = useCompileCheckout(projectUuid);
    const { data: credential } = useGithubUserCredential();
    const { mutate: close, isLoading: isClosing } =
        useClosePullRequest(projectUuid);
    const [publishing, setPublishing] = useState(false);
    const [discarding, setDiscarding] = useState(false);
    const [isTrying, setIsTrying] = useDevelopmentView();
    const finishDiscardedWork = useFinishDiscardedWork(projectUuid);
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
    const canPublish = isMine && canWriteBranch && step.action === 'publish';
    const tryIt = useTryItMenuItem(projectUuid, pullRequest);
    return (
        <DevelopmentBar summary={null}>
            {tryIt.modal}
            {isMine && !canWriteBranch ? (
                <Tooltip
                    multiline
                    w={240}
                    label={
                        mergesHere
                            ? onlyWritersCanPublish(branch)
                            : 'Merge it in your repository to publish.'
                    }
                >
                    <Button
                        size="xs"
                        variant="default"
                        component="a"
                        href={prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Open pull request
                    </Button>
                </Tooltip>
            ) : isMine ? (
                <Tooltip
                    multiline
                    w={240}
                    label={step.hint}
                    events={{ hover: true, focus: true, touch: false }}
                >
                    <Button
                        size="xs"
                        variant={canPublish ? 'filled' : 'default'}
                        leftSection={
                            compile?.status === 'compiling' ||
                            isAgentWorking ? (
                                <Loader size={12} color="gray" />
                            ) : compile?.status === 'failed' ? (
                                <MantineIcon
                                    icon={IconAlertTriangle}
                                    size={14}
                                    color="yellow"
                                />
                            ) : null
                        }
                        loading={compileAgain.isLoading}
                        data-disabled={
                            (step.action === null && !isAgentWorking) ||
                            undefined
                        }
                        aria-disabled={step.action === null}
                        aria-busy={isAgentWorking}
                        onClick={() => {
                            if (step.action === 'compile')
                                compileAgain.mutate();
                            else if (step.action === 'publish')
                                setPublishing(true);
                        }}
                    >
                        {step.label}
                    </Button>
                </Tooltip>
            ) : null}
            <Menu position="bottom-end">
                <Menu.Target>
                    <ActionIcon
                        size="md"
                        aria-label="More actions"
                        variant="subtle"
                        color="gray"
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    {tryIt.item}
                    {previewProjectUuid ? (
                        <Menu.Item
                            component={Link}
                            to={getSemanticStudioUrl(previewProjectUuid, {
                                ref: null,
                            })}
                            target="_blank"
                            leftSection={
                                <MantineIcon icon={IconExternalLink} />
                            }
                        >
                            Open preview project
                        </Menu.Item>
                    ) : null}
                    {pullRequest.changedModels[0] ? (
                        <Menu.Item
                            component={Link}
                            to={`/projects/${projectUuid}/tables/${encodeURIComponent(pullRequest.changedModels[0])}`}
                        >
                            Open in Explore
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
                    {isMine &&
                    prUrl.startsWith('https://github.com/') &&
                    credential === null ? (
                        <Menu.Item
                            component={Link}
                            to="/generalSettings/profile"
                        >
                            Open pull requests as you
                        </Menu.Item>
                    ) : null}
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
                <PublishDraftModal
                    projectUuid={projectUuid}
                    prUrl={prUrl}
                    destination={destination}
                    onClose={() => setPublishing(false)}
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

/** A dbt change still being saved, in the toolbar: only that it is under way, since the chat shows its steps. */
export const StudioSavingBar: FC<{
    projectUuid: string;
    change: StudioPendingChange;
    /** The open pull request this save adds to; null when the save opens the first one. */
    pullRequest: StudioPullRequest | null;
}> = ({ projectUuid, change, pullRequest }) => {
    const { state } = useWritebackProgress(
        projectUuid,
        change.aiWritebackRunUuid,
    );
    return (
        <DevelopmentBar
            summary={
                <Group gap={6} wrap="nowrap" miw={0}>
                    {state === 'running' ? (
                        <Loader size={12} color="gray" />
                    ) : null}
                    <Text fz="xs" c="dimmed" truncate>
                        {state === 'running'
                            ? 'Saving'
                            : state === 'done'
                              ? 'Saved'
                              : 'The save stopped'}
                    </Text>
                </Group>
            }
        >
            {/* An earlier save can still be tried while this one runs. */}
            {pullRequest ? (
                <TryItButton
                    projectUuid={projectUuid}
                    pullRequest={pullRequest}
                />
            ) : null}
        </DevelopmentBar>
    );
};
