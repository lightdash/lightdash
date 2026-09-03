import type { AiAgentThread } from '@lightdash/common';
import { Anchor, Badge, Box, Group, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import { matchesModelConfig } from '../../../../../components/common/ModelSelector/utils';
import { getAiAgentPageBase } from '../../hooks/aiAgentRouting';
import { useModelOptions } from '../../hooks/useModelOptions';
import { useAiAgentThreadStreamQuery } from '../../streaming/useAiAgentThreadStreamQuery';
import {
    formatDurationMs,
    getResponseTimingMetrics,
} from '../../utils/responseTiming';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';

interface Props {
    label: string;
    projectUuid: string;
    agentUuid: string;
    agentName: string;
    thread: AiAgentThread;
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

type TimingSummary = {
    source: 'live' | 'server';
    ttftMs: number | null;
    totalMs: number;
};

export const BattleThreadPane: FC<Props> = ({
    label,
    projectUuid,
    agentUuid,
    agentName,
    thread,
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

    const timing = useMemo<TimingSummary | null>(() => {
        const liveTiming = stream?.timing;
        // Live stopwatch while streaming, and the client-observed figure
        // right after until the persisted server timing lands.
        if (isStreaming && liveTiming) {
            return {
                source: 'live',
                ttftMs:
                    liveTiming.firstTokenAt === null
                        ? null
                        : liveTiming.firstTokenAt - liveTiming.startedAt,
                totalMs: now - liveTiming.startedAt,
            };
        }
        const persisted =
            lastAssistantMessage?.responseTiming &&
            lastAssistantMessage.status !== 'pending'
                ? getResponseTimingMetrics(lastAssistantMessage.responseTiming)
                : null;
        if (persisted) return { source: 'server', ...persisted };
        if (liveTiming && liveTiming.finishedAt !== null) {
            return {
                source: 'live',
                ttftMs:
                    liveTiming.firstTokenAt === null
                        ? null
                        : liveTiming.firstTokenAt - liveTiming.startedAt,
                totalMs: liveTiming.finishedAt - liveTiming.startedAt,
            };
        }
        return null;
    }, [isStreaming, lastAssistantMessage, now, stream?.timing]);

    const status = isStreaming
        ? 'Streaming'
        : lastAssistantMessage?.status === 'error'
          ? 'Failed'
          : lastAssistantMessage?.status === 'pending'
            ? 'Waiting'
            : 'Done';

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
                    <Badge size="sm" variant="light" color="ldGray">
                        {label}
                    </Badge>
                    <Text size="sm" fw={600} truncate>
                        {modelDisplayName ?? 'Default model'}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {status}
                    </Text>
                </Group>
                <Group gap="sm" wrap="nowrap">
                    {timing && (
                        <Group gap={4} wrap="nowrap">
                            <Text size="xs" c="dimmed">
                                first token
                            </Text>
                            <Text size="xs" fw={600} ff="monospace">
                                {timing.ttftMs === null
                                    ? '…'
                                    : formatDurationMs(timing.ttftMs)}
                            </Text>
                            <Text size="xs" c="dimmed" ml={4}>
                                total
                            </Text>
                            <Text size="xs" fw={600} ff="monospace">
                                {formatDurationMs(timing.totalMs)}
                            </Text>
                            <Text size="xs" c="dimmed" ml={2}>
                                {timing.source === 'live'
                                    ? '(client)'
                                    : '(server)'}
                            </Text>
                        </Group>
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
