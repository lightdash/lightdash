import { type PartitionColumn } from '@lightdash/common';
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
}> = ({ pendingSwitch, activeConnectionName, onConfirm, onCancel }) => {
    const { t } = useTranslation('sqlRunner');
    return (
        <Paper withBorder p="xs" mb="xs">
            <Stack gap="xs">
                <Text fz="sm" fw={600}>
                    {t('connectionSwitch.title', {
                        name: pendingSwitch.connectionName,
                    })}
                </Text>
                <Text fz="xs" c="dimmed">
                    {t('connectionSwitch.description', {
                        table: pendingSwitch.qualifiedName,
                    })}
                </Text>
                <Group gap="xs">
                    <Button size="xs" onClick={onConfirm}>
                        {t('connectionSwitch.confirm')}
                    </Button>
                    <Button size="xs" variant="default" onClick={onCancel}>
                        {activeConnectionName
                            ? t('connectionSwitch.keepNamed', {
                                  name: activeConnectionName,
                              })
                            : t('connectionSwitch.keepThis')}
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
};
