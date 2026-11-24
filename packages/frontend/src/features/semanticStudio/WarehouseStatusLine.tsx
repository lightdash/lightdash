import { type WarehouseTypes } from '@lightdash/common';
import { Anchor, Box, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import {
    getWarehouseIcon,
    getWarehouseLabel,
} from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import classes from './WarehouseStatusLine.module.css';
import { useWarehouseSummary, type WarehouseSummary } from './warehouseSummary';

/** The warehouse's type, then where its tables are and how many, once listed. */
export const WarehouseHeading: FC<{
    type: WarehouseTypes;
    summary: WarehouseSummary | null;
}> = ({ type, summary }) => {
    const details = [
        summary?.location ?? null,
        summary
            ? `${summary.tableCount} ${summary.tableCount === 1 ? 'table' : 'tables'}`
            : null,
    ].filter((detail) => detail !== null);
    return (
        <Box className={classes.heading}>
            <Group gap="xs" wrap="nowrap" flex="none">
                {getWarehouseIcon(type, 16)}
                <Text fz="sm" fw={500}>
                    {getWarehouseLabel(type) ?? 'Warehouse'}
                </Text>
            </Group>
            {details.length > 0 ? (
                <Text fz="xs" c="dimmed" maw="100%" truncate>
                    {details.join(' · ')}
                </Text>
            ) : null}
        </Box>
    );
};

/** What the models read from, at the top of the source panel; settingsPath is null for people who can't open settings. */
export const WarehouseStatusLine: FC<{
    projectUuid: string;
    settingsPath: string | null;
}> = ({ projectUuid, settingsPath }) => {
    const { type, summary } = useWarehouseSummary(projectUuid);
    if (!type) return null;
    return (
        <Box className={classes.status} aria-label="Warehouse">
            <WarehouseHeading type={type} summary={summary} />
            {settingsPath ? (
                <Anchor component={Link} to={settingsPath} fz="xs">
                    Edit connection
                </Anchor>
            ) : (
                <Text fz="xs" c="dimmed">
                    Ask a project admin to change the connection
                </Text>
            )}
        </Box>
    );
};
