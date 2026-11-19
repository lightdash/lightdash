import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { expect, it, vi } from 'vitest';
import { useSaveStudioSource } from './useStudioSources';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));

it('reuses the created thread when retrying a save whose response was lost', async () => {
    const client = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSaveStudioSource('project'), {
        wrapper,
    });
    const request = {
        path: 'models/orders.sql',
        content: 'select 1',
        revision: 'original',
        prUrl: null,
        threadUuid: null,
        newChangeAgentUuid: 'agent',
    };
    api.mockResolvedValueOnce({ uuid: 'thread' })
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValueOnce({ status: 'failed', error: 'Reload the file' });
    await act(async () => {
        await expect(result.current.mutateAsync(request)).rejects.toThrow(
            'Connection lost',
        );
    });
    await act(async () => {
        await result.current.mutateAsync(request);
    });
    expect(api).toHaveBeenCalledTimes(3);
    expect(api.mock.calls[1][0].body).toBe(api.mock.calls[2][0].body);
    expect(api.mock.calls[2][0].body).toContain('"threadUuid":"thread"');
});
