import {
    ExploreType,
    type SummaryExplore,
    type WarehouseConnectionForUserCredentials,
} from '@lightdash/common';

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

/**
 * The warehouse connection badge for an explore. A live data source explore
 * reads an integration's API rather than a warehouse, so it has no badge.
 */
export const getExploreConnectionName = (
    connections: WarehouseConnectionForUserCredentials[] | null,
    explore: Pick<SummaryExplore, 'type' | 'warehouseConnectionUuid'>,
): string | null =>
    explore.type === ExploreType.API_SOURCE
        ? null
        : getConnectionName(connections, explore.warehouseConnectionUuid);
