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
});
