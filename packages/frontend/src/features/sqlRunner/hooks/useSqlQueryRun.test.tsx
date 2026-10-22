import {
    getExpiredPersonalSignInMessage,
    PersonSignInProvider,
    WarehouseTypes,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    startSharedSignInQueryScope,
    clearSharedSignInQueryScope,
} from '../../../hooks/sharedSignInQueryRecovery';
import {
    SHARED_SIGN_IN_QUERY_FAILED,
    SHARED_SIGN_IN_RECONNECTED,
} from '../../../hooks/useReconnectSharedSignIn';
import { getAsyncQueryError } from '../../queryRunner/asyncQueryError';
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
            .mockRejectedValueOnce(
                getAsyncQueryError(
                    getExpiredPersonalSignInMessage({
                        provider: PersonSignInProvider.GOOGLE,
                    }),
                ),
            )
            .mockResolvedValueOnce({ columns: [] } as never);
        const { result } = renderHook(() => useSqlQueryRun('project-uuid'), {
            wrapper,
        });
        await act(async () => {
            await expect(
                result.current.mutateAsync({ sql: 'select 1', limit: 1 }),
            ).rejects.toMatchObject({ error: { name: 'BigqueryTokenError' } });
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

it.each(['permission', 'project', 'connection', 'user'] as const)(
    'does not replay saved SQL after a %s change or failure',
    async (kind) => {
        vi.clearAllMocks();
        store.dispatch(resetState());
        const scope = startSharedSignInQueryScope('project_a', 'user_a');
        const error =
            kind === 'permission'
                ? {
                      status: 'error',
                      error: {
                          name: 'ForbiddenError',
                          statusCode: 403,
                          message: 'invalid_grant Google token expired',
                          data: {},
                      },
                  }
                : getAsyncQueryError(
                      getExpiredPersonalSignInMessage({
                          provider: PersonSignInProvider.GOOGLE,
                      }),
                  );
        vi.mocked(executeSqlQuery).mockRejectedValueOnce(error);
        const { result, rerender, unmount } = renderHook(
            ({ projectUuid }) => useSqlQueryRun(projectUuid),
            { initialProps: { projectUuid: 'project_a' }, wrapper },
        );
        await act(async () => {
            await expect(
                result.current.mutateAsync({ sql: 'select 1', limit: 1 }),
            ).rejects.toEqual(error);
        });
        if (kind === 'project') rerender({ projectUuid: 'project_b' });
        if (kind === 'connection')
            await act(() =>
                store.dispatch(
                    setConnectionRoute({
                        route: 'multi',
                        connection: {
                            warehouseConnectionUuid: 'connection_b',
                            name: 'Another connection',
                            warehouseType: WarehouseTypes.BIGQUERY,
                        },
                    }),
                ),
            );
        const current =
            kind === 'user'
                ? startSharedSignInQueryScope('project_a', 'user_b')
                : scope;
        await act(() =>
            window.dispatchEvent(
                new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                    detail: kind === 'project' ? 'project_b' : 'project_a',
                }),
            ),
        );
        await act(async () => {});
        expect(executeSqlQuery).toHaveBeenCalledTimes(1);
        unmount();
        clearSharedSignInQueryScope(current);
    },
);

it('does not save an old pending SQL failure after reconnect', async () => {
    vi.clearAllMocks();
    store.dispatch(resetState());
    const oldScope = startSharedSignInQueryScope('project_a', 'user_a');
    const pending = Promise.withResolvers<never>();
    vi.mocked(executeSqlQuery).mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(() => useSqlQueryRun('project_a'), {
        wrapper,
    });
    let run: Promise<unknown>;
    act(() => {
        run = result.current.mutateAsync({ sql: 'select 1', limit: 1 });
    });
    await waitFor(() => expect(executeSqlQuery).toHaveBeenCalledTimes(1));
    const scope = startSharedSignInQueryScope('project_a', 'user_a');
    const error = getAsyncQueryError(
        getExpiredPersonalSignInMessage({
            provider: PersonSignInProvider.GOOGLE,
        }),
    );
    await act(async () => {
        pending.reject(error);
        await expect(run!).rejects.toEqual(error);
    });
    await act(() =>
        window.dispatchEvent(
            new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                detail: 'project_a',
            }),
        ),
    );
    await act(async () => {});
    expect(executeSqlQuery).toHaveBeenCalledTimes(1);
    unmount();
    clearSharedSignInQueryScope(oldScope);
    clearSharedSignInQueryScope(scope);
});
