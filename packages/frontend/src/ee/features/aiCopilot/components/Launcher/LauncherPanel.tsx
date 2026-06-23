import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import {
    Avatar,
    Badge,
    Box,
    Button,
    Center,
    Group,
    Loader,
    Stack,
    Text,
} from '@mantine-8/core';
import {
    useCallback,
    useMemo,
    useState,
    type CSSProperties,
    type FC,
} from 'react';
import { createPath, useLocation, useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import useApp from '../../../../../providers/App/useApp';
import { useAiAgentModelSelection } from '../../hooks/useAiAgentModelSelection';
import { useAiAgentSqlModeAvailable } from '../../hooks/useAiAgentSqlModeAvailable';
import { usePendingThreadRefetch } from '../../hooks/usePendingThreadRefetch';
import { usePinnedContext } from '../../hooks/usePinnedContext';
import {
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
    useCreateAgentThreadMutation,
} from '../../hooks/useProjectAiAgents';
import { openPanel } from '../../store/aiAgentLauncherSlice';
import {
    selectThreadSqlMode,
    setThreadSqlMode,
} from '../../store/aiAgentThreadModeSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { type AiAgentToolResult } from '../../types';
import { getDashboardNavigationUrlFromContentToolResult } from '../../utils/contentToolResultNavigation';
import { AiAgentNewThreadMcpConnections } from '../AiAgentNewThreadMcpConnections';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../ChatElements/AgentChatInput';
import { contextItemsToContentMentionSuggestions } from '../ChatElements/contentMentions';
import { getPromptContextItemKey } from '../ChatElements/contentReferenceUtils';
import { PinnedContextCard } from '../PinnedContextCard/PinnedContextCard';
import styles from './AiAgentsLauncher.module.css';
import {
    getConcreteLauncherAgent,
    isLauncherAutoAgent,
    type LauncherSelectedAgent,
} from './launcherAgentSelection';
import { PanelHeader } from './PanelHeader';
import {
    useAiAgentLauncherRouter,
    type LauncherRouterCandidate,
} from './useAiAgentLauncherRouter';
import { useLauncherDock } from './useLauncherDock';

type Props = {
    projectUuid: string;
    agent: LauncherSelectedAgent;
    agents: AiAgentSummary[];
    activeThreadId: string | null;
    style?: CSSProperties;
};

export const LauncherPanel: FC<Props> = ({
    projectUuid,
    agent,
    agents,
    activeThreadId,
    style,
}) => {
    if (!agent) {
        return (
            <div className={styles.panel} style={style}>
                <PanelHeader
                    projectUuid={projectUuid}
                    agent={null}
                    agents={agents}
                    title="AI"
                    threadId={null}
                />
                <Center className={styles.panelBody}>
                    <Loader size="sm" color="gray" />
                </Center>
            </div>
        );
    }

    return activeThreadId && !isLauncherAutoAgent(agent) ? (
        <ExistingThreadPanel
            projectUuid={projectUuid}
            agent={agent}
            agents={agents}
            threadId={activeThreadId}
            style={style}
        />
    ) : (
        <NewThreadPanel
            projectUuid={projectUuid}
            agent={agent}
            agents={agents}
            style={style}
        />
    );
};

const NewThreadPanel: FC<{
    projectUuid: string;
    agent: NonNullable<LauncherSelectedAgent>;
    agents: AiAgentSummary[];
    style?: CSSProperties;
}> = ({ projectUuid, agent, agents, style }) => {
    const navigate = useNavigate();
    const dispatch = useAiAgentStoreDispatch();
    const pendingContext = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.pendingContext,
    );

    const chartUuid = pendingContext?.chartUuid;
    const dashboardUuid = pendingContext?.dashboardUuid;

    const { addItem: addDockItem } = useLauncherDock(projectUuid);
    const isAuto = isLauncherAutoAgent(agent);
    const concreteAgent = getConcreteLauncherAgent(agent);

    const {
        contextInput,
        previewItems,
        contentMentionItems,
        isReady: isPinnedContextReady,
    } = usePinnedContext({
        projectUuid,
        chartUuidOrSlug: chartUuid,
        dashboardUuidOrSlug: dashboardUuid,
    });

    const sqlModeAvailable = useAiAgentSqlModeAvailable(projectUuid);
    // New threads have no uuid yet — keep the toggle in local state and seed
    // the per-thread slice entry once the thread is created.
    const [sqlMode, setSqlMode] = useState(false);
    const [composerSeed, setComposerSeed] = useState<string | null>(null);
    const {
        extendedThinking,
        handleExtendedThinkingChange,
        handleSelectedModelKeyChange,
        modelConfig,
        modelOptions,
        selectedModelKey,
        showExtendedThinking,
    } = useAiAgentModelSelection({
        projectUuid,
        agentUuid: concreteAgent?.uuid,
    });
    const dispatchToStore = useAiAgentStoreDispatch();
    const handleToolResult = useCallback(
        (toolResult: AiAgentToolResult) => {
            const dashboardUrl = getDashboardNavigationUrlFromContentToolResult(
                projectUuid,
                toolResult,
            );
            if (!dashboardUrl) return;

            void navigate(dashboardUrl, { viewTransition: true });
        },
        [navigate, projectUuid],
    );

    const { mutateAsync: createAgentThread, isLoading: isCreatingThread } =
        useCreateAgentThreadMutation(projectUuid, {
            // Launcher does its own routing via panels/dock — skip the default
            // page navigation that other surfaces want.
            skipNavigation: true,
            onCreated: (thread) => {
                addDockItem({
                    threadId: thread.uuid,
                    agentUuid: thread.agentUuid,
                    title: thread.firstMessage.message,
                });
                dispatch(
                    openPanel({
                        threadId: thread.uuid,
                        agentUuid: thread.agentUuid,
                    }),
                );
                // Seed the per-thread mode slice with the user's choice so
                // subsequent prompts in this thread default to the same.
                dispatchToStore(
                    setThreadSqlMode({
                        threadUuid: thread.uuid,
                        enabled: sqlModeAvailable && sqlMode,
                    }),
                );
            },
            onToolResult: handleToolResult,
        });

    const createThreadForAgent = useCallback(
        async ({
            agentUuid,
            context,
            message,
            optimisticContext,
            toolHints,
        }: {
            agentUuid: string;
            context?: AiPromptContextInput;
            message: string;
            optimisticContext?: AiPromptContext;
            toolHints: string[];
        }) => {
            return createAgentThread({
                agentUuid,
                prompt: message,
                context,
                optimisticContext,
                enableSqlMode: sqlModeAvailable && sqlMode,
                modelConfig,
                toolHints,
            });
        },
        [createAgentThread, modelConfig, sqlMode, sqlModeAvailable],
    );

    const {
        confirmPick,
        handleSubmit,
        isLocked,
        isPickingAgent,
        sortedCandidates,
    } = useAiAgentLauncherRouter({
        agent,
        agents,
        contextInput,
        createThreadForAgent,
        isCreatingThread,
        isPinnedContextReady,
        previewItems,
        projectUuid,
    });
    const displayName = isAuto ? 'Auto' : agent.name;
    const description = isAuto
        ? 'Routes each new question to the best-fit agent'
        : agent.description;

    return (
        <div className={styles.panel} style={style}>
            <PanelHeader
                projectUuid={projectUuid}
                agent={agent}
                agents={agents}
                title={displayName}
                threadId={null}
            />
            <div className={styles.panelBody}>
                <Stack
                    flex={1}
                    justify="center"
                    align="center"
                    gap="xs"
                    px="md"
                >
                    {isAuto ? (
                        <Avatar size="lg" color="ldGray" radius="xl">
                            <Text size="sm" fw={700} c="ldGray.6">
                                AI
                            </Text>
                        </Avatar>
                    ) : (
                        <LightdashUserAvatar
                            size="lg"
                            name={agent.name}
                            src={agent.imageUrl}
                        />
                    )}
                    <Text size="sm" fw={500}>
                        {displayName}
                    </Text>
                    {description && (
                        <Text size="xs" c="dimmed" ta="center" maw={360}>
                            {description}
                        </Text>
                    )}
                </Stack>
                {concreteAgent && (
                    <Stack px="md" pb="xs">
                        <AiAgentNewThreadMcpConnections
                            projectUuid={projectUuid}
                            agentUuid={concreteAgent.uuid}
                            onSuggestedPrompt={setComposerSeed}
                        />
                    </Stack>
                )}
                {previewItems.length > 0 && (
                    <Stack gap="xxs" px="md" pb="xs">
                        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                            Pinned context
                        </Text>
                        <Group gap="xs" wrap="wrap">
                            {previewItems.map((item) => (
                                <PinnedContextCard
                                    key={getPromptContextItemKey(item)}
                                    item={item}
                                    projectUuid={projectUuid}
                                />
                            ))}
                        </Group>
                    </Stack>
                )}
                {isPickingAgent && (
                    <LauncherAgentPicker
                        candidates={sortedCandidates}
                        onPick={confirmPick}
                    />
                )}
                <AgentChatInput
                    key={composerSeed ?? 'composer'}
                    defaultValue={composerSeed ?? undefined}
                    onSubmit={handleSubmit}
                    loading={isLocked}
                    disabled={!isPinnedContextReady || isPickingAgent}
                    placeholder={`Ask ${displayName} anything...`}
                    projectUuid={projectUuid}
                    agentUuid={concreteAgent?.uuid}
                    fullWidth
                    sqlMode={sqlModeAvailable ? sqlMode : undefined}
                    onSqlModeChange={sqlModeAvailable ? setSqlMode : undefined}
                    contentMentionPriorityItems={contentMentionItems}
                    models={modelOptions}
                    selectedModelId={selectedModelKey}
                    onModelChange={handleSelectedModelKeyChange}
                    extendedThinking={
                        showExtendedThinking ? extendedThinking : undefined
                    }
                    onExtendedThinkingChange={
                        showExtendedThinking
                            ? handleExtendedThinkingChange
                            : undefined
                    }
                />
            </div>
        </div>
    );
};

const LauncherAgentPicker: FC<{
    candidates: LauncherRouterCandidate[];
    onPick: (agentUuid: string) => void;
}> = ({ candidates, onPick }) => (
    <Stack gap="xs" px="md" pb="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Choose agent
        </Text>
        <Stack gap="xxs">
            {candidates.map((candidate) => (
                <Button
                    key={candidate.agentUuid}
                    variant="default"
                    justify="start"
                    leftSection={
                        <LightdashUserAvatar
                            size="xs"
                            name={candidate.name}
                            src={candidate.agent?.imageUrl}
                        />
                    }
                    onClick={() => onPick(candidate.agentUuid)}
                >
                    <Box className={styles.candidateContent}>
                        <Box className={styles.candidateText}>
                            {candidate.name}
                        </Box>
                        {candidate.isRecommended && (
                            <Badge
                                size="xs"
                                color="violet"
                                variant="light"
                                radius="sm"
                            >
                                Recommended
                            </Badge>
                        )}
                    </Box>
                </Button>
            ))}
        </Stack>
    </Stack>
);

const ExistingThreadPanel: FC<{
    projectUuid: string;
    agent: AiAgentSummary;
    agents: AiAgentSummary[];
    threadId: string;
    style?: CSSProperties;
}> = ({ projectUuid, agent, agents, threadId, style }) => {
    const { user } = useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const {
        data: thread,
        isLoading: isLoadingThread,
        refetch,
    } = useAiAgentThread(projectUuid, agent.uuid, threadId);

    const { isStreaming, isPending } = usePendingThreadRefetch(
        thread,
        threadId,
        refetch,
    );

    const handleToolResult = useCallback(
        (toolResult: AiAgentToolResult) => {
            const dashboardUrl = getDashboardNavigationUrlFromContentToolResult(
                projectUuid,
                toolResult,
            );
            if (!dashboardUrl) return;

            void navigate(dashboardUrl, { viewTransition: true });
        },
        [navigate, projectUuid],
    );

    const {
        mutateAsync: createAgentThreadMessage,
        isLoading: isCreatingMessage,
    } = useCreateAgentThreadMessageMutation(projectUuid, agent.uuid, threadId, {
        onToolResult: handleToolResult,
    });

    const sqlModeAvailable = useAiAgentSqlModeAvailable(projectUuid);
    const sqlMode = useAiAgentStoreSelector(selectThreadSqlMode(threadId));
    const dispatchToStore = useAiAgentStoreDispatch();

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;
    const contentMentionItems = useMemo(
        () =>
            contextItemsToContentMentionSuggestions(
                thread?.messages.flatMap((message) =>
                    message.role === 'user' ? message.context : [],
                ) ?? [],
                'thread',
            ),
        [thread?.messages],
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
        const firstAssistantMessage = thread?.messages?.find(
            (m) => m.role === 'assistant',
        );
        const modelConfig = firstAssistantMessage?.modelConfig ?? undefined;
        void createAgentThreadMessage({
            prompt: message,
            modelConfig,
            context,
            optimisticContext,
            enableSqlMode: sqlModeAvailable && sqlMode,
            toolHints,
        });
    };

    const headerTitle =
        thread?.title || thread?.firstMessage?.message || agent.name;

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

    if (isLoadingThread || !thread) {
        return (
            <div className={styles.panel} style={style}>
                <PanelHeader
                    projectUuid={projectUuid}
                    agent={agent}
                    agents={agents}
                    title={headerTitle}
                    threadId={threadId}
                />
                <Center className={styles.panelBody}>
                    <Loader size="sm" color="gray" />
                </Center>
            </div>
        );
    }

    return (
        <div className={styles.panel} style={style}>
            <PanelHeader
                projectUuid={projectUuid}
                agent={agent}
                agents={agents}
                title={headerTitle}
                threadId={threadId}
            />
            <div className={styles.panelBody}>
                <AgentChatDisplay
                    thread={thread}
                    agentName={agent.name}
                    enableAutoScroll
                    projectUuid={projectUuid}
                    agentUuid={agent.uuid}
                    renderArtifactsInline
                    onDashboardLinkClick={handleDashboardLinkClick}
                >
                    <AgentChatInput
                        disabled={
                            thread.createdFrom === 'slack' ||
                            !isThreadFromCurrentUser
                        }
                        disabledReason="This thread is read-only. To continue the conversation, reply in Slack."
                        loading={isCreatingMessage || isStreaming || isPending}
                        onSubmit={handleSubmit}
                        placeholder={`Ask ${agent.name} anything...`}
                        messageCount={thread.messages?.length || 0}
                        projectUuid={projectUuid}
                        agentUuid={agent.uuid}
                        fullWidth
                        threadUuid={threadId}
                        contentMentionPriorityItems={contentMentionItems}
                        latestAssistantMessageUuid={
                            [...(thread.messages ?? [])]
                                .reverse()
                                .find((m) => m.role === 'assistant')?.uuid
                        }
                        sqlMode={sqlModeAvailable ? sqlMode : undefined}
                        onSqlModeChange={
                            sqlModeAvailable
                                ? (enabled) =>
                                      dispatchToStore(
                                          setThreadSqlMode({
                                              threadUuid: threadId,
                                              enabled,
                                          }),
                                      )
                                : undefined
                        }
                    />
                </AgentChatDisplay>
            </div>
        </div>
    );
};
