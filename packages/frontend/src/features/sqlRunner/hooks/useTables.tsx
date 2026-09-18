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
import { type TableUnitState } from '../utils/tableRows';

export type GetTablesParams = {
    projectUuid: string;
    database: string | undefined;
};

const databasesQueryKey = (projectUuid: string) => [
    'sqlRunner',
    'databases',
    projectUuid,
];

const tablesQueryKey = (projectUuid: string, database: string) => [
    'sqlRunner',
    'tables',
    projectUuid,
    database,
];

const fetchDatabases = async (projectUuid: string) =>
    lightdashApi<WarehouseDatabaseListing>({
        url: `/projects/${projectUuid}/sqlRunner/databases`,
        method: 'GET',
        body: undefined,
    });

const fetchTables = async (projectUuid: string, database: string) => {
    const query = new URLSearchParams({ database }).toString();
    return lightdashApi<WarehouseTablesCatalog>({
        url: `/projects/${projectUuid}/sqlRunner/tables?${query}`,
        method: 'GET',
        body: undefined,
    });
};

const refreshTables = async (projectUuid: string) =>
    lightdashApi<WarehouseTablesCatalog>({
        url: `/projects/${projectUuid}/sqlRunner/refresh-catalog`,
        method: 'POST',
        body: undefined,
    });

export const useDatabases = ({ projectUuid }: { projectUuid: string }) =>
    useQuery<WarehouseDatabaseListing, ApiError>({
        queryKey: databasesQueryKey(projectUuid),
        queryFn: () => fetchDatabases(projectUuid),
        retry: false,
        enabled: !!projectUuid,
    });

export const useTables = ({ projectUuid, database }: GetTablesParams) =>
    useQuery<WarehouseTablesCatalog, ApiError>({
        queryKey: tablesQueryKey(projectUuid, database ?? ''),
        queryFn: () => fetchTables(projectUuid, database ?? ''),
        retry: false,
        enabled: !!projectUuid && !!database,
    });

export const useRefreshTables = ({ projectUuid }: { projectUuid: string }) => {
    const queryClient = useQueryClient();

    return useMutation<WarehouseTablesCatalog, ApiError>(
        () => refreshTables(projectUuid),
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries(
                    databasesQueryKey(projectUuid),
                );
                await queryClient.invalidateQueries([
                    'sqlRunner',
                    'tables',
                    projectUuid,
                ]);
            },
        },
    );
};

export type TableUnits = {
    states: Map<string, TableUnitState>;
    loadedCatalogs: WarehouseTablesCatalog[];
    retry: (database: string) => void;
};

// useQueries returns a new array every render, so memos key off the one
// signature that changes when a unit's data, error or fetch state changes.
const resultsSignature = (
    databases: string[],
    results: { status: string; fetchStatus: string; dataUpdatedAt: number }[],
) =>
    results
        .map(
            (result, index) =>
                `${databases[index]}:${result.status}:${result.fetchStatus}:${result.dataUpdatedAt}`,
        )
        .join('|');

/**
 * One query per listed database. A database is fetched once the tree expands
 * it; collapsing it keeps the cached tables so the row reopens without a call.
 */
export const useTableUnits = ({
    projectUuid,
    databases,
    enabledDatabases,
}: {
    projectUuid: string;
    databases: string[];
    enabledDatabases: ReadonlySet<string>;
}): TableUnits => {
    const queryClient = useQueryClient();

    const results = useQueries({
        queries: databases.map((database) => ({
            queryKey: tablesQueryKey(projectUuid, database),
            queryFn: () => fetchTables(projectUuid, database),
            retry: false,
            enabled: !!projectUuid && enabledDatabases.has(database),
        })),
    });

    const signature = resultsSignature(databases, results);

    const states = useMemo(() => {
        const byDatabase = new Map<string, TableUnitState>();
        databases.forEach((database, index) => {
            const result = results[index];
            if (result?.data) {
                byDatabase.set(database, {
                    status: 'loaded',
                    catalog: result.data,
                });
            } else if (result?.isError) {
                byDatabase.set(database, {
                    status: 'error',
                    message:
                        (result.error as ApiError | null)?.error?.message ??
                        'Failed to load tables',
                });
            } else if (result?.fetchStatus === 'fetching') {
                byDatabase.set(database, { status: 'loading' });
            } else {
                byDatabase.set(database, { status: 'idle' });
            }
        });
        return byDatabase;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    const loadedCatalogs = useMemo(
        () =>
            [...states.values()].flatMap((state) =>
                state.status === 'loaded' ? [state.catalog] : [],
            ),
        [states],
    );

    const retry = useCallback(
        (database: string) => {
            void queryClient.refetchQueries(
                tablesQueryKey(projectUuid, database),
            );
        },
        [queryClient, projectUuid],
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
}: {
    projectUuid: string;
    databases: string[];
}): WarehouseTablesCatalog => {
    const results = useQueries({
        queries: databases.map((database) => ({
            queryKey: tablesQueryKey(projectUuid, database),
            queryFn: () => fetchTables(projectUuid, database),
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
