import { type WarehouseTypes } from '@lightdash/common';
import { Anchor, Box, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import {
    getWarehouseIcon,
    getWarehouseLabel,
} from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import { TableListingFailureNotice } from '../sqlRunner/components/TableListingFailureNotice';
import classes from './WarehouseStatusLine.module.css';
import { useWarehouseSummary, warehouseDetails } from './warehouseSummary';

/** The warehouse's type, then what is known about its tables. */
export const WarehouseHeading: FC<{
    type: WarehouseTypes;
    details: string[];
}> = ({ type, details }) => {
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

/** What the models read from; named is false under a title that already names the warehouse, and settingsPath is null for people who can't open settings. */
export const WarehouseStatusLine: FC<{
    projectUuid: string;
    named: boolean;
    settingsPath: string | null;
}> = ({ projectUuid, named, settingsPath }) => {
    const { type, isListing, summary, listingFailure } =
        useWarehouseSummary(projectUuid);
    if (!type) return null;
    const details = isListing ? ['Listing tables…'] : warehouseDetails(summary);
    return (
        <Box className={classes.status} aria-label="Warehouse">
            {named ? (
                <WarehouseHeading type={type} details={details} />
            ) : details.length > 0 ? (
                <Text fz="sm" c="dimmed" truncate>
                    {details.join(' · ')}
                </Text>
            ) : null}
            {listingFailure ? (
                <TableListingFailureNotice failure={listingFailure} />
            ) : null}
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
