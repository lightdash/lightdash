import { type AiAgentEvaluationRunSummary } from '@lightdash/common';
import { Text, Tooltip, type MantineColor } from '@mantine-8/core';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';
import { statusConfig } from '../Evals/utils';
import { StatusIndicator } from '../StatusIndicator';

const statusDotColor: Record<
    AiAgentEvaluationRunSummary['status'],
    MantineColor
> = {
    completed: 'green.6',
    failed: 'red.6',
    running: 'yellow.6',
    pending: 'ldGray.6',
};

export const RunStatusIndicator = ({
    status,
}: {
    status: AiAgentEvaluationRunSummary['status'];
}) => (
    <StatusIndicator
        color={statusDotColor[status]}
        label={statusConfig[status].label}
    />
);

export const TimeAgo = ({
    date,
    fz,
    c,
}: {
    date: Date;
    fz: string;
    c: string;
}) => {
    const timeAgo = useTimeAgo(date);
    return (
        <Tooltip withinPortal label={new Date(date).toLocaleString()}>
            <Text fz={fz} c={c} truncate>
                {timeAgo}
            </Text>
        </Tooltip>
    );
};
