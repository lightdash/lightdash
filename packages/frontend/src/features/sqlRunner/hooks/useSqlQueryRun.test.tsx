import { WarehouseTypes } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    SHARED_SIGN_IN_QUERY_FAILED,
    SHARED_SIGN_IN_RECONNECTED,
} from '../../../hooks/useReconnectSharedSignIn';
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

            expect(vi.mocked(executeSqlQuery).mock.calls[0][6]).toBe(expected);
        },
    );

    it('replays the last failed mutation after reconnect', async () => {
        vi.mocked(executeSqlQuery)
            .mockRejectedValueOnce(new Error('expired'))
            .mockResolvedValueOnce({ columns: [] } as never);
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
                new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                    detail: 'project-uuid',
                }),
            );
        });

        await waitFor(() => expect(executeSqlQuery).toHaveBeenCalledTimes(2));
        expect(vi.mocked(executeSqlQuery).mock.calls[1][2]).toBe('select 1');
    });

    it('reports a virtual-view failure with its project', async () => {
        vi.mocked(executeSqlQuery).mockRejectedValueOnce(new Error('expired'));
        const onFailure = vi.fn();
        window.addEventListener(SHARED_SIGN_IN_QUERY_FAILED, onFailure);
        const { result } = renderHook(() => useSqlQueryRun('project-uuid'), {
            wrapper,
        });
        await act(async () => {
            await expect(
                result.current.mutateAsync({ sql: 'select 1', limit: 1 }),
            ).rejects.toThrow('expired');
        });
        expect(onFailure).toHaveBeenCalledOnce();
        expect((onFailure.mock.calls[0][0] as CustomEvent).detail).toEqual({
            projectUuid: 'project-uuid',
            error: expect.any(Error),
        });
        window.removeEventListener(SHARED_SIGN_IN_QUERY_FAILED, onFailure);
    });
});
