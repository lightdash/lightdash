import { Box, Center, Divider, Flex, Loader, Stack } from '@mantine/core';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { BattleThreadPane } from '../../features/aiCopilot/components/Battle/BattleThreadPane';
import { AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { ChatElementsUtils } from '../../features/aiCopilot/components/ChatElements/utils';
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
    const [queuedA, setQueuedA] = useState<BattleMessageInput | null>(null);
    const [queuedB, setQueuedB] = useState<BattleMessageInput | null>(null);

    const busyA =
        messageA.isLoading || pendingA.isStreaming || pendingA.isThreadPending;
    const busyB =
        messageB.isLoading || pendingB.isStreaming || pendingB.isThreadPending;

    useEffect(() => {
        if (busyA || !queuedA) return;
        setQueuedA(null);
        void messageA.mutateAsync(queuedA);
    }, [busyA, messageA, queuedA]);

    useEffect(() => {
        if (busyB || !queuedB) return;
        setQueuedB(null);
        void messageB.mutateAsync(queuedB);
    }, [busyB, messageB, queuedB]);

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
            const inputA = {
                ...shared,
                modelConfig: getThreadModelConfig(threadA),
            };
            const inputB = {
                ...shared,
                modelConfig: getThreadModelConfig(threadB),
            };
            if (busyA) setQueuedA(inputA);
            else void messageA.mutateAsync(inputA);
            if (busyB) setQueuedB(inputB);
            else void messageB.mutateAsync(inputB);
        },
        [busyA, busyB, messageA, messageB, threadA, threadB],
    );

    const queueFull = queuedA !== null || queuedB !== null;

    if (!projectUuid || !agentUuid || !threadA || !threadB) {
        return (
            <Center h="100%">
                <Loader color="gray" />
            </Center>
        );
    }

    return (
        <Stack h="100%" gap={0}>
            <Flex flex={1} mih={0} wrap="nowrap" align="stretch">
                <Box flex={1} miw={0} h="100%">
                    <BattleThreadPane
                        label={
                            threadA.battleProfile === 'fast' ? 'JEV on' : 'A'
                        }
                        projectUuid={projectUuid}
                        agentUuid={agentUuid}
                        agentName={agent.name}
                        thread={threadA}
                        queued={queuedA !== null}
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
                        queued={queuedB !== null}
                    />
                </Box>
            </Flex>
            <Box {...ChatElementsUtils.centeredElementProps} h="unset" py="sm">
                <AgentChatInput
                    onSubmit={handleSubmit}
                    loading={queueFull}
                    placeholder={
                        queueFull
                            ? 'One follow-up is queued...'
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
