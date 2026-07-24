import { WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
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
