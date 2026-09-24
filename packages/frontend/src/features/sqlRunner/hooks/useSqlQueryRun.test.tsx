import { WarehouseTypes } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { store } from '../store';
import {
    resetState,
    setConnectionRoute,
    type SqlRunnerConnectionRoute,
} from '../store/sqlRunnerSlice';
import { useSqlQueryRun } from './useSqlQueryRun';

vi.mock('../../queryRunner/executeQuery', () => ({
    executeSqlQuery: vi.fn(async () => ({ columns: [] })),
}));

const wrapper: FC<PropsWithChildren> = ({ children }) => (
    <Provider store={store}>
        <QueryClientProvider client={new QueryClient()}>
            {children}
        </QueryClientProvider>
    </Provider>
);

describe('useSqlQueryRun', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        store.dispatch(resetState());
    });

    it.each<{
        route: SqlRunnerConnectionRoute;
        expected: string | null | undefined;
    }>([
        {
            route: {
                route: 'multi',
                connection: {
                    warehouseConnectionUuid: 'finance-uuid',
                    name: 'Finance',
                    warehouseType: WarehouseTypes.POSTGRES,
                },
            },
            expected: 'finance-uuid',
        },
        { route: { route: 'single' }, expected: undefined },
    ])(
        'reads the columns on the connection of the $route.route route',
        async ({ route, expected }) => {
            store.dispatch(setConnectionRoute(route));
            const { result } = renderHook(
                () => useSqlQueryRun('project-uuid'),
                { wrapper },
            );

            await act(async () => {
                await result.current.mutateAsync({ sql: 'select 1', limit: 1 });
            });

            expect(vi.mocked(executeSqlQuery).mock.calls[0][5]).toBe(expected);
        },
    );
});
