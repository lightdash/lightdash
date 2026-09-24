import { type AiAgentJevDecision } from '@lightdash/common';
import { Badge, Stack, Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { formatDurationMs } from '../../utils/responseTiming';
import { describeJevDecision } from './jevDecision';

export const JevDecisionIndicator: FC<{ decision: AiAgentJevDecision }> = ({
    decision,
}) => {
    const { applied, badge, title, description, reasonCode } =
        describeJevDecision(decision);
    return (
        <Tooltip
            maw={300}
            multiline
            label={
                <Stack gap={4}>
                    <Text fz="xs" fw={600}>
                        {title}
                    </Text>
                    <Text fz="xs">{description}</Text>
                    <Text fz="xs" c="dimmed">
                        Decided in {formatDurationMs(decision.latencyMs)}
                        {reasonCode ? ` · ${reasonCode}` : ''}
                    </Text>
                </Stack>
            }
        >
            <Badge
                size="sm"
                variant={applied ? 'light' : 'default'}
                color={applied ? 'indigo' : undefined}
            >
                {badge}
            </Badge>
        </Tooltip>
    );
};
