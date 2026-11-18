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
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { DevelopmentBar } from '../../../../../features/semanticStudio/DevelopmentBar';
import {
    getDevelopmentPreview,
    isDevelopmentViewPinned,
    useDevelopmentView,
} from '../../../../../features/semanticStudio/developmentView';
import { useCompileCheckout } from '../../../../../features/semanticStudio/useSemanticLayerModel';
import { useClosePullRequest } from '../../hooks/useClosePullRequest';
import {
    useElapsed,
    useWritebackProgress,
} from '../../hooks/useWritebackProgress';
import { WRITEBACK_STEPS } from '../ChatElements/ToolCalls/writebackProgress';
import { WritebackSegments } from '../ChatElements/ToolCalls/WritebackProgressCard';
import { PublishDraftModal } from './PublishDraftModal';
import { TryItButton } from './TryItButton';
import { useFinishDiscardedWork } from './useSemanticStudioChat';
import { useStudioPublish } from './useStudioPublish';
import {
    type StudioPendingChange,
    type StudioPullRequest,
} from './useStudioPullRequest';

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
        blocker: publishBlocker,
    } = useStudioPublish(projectUuid, prUrl, ciChecks);
    const compileAgain = useCompileCheckout(projectUuid);
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
    const isCompileFailed = compile?.status === 'failed';
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
                    label={
                        isCompileFailed
                            ? `${compile?.error ?? 'The latest compile failed.'} Click to compile again.`
                            : (publishBlocker ?? `Merges ${destination}.`)
                    }
                >
                    {/* Publish waits on the draft's compile, so the button says where that stands. */}
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={
                            compile?.status === 'compiling' ? (
                                <Loader size={12} color="gray" />
                            ) : isCompileFailed ? (
                                <MantineIcon
                                    icon={IconAlertTriangle}
                                    size={14}
                                    color="yellow"
                                />
                            ) : null
                        }
                        loading={compileAgain.isLoading}
                        data-disabled={
                            (!isCompileFailed && !!publishBlocker) || undefined
                        }
                        aria-disabled={!isCompileFailed && !!publishBlocker}
                        onClick={() => {
                            if (isCompileFailed) compileAgain.mutate();
                            else if (!publishBlocker) setPublishing(true);
                        }}
                    >
                        {compile?.status === 'compiling'
                            ? 'Compiling'
                            : isCompileFailed
                              ? 'Compile failed'
                              : 'Publish'}
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
