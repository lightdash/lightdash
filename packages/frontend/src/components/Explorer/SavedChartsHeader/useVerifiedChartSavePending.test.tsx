import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';
import { useVerifiedChartSavePending } from './useVerifiedChartSavePending';

const setup = (dirty = false) => {
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return {
        client,
        ...renderHook(
            ({ dirty }) => useVerifiedChartSavePending('chart', dirty),
            { wrapper, initialProps: { dirty } },
        ),
    };
};

describe('verified chart result readiness', () => {
    it('releases a clean chart without requiring the editor to close', () => {
        const { result } = setup();
        expect(result.current).toBe(false);
    });
    it('keeps unsaved changes blocked until the chart is clean', () => {
        const { result, rerender } = setup(true);
        expect(result.current).toBe(true);
        rerender({ dirty: false });
        expect(result.current).toBe(false);
    });
    it('does not treat a failed save as completion while changes remain', async () => {
        const { client, result, rerender } = setup(true);
        const mutation = client.getMutationCache().build(client, {
            mutationKey: ['saved_query_version'],
            variables: { uuid: 'chart' },
            mutationFn: async (_variables: { uuid: string }) => {
                throw new Error('Save failed');
            },
            retry: false,
        });
        await act(async () => {
            await mutation.execute().catch(() => undefined);
        });
        expect(mutation.state.status).toBe('error');
        expect(result.current).toBe(true);
        rerender({ dirty: false });
        expect(result.current).toBe(false);
    });

    it.each(['chart', 'another-chart'])(
        'tracks only the current chart while %s saves',
        async (uuid) => {
            const { client, result } = setup();
            let finish!: () => void;
            const request = new Promise<void>((resolve) => {
                finish = resolve;
            });
            const mutation = client.getMutationCache().build(client, {
                mutationKey: ['saved_query_version'],
                variables: { uuid },
                mutationFn: (_variables: { uuid: string }) => request,
            });
            let saving!: Promise<void>;
            act(() => {
                saving = mutation.execute();
            });
            await waitFor(() => expect(mutation.state.status).toBe('loading'));
            await waitFor(() => expect(result.current).toBe(uuid === 'chart'));
            await act(async () => {
                finish();
                await saving;
            });
            await waitFor(() => expect(result.current).toBe(false));
        },
    );
});
