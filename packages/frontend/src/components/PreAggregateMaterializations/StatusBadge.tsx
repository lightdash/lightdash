import { type PreAggregateMaterializationSummary } from '@lightdash/common';
import { Badge, Tooltip } from '@mantine-8/core';
import { type FC } from 'react';

export const StatusBadge: FC<{
    summary: PreAggregateMaterializationSummary;
}> = ({ summary }) => {
    if (summary.definitionError) {
        return (
            <Tooltip label={summary.definitionError} multiline maw={300}>
                <Badge color="red" variant="light" size="sm">
                    Definition error
                </Badge>
            </Tooltip>
        );
    }

    if (!summary.materialization) {
        return (
            <Badge color="gray" variant="light" size="sm">
                Never materialized
            </Badge>
        );
    }

    const { status, errorMessage } = summary.materialization;

    switch (status) {
        case 'active':
            return (
                <Badge color="green" variant="light" size="sm">
                    Active
                </Badge>
            );
        case 'in_progress':
            return (
                <Badge color="blue" variant="light" size="sm">
                    In progress
                </Badge>
            );
        case 'failed':
            return (
                <Tooltip
                    label={errorMessage ?? 'Unknown error'}
                    multiline
                    maw={300}
                >
                    <Badge color="red" variant="light" size="sm">
                        Failed
                    </Badge>
                </Tooltip>
            );
        case 'superseded':
            return (
                <Badge color="gray" variant="light" size="sm">
                    Superseded
                </Badge>
            );
        default:
            return (
                <Badge color="gray" variant="light" size="sm">
                    {status}
                </Badge>
            );
    }
};
