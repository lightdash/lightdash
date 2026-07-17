import { type AiDeepResearchChartData } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
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
    derivedFrom: null,
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
    snapshot: {
        takenAt: '2026-07-15T09:18:00.000Z',
        rowCount: 2,
        truncated: false,
        columnOrder: ['orders_order_month', 'orders_total_revenue'],
        rows: [
            ['2026-05', 120],
            ['2026-06', 90],
        ],
    },
};

const idleLiveQuery = {
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: undefined,
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
        />,
    );

describe('DeepResearchChartTile', () => {
    beforeEach(() => {
        mocks.useLiveQuery.mockReturnValue(idleLiveQuery);
        mocks.useQueryResults.mockReturnValue(idleResults);
    });

    it('renders the snapshot without executing any query', () => {
        renderTile();

        expect(screen.getByTestId('visualization')).toHaveTextContent(
            'Rendered query data',
        );
        expect(
            screen.getByRole('figure', { name: chart.title }),
        ).toBeInTheDocument();
        expect(screen.getByText(/Snapshot from/)).toBeVisible();
        expect(mocks.useLiveQuery).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            runUuid: 'run-1',
            chartKey: QUERY_UUID,
            enabled: false,
        });
        expect(screen.getByTestId('visualization')).toHaveAttribute(
            'data-display-fields',
            'false',
        );
        expect(screen.getByTestId('visualization')).toHaveAttribute(
            'data-display-filters',
            'false',
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

    it('switches to live data on demand', () => {
        renderTile();

        fireEvent.click(screen.getByRole('button', { name: 'View live data' }));

        expect(mocks.useLiveQuery).toHaveBeenLastCalledWith({
            projectUuid: 'project-1',
            runUuid: 'run-1',
            chartKey: QUERY_UUID,
            enabled: true,
        });
    });

    it('defaults to live data when the report has no snapshot', () => {
        mocks.useLiveQuery.mockReturnValue({
            ...idleLiveQuery,
            isLoading: true,
        });

        renderTile({ snapshot: null });

        expect(mocks.useLiveQuery).toHaveBeenCalledWith(
            expect.objectContaining({ enabled: true }),
        );
        expect(screen.getByText('Loading live chart data')).toBeVisible();
        expect(screen.queryByText(/Snapshot from/)).not.toBeInTheDocument();
    });

    it('labels agent-computed charts and offers no live view', () => {
        renderTile({ source: 'inline', queryUuid: null });

        expect(screen.getByText('Agent-computed')).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'View live data' }),
        ).not.toBeInTheDocument();
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

        renderTile({ snapshot: null });

        expect(
            screen.getByText(
                'The live data for this chart could not be loaded.',
            ),
        ).toBeVisible();
        screen.getByRole('button', { name: 'Retry' }).click();
        expect(refetchRows).toHaveBeenCalledOnce();
    });
});
