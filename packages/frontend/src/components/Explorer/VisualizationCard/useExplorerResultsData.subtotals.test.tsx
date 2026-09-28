import { VizAggregationOptions, VizIndexType } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { assert, expect, it, vi } from 'vitest';
import { useExplorerResultsData } from './useExplorerResultsData';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock('../../../hooks/useExplorerQuery', () => ({
    useExplorerQuery: mocks.query,
}));
vi.mock('../../../hooks/useQueryResults', () => ({
    executeSubtotalQueryAndGetRows: mocks.execute,
}));
vi.mock('../../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => null,
}));

it('expands with the original series grouping and returns flat series rows', async () => {
    const args = {
        projectUuid: 'project-1',
        tableId: 'orders',
        query: {
            dimensions: ['orders_country', 'orders_city', 'orders_status'],
        },
        pivotConfiguration: {
            indexColumn: [
                { reference: 'orders_country', type: VizIndexType.CATEGORY },
            ],
            groupByColumns: [{ reference: 'orders_status' }],
            valuesColumns: [
                {
                    reference: 'orders_amount',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
        },
    };
    const rows = ['paid', 'pending'].map((status) => ({
        orders_city: { value: { raw: 'Porto', formatted: 'Porto' } },
        orders_status: { value: { raw: status, formatted: status } },
    }));
    mocks.query.mockReturnValue({
        query: { data: { queryUuid: 'root-query' } },
        queryResults: { rows: [] },
        validQueryArgs: args,
        subtotalDimensions: ['orders_country', 'orders_city'],
    });
    mocks.execute.mockResolvedValue(rows);
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useExplorerResultsData(), { wrapper });
    assert('vizSubtotals' in result.current.resultsData);
    await expect(
        result.current.resultsData.vizSubtotals!.get({
            level: 1,
            parentValues: ['Portugal'],
        }),
    ).resolves.toEqual({ rows });
    expect(mocks.execute).toHaveBeenCalledWith({
        ...args,
        pivotResults: true,
        subtotalLevel: {
            subtotalDimensions: ['orders_city'],
            parent: [{ dimensionId: 'orders_country', value: 'Portugal' }],
        },
    });
});
