import { type AiDeepResearchChartData } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { DeepResearchChartTile } from './DeepResearchChartTile';

const mocks = vi.hoisted(() => ({
    useLiveQuery: vi.fn(),
    useQueryResults: vi.fn(),
}));

vi.mock('../../hooks/useDeepResearch', () => ({
    useDeepResearchChartLiveQuery: mocks.useLiveQuery,
}));

vi.mock('../../../../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: mocks.useQueryResults,
}));

vi.mock('../ChatElements/AiVisualizationRenderer', () => ({
    AiVisualizationRenderer: ({
        headerContent,
        displayFields,
        displayFilters,
        loadExplore,
    }: {
        headerContent: ReactNode;
        displayFields?: boolean;
        displayFilters?: boolean;
        loadExplore?: boolean;
    }) => (
        <div
            data-testid="visualization"
            data-display-fields={String(displayFields)}
            data-display-filters={String(displayFilters)}
            data-load-explore={String(loadExplore)}
        >
            {headerContent}
            <div>Rendered query data</div>
        </div>
    ),
}));

vi.mock('../ChatElements/AgentVisualizationFilters', () => ({
    default: () => <div data-testid="filter-pills" />,
}));

const QUERY_UUID = '7c4b40ba-79f8-4fd2-9c43-223eca8fa76f';

const dimensionFilter = {
    id: 'filter-1',
    target: { fieldId: 'orders_status', fieldFilterType: 'string' },
    operator: 'equals',
    values: ['completed'],
};

const chart: AiDeepResearchChartData = {
    source: 'warehouse',
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
    queryUuid: QUERY_UUID,
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
        tableCalculations: [],
        additionalMetrics: [],
    } as AiDeepResearchChartData['metricQuery'],
    fields: {},
};

const idleLiveQuery = {
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: { query: { queryUuid: 'live-query-uuid' } },
};

const idleResults = {
    rows: [],
    isFetchingRows: false,
    error: null,
    refetchRows: vi.fn(),
};

const renderTile = (chartOverrides: Partial<AiDeepResearchChartData> = {}) =>
    renderWithProviders(
        <DeepResearchChartTile
            chartKey={QUERY_UUID}
            chart={{ ...chart, ...chartOverrides }}
            projectUuid="project-1"
            runUuid="run-1"
            reportRunAt="2026-07-15T09:18:00.000Z"
        />,
    );

describe('DeepResearchChartTile', () => {
    beforeEach(() => {
        mocks.useLiveQuery.mockReturnValue(idleLiveQuery);
        mocks.useQueryResults.mockReturnValue(idleResults);
    });

    it('executes and renders a live query', () => {
        renderTile();

        expect(screen.getByTestId('visualization')).toHaveTextContent(
            'Rendered query data',
        );
        expect(
            screen.getByRole('figure', { name: chart.title }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Report data as of .*; chart shows live data/),
        ).toBeVisible();
        expect(mocks.useLiveQuery).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            runUuid: 'run-1',
            chartKey: QUERY_UUID,
        });
        expect(mocks.useQueryResults).toHaveBeenLastCalledWith(
            'project-1',
            'live-query-uuid',
            chart.title,
        );
        expect(screen.getByTestId('visualization')).toHaveAttribute(
            'data-display-fields',
            'false',
        );
        expect(screen.getByTestId('visualization')).toHaveAttribute(
            'data-display-filters',
            'false',
        );
        expect(screen.getByTestId('visualization')).toHaveAttribute(
            'data-load-explore',
            'true',
        );
    });

    it('shows the applied filters as read-only pills in the header', () => {
        renderTile();

        expect(screen.getByTestId('filter-pills')).toBeInTheDocument();
    });

    it('omits the filter pills when the query has no filters', () => {
        renderTile({
            metricQuery: { ...chart.metricQuery, filters: {} },
        });

        expect(screen.queryByTestId('filter-pills')).not.toBeInTheDocument();
    });

    it('shows a loader while the live query is starting', () => {
        mocks.useLiveQuery.mockReturnValue({
            ...idleLiveQuery,
            isLoading: true,
            data: undefined,
        });
        renderTile();

        expect(mocks.useLiveQuery).toHaveBeenLastCalledWith(
            expect.objectContaining({ chartKey: QUERY_UUID }),
        );
        expect(screen.getByText('Loading live chart data')).toBeVisible();
    });

    it('shows the live error state even while a page fetch is marked in-flight', () => {
        const refetchRows = vi.fn();
        mocks.useLiveQuery.mockReturnValue({
            ...idleLiveQuery,
            isError: true,
            error: new Error('Query failed'),
        });
        mocks.useQueryResults.mockReturnValue({
            ...idleResults,
            isFetchingRows: true,
            error: new Error('Query failed'),
            refetchRows,
        });

        renderTile();

        expect(
            screen.getByText(
                'The live data for this chart could not be loaded.',
            ),
        ).toBeVisible();
        screen.getByRole('button', { name: 'Retry' }).click();
        expect(refetchRows).toHaveBeenCalledOnce();
    });
});
