import { renderHook } from '@testing-library/react';
import { useGroupedResultsAvailability } from './useGroupedResultsAvailability';

const state = vi.hoisted(() => ({
    queryResults: {
        rows: [] as unknown[],
        pivotDetails: { totalColumnCount: 999 },
    },
    merge: {
        isMerging: true,
        wasRestored: false,
        isRunning: false,
        runError: null as unknown,
        runErrors: [] as unknown[],
        mergeResults: {
            results: {
                rows: [{}] as unknown[],
                pivotDetails: { totalColumnCount: 2 },
            },
        } as unknown,
    },
}));

vi.mock('../../../features/explorer/store', () => ({
    selectPivotConfig: 'pivot-config',
    selectChartConfig: 'chart-config',
    useExplorerSelector: (selector: string) =>
        selector === 'pivot-config'
            ? { columns: ['merge_status'] }
            : { type: 'cartesian' },
}));

vi.mock('../../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => state.merge,
}));

vi.mock('../../../hooks/useExplorerQuery', () => ({
    useExplorerQuery: () => ({ queryResults: state.queryResults }),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { pivotTable: { maxColumnLimit: 10 } } },
    }),
}));

describe('useGroupedResultsAvailability', () => {
    afterEach(() => {
        state.merge.wasRestored = false;
        state.merge.isRunning = false;
        state.merge.runError = null;
        state.merge.runErrors = [];
        state.merge.mergeResults = {
            results: {
                rows: [{}],
                pivotDetails: { totalColumnCount: 2 },
            },
        };
        state.queryResults.rows = [];
    });

    it('uses merged rows and pivot metadata instead of the primary query', () => {
        const { result } = renderHook(() => useGroupedResultsAvailability());

        expect(result.current.hasNoResults).toBe(false);
        expect(result.current.exceedsColumnLimit).toBe(false);
        expect(result.current.isGroupedDisabled).toBe(false);
    });

    it('does not expose stale primary grouped results while a saved merge restores', () => {
        state.merge.mergeResults = null;
        state.merge.wasRestored = true;
        state.queryResults.rows = [{}];

        const { result } = renderHook(() => useGroupedResultsAvailability());

        expect(result.current.hasNoResults).toBe(true);
        expect(result.current.isGroupedDisabled).toBe(true);
    });
});
