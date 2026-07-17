import { type AiDeepResearchChartBlock } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { DeepResearchChartTile } from './DeepResearchChartTile';

const mocks = vi.hoisted(() => ({
    useChartQuery: vi.fn(),
    useQueryResults: vi.fn(),
}));

vi.mock('../../hooks/useDeepResearch', () => ({
    useDeepResearchChartVizQuery: mocks.useChartQuery,
}));

vi.mock('../../../../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: mocks.useQueryResults,
}));

vi.mock('../ChatElements/AiVisualizationRenderer', () => ({
    AiVisualizationRenderer: ({
        headerContent,
        displayFields,
        displayFilters,
    }: {
        headerContent: ReactNode;
        displayFields?: boolean;
        displayFilters?: boolean;
    }) => (
        <div
            data-testid="visualization"
            data-display-fields={String(displayFields)}
            data-display-filters={String(displayFilters)}
        >
            {headerContent}
            <div>Rendered query data</div>
        </div>
    ),
}));

vi.mock('../ChatElements/AgentVisualizationFilters', () => ({
    default: () => <div data-testid="filter-pills" />,
}));

const chart: AiDeepResearchChartBlock = {
    queryUuid: '7c4b40ba-79f8-4fd2-9c43-223eca8fa76f',
    title: 'Revenue trend',
    chartConfig: {
        defaultVizType: 'line',
        xAxisDimension: 'orders_order_month',
        yAxisMetrics: ['orders_total_revenue'],
        groupBy: null,
        xAxisType: 'time',
        stackBars: null,
        lineType: 'line',
        funnelDataInput: null,
        xAxisLabel: 'Month',
        yAxisLabel: 'Revenue',
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    },
};

const dimensionFilter = {
    id: 'filter-1',
    target: { fieldId: 'orders_status', fieldFilterType: 'string' },
    operator: 'equals',
    values: ['completed'],
};

const readyQuery = {
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
        type: 'query_result',
        query: {
            queryUuid: chart.queryUuid,
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_month'],
                metrics: ['orders_total_revenue'],
                sorts: [],
                limit: 500,
                filters: {
                    dimensions: {
                        id: 'group-1',
                        and: [dimensionFilter],
                    },
                },
            },
            fields: {},
        },
    },
};

const readyResults = {
    rows: [],
    isFetchingRows: false,
    error: null,
    refetchRows: vi.fn(),
};

const renderTile = () =>
    renderWithProviders(
        <DeepResearchChartTile
            chart={chart}
            projectUuid="project-1"
            runUuid="run-1"
        />,
    );

describe('DeepResearchChartTile', () => {
    it('renders the exact query with measurement context', () => {
        mocks.useChartQuery.mockReturnValue(readyQuery);
        mocks.useQueryResults.mockReturnValue(readyResults);

        renderTile();

        expect(screen.getByTestId('visualization')).toHaveTextContent(
            'Rendered query data',
        );
        expect(
            screen.getByTestId('visualization').closest('figure'),
        ).toBeInTheDocument();
        expect(screen.getByTestId('visualization')).toHaveAttribute(
            'data-display-fields',
            'false',
        );
        expect(screen.getByTestId('visualization')).toHaveAttribute(
            'data-display-filters',
            'false',
        );
        expect(
            screen.getByRole('figure', { name: chart.title }),
        ).toBeInTheDocument();
        expect(mocks.useChartQuery).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            runUuid: 'run-1',
            queryUuid: chart.queryUuid,
        });
        expect(mocks.useQueryResults).toHaveBeenCalledWith(
            'project-1',
            chart.queryUuid,
            chart.title,
        );
    });

    it('shows the applied filters as read-only pills in the header', () => {
        mocks.useChartQuery.mockReturnValue(readyQuery);
        mocks.useQueryResults.mockReturnValue(readyResults);

        renderTile();

        expect(screen.getByTestId('filter-pills')).toBeInTheDocument();
    });

    it('omits the filter pills when the query has no filters', () => {
        mocks.useChartQuery.mockReturnValue({
            ...readyQuery,
            data: {
                ...readyQuery.data,
                query: {
                    ...readyQuery.data.query,
                    metricQuery: {
                        ...readyQuery.data.query.metricQuery,
                        filters: {},
                    },
                },
            },
        });
        mocks.useQueryResults.mockReturnValue(readyResults);

        renderTile();

        expect(screen.queryByTestId('filter-pills')).not.toBeInTheDocument();
    });

    it('shows a quiet loading state while query metadata is loading', () => {
        mocks.useChartQuery.mockReturnValue({
            ...readyQuery,
            isLoading: true,
            data: undefined,
        });
        mocks.useQueryResults.mockReturnValue(readyResults);

        renderTile();

        expect(screen.getByText('Loading evidence chart')).toBeVisible();
    });

    it('keeps a failed evidence chart from breaking the report', () => {
        const refetchRows = vi.fn();
        mocks.useChartQuery.mockReturnValue({
            ...readyQuery,
            isError: true,
            error: new Error('Query results expired'),
            data: undefined,
        });
        mocks.useQueryResults.mockReturnValue({
            ...readyResults,
            error: new Error('Query results expired'),
            refetchRows,
        });

        renderTile();

        expect(
            screen.getByText('This evidence chart could not be loaded.'),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
        screen.getByRole('button', { name: 'Retry' }).click();
        expect(refetchRows).toHaveBeenCalledOnce();
    });
});
