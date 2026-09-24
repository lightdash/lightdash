import { WarehouseTypes } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it } from 'vitest';
import { store } from '../store';
import {
    resetState,
    setConnectionRoute,
    type SqlRunnerConnection,
} from '../store/sqlRunnerSlice';
import { useSavedChartConnection } from './useSavedChartConnection';

const wrapper: FC<PropsWithChildren> = ({ children }) => (
    <Provider store={store}>{children}</Provider>
);

const finance: SqlRunnerConnection = {
    warehouseConnectionUuid: 'finance-uuid',
    name: 'Finance',
    warehouseType: WarehouseTypes.POSTGRES,
};
const original: SqlRunnerConnection = {
    warehouseConnectionUuid: null,
    name: 'Warehouse',
    warehouseType: WarehouseTypes.POSTGRES,
};

describe('useSavedChartConnection', () => {
    beforeEach(() => {
        store.dispatch(resetState());
    });

    it('moving a chart from an extra connection to the original is a change saved as an explicit null', () => {
        store.dispatch(
            setConnectionRoute({ route: 'multi', connection: finance }),
        );
        const { result } = renderHook(
            () =>
                useSavedChartConnection({
                    warehouseConnectionUuid: 'finance-uuid',
                }),
            { wrapper },
        );
        expect(result.current.hasConnectionChange).toBe(false);

        act(() => {
            store.dispatch(
                setConnectionRoute({ route: 'multi', connection: original }),
            );
        });

        expect(result.current.hasConnectionChange).toBe(true);
        expect(result.current.connectionRequest).toEqual({
            ready: true,
            field: { warehouseConnectionUuid: null },
        });

        act(() => result.current.markSaved());

        expect(result.current.hasConnectionChange).toBe(false);
    });

    it('a single project has no connection change and no connection field', () => {
        store.dispatch(setConnectionRoute({ route: 'single' }));
        const { result } = renderHook(
            () => useSavedChartConnection({ warehouseConnectionUuid: null }),
            { wrapper },
        );

        expect(result.current.hasConnectionChange).toBe(false);
        expect(result.current.connectionRequest).toEqual({
            ready: true,
            field: {},
        });
    });
});
