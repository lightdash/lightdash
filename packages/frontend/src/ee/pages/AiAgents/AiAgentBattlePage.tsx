import { Box, Center, Divider, Flex, Loader, Stack } from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { BattleMessageContext } from '../../features/aiCopilot/components/Battle/BattleMessageContext';
import { BattleThreadPane } from '../../features/aiCopilot/components/Battle/BattleThreadPane';
import { getTurnWinners } from '../../features/aiCopilot/components/Battle/battleTurns';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
import { useBattleFollowUpQueue } from '../../features/aiCopilot/hooks/useBattleFollowUpQueue';
import { usePendingThreadRefetch } from '../../features/aiCopilot/hooks/usePendingThreadRefetch';
import {
    useAiAgentThread,
    useCreateAgentThreadMessageMutation,
} from '../../features/aiCopilot/hooks/useProjectAiAgents';
import { type AgentContext } from './AgentPage';

const getThreadModelConfig = (
    thread: ReturnType<typeof useAiAgentThread>['data'],
) =>
    thread?.messages.find((message) => message.role === 'assistant')
        ?.modelConfig ?? undefined;

type BattleMessageInput = Parameters<
    ReturnType<typeof useCreateAgentThreadMessageMutation>['mutateAsync']
>[0];

const AiAgentBattlePage: FC = () => {
    const { agentUuid, threadUuidA, threadUuidB } = useParams();
    const projectUuid = useProjectUuid();
    const { agent } = useOutletContext<AgentContext>();

    const threadAQuery = useAiAgentThread(projectUuid!, agentUuid, threadUuidA);
    const threadBQuery = useAiAgentThread(projectUuid!, agentUuid, threadUuidB);

    const pendingA = usePendingThreadRefetch(
        threadAQuery.data,
        threadUuidA!,
        threadAQuery.refetch,
    );
    const pendingB = usePendingThreadRefetch(
        threadBQuery.data,
        threadUuidB!,
        threadBQuery.refetch,
    );

    const messageA = useCreateAgentThreadMessageMutation(
        projectUuid!,
        agentUuid,
        threadUuidA,
    );
    const messageB = useCreateAgentThreadMessageMutation(
        projectUuid!,
        agentUuid,
        threadUuidB,
    );

    const threadA = threadAQuery.data;
    const threadB = threadBQuery.data;
    const busyA =
        messageA.isLoading || pendingA.isStreaming || pendingA.isThreadPending;
    const busyB =
        messageB.isLoading || pendingB.isStreaming || pendingB.isThreadPending;

    const queueA = useBattleFollowUpQueue<BattleMessageInput>(
        busyA,
        messageA.mutateAsync,
    );
    const queueB = useBattleFollowUpQueue<BattleMessageInput>(
        busyB,
        messageB.mutateAsync,
    );
    const { enqueue: enqueueA } = queueA;
    const { enqueue: enqueueB } = queueB;

    const handleSubmit = useCallback(
        ({
            message,
            toolHints,
            context,
            optimisticContext,
        }: {
            message: string;
            toolHints: string[];
            context?: Parameters<typeof messageA.mutateAsync>[0]['context'];
            optimisticContext?: Parameters<
                typeof messageA.mutateAsync
            >[0]['optimisticContext'];
        }) => {
            const shared = {
                prompt: message,
                toolHints,
                context,
                optimisticContext,
            };
            enqueueA({
                ...shared,
                modelConfig: getThreadModelConfig(threadA),
            });
            enqueueB({
                ...shared,
                modelConfig: getThreadModelConfig(threadB),
            });
        },
        [enqueueA, enqueueB, threadA, threadB],
    );

    const battleMessageContext = useMemo(
        () => ({
            winnerMessageUuids:
                threadA && threadB
                    ? getTurnWinners(threadA, threadB)
                    : new Set<string>(),
        }),
        [threadA, threadB],
    );

    const queuedCount = Math.max(queueA.queuedCount, queueB.queuedCount);

    if (!projectUuid || !agentUuid || !threadA || !threadB) {
        return (
            <Center h="100%">
                <Loader color="gray" />
            </Center>
        );
    }

    return (
        <Stack h="100%" gap={0}>
            <BattleMessageContext.Provider value={battleMessageContext}>
                <Flex flex={1} mih={0} wrap="nowrap" align="stretch">
                    <Box flex={1} miw={0} h="100%">
                        <BattleThreadPane
                            label={
                                threadA.battleProfile === 'fast'
                                    ? 'JEV on'
                                    : 'A'
                            }
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            agentName={agent.name}
                            thread={threadA}
                            queuedCount={queueA.queuedCount}
                        />
                    </Box>
                    <Divider orientation="vertical" />
                    <Box flex={1} miw={0} h="100%">
                        <BattleThreadPane
                            label={
                                threadB.battleProfile === 'baseline'
                                    ? 'Baseline'
                                    : 'B'
                            }
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            agentName={agent.name}
                            thread={threadB}
                            queuedCount={queueB.queuedCount}
                        />
                    </Box>
                </Flex>
            </BattleMessageContext.Provider>
            <Box {...ChatElementsUtils.centeredElementProps} h="unset" py="sm">
                <AgentChatInput
                    onSubmit={handleSubmit}
                    placeholder={
                        queuedCount > 0
                            ? `${queuedCount} queued, keep asking...`
                            : 'Ask both sides a follow-up...'
                    }
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    messageCount={threadA.messages.length}
                    showSuggestions={false}
                />
            </Box>
        </Stack>
    );
};

export default AiAgentBattlePage;
