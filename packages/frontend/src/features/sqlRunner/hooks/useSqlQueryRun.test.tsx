import { WarehouseTypes } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SHARED_SIGN_IN_RECONNECTED } from '../../../hooks/useReconnectSharedSignIn';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { store } from '../store';
import {
    resetState,
    setConnectionRoute,
    type SqlRunnerConnectionRoute,
} from '../store/sqlRunnerSlice';
import { useSqlQueryRun } from './useSqlQueryRun';

const expiredStateFlag = vi.hoisted(() => ({ enabled: true }));

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: expiredStateFlag.enabled },
    }),
}));

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
        expiredStateFlag.enabled = true;
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

    it.each([SHARED_SIGN_IN_RECONNECTED, 'warehouse-sign-in-reconnected'])(
        'replays the last failed mutation after %s',
        async (eventName) => {
            vi.mocked(executeSqlQuery)
                .mockRejectedValueOnce(new Error('expired'))
                .mockResolvedValueOnce({ columns: [] } as never);
            const { result } = renderHook(
                () => useSqlQueryRun('project-uuid'),
                {
                    wrapper,
                },
            );
            await act(async () => {
                await expect(
                    result.current.mutateAsync({ sql: 'select 1', limit: 1 }),
                ).rejects.toThrow('expired');
            });

            act(() => {
                window.dispatchEvent(
                    new CustomEvent(eventName, {
                        detail: 'project-uuid',
                    }),
                );
            });

            await waitFor(() =>
                expect(executeSqlQuery).toHaveBeenCalledTimes(2),
            );
            expect(vi.mocked(executeSqlQuery).mock.calls[1][1]).toBe(
                'select 1',
            );
        },
    );

    it('does not replay a personal reconnect event with the flag off', async () => {
        expiredStateFlag.enabled = false;
        vi.mocked(executeSqlQuery).mockRejectedValueOnce(new Error('expired'));
        const { result } = renderHook(() => useSqlQueryRun('project-uuid'), {
            wrapper,
        });
        await act(async () => {
            await expect(
                result.current.mutateAsync({ sql: 'select 1', limit: 1 }),
            ).rejects.toThrow('expired');
        });
        act(() => {
            window.dispatchEvent(
                new CustomEvent('warehouse-sign-in-reconnected', {
                    detail: 'project-uuid',
                }),
            );
        });
        expect(executeSqlQuery).toHaveBeenCalledTimes(1);
    });
});
