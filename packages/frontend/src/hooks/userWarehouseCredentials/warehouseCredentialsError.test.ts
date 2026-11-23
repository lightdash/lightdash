import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
    retryAfterWarehouseCredentialsSaved,
    WAREHOUSE_CREDENTIALS_CONNECTED,
} from './warehouseCredentialsError';

const failWith = (name: string) =>
    vi.fn().mockRejectedValue({ error: { name } });

describe('retryAfterWarehouseCredentialsSaved', () => {
    it('re-runs only the queries that failed on credentials', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const missing = failWith('MissingWarehouseCredentialsError');
        const unrelated = failWith('WarehouseQueryError');
        const healthy = vi.fn().mockResolvedValue('ok');
        await Promise.allSettled([
            queryClient.fetchQuery(['missing'], missing),
            queryClient.fetchQuery(['unrelated'], unrelated),
            queryClient.fetchQuery(['healthy'], healthy),
        ]);

        retryAfterWarehouseCredentialsSaved(queryClient, 'project');
        await vi.waitFor(() => expect(missing).toHaveBeenCalledTimes(2));

        expect(unrelated).toHaveBeenCalledTimes(1);
        expect(healthy).toHaveBeenCalledTimes(1);
    });

    it('tells non-query runners which project connected', () => {
        const listener = vi.fn();
        window.addEventListener(WAREHOUSE_CREDENTIALS_CONNECTED, listener);

        retryAfterWarehouseCredentialsSaved(new QueryClient(), 'project');

        expect(listener.mock.calls[0][0].detail).toBe('project');
        window.removeEventListener(WAREHOUSE_CREDENTIALS_CONNECTED, listener);
    });
});
