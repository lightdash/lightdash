import { WarehouseTypes } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateShareMutation, useGetShare } from '../../../hooks/useShare';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { store } from '../store';
import {
    resetState,
    setConnectionRoute,
    setState,
} from '../store/sqlRunnerSlice';
import { runSqlQuery } from '../store/thunks';
import {
    useCreateSqlRunnerShareUrl,
    useSqlRunnerShareUrl,
} from './useSqlRunnerShareUrl';

const createShareUrl = vi.fn(async () => ({ nanoid: 'share-id' }));

vi.mock('../../../hooks/useShare', () => ({
    useCreateShareMutation: vi.fn(),
    useGetShare: vi.fn(),
}));

vi.mock('../../queryRunner/executeQuery', () => ({
    executeSqlQuery: vi.fn(),
}));

vi.mock('../../../components/DataViz/store/selectors', () => ({
    selectCompleteConfigByKind: () => undefined,
}));

const wrapper: FC<PropsWithChildren> = ({ children }) => (
    <Provider store={store}>{children}</Provider>
);

const financeRoute = {
    route: 'multi',
    connection: {
        warehouseConnectionUuid: 'finance-uuid',
        name: 'Finance',
        warehouseType: WarehouseTypes.POSTGRES,
    },
} as const;

describe('SQL runner share links and the active connection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        store.dispatch(resetState());
        vi.mocked(useCreateShareMutation).mockReturnValue({
            mutateAsync: createShareUrl,
        } as never);
    });

    it('a share link does not carry the connection route', async () => {
        store.dispatch(setConnectionRoute(financeRoute));
        const { result } = renderHook(() => useCreateSqlRunnerShareUrl(), {
            wrapper,
        });

        await act(async () => {
            await result.current();
        });

        const params = JSON.parse(
            (createShareUrl.mock.calls[0] as unknown as [{ params: string }])[0]
                .params,
        );
        expect(params.sqlRunnerState).not.toHaveProperty('connectionRoute');
    });

    it('a shared state waits for the viewer connection and sends no request', async () => {
        vi.mocked(useGetShare).mockReturnValue({
            data: {
                params: JSON.stringify({
                    sqlRunnerState: {
                        sql: 'select 1',
                        connectionRoute: financeRoute,
                    },
                    chartConfig: null,
                }),
            },
            error: null,
        } as never);
        const { result } = renderHook(() => useSqlRunnerShareUrl('share-id'), {
            wrapper,
        });

        expect(result.current.sqlRunnerState?.connectionRoute).toEqual({
            route: 'pending',
        });
        store.dispatch(setState(result.current.sqlRunnerState!));
        await store.dispatch(
            runSqlQuery({
                sql: 'select 1',
                limit: 10,
                projectUuid: 'project-uuid',
                parameterValues: {},
            }),
        );

        expect(executeSqlQuery).not.toHaveBeenCalled();
    });
});
