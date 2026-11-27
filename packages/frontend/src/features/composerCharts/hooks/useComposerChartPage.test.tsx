import {
    type ComposerChartRunResults,
    type ExecuteComposerChartRequest,
    type ParametersValuesMap,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { type LightdashApi } from '../../../api';
import { LightdashApiContext } from '../../../providers/LightdashApi/LightdashApiContext';
import { useComposerChartPageRun } from './useComposerChartPage';

const run = {} as ComposerChartRunResults;
const chart = { uuid: 'chart-uuid', versionUuid: 'version-uuid' };

const setup = () => {
    const pending: Array<() => void> = [];
    const api = vi.fn(
        () =>
            new Promise<ComposerChartRunResults>((resolve) => {
                pending.push(() => resolve(run));
            }),
    );
    const sent = () =>
        api.mock.calls.map(
            ([{ body }]: [{ body: string }]) =>
                (JSON.parse(body) as ExecuteComposerChartRequest)
                    .invalidateCache,
        );
    const answer = async (index: number) => {
        await waitFor(() => expect(pending[index]).toBeDefined());
        await act(async () => pending[index]());
    };
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            <LightdashApiContext.Provider
                value={api as unknown as LightdashApi}
            >
                {children}
            </LightdashApiContext.Provider>
        </QueryClientProvider>
    );
    const hook = renderHook(
        ({ parameters }: { parameters: ParametersValuesMap }) =>
            useComposerChartPageRun({
                projectUuid: 'project-uuid',
                chart,
                parameters,
            }),
        { wrapper, initialProps: { parameters: { currency: 'usd' } } },
    );
    return { hook, sent, answer };
};

describe('useComposerChartPageRun', () => {
    it('skips the cache on one run per Refresh', async () => {
        const { hook, sent, answer } = setup();
        await answer(0);
        act(() => hook.result.current.refresh());
        await answer(1);
        hook.rerender({ parameters: { currency: 'eur' } });
        await answer(2);
        hook.rerender({ parameters: { currency: 'usd' } });
        await answer(3);
        expect(sent()).toEqual([false, true, false, false]);
    });

    it('skips the cache once when a pick lands while Refresh is pending', async () => {
        const { hook, sent, answer } = setup();
        await answer(0);
        act(() => hook.result.current.refresh());
        await waitFor(() => expect(sent()).toHaveLength(2));
        hook.rerender({ parameters: { currency: 'eur' } });
        await answer(2);
        await answer(1);
        hook.rerender({ parameters: { currency: 'usd' } });
        await answer(3);
        expect(sent()).toEqual([false, true, false, false]);
    });
});
