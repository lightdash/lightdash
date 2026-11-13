import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowBackUp,
    IconGitPullRequest,
    IconMessagePlus,
    IconLayoutSidebarRightCollapse,
    IconPlus,
} from '@tabler/icons-react';
import { uniqBy } from 'es-toolkit/compat';
import { useEffect, useEffectEvent, useRef, useState, type FC } from 'react';
import { Provider } from 'react-redux';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SidebarPosition } from '../../../../../components/common/Page/types';
import {
    isStudioChatRefDrag,
    readStudioChatRefDrop,
    type StudioChatRef,
} from '../../../../../features/semanticStudio/studioChatRefs';
import { STUDIO_STARTERS } from '../../../../../features/semanticStudio/studioStarters';
import { useKeepsSemanticLayerDraft } from '../../../../../features/semanticStudio/useSemanticLayerModel';
import useSidebarResize from '../../../../../hooks/useSidebarResize';
import { useAiAgentSqlModeAvailable } from '../../hooks/useAiAgentSqlModeAvailable';
import { usePendingThreadRefetch } from '../../hooks/usePendingThreadRefetch';
import {
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
    useCreateAgentThreadMutation,
} from '../../hooks/useProjectAiAgents';
import { store } from '../../store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../streaming/AiAgentThreadStreamAbortControllerContextProvider';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../ChatElements/AgentChatInput';
import { QuietCardsContext } from '../ChatElements/ToolCalls/quietCards';
import classes from './SemanticStudioAgent.module.css';
import { StudioChatEmptyState } from './StudioChatEmptyState';
import { StudioChatRefChips } from './StudioChatRefChips';
import { getOpenProposal } from './studioProposal';
import {
    useChatOpen,
    useStudioAgent,
    type StoredThread,
} from './useSemanticStudioChat';
import { useStudioPullRequest } from './useStudioPullRequest';

type OpenModel = { modelName: string | null; fieldName: string | null };

type Attached = {
    attached: StudioChatRef[];
    onDetach: (ref: StudioChatRef) => void;
    onAttachedSent: () => void;
};

type AskedPrompt = { prompt: string | null; onPromptTaken: () => void };

type Submitted = {
    message: string;
    context?: AiPromptContextInput;
    optimisticContext?: AiPromptContext;
};

const withOpenModel = (
    { modelName, fieldName }: OpenModel,
    attached: StudioChatRef[],
    { message, context, optimisticContext }: Submitted,
) => {
    const refs = [
        ...(modelName ? [{ modelName, fieldName }] : []),
        ...attached.map((ref) => ({
            modelName: ref.modelName,
            fieldName: ref.fieldName,
        })),
    ];
    const items = uniqBy(
        refs,
        (ref) => `${ref.modelName}:${ref.fieldName ?? ''}`,
    ).map((ref) => ({ type: 'semantic_model' as const, ...ref }));
    return {
        prompt: message,
        context: [...items, ...(context ?? [])],
        optimisticContext: [...items, ...(optimisticContext ?? [])],
    };
};

/** Whether a model or field is being dragged anywhere on the page. */
const useStudioChatRefDragging = () => {
    const [isDragging, setIsDragging] = useState(false);
    useEffect(() => {
        const onStart = (event: DragEvent) => {
            if (event.dataTransfer && isStudioChatRefDrag(event.dataTransfer))
                setIsDragging(true);
        };
        const onEnd = () => setIsDragging(false);
        window.addEventListener('dragstart', onStart);
        window.addEventListener('dragend', onEnd);
        window.addEventListener('drop', onEnd);
        return () => {
            window.removeEventListener('dragstart', onStart);
            window.removeEventListener('dragend', onEnd);
            window.removeEventListener('drop', onEnd);
        };
    }, []);
    return isDragging;
};

const PANEL_WIDTH = 360;
const PANEL_MIN_WIDTH = 300;

const useStartThread = (
    projectUuid: string,
    agent: AiAgentSummary,
    onCreated: (thread: StoredThread) => void,
    openModel: OpenModel,
    { attached, onAttachedSent }: Attached,
) => {
    const sqlMode = useAiAgentSqlModeAvailable(projectUuid);
    const { mutateAsync: createThread, isLoading } =
        useCreateAgentThreadMutation(projectUuid, {
            skipNavigation: true,
            onCreated: (thread) =>
                onCreated({
                    threadUuid: thread.uuid,
                    agentUuid: thread.agentUuid,
                }),
        });
    return {
        isLoading,
        start: (submitted: Submitted) => {
            void createThread({
                agentUuid: agent.uuid,
                createdFrom: 'semantic_studio',
                enableSqlMode: sqlMode,
                ...withOpenModel(openModel, attached, submitted),
            });
            onAttachedSent();
        },
    };
};

/** Sends a prompt asked for from outside the chat, once. */
const useAskedPrompt = (
    { prompt, onPromptTaken }: AskedPrompt,
    send: (message: string) => void,
) => {
    const take = useEffectEvent((asked: string) => {
        onPromptTaken();
        send(asked);
    });
    // Strict Mode mounts twice; the ref keeps that from sending twice.
    const taken = useRef(false);
    useEffect(() => {
        if (!prompt) {
            taken.current = false;
            return;
        }
        if (taken.current) return;
        taken.current = true;
        take(prompt);
    }, [prompt]);
};

const NewThread: FC<
    OpenModel &
        AskedPrompt &
        Attached & {
            projectUuid: string;
            agent: AiAgentSummary;
            onCreated: (thread: StoredThread) => void;
            showStarters: boolean;
        }
> = ({
    projectUuid,
    agent,
    onCreated,
    modelName,
    fieldName,
    prompt,
    onPromptTaken,
    showStarters,
    attached,
    onDetach,
    onAttachedSent,
}) => {
    const { start, isLoading } = useStartThread(
        projectUuid,
        agent,
        onCreated,
        { modelName, fieldName },
        { attached, onDetach, onAttachedSent },
    );
    useAskedPrompt({ prompt, onPromptTaken }, (message) => start({ message }));
    const keepsDraft = useKeepsSemanticLayerDraft(projectUuid);
    return (
        <>
            <StudioChatEmptyState keepsDraft={keepsDraft}>
                {showStarters ? (
                    <Group gap="xs" justify="center">
                        {STUDIO_STARTERS.map(({ label, prompt: starter }) => (
                            <Button
                                key={label}
                                size="xs"
                                variant="default"
                                disabled={isLoading}
                                onClick={() => start({ message: starter })}
                            >
                                {label}
                            </Button>
                        ))}
                    </Group>
                ) : null}
            </StudioChatEmptyState>
            <StudioChatRefChips refs={attached} onRemove={onDetach} />
            <AgentChatInput
                allowAttachments={false}
                accessCalloutVariant="inline"
                loading={isLoading}
                onSubmit={start}
                placeholder="What should I build or change?"
                projectUuid={projectUuid}
                agentUuid={agent.uuid}
                fullWidth
            />
        </>
    );
};

const ExistingThread: FC<
    OpenModel &
        AskedPrompt &
        Attached & {
            projectUuid: string;
            agent: AiAgentSummary;
            threadUuid: string;
        }
> = ({
    projectUuid,
    agent,
    threadUuid,
    modelName,
    fieldName,
    prompt,
    onPromptTaken,
    attached,
    onDetach,
    onAttachedSent,
}) => {
    const sqlMode = useAiAgentSqlModeAvailable(projectUuid);
    const {
        data: thread,
        isLoading,
        refetch,
    } = useAiAgentThread(projectUuid, agent.uuid, threadUuid);
    const { isStreaming, isThreadPending } = usePendingThreadRefetch(
        thread,
        threadUuid,
        refetch,
    );
    const { mutateAsync: sendMessage, isLoading: isSending } =
        useCreateAgentThreadMessageMutation(
            projectUuid,
            agent.uuid,
            threadUuid,
        );
    const send = (submitted: Submitted) => {
        void sendMessage({
            enableSqlMode: sqlMode,
            ...withOpenModel({ modelName, fieldName }, attached, submitted),
        });
        onAttachedSent();
    };
    useAskedPrompt({ prompt, onPromptTaken }, (message) => send({ message }));
    const keepsDraft = useKeepsSemanticLayerDraft(projectUuid);
    const pullRequest = useStudioPullRequest(projectUuid);
    // Unknown counts as open, so a slow or unavailable status check never offers a second pull request.
    const isClosed = !!pullRequest?.ciChecks && !pullRequest.isOpen;
    const isRequestingPullRequest = useRef(false);
    if (isLoading || !thread) {
        return (
            <Center flex={1}>
                <Loader size="sm" color="gray" />
            </Center>
        );
    }
    const isBusy = isSending || isStreaming || isThreadPending;
    return (
        <AgentChatDisplay
            thread={thread}
            agentName={agent.name}
            enableAutoScroll
            projectUuid={projectUuid}
            agentUuid={agent.uuid}
            renderArtifactsInline
        >
            {!keepsDraft &&
            !isBusy &&
            getOpenProposal(thread.messages).length > 0 ? (
                <div className={classes.pullRequestPrompt}>
                    <Stack className={classes.pullRequestCard} gap="sm">
                        <Group gap="sm" wrap="nowrap">
                            <span className={classes.pullRequestIcon}>
                                <MantineIcon
                                    icon={IconGitPullRequest}
                                    size={16}
                                />
                            </span>
                            <Stack gap={0} flex={1} miw={0}>
                                <Text fz="sm" fw={500}>
                                    {pullRequest && !isClosed
                                        ? 'Add this to your pull request?'
                                        : 'Happy with this change?'}
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    {!pullRequest
                                        ? 'You can try it once its pull request opens.'
                                        : isClosed
                                          ? 'Your last pull request is closed, so this opens a new one.'
                                          : 'Commits it to the same pull request.'}
                                </Text>
                            </Stack>
                        </Group>
                        <Button
                            size="xs"
                            fullWidth
                            onClick={() => {
                                if (isRequestingPullRequest.current) return;
                                isRequestingPullRequest.current = true;
                                void sendMessage({
                                    enableSqlMode: sqlMode,
                                    prompt: !pullRequest
                                        ? 'Open the pull request.'
                                        : isClosed
                                          ? 'Open a new pull request.'
                                          : 'Save this to the pull request.',
                                    // The pull request tools only join a turn that carries this hint.
                                    toolHints: ['editDbtProject'],
                                }).finally(() => {
                                    isRequestingPullRequest.current = false;
                                });
                            }}
                        >
                            {!pullRequest
                                ? 'Open pull request'
                                : isClosed
                                  ? 'Open new pull request'
                                  : 'Save to pull request'}
                        </Button>
                    </Stack>
                </div>
            ) : null}
            <StudioChatRefChips refs={attached} onRemove={onDetach} />
            <AgentChatInput
                allowAttachments={false}
                accessCalloutVariant="inline"
                loading={isBusy}
                onSubmit={send}
                placeholder="What should I build or change?"
                messageCount={thread.messages.length}
                projectUuid={projectUuid}
                agentUuid={agent.uuid}
                threadUuid={threadUuid}
                fullWidth
            />
        </AgentChatDisplay>
    );
};

type AgentProps = OpenModel &
    AskedPrompt &
    Attached & {
        projectUuid: string;
        showStarters: boolean;
        onAttach: (ref: StudioChatRef) => void;
    };

const SemanticStudioAgentPanel: FC<AgentProps> = ({
    projectUuid,
    modelName,
    fieldName,
    prompt,
    onPromptTaken,
    showStarters,
    attached,
    onAttach,
    onDetach,
    onAttachedSent,
}) => {
    const [isDropping, setIsDropping] = useState(false);
    const isDragging = useStudioChatRefDragging();
    const {
        isEnabled,
        agent,
        thread,
        setStored,
        startNewThread,
        previousThread,
        returnToPreviousThread,
    } = useStudioAgent(projectUuid);
    const [isOpen, setIsOpen] = useChatOpen();

    const { sidebarRef, sidebarWidth, isResizing, startResizing } =
        useSidebarResize({
            defaultWidth: PANEL_WIDTH,
            minWidth: PANEL_MIN_WIDTH,
            position: SidebarPosition.RIGHT,
        });

    if (!isEnabled || !agent) return null;
    if (!isOpen) return null;
    return (
        <QuietCardsContext.Provider value>
            <Box
                ref={sidebarRef}
                className={classes.panel}
                w={sidebarWidth}
                data-quiet-cards
                data-dragging={isDragging || undefined}
                data-dropping={isDropping || undefined}
                // Capture, so the editor inside never pastes the dragged name as text.
                onDragOverCapture={(event) => {
                    if (!isStudioChatRefDrag(event.dataTransfer)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = 'copy';
                    setIsDropping(true);
                }}
                onDragLeave={(event) => {
                    if (
                        !event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                        )
                    )
                        setIsDropping(false);
                }}
                onDropCapture={(event) => {
                    if (!isStudioChatRefDrag(event.dataTransfer)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    setIsDropping(false);
                    const ref = readStudioChatRefDrop(event.dataTransfer);
                    if (ref) onAttach(ref);
                }}
            >
                {isDragging || isDropping ? (
                    <div className={classes.dropHint}>
                        <MantineIcon icon={IconMessagePlus} size={20} />
                        Drop here to ask about it
                    </div>
                ) : null}
                <Box
                    className={classes.resizeHandle}
                    data-resizing={isResizing}
                    onMouseDown={(event) => {
                        // Without this the drag selects text across the page.
                        event.preventDefault();
                        startResizing();
                    }}
                />
                <Group className={classes.actions} gap={4} wrap="nowrap">
                    {previousThread ? (
                        <Tooltip label="Previous conversation">
                            <ActionIcon
                                aria-label="Previous conversation"
                                onClick={returnToPreviousThread}
                            >
                                <MantineIcon icon={IconArrowBackUp} />
                            </ActionIcon>
                        </Tooltip>
                    ) : null}
                    {thread ? (
                        <Tooltip label="New conversation">
                            <ActionIcon
                                aria-label="New conversation"
                                onClick={startNewThread}
                            >
                                <MantineIcon icon={IconPlus} />
                            </ActionIcon>
                        </Tooltip>
                    ) : null}
                    <Tooltip label="Hide chat">
                        <ActionIcon
                            aria-label="Hide chat"
                            onClick={() => setIsOpen(false)}
                        >
                            <MantineIcon
                                icon={IconLayoutSidebarRightCollapse}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <Box className={classes.body}>
                    {thread ? (
                        <ExistingThread
                            key={thread.threadUuid}
                            projectUuid={projectUuid}
                            agent={thread.agent}
                            threadUuid={thread.threadUuid}
                            modelName={modelName}
                            fieldName={fieldName}
                            prompt={prompt}
                            onPromptTaken={onPromptTaken}
                            attached={attached}
                            onDetach={onDetach}
                            onAttachedSent={onAttachedSent}
                        />
                    ) : (
                        <NewThread
                            projectUuid={projectUuid}
                            agent={agent}
                            onCreated={setStored}
                            showStarters={showStarters}
                            modelName={modelName}
                            fieldName={fieldName}
                            prompt={prompt}
                            onPromptTaken={onPromptTaken}
                            attached={attached}
                            onDetach={onDetach}
                            onAttachedSent={onAttachedSent}
                        />
                    )}
                </Box>
            </Box>
        </QuietCardsContext.Provider>
    );
};

/** The left sidebar of Semantic Studio: an agent that proposes model changes for the person to apply. */
export const SemanticStudioAgent: FC<AgentProps> = (props) => (
    <Provider store={store}>
        <AiAgentThreadStreamAbortControllerContextProvider>
            <SemanticStudioAgentPanel {...props} />
        </AiAgentThreadStreamAbortControllerContextProvider>
    </Provider>
);
