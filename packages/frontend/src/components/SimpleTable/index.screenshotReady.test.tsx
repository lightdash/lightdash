import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';

const { mockContext } = vi.hoisted(() => ({
    mockContext: {
        current: {} as Record<string, unknown>,
    },
}));

vi.mock('../common/PivotTable', () => ({
    default: () => null,
}));

vi.mock('../LightdashVisualization/types', () => ({
    isTableVisualizationConfig: () => true,
}));

vi.mock('../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => mockContext.current,
}));

// eslint-disable-next-line import/first
import SimpleTable from './index';

const totalLoadingFlags = [
    'isCalculatingColumnTotals',
    'isCalculatingRowTotals',
    'isCalculatingRowSubtotals',
    'isCalculatingGrandTotals',
    'isCalculatingSubtotals',
] as const;

type TotalLoadingFlag = (typeof totalLoadingFlags)[number];

const buildContext = (
    chartConfigOverrides: Partial<Record<TotalLoadingFlag, boolean>> & {
        columnTotalsError?: Error;
        isPivotTableEnabled?: boolean;
        pivotTableData?: {
            data: { rowsCount: number } | undefined;
            loading: boolean;
            error: undefined;
        };
    } = {},
) => ({
    columnOrder: [],
    itemsMap: {},
    visualizationConfig: {
        chartConfig: {
            columns: [],
            pivotTableData: {
                data: { rowsCount: 1 },
                loading: false,
                error: undefined,
            },
            isPivotTableEnabled: true,
            rendersPivotTable: true,
            isPivotResultStale: false,
            showColumnCalculation: true,
            showResultsTotal: false,
            showSubtotals: false,
            showSubtotalsExpanded: false,
            showRowGrouping: false,
            updateColumnProperty: vi.fn(),
            getFieldLabel: vi.fn(),
            getField: vi.fn(),
            ...chartConfigOverrides,
        },
    },
    resultsData: {
        rows: [{}],
        totalResults: 1,
        hasFetchedAllRows: true,
        setFetchAll: vi.fn(),
    },
    isLoading: false,
    isEditMode: false,
    parameters: undefined,
    hasExplorerStore: false,
});

describe('SimpleTable screenshot readiness', () => {
    beforeEach(() => {
        mockContext.current = buildContext();
    });

    it.each(totalLoadingFlags)('waits while %s is true', (totalLoadingFlag) => {
        mockContext.current = buildContext({ [totalLoadingFlag]: true });
        const onScreenshotReady = vi.fn();

        renderWithProviders(
            <SimpleTable isDashboard onScreenshotReady={onScreenshotReady} />,
        );

        expect(onScreenshotReady).not.toHaveBeenCalled();
    });

    it('signals once after totals settle', () => {
        mockContext.current = buildContext({
            isCalculatingColumnTotals: true,
        });
        const onScreenshotReady = vi.fn();
        const renderTable = () => (
            <SimpleTable isDashboard onScreenshotReady={onScreenshotReady} />
        );
        const { rerender } = renderWithProviders(renderTable());

        mockContext.current = buildContext();
        rerender(renderTable());
        rerender(renderTable());

        expect(onScreenshotReady).toHaveBeenCalledOnce();
    });

    it('signals after a totals request settles with an error', () => {
        mockContext.current = buildContext({
            columnTotalsError: new Error('Totals failed'),
        });
        const onScreenshotReady = vi.fn();

        renderWithProviders(
            <SimpleTable isDashboard onScreenshotReady={onScreenshotReady} />,
        );

        expect(onScreenshotReady).toHaveBeenCalledOnce();
    });

    // A pivot with only table calculations has no metrics, so it is not
    // "pivot enabled" but still renders the pivot table and its totals.
    it('waits for pivot data and totals when the pivot has no metrics', () => {
        const onScreenshotReady = vi.fn();
        const renderTable = () => (
            <SimpleTable isDashboard onScreenshotReady={onScreenshotReady} />
        );

        mockContext.current = buildContext({
            isPivotTableEnabled: false,
            pivotTableData: {
                data: undefined,
                loading: false,
                error: undefined,
            },
        });
        const { rerender } = renderWithProviders(renderTable());

        mockContext.current = buildContext({
            isPivotTableEnabled: false,
            isCalculatingSubtotals: true,
        });
        rerender(renderTable());

        expect(onScreenshotReady).not.toHaveBeenCalled();

        mockContext.current = buildContext({ isPivotTableEnabled: false });
        rerender(renderTable());

        expect(onScreenshotReady).toHaveBeenCalledOnce();
    });
});
