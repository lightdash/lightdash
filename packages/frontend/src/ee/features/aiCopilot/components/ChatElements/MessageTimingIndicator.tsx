import type { AiPromptResponseTiming } from '@lightdash/common';
import { Badge, Stack, Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    formatDurationMs,
    getResponseTimingMetrics,
} from '../../utils/responseTiming';
import { formatTokenCount } from '../Battle/battleTurns';

export type MessageTokenCounts = {
    agent: number;
    decisions: number;
    decisionName: string;
};

interface Props {
    responseTiming: AiPromptResponseTiming | null;
    isWinner: boolean;
    tokens: MessageTokenCounts | null;
}

export const MessageTimingIndicator: FC<Props> = ({
    responseTiming,
    isWinner,
    tokens,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    if (!responseTiming) return null;

    const metrics = getResponseTimingMetrics(responseTiming);
    if (!metrics) return null;

    const ttft =
        metrics.ttftMs === null
            ? t('timing.notAvailable')
            : formatDurationMs(metrics.ttftMs);
    const stages = metrics.stages;

    return (
        <Tooltip
            label={
                <Stack gap={2}>
                    <Text size="xs">
                        {t('timing.firstToken', {
                            ttft,
                            total: formatDurationMs(metrics.totalMs),
                        })}
                    </Text>
                    {stages && (
                        <Text size="xs">
                            {t('timing.stages', {
                                prep: formatDurationMs(stages.preparationMs),
                                provider:
                                    stages.providerMs === null
                                        ? t('timing.notAvailable')
                                        : formatDurationMs(stages.providerMs),
                                query: formatDurationMs(stages.queryMs),
                                api: formatDurationMs(stages.apiMs),
                                render: formatDurationMs(stages.renderMs),
                            })}
                            {stages.queryCacheHits > 0
                                ? ` · ${t('timing.cacheHits', {
                                      count: stages.queryCacheHits,
                                  })}`
                                : ''}
                            {stages.queryReuseHits > 0
                                ? ` · ${t('timing.reuseHits', {
                                      count: stages.queryReuseHits,
                                  })}`
                                : ''}
                        </Text>
                    )}
                    {tokens && (
                        <Text size="xs">
                            {t('timing.tokens', {
                                decisionName: tokens.decisionName,
                                decisions: tokens.decisions.toLocaleString(),
                                agent: tokens.agent.toLocaleString(),
                            })}
                        </Text>
                    )}
                    <Text size="xs" c="dimmed">
                        {t('timing.footnote')}
                    </Text>
                </Stack>
            }
            maw={320}
            multiline
        >
            <Badge variant="transparent" size="sm" fz="xs" c="dimmed">
                {isWinner ? '🥇 ' : ''}
                {tokens
                    ? `${formatDurationMs(metrics.totalMs)} · ${formatTokenCount(tokens.agent, tokens.decisions, tokens.decisionName)}`
                    : `${ttft} · ${formatDurationMs(metrics.totalMs)}`}
            </Badge>
        </Tooltip>
    );
};
