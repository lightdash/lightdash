import { WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    clearMissingConnection,
    initialState,
    setConnectionUuid,
    setState,
    setWarehouseConnectionType,
    sqlRunnerSlice,
    switchActiveConnection,
    toggleActiveTable,
} from './sqlRunnerSlice';
import { runSqlQuery } from './thunks';

const { reducer } = sqlRunnerSlice;

describe('sqlRunnerSlice warehouseConnectionType', () => {
    it('setState replaces the slice and clears warehouseConnectionType when the payload omits it', () => {
        // Simulates a share link (e.g. from the MCP `run_sql` tool) whose payload
        // has no warehouseConnectionType: useSqlRunnerShareUrl spreads it over
        // initialState, so the value arrives as undefined.
        const withWarehouse = reducer(
            undefined,
            setWarehouseConnectionType(WarehouseTypes.SNOWFLAKE),
        );
        expect(withWarehouse.warehouseConnectionType).toBe(
            WarehouseTypes.SNOWFLAKE,
        );

        const sharePayload = {
            ...initialState,
            sql: 'SELECT 1',
            fetchResultsOnLoad: true,
        };
        const afterSetState = reducer(withWarehouse, setState(sharePayload));

        expect(afterSetState.warehouseConnectionType).toBeUndefined();
    });

    it('setWarehouseConnectionType restores the value after it was clobbered (not permanently lost)', () => {
        const clobbered = reducer(
            undefined,
            setState({ ...initialState, sql: 'SELECT 1' }),
        );
        expect(clobbered.warehouseConnectionType).toBeUndefined();

        const restored = reducer(
            clobbered,
            setWarehouseConnectionType(WarehouseTypes.POSTGRES),
        );

        expect(restored.warehouseConnectionType).toBe(WarehouseTypes.POSTGRES);
    });
});

describe('sqlRunnerSlice connection bindings', () => {
    it('keeps completed results pinned when the active connection changes', () => {
        const completed = reducer(
            reducer(undefined, setConnectionUuid('connection-before-run')),
            runSqlQuery.fulfilled(
                {
                    queryUuid: 'query-uuid',
                    fileUrl: undefined,
                    results: [],
                    columns: [],
                },
                'request-id',
                {
                    projectUuid: 'project-uuid',
                    sql: 'select 1',
                    limit: 500,
                    parameterValues: {},
                    connectionUuid: 'result-connection-uuid',
                },
            ),
        );

        const afterChangingActiveConnection = reducer(
            completed,
            setConnectionUuid('active-connection-uuid'),
        );

        expect(afterChangingActiveConnection.connectionUuid).toBe(
            'active-connection-uuid',
        );
        expect(afterChangingActiveConnection.resultConnectionUuid).toBe(
            'result-connection-uuid',
        );
    });

    it('captures the server-resolved connection when the request omitted it', () => {
        const completed = reducer(
            undefined,
            runSqlQuery.fulfilled(
                {
                    queryUuid: 'query-uuid',
                    connectionUuid: 'server-resolved-connection-uuid',
                    fileUrl: undefined,
                    results: [],
                    columns: [],
                },
                'request-id',
                {
                    projectUuid: 'project-uuid',
                    sql: 'select 1',
                    limit: 500,
                    parameterValues: {},
                },
            ),
        );

        expect(completed.connectionUuid).toBeUndefined();
        expect(completed.resultConnectionUuid).toBe(
            'server-resolved-connection-uuid',
        );
    });
});

describe('sqlRunnerSlice switching the active connection', () => {
    const completedRun = (connectionUuid: string) =>
        reducer(
            reducer(undefined, setConnectionUuid(connectionUuid)),
            runSqlQuery.fulfilled(
                {
                    queryUuid: 'query-uuid',
                    fileUrl: 'file-url',
                    results: [{ id: 1 }],
                    columns: [{ reference: 'id' }],
                },
                'request-id',
                {
                    projectUuid: 'project-uuid',
                    sql: 'select 1',
                    limit: 500,
                    parameterValues: {},
                    connectionUuid,
                },
            ),
        );

    it('clears the results a switch leaves behind', () => {
        const completed = completedRun('connection-1');
        expect(completed.sqlRows).toHaveLength(1);

        const switched = reducer(
            completed,
            switchActiveConnection('connection-2'),
        );

        expect(switched.connectionUuid).toBe('connection-2');
        expect(switched.sqlRows).toBeUndefined();
        expect(switched.sqlColumns).toBeUndefined();
        expect(switched.queryUuid).toBeUndefined();
        expect(switched.fileUrl).toBeUndefined();
        expect(switched.resultConnectionUuid).toBeUndefined();
        expect(switched.resultsTableConfig).toBeUndefined();
    });

    it('clears the selected table, which belongs to the old catalog', () => {
        const withTable = reducer(
            reducer(undefined, setConnectionUuid('connection-1')),
            toggleActiveTable({
                table: 'orders',
                schema: 'jaffle',
                database: 'raw',
            }),
        );
        expect(withTable.activeTable).toBe('orders');

        const switched = reducer(
            withTable,
            switchActiveConnection('connection-2'),
        );

        expect(switched.activeTable).toBeUndefined();
        expect(switched.activeSchema).toBeUndefined();
        expect(switched.activeDatabase).toBeUndefined();
    });

    it('leaves results alone when the switch selects the active connection', () => {
        const completed = completedRun('connection-1');

        const unchanged = reducer(
            completed,
            switchActiveConnection('connection-1'),
        );

        expect(unchanged.sqlRows).toHaveLength(1);
        expect(unchanged.resultConnectionUuid).toBe('connection-1');
    });

    it('seeds a connection without discarding results', () => {
        const completed = completedRun('connection-1');

        const seeded = reducer(completed, setConnectionUuid('connection-2'));

        expect(seeded.connectionUuid).toBe('connection-2');
        expect(seeded.sqlRows).toHaveLength(1);
        expect(seeded.resultConnectionUuid).toBe('connection-1');
    });
});

describe('sqlRunnerSlice clearMissingConnection', () => {
    const withResults = {
        ...initialState,
        connectionUuid: 'connection-marketing',
        resultConnectionUuid: 'connection-marketing',
        activeTable: 'campaigns',
        activeSchema: 'public',
        activeDatabase: 'acc_marketing',
        sqlColumns: [],
        sqlRows: [{ ok: 1 }],
        queryError: new Error('Connection not found'),
        queryIsLoading: true,
    } as typeof initialState;

    it('drops the connection and the table it belonged to', () => {
        const state = reducer(withResults, clearMissingConnection());

        expect(state.connectionUuid).toBeUndefined();
        expect(state.activeTable).toBeUndefined();
        expect(state.activeSchema).toBeUndefined();
        expect(state.activeDatabase).toBeUndefined();
        expect(state.queryError).toBeUndefined();
        expect(state.queryIsLoading).toBe(false);
    });

    it('keeps the results already on screen', () => {
        const state = reducer(withResults, clearMissingConnection());

        expect(state.sqlRows).toEqual([{ ok: 1 }]);
        expect(state.sqlColumns).toEqual([]);
        expect(state.resultConnectionUuid).toBe('connection-marketing');
    });
});
