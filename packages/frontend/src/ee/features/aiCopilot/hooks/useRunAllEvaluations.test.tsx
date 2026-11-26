import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { expect, it, vi } from 'vitest';
import { useRunAllEvaluations } from './useAiAgentEvaluations';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock('../../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));

it('skips active suites and continues queuing after a submission fails', async () => {
    const noRuns = { data: { runs: [] } };
    api.mockResolvedValueOnce({ data: { runs: [{ status: 'running' }] } })
        .mockResolvedValueOnce(noRuns)
        .mockRejectedValueOnce(new Error('Request failed'))
        .mockResolvedValueOnce(noRuns)
        .mockResolvedValueOnce({ runUuid: 'new-run' });
    const queryClient = new QueryClient();
    const wrapper: FC<PropsWithChildren> = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    const { result } = renderHook(
        () => useRunAllEvaluations('project', 'agent'),
        { wrapper },
    );

    act(() => result.current.mutate(['active', 'failed', 'ready']));

    await waitFor(() =>
        expect(result.current.data).toEqual({
            failures: ['failed'],
            skipped: 1,
            queued: 1,
        }),
    );
    expect(
        api.mock.calls
            .filter(([request]) => request.method === 'POST')
            .map(([request]) => request.url),
    ).toEqual([
        '/projects/project/aiAgents/agent/evaluations/failed/run',
        '/projects/project/aiAgents/agent/evaluations/ready/run',
    ]);
});
