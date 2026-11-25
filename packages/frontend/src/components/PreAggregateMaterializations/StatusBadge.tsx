import {
    assertUnreachable,
    type PreAggregateMaterializationSummary,
} from '@lightdash/common';
import { Badge, Tooltip } from '@mantine/core';
import { IconDatabaseExport } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import {
    getPreAggregateStatus,
    PRE_AGGREGATE_STATUS,
} from './preAggregateStatus';

export const StatusBadge: FC<{
    summary: PreAggregateMaterializationSummary;
}> = ({ summary }) => {
    const kind = getPreAggregateStatus(summary);
    const { label, color } = PRE_AGGREGATE_STATUS[kind];
    const badge = (
        <Badge
            color={color}
            size="sm"
            leftSection={
                kind === 'external' ? (
                    <MantineIcon icon={IconDatabaseExport} size="xs" />
                ) : undefined
            }
        >
            {label}
        </Badge>
    );

    switch (kind) {
        case 'invalid':
            return (
                <Tooltip label={summary.definitionError} maw={300}>
                    {badge}
                </Tooltip>
            );
        case 'external':
            return (
                <Tooltip label="Served from a customer-managed warehouse table">
                    {badge}
                </Tooltip>
            );
        case 'failed':
            return (
                <Tooltip
                    label={
                        summary.materialization?.errorMessage ?? 'Unknown error'
                    }
                    maw={300}
                >
                    {badge}
                </Tooltip>
            );
        case 'active':
        case 'in_progress':
        case 'superseded':
        case 'never_built':
            return badge;
        default:
            return assertUnreachable(kind, 'Unknown pre-aggregate status');
    }
};
