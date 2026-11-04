import {
    WarehouseTypes,
    WeekDay,
    type ApiExploreResults,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../api';
import {
    resolveExploreWarehouseConnection,
    useExploreWarehouseConnection,
} from './useExploreWarehouseConnection';

const projectConnection = {
    type: WarehouseTypes.POSTGRES,
    startOfWeek: WeekDay.MONDAY,
};
const exploreConnection: ApiExploreResults['warehouseConnection'] = {
    warehouseConnectionUuid: 'extra-connection',
    warehouseType: WarehouseTypes.BIGQUERY,
    startOfWeek: WeekDay.SUNDAY,
};

vi.mock('../api');
vi.mock('./useQueryError', () => ({ default: () => vi.fn() }));
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('./useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));
vi.mock('./useProject', () => ({
    useProject: () => ({ data: { warehouseConnection: projectConnection } }),
}));

const setup = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    return { queryClient, wrapper };
};

const exploreKey = ['tables', 'orders', 'project-uuid'];

describe('resolveExploreWarehouseConnection', () => {
    it('uses the explore dialect and week start over the project connection', () => {
        expect(
            resolveExploreWarehouseConnection(
                exploreConnection,
                projectConnection,
                true,
            ),
        ).toEqual({
            warehouseType: WarehouseTypes.BIGQUERY,
            startOfWeek: WeekDay.SUNDAY,
        });
    });

    it('preserves a null explore week start instead of using the project week start', () => {
        expect(
            resolveExploreWarehouseConnection(
                { ...exploreConnection, startOfWeek: null },
                projectConnection,
                true,
            ),
        ).toEqual({
            warehouseType: WarehouseTypes.BIGQUERY,
            startOfWeek: null,
        });
    });

    it('keeps the project week start with mixed warehouse connections off', () => {
        expect(
            resolveExploreWarehouseConnection(
                {
                    ...exploreConnection,
                    warehouseType: WarehouseTypes.POSTGRES,
                },
                projectConnection,
                false,
            ),
        ).toEqual({
            warehouseType: WarehouseTypes.POSTGRES,
            startOfWeek: WeekDay.MONDAY,
        });
    });

    it('falls back to the project connection without an explore', () => {
        expect(
            resolveExploreWarehouseConnection(null, projectConnection, true),
        ).toEqual({
            warehouseType: WarehouseTypes.POSTGRES,
            startOfWeek: WeekDay.MONDAY,
        });
    });

    it('returns explicit nulls without either connection', () => {
        expect(resolveExploreWarehouseConnection(null, null, true)).toEqual({
            warehouseType: null,
            startOfWeek: null,
        });
    });
});

describe('useExploreWarehouseConnection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flag.enabled = true;
    });

    it('uses the project week start for an extra connection with the flag off', () => {
        flag.enabled = false;
        const { queryClient, wrapper } = setup();
        queryClient.setQueryData(exploreKey, {
            warehouseConnection: exploreConnection,
        });
        const { result } = renderHook(
            () => useExploreWarehouseConnection('orders', 'project-uuid'),
            { wrapper },
        );

        expect(result.current).toEqual({
            warehouseType: WarehouseTypes.BIGQUERY,
            startOfWeek: WeekDay.MONDAY,
        });
    });

    it('reads the existing explore cache without a request, including on invalidation', async () => {
        const { queryClient, wrapper } = setup();
        queryClient.setQueryData(exploreKey, {
            warehouseConnection: exploreConnection,
        });
        const { result } = renderHook(
            () => useExploreWarehouseConnection('orders', 'project-uuid'),
            { wrapper },
        );

        expect(result.current).toEqual({
            warehouseType: WarehouseTypes.BIGQUERY,
            startOfWeek: WeekDay.SUNDAY,
        });
        await act(() => queryClient.invalidateQueries(exploreKey));
        expect(sharedLightdashApi).not.toHaveBeenCalled();
    });

    it('uses an unsupported formula dialect when the cached explore connection changes', async () => {
        const { queryClient, wrapper } = setup();
        queryClient.setQueryData(exploreKey, {
            warehouseConnection: exploreConnection,
        });
        const { result } = renderHook(
            () => useExploreWarehouseConnection('orders', 'project-uuid'),
            { wrapper },
        );

        act(() => {
            queryClient.setQueryData(exploreKey, {
                warehouseConnection: {
                    ...exploreConnection,
                    warehouseType: WarehouseTypes.TRINO,
                    startOfWeek: null,
                },
            });
        });

        await waitFor(() =>
            expect(result.current).toEqual({
                warehouseType: WarehouseTypes.TRINO,
                startOfWeek: null,
            }),
        );
        expect(sharedLightdashApi).not.toHaveBeenCalled();
    });

    it('uses the project fallback when no explore is selected', () => {
        const { wrapper } = setup();
        const { result } = renderHook(
            () => useExploreWarehouseConnection(null, 'project-uuid'),
            { wrapper },
        );

        expect(result.current).toEqual({
            warehouseType: WarehouseTypes.POSTGRES,
            startOfWeek: WeekDay.MONDAY,
        });
        expect(sharedLightdashApi).not.toHaveBeenCalled();
    });

    it('updates when the explore loads and does not reuse it for another explore or project', async () => {
        const { queryClient, wrapper } = setup();
        const { result, rerender } = renderHook(
            ({ exploreName, projectUuid }) =>
                useExploreWarehouseConnection(exploreName, projectUuid),
            {
                wrapper,
                initialProps: {
                    exploreName: 'orders',
                    projectUuid: 'project-uuid',
                },
            },
        );
        expect(result.current.warehouseType).toBe(WarehouseTypes.POSTGRES);
        expect(sharedLightdashApi).not.toHaveBeenCalled();

        act(() => {
            queryClient.setQueryData(exploreKey, {
                warehouseConnection: exploreConnection,
            });
        });
        await waitFor(() =>
            expect(result.current.warehouseType).toBe(WarehouseTypes.BIGQUERY),
        );
        expect(result.current.startOfWeek).toBe(WeekDay.SUNDAY);

        rerender({ exploreName: 'payments', projectUuid: 'project-uuid' });
        expect(result.current.warehouseType).toBe(WarehouseTypes.POSTGRES);
        rerender({ exploreName: 'orders', projectUuid: 'other-project' });
        expect(result.current.warehouseType).toBe(WarehouseTypes.POSTGRES);
        expect(sharedLightdashApi).not.toHaveBeenCalled();
    });
});
