import type {
    AiAgentBattleProfile,
    AiAgentLoadoutBase,
    AiAgentThread,
} from '@lightdash/common';
import { Anchor, Badge, Box, Group, Stack, Text } from '@mantine/core';
import { useContext, useEffect, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import { matchesModelConfig } from '../../../../../components/common/ModelSelector/utils';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { getAiAgentPageBase } from '../../hooks/aiAgentRouting';
import { useModelOptions } from '../../hooks/useModelOptions';
import { useAiAgentThreadStreamQuery } from '../../streaming/useAiAgentThreadStreamQuery';
import { formatDurationMs } from '../../utils/responseTiming';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { BattleMessageContext } from './BattleMessageContext';
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
    onChoiceSelect: (prompt: string) => void;
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

const battleColors: Record<AiAgentBattleProfile, string> = {
    fast: 'violet',
    luna: 'teal',
    baseline: 'gray',
    classic: 'gray',
    composer: 'indigo',
};
// Query path sides still make fast decisions with JEV when Fast mode is on.
const battleDecisionNames: Record<AiAgentBattleProfile, string> = {
    fast: 'JEV',
    luna: 'Luna',
    baseline: 'JEV',
    classic: 'JEV',
    composer: 'JEV',
};
const loadoutBaseNames: Record<AiAgentLoadoutBase, string> = {
    classic: 'Classic',
    composer: 'Composer',
    no_data_access: 'No data access',
    deep_research_worker: 'Deep research',
    deep_research_coordinator: 'Deep research',
};
const NO_WINNERS: ReadonlySet<string> = new Set();

// The ticker and stream updates stay here so they never re-render the chat.
const BattlePaneHeader: FC<Omit<Props, 'agentName' | 'onChoiceSelect'>> = ({
    label,
    projectUuid,
    agentUuid,
    thread,
    queuedCount,
}) => {
    const isEmbed = useIsEmbedded();
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

    // The loadout a query path side actually ran with can differ from its profile.
    const loadoutBase = useMemo(
        () =>
            [...thread.messages]
                .reverse()
                .flatMap((message) =>
                    message.role === 'assistant' && message.loadout
                        ? [message.loadout.base]
                        : [],
                )[0] ?? null,
        [thread.messages],
    );
    const isQueryPathSide =
        thread.battleProfile === 'classic' ||
        thread.battleProfile === 'composer';
    const badgeLabel =
        isQueryPathSide && loadoutBase ? loadoutBaseNames[loadoutBase] : label;

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
        <Group
            justify="space-between"
            px="sm"
            py={6}
            wrap="nowrap"
            style={{
                borderBottom: '1px solid var(--mantine-color-default-border)',
            }}
        >
            <Group gap="xs" wrap="nowrap" miw={0}>
                <Badge
                    size="sm"
                    flex="none"
                    variant="light"
                    color={battleColors[thread.battleProfile ?? 'baseline']}
                >
                    {badgeLabel}
                </Badge>
                <Text size="sm" fw={600} truncate>
                    {modelDisplayName ?? 'Default model'}
                </Text>
                {(status || queuedCount > 0) && (
                    <Text size="xs" c="dimmed">
                        {[
                            status,
                            queuedCount > 0 ? `${queuedCount} queued` : null,
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
                            battleDecisionNames[
                                thread.battleProfile ?? 'baseline'
                            ],
                        )}
                    </Text>
                )}
                <Anchor
                    component={Link}
                    to={`${getAiAgentPageBase(projectUuid, isEmbed)}/${agentUuid}/threads/${thread.uuid}`}
                    size="xs"
                >
                    Open
                </Anchor>
            </Group>
        </Group>
    );
};

export const BattleThreadPane: FC<Props> = ({
    label,
    projectUuid,
    agentUuid,
    agentName,
    thread,
    queuedCount,
    onChoiceSelect,
}) => {
    const battle = useContext(BattleMessageContext);
    const decisionName =
        battleDecisionNames[thread.battleProfile ?? 'baseline'];
    const messageContext = useMemo(
        () => ({
            winnerMessageUuids: battle?.winnerMessageUuids ?? NO_WINNERS,
            decisionName,
        }),
        [battle?.winnerMessageUuids, decisionName],
    );
    return (
        <Stack h="100%" gap={0} miw={0}>
            <BattlePaneHeader
                label={label}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
                thread={thread}
                queuedCount={queuedCount}
            />
            <Box flex={1} mih={0}>
                <BattleMessageContext.Provider value={messageContext}>
                    <AgentChatDisplay
                        thread={thread}
                        agentName={agentName}
                        enableAutoScroll
                        projectUuid={projectUuid}
                        agentUuid={agentUuid}
                        renderArtifactsInline
                        onChoiceSelect={onChoiceSelect}
                    />
                </BattleMessageContext.Provider>
            </Box>
        </Stack>
    );
};
