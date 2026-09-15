import {
    assertUnreachable,
    type PreAggregateMaterializationSummary,
} from '@lightdash/common';
import { Badge, Tooltip } from '@mantine/core';
import { IconDatabaseExport } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

export const StatusBadge: FC<{
    summary: PreAggregateMaterializationSummary;
}> = ({ summary }) => {
    if (summary.definitionError) {
        return (
            <Tooltip label={summary.definitionError} maw={300}>
                <Badge color="red" size="sm">
                    Definition error
                </Badge>
            </Tooltip>
        );
    }

    if (summary.externalTable) {
        return (
            <Tooltip label="Served from a customer-managed warehouse table">
                <Badge
                    color="indigo"
                    size="sm"
                    leftSection={
                        <MantineIcon icon={IconDatabaseExport} size="xs" />
                    }
                >
                    External
                </Badge>
            </Tooltip>
        );
    }

    if (!summary.activeMaterialization) {
        if (summary.materialization) {
            return <Badge size="sm">Unavailable</Badge>;
        }
        return <Badge size="sm">Never materialized</Badge>;
    }

    return (
        <MaterializationStatusBadge
            materialization={summary.activeMaterialization}
        />
    );
};

export const MaterializationStatusBadge: FC<{
    materialization: PreAggregateMaterializationSummary['materialization'];
}> = ({ materialization }) => {
    if (!materialization) return <Badge size="sm">No attempts</Badge>;

    const { status, errorMessage } = materialization;

    switch (status) {
        case 'active':
            return (
                <Badge color="green" size="sm">
                    Active
                </Badge>
            );
        case 'in_progress':
            return (
                <Badge color="blue" size="sm">
                    In progress
                </Badge>
            );
        case 'failed':
            return (
                <Tooltip label={errorMessage ?? 'Unknown error'} maw={300}>
                    <Badge color="red" size="sm">
                        Failed
                    </Badge>
                </Tooltip>
            );
        case 'superseded':
            return <Badge size="sm">Superseded</Badge>;
        default:
            return assertUnreachable(status, 'Unknown materialization status');
    }
};
