import { DimensionType, WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    hydrateSqlQueryResults,
    initialState,
    setState,
    setWarehouseConnectionType,
    sqlRunnerSlice,
} from './sqlRunnerSlice';

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

describe('sqlRunnerSlice hydrateSqlQueryResults', () => {
    it('hydrates raw SQL results and creates a visible table config', () => {
        const state = reducer(
            undefined,
            hydrateSqlQueryResults({
                projectUuid: 'project-uuid',
                queryUuid: 'query-uuid',
                sql: 'select 1 as answer',
                limit: 500,
                fileUrl: undefined,
                columns: [
                    {
                        reference: 'answer',
                        type: DimensionType.NUMBER,
                    },
                ],
                results: [{ answer: 1 }],
            }),
        );

        expect(state).toMatchObject({
            projectUuid: 'project-uuid',
            queryUuid: 'query-uuid',
            sql: 'select 1 as answer',
            limit: 500,
            sqlRows: [{ answer: 1 }],
            resultsTableConfig: {
                columns: {
                    answer: {
                        visible: true,
                        reference: 'answer',
                        label: 'answer',
                    },
                },
            },
        });
    });
});
