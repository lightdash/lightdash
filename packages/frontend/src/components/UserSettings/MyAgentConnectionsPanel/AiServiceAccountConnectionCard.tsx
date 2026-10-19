import { type WarehouseTypes } from '@lightdash/common';
import { Paper, Stack, Text, Title } from '@mantine/core';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/utils';

export const AiServiceAccountConnectionCard = ({
    warehouseType,
}: {
    warehouseType: WarehouseTypes;
}) => {
    const warehouseName = getWarehouseLabel(warehouseType);
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>{warehouseName}</Title>
                <Text fz="sm" c="dimmed">
                    {`Agents on ${warehouseName} projects run as a shared agent account that your admin set up. They read only what that account can read. Your own access doesn't change.`}
                </Text>
            </Stack>
        </Paper>
    );
};
