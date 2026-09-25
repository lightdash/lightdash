import {
    AiResultType,
    QuerySourceType,
    type AiComposerChartArtifactConfig,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { fireEvent, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiArtifactPanel } from './AiArtifactPanel';

const mocks = vi.hoisted(() => ({
    fastDecisions: vi.fn(),
    artifact: vi.fn(),
    thread: vi.fn(),
    query: vi.fn(),
    rows: vi.fn(),
    retry: vi.fn(),
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: mocks.fastDecisions,
}));
vi.mock('../../hooks/useAiAgentArtifacts', () => ({
    useAiAgentArtifact: mocks.artifact,
}));
vi.mock('../../hooks/useProjectAiAgents', () => ({
    useAiAgentThread: mocks.thread,
    useAiAgentArtifactVizQuery: mocks.query,
}));
vi.mock('../../../../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: mocks.rows,
}));
vi.mock('../../../../../hooks/health/useHealth', () => ({
    default: () => ({ data: { query: { maxLimit: 5000 } } }),
}));
vi.mock('../../store/hooks', () => ({
    useAiAgentStoreDispatch: () => vi.fn(),
}));
vi.mock('../../hooks/useAiArtifactChart', async (original) => ({
    ...(await original<object>()),
    useAiArtifactCompiledSql: () => undefined,
}));
vi.mock('./AiChartQuickOptions', () => ({ AiChartQuickOptions: () => null }));
vi.mock('../../../../../components/DataViz/visualizations/ChartView', () => ({
    default: ({ config }: { config: { type: string } }) => (
        <Box data-testid={`chart-view-${config.type}`} />
    ),
}));
vi.mock('../../../../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({ data: undefined }),
}));
vi.mock('./AiVisualizationRenderer', () => ({
    AiVisualizationRenderer: ({
        headerContent,
    }: {
        headerContent: ReactNode;
    }) => <Box data-testid="chart">{headerContent}</Box>,
}));

const artifact = {
    projectUuid: 'project',
    agentUuid: 'agent',
    artifactUuid: 'artifact',
    versionUuid: 'version',
    messageUuid: 'message',
    threadUuid: 'thread',
};
const config: ToolRunQueryArgs = {
    title: 'Monthly orders',
    description: '',
    mergeConfig: null,
    queryConfig: {
        exploreName: 'orders',
        dimensions: ['orders_month'],
        metrics: ['orders_count'],
        sorts: [],
        limit: 500,
        filters: null,
        tableCalculations: null,
        customMetrics: null,
        parameters: null,
    },
    chartConfig: {
        defaultVizType: 'line',
        xAxisDimension: 'orders_month',
        yAxisMetrics: ['orders_count'],
        xAxisType: 'time',
        xAxisLabel: 'Month',
        yAxisLabel: 'Orders',
        groupBy: null,
        lineType: 'line',
        stackBars: null,
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.fastDecisions.mockReturnValue({ data: { enabled: true } });
    mocks.artifact.mockReturnValue({
        data: {
            artifactType: 'chart',
            chartConfig: { source: 'semantic', config },
        },
        isLoading: false,
        error: null,
        refetch: mocks.retry,
    });
    mocks.thread.mockReturnValue({
        data: { messages: [{ role: 'assistant', uuid: 'message' }] },
        isLoading: false,
        error: null,
        refetch: mocks.retry,
    });
    mocks.query.mockReturnValue({
        data: {
            source: 'semantic',
            type: AiResultType.QUERY_RESULT,
            metadata: { title: 'Monthly orders' },
            query: {
                queryUuid: 'query',
                metricQuery: {
                    ...config.queryConfig,
                    filters: {},
                    tableCalculations: [],
                },
                fields: {},
            },
        },
        isLoading: false,
        error: null,
        refetch: mocks.retry,
    });
    mocks.rows.mockReturnValue({
        rows: [{}],
        isFetchingRows: false,
        error: null,
        refetchRows: mocks.retry,
    });
});

describe('artifact panel recovery and navigation', () => {
    it('keeps a preview choice on rerender but resets it when opening a different version', () => {
        const { rerender } = renderWithProviders(
            <AiArtifactPanel artifact={artifact} />,
        );
        fireEvent.click(
            screen
                .getAllByRole('radio')
                .find((radio) => radio.getAttribute('value') === 'bar')!,
        );
        rerender(<AiArtifactPanel artifact={{ ...artifact }} />);
        expect(
            screen
                .getAllByRole('radio')
                .find((radio) => radio.getAttribute('value') === 'bar')!,
        ).toBeChecked();
        rerender(
            <AiArtifactPanel
                artifact={{ ...artifact, versionUuid: 'another-version' }}
            />,
        );
        expect(
            screen
                .getAllByRole('radio')
                .find((radio) => radio.getAttribute('value') === 'line')!,
        ).toBeChecked();
    });

    it.each([false, undefined])(
        'retains the legacy loading behavior with the flag %s',
        (enabled) => {
            mocks.fastDecisions.mockReturnValue({
                data: enabled === undefined ? undefined : { enabled },
            });
            mocks.rows.mockReturnValue({
                ...mocks.rows(),
                isFetchingRows: true,
            });
            renderWithProviders(<AiArtifactPanel artifact={artifact} />);
            expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Retry' }),
            ).not.toBeInTheDocument();
        },
    );

    it.each(['artifact', 'thread', 'query', 'rows'] as const)(
        'offers a working retry after a %s failure',
        (source) => {
            const prior = mocks[source]();
            mocks[source].mockReturnValue({
                ...prior,
                error: { error: { message: 'Unavailable' } },
                isLoading: false,
                isFetchingRows: true,
            });
            renderWithProviders(<AiArtifactPanel artifact={artifact} />);
            fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
            expect(mocks.retry).toHaveBeenCalledTimes(1);
            expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
        },
    );

    it('keeps existing rows visible while another page loads', () => {
        mocks.rows.mockReturnValue({ ...mocks.rows(), isFetchingRows: true });
        renderWithProviders(<AiArtifactPanel artifact={artifact} />);
        expect(screen.getByTestId('chart')).toBeInTheDocument();
    });

    it('shows an unavailable state for a missing message rather than loading forever', () => {
        mocks.thread.mockReturnValue({
            data: { messages: [] },
            isLoading: false,
            error: null,
        });
        renderWithProviders(<AiArtifactPanel artifact={artifact} />);
        expect(
            screen.getByText('This artifact is unavailable.'),
        ).toBeInTheDocument();
    });
});

const composerConfig: AiComposerChartArtifactConfig = {
    source: 'composer',
    schemaVersion: 1,
    terminalNodeId: 'joined',
    lastQueryUuid: 'query',
    queries: [
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'orders',
            title: 'Orders by status',
            sql: 'select status, count(*) as n from orders group by 1',
        },
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'amounts',
            title: 'Average amount',
            sql: 'select status, avg(amount) as avg_amount from orders group by 1',
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'joined',
            title: 'Orders with amounts',
            sql: 'select * from orders join amounts using (status)',
            references: ['orders', 'amounts'],
        },
    ],
};

const resultsOf = (
    columns: Record<string, { reference: string; type: string }>,
    rows: Record<string, unknown>[],
) => ({
    rows: rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, raw]) => [key, { value: { raw } }]),
        ),
    ),
    columns,
    hasFetchedAllRows: true,
    fetchAll: true,
    setFetchAll: vi.fn(),
    isInitialLoading: false,
    isFetchingFirstPage: false,
    isFetchingRows: false,
    error: null,
    refetchRows: mocks.retry,
});

const statusResults = resultsOf(
    { status: { reference: 'status', type: 'string' } },
    [{ status: 'completed' }],
);

const vizRadios = () =>
    screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'));
const checkedViz = () =>
    screen
        .getAllByRole('radio')
        .find((radio) => (radio as HTMLInputElement).checked)
        ?.getAttribute('value');

describe('composer artifact', () => {
    const renderComposer = (
        chartConfig: AiComposerChartArtifactConfig,
        results: ReturnType<typeof resultsOf> = statusResults,
    ) => {
        mocks.artifact.mockReturnValue({
            data: {
                artifactType: 'chart',
                title: 'Orders vs amounts',
                chartConfig,
            },
            isLoading: false,
            error: null,
            refetch: mocks.retry,
        });
        mocks.rows.mockReturnValue(results);
        return renderWithProviders(<AiArtifactPanel artifact={artifact} />);
    };

    it('renders the results with a collapsed pipeline bar', () => {
        renderComposer(composerConfig);
        expect(screen.getByText('Orders vs amounts')).toBeInTheDocument();
        expect(screen.getByRole('columnheader')).toHaveTextContent('status');
        expect(screen.getByText('3 steps')).toBeInTheDocument();
        expect(screen.queryByText('Sources')).not.toBeInTheDocument();
    });

    it('expands into grouped rows by title', () => {
        renderComposer(composerConfig);
        fireEvent.click(screen.getByRole('button', { name: /queries/i }));
        expect(screen.getByText('Sources')).toBeInTheDocument();
        expect(screen.getByText('Result')).toBeInTheDocument();
        expect(screen.getByText('Orders by status')).toBeInTheDocument();
        expect(screen.getByText('Orders with amounts')).toBeInTheDocument();
        expect(
            screen.getByText('Reads Orders by status, Average amount'),
        ).toBeInTheDocument();
        expect(screen.queryByText('joined')).not.toBeInTheDocument();
    });

    it('falls back to node ids when titles are missing', () => {
        renderComposer({
            ...composerConfig,
            queries: composerConfig.queries.map(({ title, ...query }) => query),
        });
        fireEvent.click(screen.getByRole('button', { name: /queries/i }));
        expect(screen.getByText('joined')).toBeInTheDocument();
        expect(screen.getByText('Reads orders, amounts')).toBeInTheDocument();
    });
});

describe('composer artifact viz switcher', () => {
    const renderComposer = (results: ReturnType<typeof resultsOf>) => {
        mocks.artifact.mockReturnValue({
            data: {
                artifactType: 'chart',
                title: 'Orders vs amounts',
                chartConfig: composerConfig,
            },
            isLoading: false,
            error: null,
            refetch: mocks.retry,
        });
        mocks.rows.mockReturnValue(results);
        return renderWithProviders(<AiArtifactPanel artifact={artifact} />);
    };

    it('opens a string + number result as a bar chart offering table, bar and line', () => {
        renderComposer(
            resultsOf(
                {
                    status: { reference: 'status', type: 'string' },
                    n: { reference: 'n', type: 'number' },
                },
                [
                    { status: 'completed', n: 3 },
                    { status: 'returned', n: 1 },
                ],
            ),
        );
        expect(vizRadios()).toEqual(['table', 'bar', 'line']);
        expect(checkedViz()).toBe('bar');
        expect(
            screen.getByTestId('chart-view-vertical_bar'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    });

    it('opens a date + number result as a line chart', () => {
        renderComposer(
            resultsOf(
                {
                    day: { reference: 'day', type: 'date' },
                    n: { reference: 'n', type: 'number' },
                },
                [
                    { day: '2024-01-01', n: 3 },
                    { day: '2024-01-02', n: 1 },
                ],
            ),
        );
        expect(checkedViz()).toBe('line');
        expect(screen.getByTestId('chart-view-line')).toBeInTheDocument();
    });

    it('switches to the table from the same fetched rows', () => {
        renderComposer(
            resultsOf(
                {
                    status: { reference: 'status', type: 'string' },
                    n: { reference: 'n', type: 'number' },
                },
                [{ status: 'completed', n: 3 }],
            ),
        );
        fireEvent.click(
            screen
                .getAllByRole('radio')
                .find((radio) => radio.getAttribute('value') === 'table')!,
        );
        expect(
            screen.getByRole('columnheader', { name: 'status' }),
        ).toBeInTheDocument();
        // Only the stored query is ever read: kinds are built from its rows.
        expect(mocks.rows.mock.calls.map(([, queryUuid]) => queryUuid)).toEqual(
            expect.arrayContaining(['query']),
        );
        expect(new Set(mocks.rows.mock.calls.map(([, q]) => q))).toEqual(
            new Set(['query']),
        );
        expect(mocks.query).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ enabled: false }),
        );
    });

    it('opens a duplicate-x result as a table but keeps bar and line selectable', () => {
        renderComposer(
            resultsOf(
                {
                    status: { reference: 'status', type: 'string' },
                    n: { reference: 'n', type: 'number' },
                },
                [
                    { status: 'completed', n: 3 },
                    { status: 'completed', n: 1 },
                ],
            ),
        );
        expect(checkedViz()).toBe('table');
        expect(vizRadios()).toEqual(['table', 'bar', 'line']);
    });

    it('shows no switcher when only the table fits', () => {
        renderComposer(statusResults);
        expect(screen.queryAllByRole('radio')).toHaveLength(0);
        expect(screen.getByRole('columnheader')).toHaveTextContent('status');
    });
});
