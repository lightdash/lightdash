import { type ApiError } from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import {
    collectEnabledUnits,
    defaultExpandedRowIds,
    tableUnitId,
    type TableUnitKey,
    type TableUnitState,
    type TreeConnection,
} from '../utils/tableRows';
import { useActiveConnection } from './useActiveConnection';
import { useConnectionDatabases, useTableUnits } from './useTables';

const IDLE_UNIT: TableUnitState = { status: 'idle' };

export type WarehouseTree = {
    connections: TreeConnection[];
    getUnitState: (unit: TableUnitKey) => TableUnitState;
    loadedCatalogs: ReturnType<typeof useTableUnits>['loadedCatalogs'];
    retry: (unit: TableUnitKey) => void;
    isRowExpanded: (rowId: string) => boolean;
    onConnectionExpanded: (connectionId: string) => void;
    isLoading: boolean;
    listingError: ApiError | null;
    isSuccess: boolean;
};

/**
 * Assembles the sidebar tree: one connection per project connection, each
 * listing its databases when the tree opens it, and each database loading its
 * tables when that row opens.
 */
export const useWarehouseTree = ({
    projectUuid,
    warehouseConnectionType,
    isRowExpandedByOverride,
}: {
    projectUuid: string;
    warehouseConnectionType: string | undefined;
    isRowExpandedByOverride: (rowId: string) => boolean | undefined;
}): WarehouseTree => {
    const { connections: projectConnections, activeConnectionUuid } =
        useActiveConnection();

    // Projects with no connection row yet still list through the project alone
    const treeSources = useMemo(
        () =>
            projectConnections.length > 0
                ? projectConnections.map((connection) => ({
                      connectionId: connection.connectionUuid,
                      connectionUuid: connection.connectionUuid as
                          | string
                          | undefined,
                      connectionName: connection.name,
                      isActive:
                          connection.connectionUuid === activeConnectionUuid,
                  }))
                : [
                      {
                          connectionId: projectUuid,
                          connectionUuid: undefined,
                          connectionName:
                              warehouseConnectionType ?? 'Connection',
                          isActive: true,
                      },
                  ],
        [
            projectConnections,
            activeConnectionUuid,
            projectUuid,
            warehouseConnectionType,
        ],
    );

    const [expandedConnectionIds, setExpandedConnectionIds] = useState<
        ReadonlySet<string>
    >(() => new Set<string>());

    // The active connection lists on mount; the rest list when opened
    const enabledConnectionIds = useMemo(() => {
        const enabled = new Set(expandedConnectionIds);
        treeSources.forEach((source) => {
            if (source.isActive) enabled.add(source.connectionId);
        });
        return enabled;
    }, [expandedConnectionIds, treeSources]);

    const {
        listings,
        isLoading: isConnectionLoading,
        errorFor,
    } = useConnectionDatabases({
        projectUuid,
        connections: treeSources,
        enabledConnectionIds,
    });

    const connections = useMemo<TreeConnection[]>(
        () =>
            treeSources.flatMap((source) => {
                const listing = listings.get(source.connectionId);
                if (!listing) return [];
                return [
                    {
                        connectionId: source.connectionId,
                        connectionName: source.connectionName,
                        isActive: source.isActive,
                        databases: listing.databases,
                        truncated: listing.truncated,
                        limit: listing.limit,
                    },
                ];
            }),
        [treeSources, listings],
    );

    const activeSource = treeSources.find((source) => source.isActive);
    const isLoading =
        activeSource !== undefined &&
        isConnectionLoading(activeSource.connectionId);
    const listingError =
        activeSource !== undefined ? errorFor(activeSource.connectionId) : null;
    const isSuccess = connections.length > 0;

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
            connections.flatMap((connection) => {
                const source = treeSources.find(
                    (candidate) =>
                        candidate.connectionId === connection.connectionId,
                );
                return connection.databases.map((entry) => ({
                    connectionId: connection.connectionId,
                    connectionUuid: source?.connectionUuid,
                    database: entry.name,
                }));
            }),
        [connections, treeSources],
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
        isSuccess,
    };
};
