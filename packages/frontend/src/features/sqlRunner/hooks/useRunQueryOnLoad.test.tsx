import { WarehouseTypes } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../store';
import {
    resetState,
    setConnectionRoute,
    setFetchResultsOnLoad,
    setSql,
} from '../store/sqlRunnerSlice';
import { useRunQueryOnLoad } from './useRunQueryOnLoad';

const wrapper: FC<PropsWithChildren> = ({ children }) => (
    <Provider store={store}>{children}</Provider>
);

const connection = (warehouseConnectionUuid: string | null) => ({
    route: 'multi' as const,
    connection: {
        warehouseConnectionUuid,
        name: warehouseConnectionUuid ?? 'Warehouse',
        warehouseType: WarehouseTypes.POSTGRES,
    },
});

describe('useRunQueryOnLoad', () => {
    const runQuery = vi.fn(async () => {});

    beforeEach(() => {
        vi.clearAllMocks();
        store.dispatch(resetState());
        store.dispatch(setSql('select 1'));
        store.dispatch(
            setFetchResultsOnLoad({
                shouldFetch: true,
                shouldOpenChartOnLoad: false,
            }),
        );
    });

    it('waits for the connection route before the first load runs', () => {
        renderHook(
            () => useRunQueryOnLoad({ runQuery, hasQueryResults: false }),
            { wrapper },
        );
        expect(runQuery).not.toHaveBeenCalled();

        act(() => {
            store.dispatch(setConnectionRoute({ route: 'single' }));
        });

        expect(runQuery).toHaveBeenCalledTimes(1);
        expect(runQuery).toHaveBeenCalledWith('select 1');
    });

    it('runs on the first load only: a connection switch that clears the results does not run again', () => {
        store.dispatch(setConnectionRoute(connection('finance-uuid')));
        const { rerender } = renderHook(
            ({ hasQueryResults }: { hasQueryResults: boolean }) =>
                useRunQueryOnLoad({ runQuery, hasQueryResults }),
            { wrapper, initialProps: { hasQueryResults: false } },
        );
        expect(runQuery).toHaveBeenCalledTimes(1);
        rerender({ hasQueryResults: true });

        act(() => {
            store.dispatch(setConnectionRoute(connection(null)));
        });
        rerender({ hasQueryResults: false });

        expect(runQuery).toHaveBeenCalledTimes(1);
    });
});
