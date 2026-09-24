import { type PartitionColumn } from '@lightdash/common';
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { type TableIdentity } from '../utils/warehouseTreeRows';

export type PendingConnectionSwitch = {
    connectionUuid: string;
    connectionName: string;
    qualifiedName: string;
    identity: TableIdentity;
    partitionColumn: PartitionColumn | undefined;
};

export const ConnectionSwitchPrompt: FC<{
    pendingSwitch: PendingConnectionSwitch;
    activeConnectionName: string | undefined;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ pendingSwitch, activeConnectionName, onConfirm, onCancel }) => (
    <Paper withBorder p="xs" mb="xs">
        <Stack gap="xs">
            <Text fz="sm" fw={600}>
                Switch to {pendingSwitch.connectionName}?
            </Text>
            <Text fz="xs" c="dimmed">
                {pendingSwitch.qualifiedName} is on another connection. Your
                editor has SQL that did not come from a table click, so nothing
                has changed yet.
            </Text>
            <Group gap="xs">
                <Button size="xs" onClick={onConfirm}>
                    Switch and replace SQL
                </Button>
                <Button size="xs" variant="default" onClick={onCancel}>
                    {activeConnectionName
                        ? `Keep ${activeConnectionName}`
                        : 'Keep this connection'}
                </Button>
            </Group>
        </Stack>
    </Paper>
);
