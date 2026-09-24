import {
    type ApiError,
    type SqlRunnerWarehouseConnection,
    type WarehouseDatabaseListing,
    type WarehouseTablesCatalog,
    type WarehouseTableSchema,
} from '@lightdash/common';
import {
    useMutation,
    useQueries,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { lightdashApi } from '../../../../api';
import {
    tableUnitId,
    type TableIdentity,
    type TableUnitKey,
    type TableUnitState,
} from '../utils/warehouseTreeRows';

const CONNECTION_POLL_MS = 15_000;

const connectionsUrl = (projectUuid: string) =>
    `/projects/${projectUuid}/sqlRunner/connections`;

const connectionUrl = (projectUuid: string, warehouseConnectionUuid: string) =>
    `${connectionsUrl(projectUuid)}/${warehouseConnectionUuid}`;

export const sqlRunnerConnectionsQueryKey = (projectUuid: string) => [
    'sqlRunner',
    'connections',
    projectUuid,
];

const databasesQueryKey = (
    projectUuid: string,
    warehouseConnectionUuid: string,
) => [
    'sqlRunner',
    'connections',
    projectUuid,
    warehouseConnectionUuid,
    'databases',
];

const tablesQueryKey = (
    projectUuid: string,
    warehouseConnectionUuid: string,
    database: string,
) => [
    'sqlRunner',
    'connections',
    projectUuid,
    warehouseConnectionUuid,
    'tables',
    database,
];

export const tableFieldsQueryKey = (
    projectUuid: string,
    identity: TableIdentity,
) => [
    'sqlRunner',
    'connections',
    projectUuid,
    identity.connectionId,
    'fields',
    identity.database,
    identity.schema,
    identity.table,
];

const fetchDatabases = (projectUuid: string, warehouseConnectionUuid: string) =>
    lightdashApi<WarehouseDatabaseListing>({
        url: `${connectionUrl(projectUuid, warehouseConnectionUuid)}/databases`,
        method: 'GET',
        body: undefined,
    });

const fetchTables = (
    projectUuid: string,
    warehouseConnectionUuid: string,
    database: string,
) =>
    lightdashApi<WarehouseTablesCatalog>({
        url: `${connectionUrl(
            projectUuid,
            warehouseConnectionUuid,
        )}/tables?${new URLSearchParams({ database }).toString()}`,
        method: 'GET',
        body: undefined,
    });

export const fetchTableFields = (
    projectUuid: string,
    identity: TableIdentity,
) =>
    lightdashApi<WarehouseTableSchema>({
        url: `${connectionUrl(
            projectUuid,
            identity.connectionId,
        )}/fields?${new URLSearchParams({
            databaseName: identity.database,
            schemaName: identity.schema,
            tableName: identity.table,
        }).toString()}`,
        method: 'GET',
        body: undefined,
    });

export const useSqlRunnerConnections = (
    projectUuid: string,
    enabled: boolean,
) =>
    useQuery<SqlRunnerWarehouseConnection[], ApiError>({
        queryKey: sqlRunnerConnectionsQueryKey(projectUuid),
        queryFn: () =>
            lightdashApi<SqlRunnerWarehouseConnection[]>({
                url: connectionsUrl(projectUuid),
                method: 'GET',
                body: undefined,
            }),
        enabled: enabled && !!projectUuid,
        retry: false,
        refetchInterval: CONNECTION_POLL_MS,
        refetchOnWindowFocus: true,
    });

export const useRefreshConnectionCatalog = (
    projectUuid: string,
    warehouseConnectionUuid: string | undefined,
) => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError>(
        async () => {
            if (!warehouseConnectionUuid) return undefined;
            return lightdashApi<undefined>({
                url: `${connectionUrl(
                    projectUuid,
                    warehouseConnectionUuid,
                )}/refresh-catalog`,
                method: 'POST',
                body: undefined,
            });
        },
        {
            onSuccess: async () => {
                if (!warehouseConnectionUuid) return;
                await queryClient.invalidateQueries([
                    'sqlRunner',
                    'connections',
                    projectUuid,
                    warehouseConnectionUuid,
                ]);
            },
        },
    );
};

export const useConnectionTableFields = ({
    projectUuid,
    identity,
}: {
    projectUuid: string;
    identity: TableIdentity | undefined;
}) =>
    useQuery<WarehouseTableSchema, ApiError>({
        queryKey: identity
            ? tableFieldsQueryKey(projectUuid, identity)
            : ['sqlRunner', 'connections', projectUuid, 'fields'],
        queryFn: () =>
            identity
                ? fetchTableFields(projectUuid, identity)
                : Promise.reject(new Error('No table selected')),
        retry: false,
        enabled: !!identity,
    });

export type TableUnit = TableUnitKey & { warehouseConnectionUuid: string };

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

const useSignatureMemo = <T>(signature: string, compute: () => T): T => {
    const [memo, setMemo] = useState(() => ({ signature, value: compute() }));
    if (memo.signature === signature) return memo.value;
    const next = { signature, value: compute() };
    setMemo(next);
    return next.value;
};

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

export const useConnectionDatabases = ({
    projectUuid,
    connectionIds,
    enabledConnectionIds,
}: {
    projectUuid: string;
    connectionIds: string[];
    enabledConnectionIds: ReadonlySet<string>;
}): ConnectionDatabases => {
    const results = useQueries({
        queries: connectionIds.map((connectionId) => ({
            queryKey: databasesQueryKey(projectUuid, connectionId),
            queryFn: () => fetchDatabases(projectUuid, connectionId),
            retry: false,
            enabled: !!projectUuid && enabledConnectionIds.has(connectionId),
        })),
    });

    const signature = resultsSignature(connectionIds, results);

    return useSignatureMemo(signature, () => {
        const listings = new Map<string, WarehouseDatabaseListing>();
        const loading = new Set<string>();
        const errors = new Map<string, ApiError>();
        connectionIds.forEach((connectionId, index) => {
            const result = results[index];
            if (result?.data) {
                listings.set(connectionId, result.data);
            } else if (result?.isError) {
                errors.set(connectionId, result.error as ApiError);
            } else if (result?.fetchStatus === 'fetching') {
                loading.add(connectionId);
            }
        });
        return {
            listings,
            isLoading: (connectionId: string) => loading.has(connectionId),
            errorFor: (connectionId: string) =>
                errors.get(connectionId) ?? null,
        };
    });
};

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
                unit.warehouseConnectionUuid,
                unit.database,
            ),
            queryFn: () =>
                fetchTables(
                    projectUuid,
                    unit.warehouseConnectionUuid,
                    unit.database,
                ),
            retry: false,
            enabled: !!projectUuid && enabledUnitIds.has(tableUnitId(unit)),
        })),
    });

    const signature = resultsSignature(units.map(tableUnitId), results);

    const states = useSignatureMemo(signature, () => {
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
    });

    const loadedCatalogs = useMemo(
        () =>
            [...states.values()].flatMap((state) =>
                state.status === 'loaded' ? [state.catalog] : [],
            ),
        [states],
    );

    const unitsById = useSignatureMemo(
        units.map(tableUnitId).join('|'),
        () => new Map(units.map((unit) => [tableUnitId(unit), unit])),
    );

    const retry = useCallback(
        (key: TableUnitKey) => {
            const unit = unitsById.get(tableUnitId(key));
            if (!unit) return;
            void queryClient.refetchQueries(
                tablesQueryKey(
                    projectUuid,
                    unit.warehouseConnectionUuid,
                    unit.database,
                ),
            );
        },
        [queryClient, projectUuid, unitsById],
    );

    return { states, loadedCatalogs, retry };
};
