import { FeatureFlags, type AiPromptResponseTiming } from '@lightdash/common';
import { Badge, Stack, Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import { useAiAgentBattleModeEnabled } from '../../hooks/useAiAgentBattleModeEnabled';
import {
    formatDurationMs,
    getResponseTimingMetrics,
} from '../../utils/responseTiming';

interface Props {
    responseTiming: AiPromptResponseTiming | null;
}

export const MessageTimingIndicator: FC<Props> = ({ responseTiming }) => {
    const battleModeEnabled = useAiAgentBattleModeEnabled();
    const fastDecisions = useServerFeatureFlag(
        FeatureFlags.AiAgentFastDecisions,
    );
    if (
        (!battleModeEnabled && fastDecisions.data?.enabled !== true) ||
        !responseTiming
    )
        return null;

    const metrics = getResponseTimingMetrics(responseTiming);
    if (!metrics) return null;

    const ttft =
        metrics.ttftMs === null ? 'n/a' : formatDurationMs(metrics.ttftMs);
    const stages = metrics.stages;

    return (
        <Tooltip
            label={
                <Stack gap={2}>
                    <Text size="xs">
                        First token {ttft} · total{' '}
                        {formatDurationMs(metrics.totalMs)}
                    </Text>
                    {stages && (
                        <Text size="xs">
                            Prep {formatDurationMs(stages.preparationMs)} ·
                            provider{' '}
                            {stages.providerMs === null
                                ? 'n/a'
                                : formatDurationMs(stages.providerMs)}{' '}
                            · query {formatDurationMs(stages.queryMs)} · API{' '}
                            {formatDurationMs(stages.apiMs)} · render{' '}
                            {formatDurationMs(stages.renderMs)}
                            {stages.queryCacheHits > 0
                                ? ` · ${stages.queryCacheHits} query cache hit${
                                      stages.queryCacheHits === 1 ? '' : 's'
                                  }`
                                : ''}
                        </Text>
                    )}
                    <Text size="xs" c="dimmed">
                        Server wall time. Concurrent stage spans can overlap.
                    </Text>
                </Stack>
            }
            maw={320}
            multiline
        >
            <Badge variant="transparent" size="sm" fz="xs" c="dimmed">
                {ttft} · {formatDurationMs(metrics.totalMs)}
            </Badge>
        </Tooltip>
    );
};
