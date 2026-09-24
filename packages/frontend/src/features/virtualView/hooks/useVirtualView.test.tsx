import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { useCreateVirtualView } from './useVirtualView';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));

const setup = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    queryClient.setQueryData(
        ['tables', 'project-slug', 'filtered', 'without-pre-aggregates'],
        [],
    );
    queryClient.setQueryData(
        ['tables', 'project-uuid', 'all', 'without-pre-aggregates'],
        [],
    );

    const wrapper: FC<PropsWithChildren> = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    const { result } = renderHook(
        () => useCreateVirtualView({ projectUuid: 'project-uuid' }),
        { wrapper },
    );

    return { queryClient, result };
};

describe('useCreateVirtualView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('invalidates every explore list cache after creating a virtual view', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({ name: 'new_view' });
        const { queryClient, result } = setup();

        result.current.mutate({
            projectUuid: 'project-uuid',
            name: 'new_view',
            sql: 'SELECT 1',
            columns: [],
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(
            queryClient.getQueryState([
                'tables',
                'project-slug',
                'filtered',
                'without-pre-aggregates',
            ])?.isInvalidated,
        ).toBe(true);
        expect(
            queryClient.getQueryState([
                'tables',
                'project-uuid',
                'all',
                'without-pre-aggregates',
            ])?.isInvalidated,
        ).toBe(true);
    });

    it.each([
        {
            name: "main's body with no connection",
            payload: {},
            expected: {
                name: 'new_view',
                sql: 'SELECT 1',
                columns: [],
            },
        },
        {
            name: 'the active extra connection',
            payload: { warehouseConnectionUuid: 'finance-uuid' },
            expected: {
                name: 'new_view',
                sql: 'SELECT 1',
                columns: [],
                warehouseConnectionUuid: 'finance-uuid',
            },
        },
        {
            name: 'the original as null',
            payload: { warehouseConnectionUuid: null },
            expected: {
                name: 'new_view',
                sql: 'SELECT 1',
                columns: [],
                warehouseConnectionUuid: null,
            },
        },
    ])('sends $name', async ({ payload, expected }) => {
        vi.mocked(lightdashApi).mockResolvedValue({ name: 'new_view' });
        const { result } = setup();

        result.current.mutate({
            projectUuid: 'project-uuid',
            name: 'new_view',
            sql: 'SELECT 1',
            columns: [],
            ...payload,
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(
            JSON.parse(vi.mocked(lightdashApi).mock.calls[0][0].body as string),
        ).toEqual(expected);
    });
});
