import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withVisualizationStore } from '../../testing/visualizationStore';
import useTableConfig from './useTableConfig';

vi.mock('../useProjectUuid', () => ({ useProjectUuid: () => 'project' }));
vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));
vi.mock('../useAsyncCalculateTotal', () => {
    const idle = () => ({ data: undefined, error: null, isFetching: false });
    return {
        useAsyncCalculateGrandTotal: idle,
        useAsyncCalculateRowSubtotals: idle,
        useAsyncCalculateRowTotal: idle,
        useAsyncCalculateSubtotals: idle,
        useAsyncCalculateTotal: idle,
    };
});

const render = (initial?: Parameters<typeof useTableConfig>[0]) =>
    renderHook(
        () =>
            useTableConfig(initial, undefined, undefined, [], undefined, undefined),
        { wrapper: withVisualizationStore() },
    );

describe('useTableConfig', () => {
    it('seeds defaults from an empty config', () => {
        const { result } = render(undefined);
        expect(result.current.validConfig).toEqual({
            showColumnCalculation: false,
            showRowCalculation: false,
            showTableNames: false,
            showResultsTotal: false,
            showSubtotals: false,
            showSubtotalsExpanded: false,
            showRowGrouping: false,
            columns: {},
            hideRowNumbers: false,
            conditionalFormattings: [],
            metricsAsRows: false,
            rowLimit: undefined,
        });
    });

    it('seeds from the saved config', () => {
        const { result } = render({
            showColumnCalculation: true,
            hideRowNumbers: true,
            columns: { a: { visible: false } },
            rowLimit: { mode: 'show', direction: 'first', count: 50 },
        });
        expect(result.current.validConfig).toMatchObject({
            showColumnCalculation: true,
            hideRowNumbers: true,
            columns: { a: { visible: false } },
            rowLimit: { mode: 'show', direction: 'first', count: 50 },
        });
    });

    it('accepts values and updaters in setters', () => {
        const { result } = render(undefined);
        act(() => result.current.setShowColumnCalculation(true));
        act(() => result.current.setShowResultsTotal((prev) => !prev));
        expect(result.current.showColumnCalculation).toBe(true);
        expect(result.current.showResultsTotal).toBe(true);
    });

    it('composes consecutive column property updates', () => {
        const { result } = render(undefined);
        act(() => {
            result.current.updateColumnProperty('a', { visible: false });
            result.current.updateColumnProperty('a', { frozen: true });
            result.current.updateColumnProperty('b', { width: 10 });
        });
        expect(result.current.columnProperties).toEqual({
            a: { visible: false, frozen: true },
            b: { width: 10 },
        });
    });
});
