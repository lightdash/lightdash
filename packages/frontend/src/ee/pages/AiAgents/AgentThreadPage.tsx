import {
    Alert,
    Button,
    Center,
    Group,
    Loader,
    Stack,
    Text,
} from '@mantine-8/core';
import {
    IconCircleCheck,
    IconGitPullRequest,
    IconRefresh,
} from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';
import { useOutletContext, useParams, useSearchParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import useApp from '../../../providers/App/useApp';
import { AgentChatDisplay } from '../../features/aiCopilot/components/ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import {
    contextItemsToContentMentionSuggestions,
    mergeContentMentionSuggestionItems,
} from '../../features/aiCopilot/components/ChatElements/contentMentions';
import {
    useAiAgentAdminReviewItem,
    useUpdateAiAgentReviewItemStatus,
} from '../../features/aiCopilot/hooks/useAiAgentAdmin';
import { useAiAgentPermission } from '../../features/aiCopilot/hooks/useAiAgentPermission';
import { useAiAgentSqlModeAvailable } from '../../features/aiCopilot/hooks/useAiAgentSqlModeAvailable';
import { useAiAgentThreadArtifact } from '../../features/aiCopilot/hooks/useAiAgentThreadArtifact';
import { useModelOptions } from '../../features/aiCopilot/hooks/useModelOptions';
import { usePendingThreadRefetch } from '../../features/aiCopilot/hooks/usePendingThreadRefetch';
import { usePinnedContext } from '../../features/aiCopilot/hooks/usePinnedContext';
import {
    useProjectAiAgent as useAiAgent,
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import {
    selectThreadSqlMode,
    setThreadSqlMode,
} from '../../features/aiCopilot/store/aiAgentThreadModeSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../features/aiCopilot/store/hooks';
import { type AiAgentToolResult } from '../../features/aiCopilot/types';
import { getDashboardNavigationUrlFromContentToolResult } from '../../features/aiCopilot/utils/contentToolResultNavigation';
import { type AgentContext } from './AgentPage';

const AiAgentThreadPage = ({ debug }: { debug?: boolean }) => {
    const { agentUuid, threadUuid, projectUuid, promptUuid } = useParams();
    const [searchParams] = useSearchParams();
    const reviewFingerprint = searchParams.get('reviewItem');
    const { user } = useApp();

    const {
        data: thread,
        isLoading: isLoadingThread,
        refetch,
    } = useAiAgentThread(projectUuid!, agentUuid, threadUuid);

    // Handle artifact selection based on thread changes
    useAiAgentThreadArtifact({
        projectUuid,
        agentUuid,
        threadUuid,
        thread,
    });

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;

    const agentQuery = useAiAgent(projectUuid!, agentUuid!);
    const { agent, navigateFromAgentChat } = useOutletContext<AgentContext>();

    const canManage = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const handleToolResult = useCallback(
        (toolResult: AiAgentToolResult) => {
            if (!projectUuid) return;

            const dashboardUrl = getDashboardNavigationUrlFromContentToolResult(
                projectUuid,
                toolResult,
            );
            if (!dashboardUrl) return;

            navigateFromAgentChat(dashboardUrl, {
                threadUuid,
                title: thread?.title || thread?.firstMessage?.message,
            });
        },
        [
            navigateFromAgentChat,
            projectUuid,
            thread?.firstMessage?.message,
            thread?.title,
            threadUuid,
        ],
    );

    const handleDashboardLinkClick = useCallback(
        (dashboardUrl: string) => {
            navigateFromAgentChat(dashboardUrl, {
                threadUuid,
                title: thread?.title || thread?.firstMessage?.message,
            });
        },
        [
            navigateFromAgentChat,
            thread?.firstMessage?.message,
            thread?.title,
            threadUuid,
        ],
    );

    const {
        mutateAsync: createAgentThreadMessage,
        isLoading: isCreatingMessage,
    } = useCreateAgentThreadMessageMutation(
        projectUuid!,
        agentUuid,
        threadUuid,
        {
            onToolResult: handleToolResult,
        },
    );

    const { isStreaming, isPending } = usePendingThreadRefetch(
        thread,
        threadUuid!,
        refetch,
    );
    const { data: reviewItem } = useAiAgentAdminReviewItem(
        reviewFingerprint ?? '',
        {
            enabled: !!reviewFingerprint,
        },
    );
    const updateReviewItemStatus = useUpdateAiAgentReviewItemStatus();

    const sqlModeAvailable = useAiAgentSqlModeAvailable(projectUuid);
    const sqlMode = useAiAgentStoreSelector(
        selectThreadSqlMode(threadUuid ?? ''),
    );
    const dispatch = useAiAgentStoreDispatch();

    const firstAssistantMessage = thread?.messages?.find(
        (m) => m.role === 'assistant',
    );
    const threadModelConfig = firstAssistantMessage?.modelConfig ?? null;

    const { data: availableModels } = useModelOptions({
        projectUuid,
        agentUuid,
        options: { enabled: !!threadModelConfig },
    });

    const isThreadModelUnavailable =
        !!threadModelConfig &&
        !!availableModels &&
        !availableModels.some(
            (m) =>
                m.provider === threadModelConfig.modelProvider &&
                m.name === threadModelConfig.modelName,
        );

    const disabledReasons: { when: boolean; message: string }[] = [
        {
            when: thread?.createdFrom === 'slack',
            message:
                'This thread is read-only. To continue the conversation, reply in Slack.',
        },
        {
            when: !!thread && !isThreadFromCurrentUser,
            message: 'This thread is read-only. It belongs to another user.',
        },
        {
            when: isThreadModelUnavailable,
            message: `The model used in this thread (${threadModelConfig?.modelProvider} ${threadModelConfig?.modelName}) is no longer available. Start a new thread to continue.`,
        },
    ];
    const activeDisabledReason = disabledReasons.find((r) => r.when);
    const inputDisabled = !!activeDisabledReason;
    const inputDisabledReason = activeDisabledReason?.message;
    const threadMentionItems = useMemo(
        () =>
            contextItemsToContentMentionSuggestions(
                thread?.messages.flatMap((message) =>
                    message.role === 'user' ? message.context : [],
                ) ?? [],
                'thread',
            ),
        [thread?.messages],
    );

    // Expand the thread's pinned dashboard into tiles, mentionable by tile name.
    const pinnedDashboardUuid = useMemo(() => {
        for (const message of thread?.messages ?? []) {
            if (message.role !== 'user') continue;
            for (const item of message.context ?? []) {
                if (item.type === 'dashboard') return item.dashboardUuid;
            }
        }
        return null;
    }, [thread?.messages]);

    const { contentMentionItems: pinnedDashboardTileItems } = usePinnedContext({
        projectUuid,
        dashboardUuidOrSlug: pinnedDashboardUuid,
    });

    const contentMentionItems = useMemo(
        () =>
            mergeContentMentionSuggestionItems(
                threadMentionItems,
                pinnedDashboardTileItems,
            ),
        [threadMentionItems, pinnedDashboardTileItems],
    );

    const handleSubmit = ({
        message,
        toolHints,
        context,
        optimisticContext,
    }: {
        message: string;
        toolHints: string[];
        context?: Parameters<typeof createAgentThreadMessage>[0]['context'];
        optimisticContext?: Parameters<
            typeof createAgentThreadMessage
        >[0]['optimisticContext'];
    }) => {
        void createAgentThreadMessage({
            prompt: message,
            modelConfig: threadModelConfig ?? undefined,
            context,
            optimisticContext,
            enableSqlMode: sqlModeAvailable && sqlMode,
            toolHints,
        });
    };
    const isBusy = isCreatingMessage || isStreaming || isPending;
    const reviewRemediation = reviewItem?.remediation ?? null;
    const reviewRemediationForThread =
        reviewRemediation?.previewThreadUuid === threadUuid
            ? reviewRemediation
            : null;
    const retryPrompt = reviewRemediationForThread?.retryPrompt ?? null;
    const linkedPrUrl = reviewRemediationForThread?.linkedPrUrl ?? null;
    const isReviewFixed = reviewItem?.status === 'resolved';
    const handleRetryOriginalQuestion = () => {
        if (!retryPrompt) return;
        handleSubmit({
            message: retryPrompt,
            toolHints: [],
        });
    };
    const handleMarkFixed = () => {
        if (!reviewItem || isReviewFixed) return;
        updateReviewItemStatus.mutate({
            fingerprint: reviewItem.fingerprint,
            body: {
                status: 'resolved',
                dismissedReason: null,
            },
        });
    };

    if (isLoadingThread || !thread || agentQuery.isLoading) {
        return (
            <Center h="100%">
                <Loader color="gray" />
            </Center>
        );
    }

    return (
        <AgentChatDisplay
            thread={thread}
            agentName={agentQuery.data?.name ?? 'AI'}
            enableAutoScroll={true}
            promptUuid={promptUuid}
            debug={debug}
            projectUuid={projectUuid}
            agentUuid={agentUuid}
            showAddToEvalsButton={canManage}
            onDashboardLinkClick={handleDashboardLinkClick}
        >
            <Stack gap="xs">
                {reviewItem && retryPrompt && (
                    <Alert color="gray" variant="light" px="md" py="sm">
                        <Group justify="space-between" align="center" gap="sm">
                            <Stack gap={2}>
                                <Text fz="sm" fw={600}>
                                    {reviewItem.title}
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    Retry the original question in this preview,
                                    then mark the review fixed when the answer
                                    behaves as expected.
                                </Text>
                            </Stack>
                            <Group gap="xs" wrap="nowrap">
                                {linkedPrUrl && (
                                    <Button
                                        component="a"
                                        href={linkedPrUrl}
                                        target="_blank"
                                        size="xs"
                                        variant="subtle"
                                        color="gray"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconGitPullRequest}
                                                size="sm"
                                            />
                                        }
                                    >
                                        View PR
                                    </Button>
                                )}
                                <Button
                                    size="xs"
                                    variant="default"
                                    disabled={inputDisabled || isBusy}
                                    onClick={handleRetryOriginalQuestion}
                                    leftSection={
                                        <MantineIcon
                                            icon={IconRefresh}
                                            size="sm"
                                        />
                                    }
                                >
                                    Retry question
                                </Button>
                                <Button
                                    size="xs"
                                    color="green"
                                    variant={isReviewFixed ? 'light' : 'filled'}
                                    disabled={isReviewFixed}
                                    loading={updateReviewItemStatus.isLoading}
                                    onClick={handleMarkFixed}
                                    leftSection={
                                        <MantineIcon
                                            icon={IconCircleCheck}
                                            size="sm"
                                        />
                                    }
                                >
                                    {isReviewFixed ? 'Fixed' : 'Mark fixed'}
                                </Button>
                            </Group>
                        </Group>
                    </Alert>
                )}
                <AgentChatInput
                    disabled={inputDisabled}
                    disabledReason={inputDisabledReason}
                    loading={isBusy}
                    onSubmit={handleSubmit}
                    placeholder={`Ask ${agent.name} anything about your data...`}
                    messageCount={thread.messages?.length || 0}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadUuid={threadUuid}
                    contentMentionPriorityItems={contentMentionItems}
                    latestAssistantMessageUuid={
                        [...(thread.messages ?? [])]
                            .reverse()
                            .find((m) => m.role === 'assistant')?.uuid
                    }
                    sqlMode={sqlModeAvailable ? sqlMode : undefined}
                    onSqlModeChange={
                        sqlModeAvailable && threadUuid
                            ? (enabled) =>
                                  dispatch(
                                      setThreadSqlMode({
                                          threadUuid,
                                          enabled,
                                      }),
                                  )
                            : undefined
                    }
                />
            </Stack>
        </AgentChatDisplay>
    );
};

export default AiAgentThreadPage;
