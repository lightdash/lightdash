import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { expect, it, vi } from 'vitest';
import { useSaveStudioSource } from './useStudioSources';

type Request = { url: string; method: string; body: string | undefined };
const api = vi.hoisted(() => vi.fn<(request: Request) => Promise<unknown>>());
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
    const startThread = vi.fn((agentUuid: string) =>
        Promise.resolve({ threadUuid: 'thread', agentUuid }),
    );
    const { result } = renderHook(
        () => useSaveStudioSource('project', startThread),
        { wrapper },
    );
    const request = {
        path: 'models/orders.sql',
        content: 'select 1',
        revision: 'original',
        prUrl: null,
        threadUuid: null,
        newChangeAgentUuid: 'agent',
    };
    let saves = 0;
    api.mockImplementation(() => {
        saves += 1;
        return saves === 1
            ? Promise.reject(new Error('Connection lost'))
            : Promise.resolve({ status: 'failed', error: 'Reload the file' });
    });
    await act(async () => {
        await expect(result.current.mutateAsync(request)).rejects.toThrow(
            'Connection lost',
        );
    });
    await act(async () => {
        await result.current.mutateAsync(request);
    });
    const calls = api.mock.calls.map(([call]) => call);
    expect(startThread).toHaveBeenCalledTimes(1);
    const saveBodies = calls
        .filter(({ url }) => url.endsWith('/sources/file'))
        .map(({ body }) => JSON.parse(body ?? 'null'));
    expect(saveBodies).toHaveLength(2);
    expect(saveBodies[1]).toEqual(saveBodies[0]);
    expect(saveBodies[1]).toMatchObject({ threadUuid: 'thread' });
});
