import { type ResultRow } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { useLayoutEffect, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchColumnSubtotalRows } from '../../../hooks/useAsyncCalculateTotal';
import { useVizSubtotalSource } from './useVizSubtotalSource';

vi.mock('../../../hooks/useAsyncCalculateTotal', () => ({
    fetchColumnSubtotalRows: vi.fn(),
}));

const fetchRows = vi.mocked(fetchColumnSubtotalRows);

const DIMENSIONS = ['orders_country', 'orders_city'];

const row = (country: string, city: string, count: number): ResultRow => ({
    orders_country: { value: { raw: country, formatted: country } },
    orders_city: { value: { raw: city, formatted: city } },
    orders_count: { value: { raw: count, formatted: `${count}` } },
});

const CITY_ROWS = [
    row('Portugal', 'Lisbon', 1),
    row('Portugal', 'Porto', 2),
    row('Spain', 'Madrid', 3),
];

type HookProps = Parameters<typeof useVizSubtotalSource>[0];

const renderSource = (initialProps: HookProps) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return renderHook((props: HookProps) => useVizSubtotalSource(props), {
        initialProps,
        wrapper: ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        ),
    });
};

const READY: HookProps = {
    projectUuid: 'project-uuid',
    sourceQueryUuid: 'query-1',
    dimensions: DIMENSIONS,
};

describe('useVizSubtotalSource', () => {
    beforeEach(() => {
        fetchRows.mockReset();
    });

    it.each([
        ['project', { ...READY, projectUuid: undefined }],
        ['source query', { ...READY, sourceQueryUuid: undefined }],
        ['hierarchy dimensions', { ...READY, dimensions: null }],
    ])('is null without the %s', (_label, props) => {
        expect(renderSource(props).result.current).toBeNull();
    });

    it('exposes the hierarchy dimensions once every input exists', () => {
        expect(renderSource(READY).result.current?.dimensions).toEqual(
            DIMENSIONS,
        );
    });

    it('keeps the same source when the bindings are rebuilt unchanged', () => {
        const { result, rerender } = renderSource(READY);
        const first = result.current;

        rerender({ ...READY, dimensions: [...DIMENSIONS] });

        expect(result.current).toBe(first);
    });

    it('fetches a level once and returns only the rows of each parent', async () => {
        fetchRows.mockResolvedValue(CITY_ROWS);
        const { result } = renderSource(READY);

        const portugal = await result.current?.get({
            level: 1,
            parentValues: ['Portugal'],
        });
        const spain = await result.current?.get({
            level: 1,
            parentValues: ['Spain'],
        });

        expect(portugal).toEqual({ rows: [CITY_ROWS[0], CITY_ROWS[1]] });
        expect(spain).toEqual({ rows: [CITY_ROWS[2]] });
        expect(fetchRows).toHaveBeenCalledTimes(1);
        expect(fetchRows).toHaveBeenCalledWith({
            projectUuid: 'project-uuid',
            sourceQueryUuid: 'query-1',
            subtotalDimensions: DIMENSIONS,
        });
    });

    it('rejects an invalid intent without fetching', async () => {
        const { result } = renderSource(READY);

        await expect(
            result.current?.get({ level: 1, parentValues: [] }),
        ).rejects.toThrow();
        expect(fetchRows).not.toHaveBeenCalled();
    });

    it('rejects a level that lands after the source query changed', async () => {
        let resolveRows: (rows: ResultRow[]) => void = () => {};
        fetchRows.mockReturnValue(
            new Promise<ResultRow[]>((resolve) => {
                resolveRows = resolve;
            }),
        );
        const { result, rerender } = renderSource(READY);

        const pending = result.current?.get({ level: 0, parentValues: [] });
        rerender({ ...READY, sourceQueryUuid: 'query-2' });
        resolveRows(CITY_ROWS);

        await expect(pending).rejects.toThrow(
            'The chart query changed during subtotal expansion.',
        );
    });

    it('rejects a level that lands after the hierarchy was rebound', async () => {
        let resolveRows: (rows: ResultRow[]) => void = () => {};
        fetchRows.mockReturnValue(
            new Promise<ResultRow[]>((resolve) => {
                resolveRows = resolve;
            }),
        );
        const { result, rerender } = renderSource(READY);

        const pending = result.current?.get({ level: 0, parentValues: [] });
        rerender({ ...READY, dimensions: [...DIMENSIONS].reverse() });
        resolveRows(CITY_ROWS);

        await expect(pending).rejects.toThrow(
            'The chart query changed during subtotal expansion.',
        );
    });

    it('reports an API failure with its own message', async () => {
        fetchRows.mockRejectedValue({
            status: 'error',
            error: {
                name: 'ForbiddenError',
                statusCode: 403,
                message: 'You cannot view this chart',
                data: {},
            },
        });
        const { result } = renderSource(READY);

        await expect(
            result.current?.get({ level: 0, parentValues: [] }),
        ).rejects.toThrow('You cannot view this chart');
    });

    it('does not fetch when called from a stale source', async () => {
        const { result, rerender } = renderSource(READY);
        const staleSource = result.current;
        rerender({ ...READY, sourceQueryUuid: 'query-2' });

        await expect(
            staleSource?.get({ level: 0, parentValues: [] }),
        ).rejects.toThrow('The chart query changed during subtotal expansion.');
        expect(fetchRows).not.toHaveBeenCalled();
    });

    it('uses only the committed query during layout effects', async () => {
        fetchRows.mockResolvedValue(CITY_ROWS);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        let previousSource: ReturnType<typeof useVizSubtotalSource> = null;
        let staleRequest: Promise<{ rows: ResultRow[] }> | undefined;
        let currentRequest: Promise<{ rows: ResultRow[] }> | undefined;
        const { rerender } = renderHook(
            (props: HookProps) => {
                const source = useVizSubtotalSource(props);
                useLayoutEffect(() => {
                    if (previousSource) {
                        staleRequest = previousSource.get({
                            level: 0,
                            parentValues: [],
                        });
                    }
                }, [source]);
                useLayoutEffect(() => {
                    if (previousSource) {
                        currentRequest = source?.get({
                            level: 0,
                            parentValues: [],
                        });
                    }
                    previousSource = source;
                }, [source]);
            },
            {
                initialProps: READY,
                wrapper: ({ children }: PropsWithChildren) => (
                    <QueryClientProvider client={queryClient}>
                        {children}
                    </QueryClientProvider>
                ),
            },
        );

        rerender({ ...READY, sourceQueryUuid: 'query-2' });

        await Promise.all([
            expect(staleRequest).rejects.toThrow(
                'The chart query changed during subtotal expansion.',
            ),
            expect(currentRequest).resolves.toEqual({ rows: CITY_ROWS }),
        ]);
        expect(fetchRows).toHaveBeenCalledExactlyOnceWith({
            projectUuid: 'project-uuid',
            sourceQueryUuid: 'query-2',
            subtotalDimensions: [DIMENSIONS[0]],
        });
    });
});
