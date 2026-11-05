import { type WarehouseTypes } from '@lightdash/common';
import { Badge, Box, Group, Stack, Text } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import MantineIcon from '../common/MantineIcon';
import classes from './ConnectionsPanel.module.css';
import { getWarehouseLabel } from './ProjectConnectFlow/utils';

export const ConnectionsSection: FC<PropsWithChildren> = ({ children }) => (
    <Stack gap="sm" className={classes.section}>
        <Text fw={600} size="sm">
            Connections
        </Text>
        {children}
    </Stack>
);

export const ConnectionsList: FC<PropsWithChildren> = ({ children }) => (
    <Stack gap={0} className={classes.list}>
        {children}
    </Stack>
);

export const ConnectionSummary: FC<{
    name: string;
    warehouseType: WarehouseTypes | null;
    status: string | null;
    actions?: ReactNode;
}> = ({ name, warehouseType, status, actions }) => (
    <Group className={classes.row} gap="sm" wrap="nowrap">
        <MantineIcon
            icon={IconPlugConnected}
            size="lg"
            className={classes.mark}
        />
        <Box className={classes.info}>
            <Group gap={6} wrap="nowrap">
                <Text fw={600} size="sm" truncate>
                    {name}
                </Text>
                {status && <Badge size="sm">{status}</Badge>}
            </Group>
            {warehouseType && (
                <Text className={classes.meta} c="dimmed" truncate>
                    {getWarehouseLabel(warehouseType)}
                </Text>
            )}
        </Box>
        {actions}
    </Group>
);
