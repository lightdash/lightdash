import type { AiAgentThread } from '@lightdash/common';
import { Anchor, Badge, Box, Group, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import { matchesModelConfig } from '../../../../../components/common/ModelSelector/utils';
import { getAiAgentPageBase } from '../../hooks/aiAgentRouting';
import { useModelOptions } from '../../hooks/useModelOptions';
import { useAiAgentThreadStreamQuery } from '../../streaming/useAiAgentThreadStreamQuery';
import { formatDurationMs } from '../../utils/responseTiming';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import {
    formatTokenCount,
    getBattleTotals,
    getBattleTurns,
} from './battleTurns';

interface Props {
    label: string;
    projectUuid: string;
    agentUuid: string;
    agentName: string;
    thread: AiAgentThread;
    queuedCount: number;
}

const useTicking = (active: boolean) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return undefined;
        const interval = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(interval);
    }, [active]);
    return now;
};

export const BattleThreadPane: FC<Props> = ({
    label,
    projectUuid,
    agentUuid,
    agentName,
    thread,
    queuedCount,
}) => {
    const stream = useAiAgentThreadStreamQuery(thread.uuid);
    const isStreaming = stream?.connection.status === 'streaming';
    const now = useTicking(isStreaming);

    const lastAssistantMessage = useMemo(
        () =>
            [...thread.messages]
                .reverse()
                .find((message) => message.role === 'assistant'),
        [thread.messages],
    );

    const { data: modelOptions } = useModelOptions({ projectUuid, agentUuid });
    // The thread's model never changes, so the first persisted config wins
    // over the optimistic (still streaming) message that has none yet.
    const modelConfig = useMemo(
        () =>
            thread.messages.flatMap((message) =>
                message.role === 'assistant' && message.modelConfig
                    ? [message.modelConfig]
                    : [],
            )[0] ?? null,
        [thread.messages],
    );
    const modelDisplayName = useMemo(() => {
        if (!modelConfig) return null;
        const option = modelOptions?.find((model) =>
            matchesModelConfig(model, modelConfig),
        );
        return option?.displayName ?? modelConfig.modelName;
    }, [modelConfig, modelOptions]);

    const totals = useMemo(
        () => getBattleTotals(getBattleTurns(thread)),
        [thread],
    );
    const liveTiming = stream?.timing;
    const lastTurnFinished =
        lastAssistantMessage?.status !== 'pending' &&
        !!lastAssistantMessage?.responseTiming;
    // Adds the turn still in flight, or just finished but not yet persisted.
    const liveMs =
        liveTiming && !lastTurnFinished
            ? (isStreaming ? now : (liveTiming.finishedAt ?? now)) -
              liveTiming.startedAt
            : 0;
    const sessionMs = totals.totalMs + liveMs;
    const liveTtftMs =
        liveTiming && !lastTurnFinished
            ? liveTiming.firstTokenAt === null
                ? null
                : liveTiming.firstTokenAt - liveTiming.startedAt
            : undefined;

    const status = isStreaming
        ? 'Streaming'
        : lastAssistantMessage?.status === 'error'
          ? 'Failed'
          : lastAssistantMessage?.status === 'pending'
            ? 'Waiting'
            : null;

    return (
        <Stack h="100%" gap={0} miw={0}>
            <Group
                justify="space-between"
                px="sm"
                py={6}
                wrap="nowrap"
                style={{
                    borderBottom:
                        '1px solid var(--mantine-color-default-border)',
                }}
            >
                <Group gap="xs" wrap="nowrap" miw={0}>
                    <Badge
                        size="sm"
                        flex="none"
                        variant="light"
                        color={
                            thread.battleProfile === 'fast' ? 'violet' : 'gray'
                        }
                    >
                        {label}
                    </Badge>
                    <Text size="sm" fw={600} truncate>
                        {modelDisplayName ?? 'Default model'}
                    </Text>
                    {(status || queuedCount > 0) && (
                        <Text size="xs" c="dimmed">
                            {[
                                status,
                                queuedCount > 0
                                    ? `${queuedCount} queued`
                                    : null,
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </Text>
                    )}
                </Group>
                <Group gap="sm" wrap="nowrap">
                    {liveTtftMs !== undefined && (
                        <Text size="xs" c="dimmed">
                            first token{' '}
                            {liveTtftMs === null
                                ? '…'
                                : formatDurationMs(liveTtftMs)}
                        </Text>
                    )}
                    {sessionMs > 0 && (
                        <Text size="xs" c="dimmed">
                            <Text span fz="xs" fw={600} c="text">
                                {formatDurationMs(sessionMs)}
                            </Text>
                            {' · '}
                            {formatTokenCount(
                                totals.agentTokens,
                                totals.jevTokens,
                            )}
                        </Text>
                    )}
                    <Anchor
                        component={Link}
                        to={`${getAiAgentPageBase(
                            projectUuid,
                        )}/${agentUuid}/threads/${thread.uuid}`}
                        size="xs"
                    >
                        Open
                    </Anchor>
                </Group>
            </Group>
            <Box flex={1} mih={0}>
                <AgentChatDisplay
                    thread={thread}
                    agentName={agentName}
                    enableAutoScroll
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    renderArtifactsInline
                />
            </Box>
        </Stack>
    );
};
