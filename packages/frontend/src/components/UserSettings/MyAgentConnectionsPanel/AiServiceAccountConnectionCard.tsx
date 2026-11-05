import { type WarehouseTypes } from '@lightdash/common';
import { Paper } from '@mantine/core';
import { SettingRow } from '../../common/Settings/SettingLayout';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/utils';

export const AiServiceAccountConnectionRow = ({
    warehouseType,
}: {
    warehouseType: WarehouseTypes;
}) => {
    const warehouseName = getWarehouseLabel(warehouseType) ?? warehouseType;
    return (
        <SettingRow
            title={warehouseName}
            description={`Agents on ${warehouseName} projects run as a shared agent account that your admin set up. They read only what that account can read. Your own access doesn't change.`}
        />
    );
};

export const AiServiceAccountConnectionCard = ({
    warehouseType,
}: {
    warehouseType: WarehouseTypes;
}) => (
    <Paper p="md">
        <AiServiceAccountConnectionRow warehouseType={warehouseType} />
    </Paper>
);
