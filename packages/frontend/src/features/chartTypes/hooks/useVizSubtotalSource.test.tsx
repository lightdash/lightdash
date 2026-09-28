import { type ResultRow } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useVizSubtotalSource } from './useVizSubtotalSource';

const dimensions = ['orders_country', 'orders_city'];
const child = { level: 1, parentValues: ['PT'] };
const rows: ResultRow[] = [
    { orders_city: { value: { raw: 'Lisbon', formatted: 'Lisbon' } } },
];

const render = (fetchRows: () => Promise<ResultRow[]>) => {
    const queryClient = new QueryClient();
    return renderHook(
        ({ rootKey }: { rootKey: string | undefined }) =>
            useVizSubtotalSource({ dimensions, rootKey, fetchRows }),
        {
            initialProps: { rootKey: 'root-1' as string | undefined },
            wrapper: ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={queryClient}>
                    {children}
                </QueryClientProvider>
            ),
        },
    );
};

describe('useVizSubtotalSource', () => {
    it('is unavailable until a root result exists', () => {
        const { result, rerender } = render(vi.fn());
        rerender({ rootKey: undefined });
        expect(result.current).toBeUndefined();
    });

    it('loads a level once per root result', async () => {
        const fetchRows = vi.fn().mockResolvedValue(rows);
        const { result } = render(fetchRows);

        await expect(result.current?.get(child)).resolves.toEqual({ rows });
        await expect(result.current?.get(child)).resolves.toEqual({ rows });

        expect(fetchRows).toHaveBeenCalledTimes(1);
        expect(fetchRows).toHaveBeenCalledWith({
            subtotalDimensions: ['orders_city'],
            parent: [{ dimensionId: 'orders_country', value: 'PT' }],
        });
    });

    it('rejects a level that lands after the root result changed', async () => {
        let resolve: (value: ResultRow[]) => void = () => {};
        const fetchRows = vi.fn(
            () => new Promise<ResultRow[]>((r) => (resolve = r)),
        );
        const { result, rerender } = render(fetchRows);

        const pending = result.current?.get(child);
        rerender({ rootKey: 'root-2' });
        resolve(rows);

        await expect(pending).rejects.toThrow(/chart query changed/);
    });

    it('does not load for a root result that is no longer on screen', async () => {
        const fetchRows = vi.fn().mockResolvedValue(rows);
        const { result, rerender } = render(fetchRows);

        const staleSource = result.current;
        rerender({ rootKey: 'root-2' });

        await expect(staleSource?.get(child)).rejects.toThrow(
            /chart query changed/,
        );
        expect(fetchRows).not.toHaveBeenCalled();
    });
});
