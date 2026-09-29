import { ChartType, type SemanticChartAsCode } from '@lightdash/common';
import type * as LightdashCommon from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import DocumentDraftChart from './DocumentDraftChart';

const mocks = vi.hoisted(() => ({
    permission: true,
    explore: { data: {} as unknown, error: null as unknown, refetch: vi.fn() },
    query: { data: { queryUuid: 'draft-query' }, isPreviousData: false },
    execute: vi.fn(),
    renderChart: vi.fn(),
    pivot: { groupByColumns: [{ reference: 'orders_month' }] },
}));
vi.mock('@lightdash/common', async (importOriginal) => ({
    ...(await importOriginal<typeof LightdashCommon>()),
    getFieldsFromMetricQuery: () => ({}),
    derivePivotConfigurationFromChart: () => mocks.pivot,
}));
vi.mock('../../hooks/useContextMenuPermissions', () => ({
    useContextMenuPermissions: () => ({ canViewExplore: mocks.permission }),
}));
vi.mock('../../hooks/useExplore', () => ({
    useExploreByProjectUuid: () => mocks.explore,
}));
vi.mock('../../hooks/useQueryResults', () => ({
    useGetReadyQueryResults: (...args: unknown[]) => {
        mocks.execute(...args);
        return mocks.query;
    },
}));
vi.mock('./DocumentChartVisualization', () => ({
    default: (props: unknown) => {
        mocks.renderChart(props);
        return <div>Draft visualization</div>;
    },
}));

const chart: SemanticChartAsCode = {
    name: 'Draft orders',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_month'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        tableCalculations: [],
        limit: 125,
        timezone: 'Europe/London',
    },
    chartConfig: { type: ChartType.TABLE },
    pivotConfig: { columns: ['orders_month'] },
    parameters: { currency: 'GBP' },
};

const renderDraft = () =>
    render(
        <MantineProvider env="test">
            <DocumentDraftChart
                projectUuid="project"
                spaceUuid="space"
                chart={chart}
            />
        </MantineProvider>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission = true;
    mocks.explore.data = {};
    mocks.explore.error = null;
    mocks.query.isPreviousData = false;
});

it('executes the unsaved definition with its timezone, parameters and derived pivot, not a persisted cell', () => {
    const before = structuredClone(chart);
    renderDraft();
    expect(mocks.execute).toHaveBeenCalledWith(
        {
            projectUuid: 'project',
            tableId: 'orders',
            query: {
                ...chart.metricQuery,
                filters: {
                    dimensions: undefined,
                    metrics: undefined,
                    tableCalculations: undefined,
                },
                pivotDimensions: ['orders_month'],
            },
            parameters: { currency: 'GBP' },
            pivotConfiguration: mocks.pivot,
            invalidateCache: true,
            dateZoomGranularity: undefined,
            usePreAggregateCache: undefined,
            customSqlProvenanceChartUuid: undefined,
        },
        [],
    );
    expect(mocks.renderChart).toHaveBeenCalledWith(
        expect.objectContaining({
            projectUuid: 'project',
            spaceUuid: 'space',
            chart,
        }),
    );
    expect(chart).toEqual(before);
});

it('does not execute until explore metadata is ready', () => {
    mocks.explore.data = undefined;
    renderDraft();
    expect(mocks.execute).toHaveBeenCalledWith(null, []);
});

it('does not execute an arbitrary query with only document access', () => {
    mocks.permission = false;
    renderDraft();
    expect(mocks.execute).toHaveBeenCalledWith(null, []);
    expect(
        screen.getByText(
            'You need Explore access to preview this unsaved chart.',
        ),
    ).toBeInTheDocument();
    expect(mocks.renderChart).not.toHaveBeenCalled();
});

it('never displays previous query rows under the newly applied configuration', () => {
    mocks.query.isPreviousData = true;
    renderDraft();
    expect(mocks.renderChart).toHaveBeenCalledWith(
        expect.objectContaining({
            query: expect.objectContaining({ data: undefined }),
        }),
    );
});

it('surfaces metadata failure instead of leaving a permanent loading chart', () => {
    mocks.explore.data = undefined;
    mocks.explore.error = { error: { message: 'Unavailable' } };
    renderDraft();
    expect(
        screen.getByText('The explore for this chart could not be loaded.'),
    ).toBeInTheDocument();
    expect(mocks.renderChart).not.toHaveBeenCalled();
});
