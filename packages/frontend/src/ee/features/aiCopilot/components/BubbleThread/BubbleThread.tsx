import {
    type AiAgentMessageUser,
    type AiAgentUser,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Loader,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconMicrophone,
    IconPencil,
    IconPointer,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useMemo, type FC, type ReactNode } from 'react';
import { createPath, useLocation, useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useApp from '../../../../../providers/App/useApp';
import { BUBBLE_DRAG_ATTRIBUTE } from '../../../capture/bubblePointer';
import { readDesignPrompt } from '../../../capture/buildDesignPrompt';
import { type BubbleInput } from '../../../capture/designSession';
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
const renderUserMessage = (
    message: AiAgentMessageUser<AiAgentUser>,
): ReactNode | null => {
    const read = readDesignPrompt(message.message);
    if (!read) return null;
    return (
        <BubbleUserMessage
            marks={read.marks}
            words={[read.said.join(' '), read.typed]
                .filter((part) => part !== '')
                .join('\n\n')}
        />
    );
};

// Stylus and Cursor are held keys: their buttons only make this bubble the target.
const REPLY_TOOLS: {
    label: string;
    hint: string;
    icon: typeof IconPencil;
    input: BubbleInput;
}[] = [
    {
        label: 'Stylus',
        hint: 'Stylus: hold ⌥ and draw',
        icon: IconPencil,
        input: 'text',
    },
    {
        label: 'Cursor',
        hint: 'Cursor: hold ⌃ and click',
        icon: IconPointer,
        input: 'text',
    },
    {
        label: 'Mic',
        hint: 'Mic: talk while you mark',
        icon: IconMicrophone,
        input: 'mic',
    },
];

type Props = {
    projectUuid: string;
    agentUuid: string;
    threadId: string;
    /** This bubble is the one Stylus, Cursor and Mic add to. */
    armed: boolean;
    onArm: (input: BubbleInput) => void;
    /** Marks or speech are being collected: here when armed, somewhere else when not. */
    replyCollecting: boolean;
    /** Sends a reply together with what this bubble collected. */
    onSendReply: (
        prompt: string,
        context: AiPromptContextInput,
    ) => Promise<void>;
    /** Null when the host draws its own close button. */
    onClose: (() => void) | null;
};

export const BubbleThread: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadId,
    armed,
    onArm,
    replyCollecting,
    onSendReply,
    onClose,
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
    const otherTargetActive = !armed && replyCollecting;

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
            : postToThread(args);

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

    return (
        <AgentContainerWidthContext.Provider value={BUBBLE_WIDTH_PX}>
            <Box className={classes.thread}>
                <Group
                    className={classes.header}
                    {...{ [BUBBLE_DRAG_ATTRIBUTE]: '' }}
                    gap="xs"
                    wrap="nowrap"
                    justify="space-between"
                >
                    <Group gap="xs" wrap="nowrap" className={classes.agentName}>
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
                    <Box className={classes.body}>
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
                                toolbarStart={
                                    <Group gap={2} wrap="nowrap">
                                        {REPLY_TOOLS.map((tool) => (
                                            <Tooltip
                                                key={tool.label}
                                                label={tool.hint}
                                                withinPortal={false}
                                            >
                                                <ActionIcon
                                                    size="sm"
                                                    aria-label={tool.label}
                                                    variant={
                                                        armed
                                                            ? 'light'
                                                            : 'subtle'
                                                    }
                                                    disabled={
                                                        otherTargetActive ||
                                                        isInputDisabled
                                                    }
                                                    onClick={() =>
                                                        onArm(tool.input)
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={tool.icon}
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        ))}
                                    </Group>
                                }
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
        </AgentContainerWidthContext.Provider>
    );
};
