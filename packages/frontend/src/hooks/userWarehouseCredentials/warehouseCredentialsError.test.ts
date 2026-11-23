import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
    retryAfterWarehouseCredentialsSaved,
    WAREHOUSE_CREDENTIALS_CONNECTED,
} from './warehouseCredentialsError';

const failWith = (name: string) =>
    vi.fn().mockRejectedValue({ error: { name } });

// Mounts a query the way a rendered component would, and waits for it to settle
const mount = async (
    queryClient: QueryClient,
    queryKey: unknown[],
    queryFn: () => Promise<unknown>,
) => {
    const observer = new QueryObserver(queryClient, {
        queryKey,
        queryFn,
        retry: false,
    });
    observer.subscribe(() => {});
    await vi.waitFor(() =>
        expect(observer.getCurrentResult().isFetching).toBe(false),
    );
};

describe('retryAfterWarehouseCredentialsSaved', () => {
    it('re-runs queries that failed on credentials in the project', async () => {
        const queryClient = new QueryClient();
        const missing = failWith('MissingWarehouseCredentialsError');
        const otherProject = failWith('MissingWarehouseCredentialsError');
        const unrelated = failWith('WarehouseQueryError');
        const healthy = vi.fn().mockResolvedValue('ok');
        await mount(queryClient, ['field-values', 'project'], missing);
        await mount(queryClient, ['field-values', 'other'], otherProject);
        await mount(queryClient, ['explore', 'project'], unrelated);
        await mount(queryClient, ['spaces', 'project'], healthy);

        retryAfterWarehouseCredentialsSaved(queryClient, 'project');
        await vi.waitFor(() => expect(missing).toHaveBeenCalledTimes(2));

        expect(otherProject).toHaveBeenCalledTimes(1);
        expect(unrelated).toHaveBeenCalledTimes(1);
        expect(healthy).toHaveBeenCalledTimes(1);
    });

    it("refreshes the project's dashboard tiles even when they loaded", async () => {
        const queryClient = new QueryClient();
        const tile = vi.fn().mockResolvedValue('rows');
        const sqlTile = vi.fn().mockResolvedValue('rows');
        const otherProjectTile = vi.fn().mockResolvedValue('rows');
        await mount(
            queryClient,
            ['dashboard_chart_ready_query', 'project', 'chart'],
            tile,
        );
        await mount(queryClient, ['savedSqlChartResults', 'slug'], sqlTile);
        await mount(
            queryClient,
            ['dashboard_chart_ready_query', 'other', 'chart'],
            otherProjectTile,
        );

        retryAfterWarehouseCredentialsSaved(queryClient, 'project');
        await vi.waitFor(() => expect(tile).toHaveBeenCalledTimes(2));

        expect(sqlTile).toHaveBeenCalledTimes(2);
        expect(otherProjectTile).toHaveBeenCalledTimes(1);
    });

    it('leaves tiles that are not on screen for their next mount', async () => {
        const queryClient = new QueryClient();
        const tile = vi.fn().mockResolvedValue('rows');
        await queryClient.fetchQuery(
            ['dashboard_chart_ready_query', 'project', 'chart'],
            tile,
        );

        retryAfterWarehouseCredentialsSaved(queryClient, 'project');
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });

        expect(tile).toHaveBeenCalledTimes(1);
    });

    it('tells non-query runners which project connected', () => {
        const listener = vi.fn();
        window.addEventListener(WAREHOUSE_CREDENTIALS_CONNECTED, listener);

        retryAfterWarehouseCredentialsSaved(new QueryClient(), 'project');

        expect(listener.mock.calls[0][0].detail).toBe('project');
        window.removeEventListener(WAREHOUSE_CREDENTIALS_CONNECTED, listener);
    });
});
