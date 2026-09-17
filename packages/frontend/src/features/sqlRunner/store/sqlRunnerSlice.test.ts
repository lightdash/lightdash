import { WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    initialState,
    setConnectionUuid,
    setState,
    setWarehouseConnectionType,
    sqlRunnerSlice,
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
