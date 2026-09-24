import { type ApiError } from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import {
    collectEnabledUnits,
    defaultExpandedRowIds,
    tableUnitId,
    type TableUnitKey,
    type TableUnitState,
    type TreeConnection,
} from '../utils/warehouseTreeRows';
import { useActiveConnection } from './useActiveConnection';
import {
    useConnectionDatabases,
    useTableUnits,
    type TableUnits,
} from './useConnectionCatalog';

const IDLE_UNIT: TableUnitState = { status: 'idle' };

const isForbiddenCatalogError = (error: ApiError | null): boolean =>
    error?.error.statusCode === 403 || error?.error.name === 'ForbiddenError';

export type WarehouseTree = {
    connections: TreeConnection[];
    getUnitState: (unit: TableUnitKey) => TableUnitState;
    loadedCatalogs: TableUnits['loadedCatalogs'];
    retry: (unit: TableUnitKey) => void;
    isRowExpanded: (rowId: string) => boolean;
    onConnectionExpanded: (connectionId: string) => void;
    isLoading: boolean;
    listingError: ApiError | null;
    listingForbidden: boolean;
    isSuccess: boolean;
};

export const useWarehouseTree = ({
    isRowExpandedByOverride,
}: {
    isRowExpandedByOverride: (rowId: string) => boolean | undefined;
}): WarehouseTree => {
    const {
        projectUuid,
        connections: projectConnections,
        activeConnectionUuid,
    } = useActiveConnection();

    const connectionIds = useMemo(
        () =>
            projectConnections.map(
                (connection) => connection.warehouseConnectionUuid,
            ),
        [projectConnections],
    );

    const [expandedConnectionIds, setExpandedConnectionIds] = useState<
        ReadonlySet<string>
    >(() => new Set<string>());

    const enabledConnectionIds = useMemo(() => {
        const enabled = new Set(expandedConnectionIds);
        if (activeConnectionUuid) enabled.add(activeConnectionUuid);
        return enabled;
    }, [expandedConnectionIds, activeConnectionUuid]);

    const {
        listings,
        isLoading: isConnectionLoading,
        errorFor,
    } = useConnectionDatabases({
        projectUuid,
        connectionIds,
        enabledConnectionIds,
    });

    const connections = useMemo<TreeConnection[]>(
        () =>
            projectConnections.map((connection) => {
                const connectionId = connection.warehouseConnectionUuid;
                const listing = listings.get(connectionId);
                const error = errorFor(connectionId);
                return {
                    connectionId,
                    connectionName: connection.name,
                    isActive: connectionId === activeConnectionUuid,
                    databases: listing?.databases ?? [],
                    listingStatus: listing
                        ? ('loaded' as const)
                        : error
                          ? ('error' as const)
                          : ('loading' as const),
                    ...(error
                        ? {
                              listingError: error.error.message,
                              listingForbidden: isForbiddenCatalogError(error),
                          }
                        : {}),
                    truncated: listing?.truncated ?? false,
                    limit: listing?.limit ?? 0,
                };
            }),
        [projectConnections, listings, errorFor, activeConnectionUuid],
    );

    const isLoading =
        activeConnectionUuid !== undefined &&
        isConnectionLoading(activeConnectionUuid);
    const listingError =
        activeConnectionUuid !== undefined
            ? errorFor(activeConnectionUuid)
            : null;
    const isSuccess =
        activeConnectionUuid !== undefined &&
        listings.has(activeConnectionUuid);

    const defaults = useMemo(
        () => defaultExpandedRowIds(connections),
        [connections],
    );
    const isRowExpanded = useCallback(
        (rowId: string) =>
            isRowExpandedByOverride(rowId) ?? defaults[rowId] ?? false,
        [isRowExpandedByOverride, defaults],
    );

    const units = useMemo(
        () =>
            connections.flatMap((connection) =>
                connection.databases.map((entry) => ({
                    connectionId: connection.connectionId,
                    warehouseConnectionUuid: connection.connectionId,
                    database: entry.name,
                })),
            ),
        [connections],
    );

    const enabledUnitIds = useMemo(
        () =>
            new Set(
                collectEnabledUnits(connections, isRowExpanded).map(
                    tableUnitId,
                ),
            ),
        [connections, isRowExpanded],
    );

    const { states, loadedCatalogs, retry } = useTableUnits({
        projectUuid,
        units,
        enabledUnitIds,
    });

    const getUnitState = useCallback(
        (unit: TableUnitKey) => states.get(tableUnitId(unit)) ?? IDLE_UNIT,
        [states],
    );

    const onConnectionExpanded = useCallback((connectionId: string) => {
        setExpandedConnectionIds((previous) =>
            new Set(previous).add(connectionId),
        );
    }, []);

    return {
        connections,
        getUnitState,
        loadedCatalogs,
        retry,
        isRowExpanded,
        onConnectionExpanded,
        isLoading,
        listingError,
        listingForbidden: isForbiddenCatalogError(listingError),
        isSuccess,
    };
};
