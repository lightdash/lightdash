import {
    type ApiError,
    type WarehouseDatabaseListing,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import {
    useMutation,
    useQueries,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../../../api';
import {
    tableUnitId,
    type TableUnitKey,
    type TableUnitState,
} from '../utils/tableRows';

export type GetTablesParams = {
    projectUuid: string;
    database: string | undefined;
    connectionUuid?: string;
};

export const databasesQueryKey = (
    projectUuid: string,
    connectionUuid?: string,
) => ['sqlRunner', 'databases', projectUuid, connectionUuid];

export const tablesQueryKey = (
    projectUuid: string,
    database: string,
    connectionUuid?: string,
) => ['sqlRunner', 'tables', projectUuid, connectionUuid, database];

const fetchDatabases = async (projectUuid: string, connectionUuid?: string) =>
    lightdashApi<WarehouseDatabaseListing>({
        url: `/projects/${projectUuid}/sqlRunner/databases${
            connectionUuid
                ? `?${new URLSearchParams({ connectionUuid }).toString()}`
                : ''
        }`,
        method: 'GET',
        body: undefined,
    });

const fetchTables = async (
    projectUuid: string,
    database: string,
    connectionUuid?: string,
) => {
    const query = new URLSearchParams({
        database,
        ...(connectionUuid ? { connectionUuid } : {}),
    }).toString();
    return lightdashApi<WarehouseTablesCatalog>({
        url: `/projects/${projectUuid}/sqlRunner/tables?${query}`,
        method: 'GET',
        body: undefined,
    });
};

const refreshTables = async (projectUuid: string, connectionUuid?: string) =>
    lightdashApi<WarehouseTablesCatalog>({
        url: `/projects/${projectUuid}/sqlRunner/refresh-catalog${
            connectionUuid
                ? `?${new URLSearchParams({ connectionUuid }).toString()}`
                : ''
        }`,
        method: 'POST',
        body: undefined,
    });

export const useDatabases = ({
    projectUuid,
    connectionUuid,
}: {
    projectUuid: string;
    connectionUuid?: string;
}) =>
    useQuery<WarehouseDatabaseListing, ApiError>({
        queryKey: databasesQueryKey(projectUuid, connectionUuid),
        queryFn: () => fetchDatabases(projectUuid, connectionUuid),
        retry: false,
        enabled: !!projectUuid,
    });

export const useTables = ({
    projectUuid,
    database,
    connectionUuid,
}: GetTablesParams) =>
    useQuery<WarehouseTablesCatalog, ApiError>({
        queryKey: tablesQueryKey(projectUuid, database ?? '', connectionUuid),
        queryFn: () => fetchTables(projectUuid, database ?? '', connectionUuid),
        retry: false,
        enabled: !!projectUuid && !!database,
    });

export const useRefreshTables = ({
    projectUuid,
    connectionUuid,
}: {
    projectUuid: string;
    connectionUuid?: string;
}) => {
    const queryClient = useQueryClient();

    return useMutation<WarehouseTablesCatalog, ApiError>(
        () => refreshTables(projectUuid, connectionUuid),
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries(
                    databasesQueryKey(projectUuid, connectionUuid),
                );
                await queryClient.invalidateQueries([
                    'sqlRunner',
                    'tables',
                    projectUuid,
                    connectionUuid,
                ]);
            },
        },
    );
};

/** One listed database of one connection, with the uuid its requests carry. */
export type TableUnit = TableUnitKey & {
    connectionUuid: string | undefined;
};

export type ConnectionDatabases = {
    listings: Map<string, WarehouseDatabaseListing>;
    isLoading: (connectionId: string) => boolean;
    errorFor: (connectionId: string) => ApiError | null;
};

export type TableUnits = {
    states: Map<string, TableUnitState>;
    loadedCatalogs: WarehouseTablesCatalog[];
    retry: (unit: TableUnitKey) => void;
};

// useQueries returns a new array every render, so memos key off the one
// signature that changes when a query's data, error or fetch state changes.
const resultsSignature = (
    keys: string[],
    results: { status: string; fetchStatus: string; dataUpdatedAt: number }[],
) =>
    results
        .map(
            (result, index) =>
                `${keys[index]}:${result.status}:${result.fetchStatus}:${result.dataUpdatedAt}`,
        )
        .join('|');

/**
 * One databases call per connection. A connection is listed once the tree
 * expands it, so a project with several connections calls only for the ones
 * the user opens.
 */
export const useConnectionDatabases = ({
    projectUuid,
    connections,
    enabledConnectionIds,
}: {
    projectUuid: string;
    connections: { connectionId: string; connectionUuid: string | undefined }[];
    enabledConnectionIds: ReadonlySet<string>;
}): ConnectionDatabases => {
    const results = useQueries({
        queries: connections.map((connection) => ({
            queryKey: databasesQueryKey(projectUuid, connection.connectionUuid),
            queryFn: () =>
                fetchDatabases(projectUuid, connection.connectionUuid),
            retry: false,
            enabled:
                !!projectUuid &&
                enabledConnectionIds.has(connection.connectionId),
        })),
    });

    const signature = resultsSignature(
        connections.map((connection) => connection.connectionId),
        results,
    );

    return useMemo(() => {
        const listings = new Map<string, WarehouseDatabaseListing>();
        const loading = new Set<string>();
        const errors = new Map<string, ApiError>();
        connections.forEach((connection, index) => {
            const result = results[index];
            if (result?.data) {
                listings.set(connection.connectionId, result.data);
            } else if (result?.isError) {
                errors.set(connection.connectionId, result.error as ApiError);
            } else if (result?.fetchStatus === 'fetching') {
                loading.add(connection.connectionId);
            }
        });
        return {
            listings,
            isLoading: (connectionId: string) => loading.has(connectionId),
            errorFor: (connectionId: string) =>
                errors.get(connectionId) ?? null,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);
};

/**
 * One query per listed database of one connection. A database is fetched once
 * the tree expands it; collapsing it keeps the cached tables so the row
 * reopens without a call.
 */
export const useTableUnits = ({
    projectUuid,
    units,
    enabledUnitIds,
}: {
    projectUuid: string;
    units: TableUnit[];
    enabledUnitIds: ReadonlySet<string>;
}): TableUnits => {
    const queryClient = useQueryClient();

    const results = useQueries({
        queries: units.map((unit) => ({
            queryKey: tablesQueryKey(
                projectUuid,
                unit.database,
                unit.connectionUuid,
            ),
            queryFn: () =>
                fetchTables(projectUuid, unit.database, unit.connectionUuid),
            retry: false,
            enabled: !!projectUuid && enabledUnitIds.has(tableUnitId(unit)),
        })),
    });

    const signature = resultsSignature(units.map(tableUnitId), results);

    const states = useMemo(() => {
        const byUnit = new Map<string, TableUnitState>();
        units.forEach((unit, index) => {
            const result = results[index];
            const id = tableUnitId(unit);
            if (result?.data) {
                byUnit.set(id, { status: 'loaded', catalog: result.data });
            } else if (result?.isError) {
                byUnit.set(id, {
                    status: 'error',
                    message:
                        (result.error as ApiError | null)?.error?.message ??
                        'Failed to load tables',
                });
            } else if (result?.fetchStatus === 'fetching') {
                byUnit.set(id, { status: 'loading' });
            } else {
                byUnit.set(id, { status: 'idle' });
            }
        });
        return byUnit;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    const loadedCatalogs = useMemo(
        () =>
            [...states.values()].flatMap((state) =>
                state.status === 'loaded' ? [state.catalog] : [],
            ),
        [states],
    );

    const unitsById = useMemo(
        () => new Map(units.map((unit) => [tableUnitId(unit), unit])),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [units.map(tableUnitId).join('|')],
    );

    const retry = useCallback(
        (key: TableUnitKey) => {
            const unit = unitsById.get(tableUnitId(key));
            if (!unit) return;
            void queryClient.refetchQueries(
                tablesQueryKey(projectUuid, unit.database, unit.connectionUuid),
            );
        },
        [queryClient, projectUuid, unitsById],
    );

    return { states, loadedCatalogs, retry };
};

const mergeCatalogs = (
    catalogs: WarehouseTablesCatalog[],
): WarehouseTablesCatalog => {
    const merged: WarehouseTablesCatalog = {};
    catalogs.forEach((catalog) => {
        Object.entries(catalog).forEach(([database, schemas]) => {
            const mergedSchemas = merged[database] ?? {};
            Object.entries(schemas).forEach(([schema, tables]) => {
                mergedSchemas[schema] = {
                    ...(mergedSchemas[schema] ?? {}),
                    ...tables,
                };
            });
            merged[database] = mergedSchemas;
        });
    });
    return merged;
};

/**
 * Every listed database the tree has already loaded, read from the query
 * cache. It never fetches, so the editor only ever suggests what the sidebar
 * has pulled in.
 */
export const useLoadedCatalogs = ({
    projectUuid,
    databases,
    connectionUuid,
}: {
    projectUuid: string;
    databases: string[];
    connectionUuid?: string;
}): WarehouseTablesCatalog => {
    const results = useQueries({
        queries: databases.map((database) => ({
            queryKey: tablesQueryKey(projectUuid, database, connectionUuid),
            queryFn: () => fetchTables(projectUuid, database, connectionUuid),
            enabled: false,
        })),
    });

    const signature = resultsSignature(databases, results);

    return useMemo(() => {
        const catalogs = results.flatMap((result) =>
            result.data ? [result.data] : [],
        );
        return mergeCatalogs(catalogs);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);
};
