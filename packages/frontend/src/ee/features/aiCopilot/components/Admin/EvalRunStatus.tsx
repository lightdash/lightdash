import { type AiAgentEvaluationRunSummary } from '@lightdash/common';
import { Badge, Text, Tooltip } from '@mantine-8/core';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';
import { statusConfig } from '../Evals/utils';

export const RunStatusBadge = ({
    status,
}: {
    status: AiAgentEvaluationRunSummary['status'];
}) => (
    <Badge variant="light" color={statusConfig[status].color}>
        {statusConfig[status].label}
    </Badge>
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
