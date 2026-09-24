import { type WarehouseConnectionForUserCredentials } from '@lightdash/common';

export const getConnectionName = (
    connections: WarehouseConnectionForUserCredentials[] | null,
    warehouseConnectionUuid: string | null,
): string | null =>
    connections?.find((connection) =>
        warehouseConnectionUuid === null
            ? connection.isOriginal
            : connection.warehouseConnectionUuid === warehouseConnectionUuid,
    )?.name ?? null;

export const getBindingConnectionUuid = (
    connections: WarehouseConnectionForUserCredentials[],
    warehouseConnectionUuid: string | null,
): string | null =>
    warehouseConnectionUuid ??
    connections.find((connection) => connection.isOriginal)
        ?.warehouseConnectionUuid ??
    null;
