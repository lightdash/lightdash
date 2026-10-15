import { type WarehouseTypes } from '@lightdash/common';
import { Paper, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/utils';

export const AiServiceAccountConnectionCard = ({
    warehouseType,
}: {
    warehouseType: WarehouseTypes;
}) => {
    const { t } = useTranslation('userSettings');
    const warehouseName = getWarehouseLabel(warehouseType);
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>{warehouseName}</Title>
                <Text fz="sm" c="dimmed">
                    {t(
                        'myAgentConnectionsPanel.aiServiceAccountConnectionCard.description',
                        {
                            warehouseName,
                        },
                    )}
                </Text>
            </Stack>
        </Paper>
    );
};
