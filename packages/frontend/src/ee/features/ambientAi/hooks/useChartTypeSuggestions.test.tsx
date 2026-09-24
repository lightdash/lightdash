import { type SuggestedChartTypeExploreResult } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../api';
import {
    suggestChartTypeFields,
    useSuggestedChartTypeExplore,
} from './useChartTypeSuggestions';

vi.mock('../../../../api', () => ({ lightdashApi: vi.fn() }));

const request = {
    prompt: 'revenue by region',
    clarifications: ['Total revenue'],
    fields: [
        {
            name: 'value',
            label: 'Value',
            type: 'metric' as const,
            required: true,
        },
    ],
};

describe('suggestChartTypeFields', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(lightdashApi).mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('gives up after six seconds', async () => {
        vi.mocked(lightdashApi).mockImplementation(
            ({ signal }) =>
                new Promise((_resolve, reject) => {
                    signal?.addEventListener('abort', () =>
                        reject(new Error('aborted')),
                    );
                }),
        );
        const result = suggestChartTypeFields('p1', {
            ...request,
            exploreName: 'orders',
        });
        const settled = vi.fn();
        result.catch(settled);

        await vi.advanceTimersByTimeAsync(5999);
        expect(settled).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toHaveBeenCalledOnce();
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/ai/p1/chart-type/suggest-fields',
                method: 'POST',
            }),
        );
    });
});

describe('useSuggestedChartTypeExplore', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset();
    });

    const wrapper = () => {
        const queryClient = new QueryClient();
        return ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };

    it('asks once per prompt and inputs, even across reopens', async () => {
        const response: SuggestedChartTypeExploreResult = {
            suggestion: { exploreName: 'orders', reason: 'It has revenue.' },
        };
        vi.mocked(lightdashApi).mockResolvedValue(response as never);
        const Wrapper = wrapper();
        const first = renderHook(
            () => useSuggestedChartTypeExplore('p1', request),
            { wrapper: Wrapper },
        );
        await waitFor(() =>
            expect(first.result.current).toEqual({
                exploreName: 'orders',
                reason: 'It has revenue.',
            }),
        );
        first.unmount();

        const reopened = renderHook(
            () => useSuggestedChartTypeExplore('p1', request),
            { wrapper: Wrapper },
        );

        expect(reopened.result.current?.exploreName).toBe('orders');
        expect(lightdashApi).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                url: '/ai/p1/chart-type/suggest-explore',
            }),
        );
    });

    it('reasks when clarifications or input declarations change', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            suggestion: null,
        } as never);
        const Wrapper = wrapper();
        const { rerender } = renderHook(
            ({ query }) => useSuggestedChartTypeExplore('p1', query),
            { initialProps: { query: request }, wrapper: Wrapper },
        );
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(1));

        const withClarification = {
            ...request,
            clarifications: ['A different answer'],
        };
        rerender({ query: withClarification });
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(2));

        rerender({
            query: {
                ...withClarification,
                fields: [{ ...request.fields[0], label: 'Amount' }],
            },
        });
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(3));
    });

    it('asks nothing without a request', () => {
        const { result } = renderHook(
            () => useSuggestedChartTypeExplore('p1', null),
            { wrapper: wrapper() },
        );

        expect(result.current).toBeNull();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
