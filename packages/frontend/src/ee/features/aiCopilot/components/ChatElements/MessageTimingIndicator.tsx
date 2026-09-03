import type { AiPromptResponseTiming } from '@lightdash/common';
import { Badge, Tooltip } from '@mantine/core';
import { type FC } from 'react';
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
    if (!battleModeEnabled || !responseTiming) return null;

    const metrics = getResponseTimingMetrics(responseTiming);
    if (!metrics) return null;

    const ttft =
        metrics.ttftMs === null ? 'n/a' : formatDurationMs(metrics.ttftMs);

    return (
        <Tooltip
            label={`Time to first token ${ttft}, total ${formatDurationMs(
                metrics.totalMs,
            )}. Measured on the server from the model call, so context loading is excluded.`}
            maw={320}
            multiline
        >
            <Badge variant="transparent" size="sm" fz="xs" c="dimmed">
                {ttft} · {formatDurationMs(metrics.totalMs)}
            </Badge>
        </Tooltip>
    );
};
