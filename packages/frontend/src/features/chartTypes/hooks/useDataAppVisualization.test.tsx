import { type DataAppViz } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { useDataAppVisualization } from './useDataAppVisualization';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

const viz = (version: number) =>
    ({ dataAppVizUuid: 'viz-1', name: `Viz v${version}` }) as DataAppViz;

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

type Props = { dataAppVizUuid: string | null; version: number | null };

const renderViz = (initialProps: Props) =>
    renderHook(
        ({ dataAppVizUuid, version }: Props) =>
            useDataAppVisualization('project-1', dataAppVizUuid, version),
        { wrapper: createWrapper(), initialProps },
    );

describe('useDataAppVisualization', () => {
    beforeEach(() => {
        // The pinned version never resolves, so what the hook shows meanwhile
        // is observable.
        vi.mocked(lightdashApi).mockImplementation(({ url }) =>
            url.includes('version=')
                ? new Promise(() => {})
                : Promise.resolve(viz(1)),
        );
    });

    it('keeps the current version on screen while a pinned one loads', async () => {
        const { result, rerender } = renderViz({
            dataAppVizUuid: 'viz-1',
            version: null,
        });
        await waitFor(() => expect(result.current.data).toEqual(viz(1)));

        rerender({ dataAppVizUuid: 'viz-1', version: 2 });

        expect(result.current.data).toEqual(viz(1));
        expect(result.current.isPreviousData).toBe(true);
    });

    it('drops the viz once the chart points at none', async () => {
        const { result, rerender } = renderViz({
            dataAppVizUuid: 'viz-1',
            version: null,
        });
        await waitFor(() => expect(result.current.data).toEqual(viz(1)));

        rerender({ dataAppVizUuid: null, version: null });

        expect(result.current.data).toBeUndefined();
    });
});
