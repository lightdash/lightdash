import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
    friendlyName,
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
    IconMessagePlus,
    IconLayoutSidebarRightCollapse,
    IconPlus,
} from '@tabler/icons-react';
import { uniqBy } from 'es-toolkit/compat';
import {
    memo,
    useEffect,
    useEffectEvent,
    useRef,
    useState,
    type FC,
} from 'react';
import { Provider } from 'react-redux';
import { Link, useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { SidebarPosition } from '../../../../../components/common/Page/types';
import {
    withStudioChatCode,
    isStudioChatRefDrag,
    readStudioChatRefDrop,
    type StudioChatRef,
} from '../../../../../features/semanticStudio/studioChatRefs';
import { STUDIO_STARTERS } from '../../../../../features/semanticStudio/studioStarters';
import {
    useKeepsSemanticLayerDraft,
    useSemanticLayerDraft,
} from '../../../../../features/semanticStudio/useSemanticLayerModel';
import useSidebarResize from '../../../../../hooks/useSidebarResize';
import { useAiAgentSqlModeAvailable } from '../../hooks/useAiAgentSqlModeAvailable';
import { usePendingThreadRefetch } from '../../hooks/usePendingThreadRefetch';
import {
    useCreateAgentThreadMessageMutation,
    useCreateAgentThreadMutation,
} from '../../hooks/useProjectAiAgents';
import { store } from '../../store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../streaming/AiAgentThreadStreamAbortControllerContextProvider';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../ChatElements/AgentChatInput';
import {
    QuietCardsContext,
    StudioAskContext,
} from '../ChatElements/ToolCalls/quietCards';
import { usePendingPrompt } from '../PendingPromptContext/PendingPromptContext';
import { getClosedChange, type ClosedChange } from './closedChange';
import classes from './SemanticStudioAgent.module.css';
import { StudioChatEmptyState } from './StudioChatEmptyState';
import { StudioChatRefChips } from './StudioChatRefChips';
import {
    useChatOpen,
    useCompileFollowUp,
    useStudioAgent,
    useStudioThread,
    type StoredThread,
} from './useSemanticStudioChat';

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
        ...attached
            .filter(({ code }) => code === null)
            .map((ref) => ({
                modelName: ref.modelName,
                fieldName: ref.fieldName,
            })),
    ];
    const items = uniqBy(
        refs,
        (ref) => `${ref.modelName}:${ref.fieldName ?? ''}`,
    ).map((ref) => ({ type: 'semantic_model' as const, ...ref }));
    const code = attached.flatMap((ref) => (ref.code ? [ref.code] : []));
    return {
        prompt: withStudioChatCode(message, code),
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
                // Studio runs the agent's SQL without asking for approval.
                autoApproveSql: true,
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
            {showStarters ? (
                // The page beside the chat already explains the empty layer, so the chat keeps only the starters.
                <Stack flex={1} justify="flex-end" px="md" pb="sm">
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
                </Stack>
            ) : (
                <StudioChatEmptyState keepsDraft={keepsDraft} />
            )}
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

/** Where the composer was once a change is out: the chat is done, and the next request starts a new one. */
/** What to do with a change once it is live: ask about it or open it in Explore. */
const ChangeClosed: FC<{
    projectUuid: string;
    closed: ClosedChange;
    onStartNew: () => void;
}> = ({ projectUuid, closed, onStartNew }) => {
    const navigate = useNavigate();
    const { setPendingPrompt } = usePendingPrompt();
    const isLive = closed.pullRequestUrl === null;
    const names = closed.models.map(friendlyName);
    return (
        <Stack gap="xs" p="md">
            <Text fz="sm" c="dimmed">
                {isLive
                    ? 'Published. Try it where people ask questions.'
                    : 'Sent for review.'}
            </Text>
            <Group gap="xs">
                {isLive && names.length > 0 ? (
                    <>
                        <Button
                            size="xs"
                            onClick={() => {
                                setPendingPrompt(
                                    `What can I learn from ${names.join(' and ')}?`,
                                );
                                void navigate(
                                    `/projects/${projectUuid}/ai-agents`,
                                );
                            }}
                        >
                            Ask a question
                        </Button>
                        {closed.models.slice(0, 2).map((model, index) => (
                            <Button
                                key={model}
                                size="xs"
                                variant="default"
                                component={Link}
                                to={`/projects/${projectUuid}/tables/${model}`}
                            >
                                Explore {names[index]}
                            </Button>
                        ))}
                    </>
                ) : null}
                <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={onStartNew}
                >
                    Start a new chat
                </Button>
            </Group>
        </Stack>
    );
};

const ExistingThread: FC<
    OpenModel &
        AskedPrompt &
        Attached & {
            projectUuid: string;
            agent: AiAgentSummary;
            threadUuid: string;
            onStartNew: () => void;
        }
> = ({
    projectUuid,
    agent,
    threadUuid,
    onStartNew,
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
    } = useStudioThread(projectUuid, agent.uuid, threadUuid);
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
            autoApproveSql: true,
            ...withOpenModel({ modelName, fieldName }, attached, submitted),
        });
        onAttachedSent();
    };
    useAskedPrompt({ prompt, onPromptTaken }, (message) => send({ message }));
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    useCompileFollowUp({
        projectUuid,
        agentUuid: agent.uuid,
        threadUuid,
        isBusy: isLoading || isSending || isStreaming || isThreadPending,
        enableSqlMode: sqlMode,
    });
    // The composer stays put while the conversation loads, so opening one never blanks the panel.
    if (isLoading || !thread) {
        return (
            <>
                <Center flex={1}>
                    <Loader size="sm" color="gray" />
                </Center>
                <StudioChatRefChips refs={attached} onRemove={onDetach} />
                <AgentChatInput
                    allowAttachments={false}
                    accessCalloutVariant="inline"
                    loading
                    onSubmit={send}
                    placeholder="What should I build or change?"
                    projectUuid={projectUuid}
                    agentUuid={agent.uuid}
                    threadUuid={threadUuid}
                    fullWidth
                />
            </>
        );
    }
    const isBusy = isSending || isStreaming || isThreadPending;
    const closed = isBusy ? null : getClosedChange(thread, draft);
    return (
        <StudioAskContext.Provider
            value={isBusy ? null : (message) => send({ message })}
        >
            <AgentChatDisplay
                thread={thread}
                agentName={agent.name}
                enableAutoScroll
                projectUuid={projectUuid}
                agentUuid={agent.uuid}
                renderArtifactsInline
                onChoiceSelect={
                    isBusy ? undefined : (message) => send({ message })
                }
            >
                {thread.messages.length === 0 && !isBusy ? (
                    <Text fz="xs" c="dimmed" ta="center" px="md" pb="xs">
                        You edited this draft by hand. Ask for more here, or
                        publish it when it is ready.
                    </Text>
                ) : null}
                {closed ? (
                    <ChangeClosed
                        projectUuid={projectUuid}
                        closed={closed}
                        onStartNew={onStartNew}
                    />
                ) : (
                    <>
                        <StudioChatRefChips
                            refs={attached}
                            onRemove={onDetach}
                        />
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
                    </>
                )}
            </AgentChatDisplay>
        </StudioAskContext.Provider>
    );
};

type AgentProps = OpenModel &
    AskedPrompt &
    Attached & {
        projectUuid: string;
        showStarters: boolean;
        onAttach: (ref: StudioChatRef) => void;
    };

// The panel renders on every move of its resize handle; the thread only when what it is given changes.
const ExistingThreadMemo = memo(ExistingThread);
const NewThreadMemo = memo(NewThread);

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
        isLoadingAgents,
        setStored,
        startNewThread,
        previousThread,
        returnToPreviousThread,
    } = useStudioAgent(projectUuid);
    const [isOpen, setIsOpen] = useChatOpen(projectUuid);

    const { sidebarRef, sidebarWidth, isResizing, startResizing } =
        useSidebarResize({
            defaultWidth: PANEL_WIDTH,
            minWidth: PANEL_MIN_WIDTH,
            position: SidebarPosition.RIGHT,
        });

    if (!isEnabled) return null;
    if (!agent) {
        return isLoadingAgents ? (
            <Box className={classes.panel} p="md">
                <Loader size="sm" />
            </Box>
        ) : null;
    }
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
                        <ExistingThreadMemo
                            key={thread.threadUuid}
                            projectUuid={projectUuid}
                            agent={thread.agent}
                            threadUuid={thread.threadUuid}
                            onStartNew={startNewThread}
                            modelName={modelName}
                            fieldName={fieldName}
                            prompt={prompt}
                            onPromptTaken={onPromptTaken}
                            attached={attached}
                            onDetach={onDetach}
                            onAttachedSent={onAttachedSent}
                        />
                    ) : (
                        <NewThreadMemo
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
