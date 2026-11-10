import { ChartType, type SemanticChartAsCode } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
import { type ReactNode } from 'react';
import DocumentChartVisualization from './DocumentChartVisualization';

const mocks = vi.hoisted(() => ({
    visualizationProvider: vi.fn(),
}));
vi.mock('../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({ data: undefined }),
}));
vi.mock('../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: () => ({
        rows: [],
        error: null,
        isFetchingRows: false,
        hasFetchedAllRows: true,
        refetchRows: vi.fn(),
    }),
}));
vi.mock('../../hooks/useResizeObserver', () => ({
    useResizeObserver: () => [vi.fn(), { width: 600, height: 400 }],
}));
vi.mock('../../components/MetricQueryData/MetricQueryDataProvider', () => ({
    default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../components/LightdashVisualization', () => ({
    default: () => <div>Visualization</div>,
}));
vi.mock(
    '../../components/LightdashVisualization/VisualizationProvider',
    () => ({
        default: ({
            children,
            ...props
        }: {
            children: ReactNode;
            hasExplorerStore?: boolean;
        }) => {
            mocks.visualizationProvider(props);
            return children;
        },
    }),
);

const chart: SemanticChartAsCode = {
    name: 'Orders by status',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_month', 'orders_status'],
        metrics: ['orders_total'],
        filters: {},
        sorts: [],
        tableCalculations: [],
        limit: 500,
    },
    chartConfig: { type: ChartType.TABLE },
    pivotConfig: { columns: ['orders_status'] },
};

it('renders without the explorer store, which only exists inside the Explorer', () => {
    // A pivot table that reads the explorer store crashes a Document with
    // "Cannot read properties of undefined (reading 'unsavedChartVersion')"
    render(
        <MantineProvider env="test">
            <DocumentChartVisualization
                projectUuid="project"
                spaceUuid={null}
                chart={chart}
                query={{
                    data: {
                        queryUuid: 'query',
                        metricQuery: chart.metricQuery,
                        fields: {},
                    } as never,
                    error: null,
                    isFetching: false,
                    refetch: vi.fn(),
                }}
            />
        </MantineProvider>,
    );
    expect(mocks.visualizationProvider).toHaveBeenCalledWith(
        expect.objectContaining({ hasExplorerStore: false }),
    );
});
