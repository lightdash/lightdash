import { type AiAgentSummary } from '@lightdash/common';
import { Center, Group, Loader, Stack, Text } from '@mantine-8/core';
import { type CSSProperties, type FC } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import useApp from '../../../../../providers/App/useApp';
import { usePendingThreadRefetch } from '../../hooks/usePendingThreadRefetch';
import { usePinnedContext } from '../../hooks/usePinnedContext';
import {
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
    useCreateAgentThreadMutation,
} from '../../hooks/useProjectAiAgents';
import { openPanel } from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { AgentChatInput } from '../ChatElements/AgentChatInput';
import { PinnedContextCard } from '../PinnedContextCard/PinnedContextCard';
import styles from './AiAgentsLauncher.module.css';
import { PanelHeader } from './PanelHeader';
import { useLauncherDock } from './useLauncherDock';

type Props = {
    projectUuid: string;
    agent: AiAgentSummary | null;
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

    return activeThreadId ? (
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
    agent: AiAgentSummary;
    agents: AiAgentSummary[];
    style?: CSSProperties;
}> = ({ projectUuid, agent, agents, style }) => {
    const dispatch = useAiAgentStoreDispatch();
    const pendingContext = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.pendingContext,
    );

    const chartUuid = pendingContext?.chartUuid;
    const dashboardUuid = pendingContext?.dashboardUuid;

    const { addItem: addDockItem } = useLauncherDock(projectUuid);

    const { contextInput, previewItems } = usePinnedContext({
        projectUuid,
        chartUuid,
        dashboardUuid,
    });

    const { mutateAsync: createAgentThread, isLoading: isCreatingThread } =
        useCreateAgentThreadMutation(agent.uuid, projectUuid, {
            onCreated: (thread) => {
                addDockItem({
                    threadId: thread.uuid,
                    agentUuid: agent.uuid,
                    title: thread.firstMessage.message,
                });
                dispatch(
                    openPanel({
                        threadId: thread.uuid,
                        agentUuid: agent.uuid,
                    }),
                );
            },
        });

    const handleSubmit = (prompt: string) => {
        void createAgentThread({
            prompt,
            context: contextInput.length > 0 ? contextInput : undefined,
            optimisticContext:
                previewItems.length > 0 ? previewItems : undefined,
        });
    };

    return (
        <div className={styles.panel} style={style}>
            <PanelHeader
                projectUuid={projectUuid}
                agent={agent}
                agents={agents}
                title={agent.name}
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
                    <LightdashUserAvatar
                        size="lg"
                        name={agent.name}
                        src={agent.imageUrl}
                    />
                    <Text size="sm" fw={500}>
                        {agent.name}
                    </Text>
                    {agent.description && (
                        <Text size="xs" c="dimmed" ta="center" maw={360}>
                            {agent.description}
                        </Text>
                    )}
                </Stack>
                {previewItems.length > 0 && (
                    <Stack gap="xxs" px="md" pb="xs">
                        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                            Pinned context
                        </Text>
                        <Group gap="xs" wrap="wrap">
                            {previewItems.map((item) => (
                                <PinnedContextCard
                                    key={`${item.type}-${
                                        item.type === 'chart'
                                            ? item.chartUuid
                                            : item.dashboardUuid
                                    }`}
                                    item={item}
                                    projectUuid={projectUuid}
                                />
                            ))}
                        </Group>
                    </Stack>
                )}
                <AgentChatInput
                    onSubmit={handleSubmit}
                    loading={isCreatingThread}
                    placeholder={`Ask ${agent.name} anything...`}
                    projectUuid={projectUuid}
                    agentUuid={agent.uuid}
                />
            </div>
        </div>
    );
};

const ExistingThreadPanel: FC<{
    projectUuid: string;
    agent: AiAgentSummary;
    agents: AiAgentSummary[];
    threadId: string;
    style?: CSSProperties;
}> = ({ projectUuid, agent, agents, threadId, style }) => {
    const { user } = useApp();
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

    const {
        mutateAsync: createAgentThreadMessage,
        isLoading: isCreatingMessage,
    } = useCreateAgentThreadMessageMutation(projectUuid, agent.uuid, threadId);

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;

    const handleSubmit = (prompt: string) => {
        const firstAssistantMessage = thread?.messages?.find(
            (m) => m.role === 'assistant',
        );
        const modelConfig = firstAssistantMessage?.modelConfig ?? undefined;
        void createAgentThreadMessage({ prompt, modelConfig });
    };

    const headerTitle =
        thread?.title || thread?.firstMessage?.message || agent.name;

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
                    />
                </AgentChatDisplay>
            </div>
        </div>
    );
};
