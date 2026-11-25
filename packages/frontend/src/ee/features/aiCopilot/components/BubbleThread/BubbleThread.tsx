import {
    type AiAgentMessageUser,
    type AiAgentUser,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import { ActionIcon, Box, Center, Group, Loader, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { createPath, useLocation, useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useApp from '../../../../../providers/App/useApp';
import { pillState } from '../../../capture/bubblePill';
import { BUBBLE_DRAG_ATTRIBUTE } from '../../../capture/bubblePointer';
import { readDesignPrompt } from '../../../capture/buildDesignPrompt';
import BubblePill from '../../../capture/components/BubblePill';
import { AgentContainerWidthContext } from '../../hooks/useAgentMaxWidth';
import { useDashboardPageContextCuration } from '../../hooks/useDashboardPageContextCuration';
import { usePendingThreadRefetch } from '../../hooks/usePendingThreadRefetch';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../ChatElements/AgentChatInput';
import { getPendingAskUser } from '../ChatElements/askUserQuestions';
import { contextItemsToContentMentionSuggestions } from '../ChatElements/contentMentions';
import classes from './BubbleThread.module.css';
import BubbleUserMessage from './BubbleUserMessage';
import { useBubbleThreadPost } from './useBubbleThreadPost';

// The chat inside lays itself out for this width, not the window's.
const BUBBLE_WIDTH_PX = 420;

// A message sent from a bubble shows as the marks and words the user gave it.
const userMessageIn =
    (color: string) =>
    (message: AiAgentMessageUser<AiAgentUser>): ReactNode | null => {
        const read = readDesignPrompt(message.message);
        if (!read) return null;
        return (
            <BubbleUserMessage
                color={color}
                marks={read.marks}
                words={[read.said.join(' '), read.typed]
                    .filter((part) => part !== '')
                    .join('\n\n')}
            />
        );
    };

/** What a minimised bubble's pill is told by its host. */
export type BubbleThreadPill = {
    /** The numbers of the bubble's marks, oldest first. */
    marks: number[];
    /** A message is on its way to the agent. */
    sending: boolean;
    /** The last message could not be sent. */
    failed: boolean;
    /** A reply was asked for and the bubble has not been open since. */
    unread: boolean;
    onExpand: () => void;
};

type Props = {
    projectUuid: string;
    agentUuid: string;
    threadId: string;
    /** This bubble is the one marks and the mic add to. */
    armed: boolean;
    /** Marks are being collected: here when armed, somewhere else when not. */
    replyCollecting: boolean;
    /** A reply with no marks was posted straight to the thread. */
    onReplied: () => void;
    /** Sends a reply together with what this bubble collected. */
    onSendReply: (
        prompt: string,
        context: AiPromptContextInput,
    ) => Promise<void>;
    /** Null when the host draws its own close button. */
    onClose: (() => void) | null;
    /** The colour of the bubble's marks. */
    color: string;
    /**
     * Minimised: a pill shows and the conversation stays alive out of sight,
     * so the agent's work still lands. Null when the conversation is open.
     */
    pill: BubbleThreadPill | null;
};

export const BubbleThread: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadId,
    armed,
    replyCollecting,
    onReplied,
    onSendReply,
    onClose,
    color,
    pill,
}) => {
    const { user } = useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const {
        agent,
        post,
        isPosting: isCreatingMessage,
    } = useBubbleThreadPost(projectUuid, agentUuid, threadId);
    const {
        data: thread,
        isLoading: isLoadingThread,
        refetch,
    } = useAiAgentThread(projectUuid, agentUuid, threadId);

    const { isStreaming, isThreadPending } = usePendingThreadRefetch(
        thread,
        threadId,
        refetch,
    );

    const threadContext = useMemo(
        () =>
            thread?.messages.flatMap((message) =>
                message.role === 'user' ? message.context : [],
            ) ?? [],
        [thread?.messages],
    );
    const { curateContext, recordSubmittedContext } =
        useDashboardPageContextCuration({
            previousContext: threadContext,
            projectUuid,
            threadId,
            boundDashboardUuid:
                thread?.binding?.type === 'dashboard'
                    ? thread.binding.dashboardUuid
                    : null,
        });
    const contentMentionItems = useMemo(
        () => contextItemsToContentMentionSuggestions(threadContext, 'thread'),
        [threadContext],
    );

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;
    const isBusy = Boolean(isCreatingMessage || isStreaming || isThreadPending);
    const isInputDisabled =
        thread?.createdFrom === 'slack' || !isThreadFromCurrentUser;
    const hasMarks = armed && replyCollecting;

    const postToThread = ({
        message,
        toolHints,
        context,
        optimisticContext,
    }: {
        message: string;
        toolHints: string[];
        context?: AiPromptContextInput;
        optimisticContext?: AiPromptContext;
    }) => {
        const curated = curateContext({ context, optimisticContext });

        return post({
            prompt: message,
            context: curated.context,
            optimisticContext: curated.optimisticContext,
            toolHints,
        }).then(() => {
            recordSubmittedContext(curated.context);
        });
    };

    const handleSubmit = (args: Parameters<typeof postToThread>[0]) =>
        hasMarks
            ? onSendReply(args.message, args.context ?? [])
            : postToThread(args).then(onReplied);

    const handleDashboardLinkClick = useCallback(
        (dashboardUrl: string) => {
            const currentUrl = createPath({
                pathname: location.pathname,
                search: location.search,
            });
            if (dashboardUrl !== currentUrl) {
                void navigate(dashboardUrl, { viewTransition: true });
            }
        },
        [location.pathname, location.search, navigate],
    );

    const agentName = agent?.name ?? 'AI';
    const renderUserMessage = useMemo(() => userMessageIn(color), [color]);

    const minimised = pill !== null;
    const isWorking =
        isBusy || isLoadingThread || !thread || (pill?.sending ?? false);
    // A reply that came while minimised is unread until the bubble is opened.
    const [cameWhileMinimised, setCameWhileMinimised] = useState(false);
    useEffect(() => {
        if (!minimised) setCameWhileMinimised(false);
        else if (isWorking) setCameWhileMinimised(true);
    }, [isWorking, minimised]);

    // Opened or picked as the place to reply: the reply box is ready to type in.
    const bodyRef = useRef<HTMLDivElement>(null);
    const isOpen = !minimised && Boolean(thread);
    useEffect(() => {
        if (!armed || !isOpen) return;
        bodyRef.current
            ?.querySelector<HTMLElement>(
                'textarea, [contenteditable="true"], input[type="text"]',
            )
            ?.focus({ preventScroll: true });
    }, [armed, isOpen]);

    return (
        <AgentContainerWidthContext.Provider value={BUBBLE_WIDTH_PX}>
            {pill && (
                <BubblePill
                    agent={{
                        name: agentName,
                        imageUrl: agent?.imageUrl ?? null,
                    }}
                    state={pillState({
                        failed: pill.failed,
                        working: isWorking,
                        asked:
                            getPendingAskUser(thread?.messages.at(-1)) !== null,
                        unread: pill.unread || cameWhileMinimised,
                    })}
                    marks={pill.marks}
                    color={color}
                    onExpand={pill.onExpand}
                />
            )}
            {/* Kept, out of sight, at its full size: its scroll and draft stay. */}
            <Box className={classes.keep} data-minimised={minimised}>
                <Box className={classes.thread}>
                    <Group
                        className={classes.header}
                        {...{ [BUBBLE_DRAG_ATTRIBUTE]: '' }}
                        gap="xs"
                        wrap="nowrap"
                        justify="space-between"
                    >
                        <Group
                            gap="xs"
                            wrap="nowrap"
                            className={classes.agentName}
                        >
                            <LightdashUserAvatar
                                size="sm"
                                name={agentName}
                                src={agent?.imageUrl}
                            />
                            <Text size="sm" fw={500} truncate>
                                {agentName}
                            </Text>
                        </Group>
                        {onClose && (
                            <ActionIcon
                                size="sm"
                                aria-label="Close"
                                onClick={onClose}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        )}
                    </Group>
                    {isLoadingThread || !thread ? (
                        <Center p="md">
                            <Loader size="sm" color="gray" />
                        </Center>
                    ) : (
                        <Box ref={bodyRef} className={classes.body}>
                            <AgentChatDisplay
                                thread={thread}
                                agentName={agentName}
                                height="auto"
                                enableAutoScroll
                                projectUuid={projectUuid}
                                agentUuid={agentUuid}
                                renderArtifactsInline
                                onDashboardLinkClick={handleDashboardLinkClick}
                                renderUserMessage={renderUserMessage}
                                onChoiceSelect={
                                    isInputDisabled || isBusy
                                        ? undefined
                                        : (choice) =>
                                              postToThread({
                                                  message: choice,
                                                  toolHints: [],
                                              })
                                }
                            >
                                <AgentChatInput
                                    accessCalloutVariant="inline"
                                    // Another bubble's text box may be in use.
                                    autoFocus={false}
                                    hideSuggestionsWhenScrolledUp={false}
                                    dense
                                    fullWidth
                                    disabled={isInputDisabled}
                                    disabledReason="This thread is read-only."
                                    loading={isBusy}
                                    onSubmit={handleSubmit}
                                    placeholder={`Reply to ${agentName}`}
                                    messageCount={thread.messages.length}
                                    projectUuid={projectUuid}
                                    agentUuid={agentUuid}
                                    threadUuid={threadId}
                                    contentMentionPriorityItems={
                                        contentMentionItems
                                    }
                                    // The question card's options would repeat as chips.
                                    showSuggestions={
                                        getPendingAskUser(
                                            thread.messages.at(-1),
                                        ) === null
                                    }
                                    latestAssistantMessageUuid={
                                        thread.messages.findLast(
                                            (m) => m.role === 'assistant',
                                        )?.uuid
                                    }
                                />
                            </AgentChatDisplay>
                        </Box>
                    )}
                </Box>
            </Box>
        </AgentContainerWidthContext.Provider>
    );
};
