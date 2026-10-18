import {
    COMPOSER_TABLE_VIZ,
    AiAccessRefusedError,
    AiAccessRefusalReason,
    AiResultType,
    FeatureFlags,
    QuerySourceType,
    QueryHistoryStatus,
    type AiComposerChartArtifactConfig,
    type ToolRunQueryArgs,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
    type ComponentProps,
    type FC,
    type ReactElement,
    type ReactNode,
} from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../../api';
import ChartColorMappingContextProvider from '../../../../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import type * as QueryResultsHooks from '../../../../../hooks/useQueryResults';
import {
    getMockedProviders,
    renderWithProviders,
} from '../../../../../testing/testUtils';
import { AiArtifactPanel } from './AiArtifactPanel';
import { AiChartVisualization } from './AiChartVisualization';
import { AiDashboardVisualizationItem } from './AiDashboardVisualizationItem';

const mocks = vi.hoisted(() => ({
    fastDecisions: vi.fn(),
    isEmbedded: vi.fn(),
    artifact: vi.fn(),
    thread: vi.fn(),
    query: vi.fn(),
    rows: vi.fn(),
    retry: vi.fn(),
    saveVizConfig: vi.fn(),
}));
vi.mock('../../../../../api', () => ({ lightdashApi: vi.fn() }));
// The explorer config panel lazy-loads the Vega editor, which pulls Monaco.
vi.mock('../../../../../components/MonacoEditor', () => ({
    default: () => null,
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: mocks.fastDecisions,
}));
vi.mock('../../../../providers/Embed/useIsEmbedded', () => ({
    default: mocks.isEmbedded,
}));
vi.mock('../../hooks/useAiAgentArtifacts', () => ({
    useAiAgentArtifact: mocks.artifact,
    useUpdateComposerViz: () => ({ mutate: mocks.saveVizConfig }),
}));
vi.mock('../../hooks/useProjectAiAgents', () => ({
    useAiAgentThread: mocks.thread,
    useAiAgentArtifactVizQuery: mocks.query,
    useAiAgentDashboardChartVizQuery: mocks.query,
    useUpdateArtifactVersionSavedSql: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../../../../../hooks/user/useCreateInAnySpaceAccess', () => ({
    default: () => false,
}));
vi.mock('./AiSqlArtifactDownloadModal', () => ({
    AiSqlArtifactDownloadModal: () => null,
}));
vi.mock(
    '../../../../../features/sqlRunner/components/SaveSqlChartModal',
    () => ({ SaveSqlChartModalContent: () => null }),
);
vi.mock('../../../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({
        mutate: vi.fn(),
        isLoading: false,
        error: null,
    }),
}));
vi.mock('../../hooks/useCanViewAiAgentSql', () => ({
    useCanViewAiAgentSql: () => false,
}));
vi.mock('../../../../../hooks/useCompiledSql', () => ({
    useCompiledSqlFromMetricQuery: () => ({ data: undefined }),
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

// The classic chart stack reads the app-wide colour mapping provider.
const MockedProviders = getMockedProviders();
const PanelProviders: FC<{ children: ReactNode }> = ({ children }) => (
    <MockedProviders>
        <MemoryRouter>
            <ChartColorMappingContextProvider>
                {children}
            </ChartColorMappingContextProvider>
        </MemoryRouter>
    </MockedProviders>
);
const renderPanel = (ui: ReactElement) =>
    renderWithProviders(ui, undefined, { wrapper: PanelProviders });

// The mocked session user.
const THREAD_OWNER_UUID = 'b264d83a-9000-426a-85ec-3f9c20f368ce';

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
    mocks.isEmbedded.mockReturnValue(false);
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
        data: {
            user: { uuid: THREAD_OWNER_UUID },
            messages: [{ role: 'assistant', uuid: 'message' }],
        },
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
            renderPanel(<AiArtifactPanel artifact={artifact} />);
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
            renderPanel(<AiArtifactPanel artifact={artifact} />);
            fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
            expect(mocks.retry).toHaveBeenCalledTimes(1);
            expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
        },
    );

    it('keeps existing rows visible while another page loads', () => {
        mocks.rows.mockReturnValue({ ...mocks.rows(), isFetchingRows: true });
        renderPanel(<AiArtifactPanel artifact={artifact} />);
        expect(screen.getByTestId('chart')).toBeInTheDocument();
    });

    it('shows an unavailable state for a missing message rather than loading forever', () => {
        mocks.thread.mockReturnValue({
            data: { user: { uuid: THREAD_OWNER_UUID }, messages: [] },
            isLoading: false,
            error: null,
        });
        renderPanel(<AiArtifactPanel artifact={artifact} />);
        expect(
            screen.getByText('This artifact is unavailable.'),
        ).toBeInTheDocument();
    });
});

const composerConfig: AiComposerChartArtifactConfig = {
    source: 'composer',
    schemaVersion: 2,
    terminalNodeId: 'joined',
    viz: COMPOSER_TABLE_VIZ,
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

// The run started on open: every node's result in this run.
const composerRun = {
    data: {
        source: 'composer',
        terminalNodeId: 'joined',
        nodeQueryUuids: {
            orders: 'orders-query',
            amounts: 'amounts-query',
            joined: 'query',
        },
        metadata: { title: 'Orders vs amounts', description: null },
    },
    isLoading: false,
    error: null,
    refetch: mocks.retry,
};

const nodeStatusesResponse = (
    statuses: {
        queryUuid: string;
        status: QueryHistoryStatus;
        error?: string;
    }[],
) =>
    vi.mocked(lightdashApi).mockImplementation((async ({
        url,
    }: {
        url: string;
    }) =>
        url.includes('/query-sources/queries/status')
            ? {
                  statuses: statuses.map(({ error, ...status }) => ({
                      ...status,
                      error: error ?? null,
                  })),
              }
            : undefined) as unknown as typeof lightdashApi);

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

// The pipeline bar's List / Graph switch is a SegmentedControl too.
const PIPELINE_MODES = ['list', 'graph'];
const vizRadioElements = () =>
    screen
        .queryAllByRole('radio')
        .filter(
            (radio) => !PIPELINE_MODES.includes(radio.getAttribute('value')!),
        );
const vizRadios = () =>
    vizRadioElements().map((radio) => radio.getAttribute('value'));
const checkedViz = () =>
    vizRadioElements()
        .find((radio) => (radio as HTMLInputElement).checked)
        ?.getAttribute('value');

// The viz switcher is a SegmentedControl of chart kinds, like the floating pill.
const kindRadios = () => vizRadioElements();
const offeredKinds = () =>
    kindRadios().map((radio) => radio.getAttribute('value'));
const selectedKind = () => checkedViz();
const chooseKind = (kind: string) =>
    fireEvent.click(
        kindRadios().find((radio) => radio.getAttribute('value') === kind)!,
    );
const chartBar = () => screen.getByRole('button', { name: /^chart/i });
// Edit rights resolve once the thread and session user have loaded.
const waitForEditable = () =>
    waitFor(() => expect(chartBar()).toHaveAttribute('data-editable', 'true'));
const openChart = async () => {
    fireEvent.click(chartBar());
    await screen.findByRole('button', { name: /^chart/i, expanded: true });
};

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
        mocks.query.mockReturnValue(composerRun);
        mocks.rows.mockReturnValue(results);
        return renderPanel(<AiArtifactPanel artifact={artifact} />);
    };

    it('renders the results with a collapsed pipeline bar', () => {
        renderComposer(composerConfig);
        expect(screen.getByText('Orders vs amounts')).toBeInTheDocument();
        expect(
            screen.getByRole('columnheader', { name: 'Status' }),
        ).toBeInTheDocument();
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

describe('composer viz', () => {
    const renderComposer = (
        results: ReturnType<typeof resultsOf>,
        chartConfig: AiComposerChartArtifactConfig = composerConfig,
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
        mocks.query.mockReturnValue(composerRun);
        mocks.rows.mockReturnValue(results);
        return renderPanel(<AiArtifactPanel artifact={artifact} />);
    };
    const statusCounts = resultsOf(
        {
            status: { reference: 'status', type: 'string' },
            n: { reference: 'n', type: 'number' },
        },
        [
            { status: 'completed', n: 3 },
            { status: 'returned', n: 1 },
        ],
    );

    it('opens a stored table viz as a table of the result columns', () => {
        renderComposer(statusCounts);
        expect(
            screen.getByRole('columnheader', { name: 'Status' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('columnheader', { name: 'N' }),
        ).toBeInTheDocument();
        expect(chartBar()).toBeInTheDocument();
    });

    it('offers the chart kinds of a string + number result', () => {
        renderComposer(statusCounts);
        expect(offeredKinds()).toEqual(
            expect.arrayContaining(['table', 'bar', 'line', 'pie']),
        );
    });

    it('writes a switcher pick back as the stored intent', async () => {
        const { unmount } = renderComposer(statusCounts);
        await waitForEditable();
        chooseKind('bar');
        expect(selectedKind()).toBe('bar');
        unmount();
        expect(mocks.saveVizConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                intent: expect.objectContaining({ defaultVizType: 'bar' }),
                chartConfig: null,
            }),
        );
    });

    it("keeps a read-only viewer's kind switch on screen without writing it", async () => {
        mocks.thread.mockReturnValue({
            data: {
                user: { uuid: 'someone-else' },
                messages: [{ role: 'assistant', uuid: 'message' }],
            },
            isLoading: false,
            error: null,
            refetch: mocks.retry,
        });
        const { unmount } = renderComposer(statusCounts);
        chooseKind('line');
        unmount();
        expect(mocks.saveVizConfig).not.toHaveBeenCalled();
    });

    it("shows the terminal node's error in the chart area", async () => {
        renderComposer({
            ...statusCounts,
            rows: [],
            columns: undefined,
            error: { error: { message: 'Division by zero' } },
        } as unknown as ReturnType<typeof resultsOf>);
        expect(
            screen.getByText('This result could not be loaded'),
        ).toBeInTheDocument();
        expect(screen.getByText('Division by zero')).toBeInTheDocument();
        expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    });

    it('keeps only one of Chart and Queries open', async () => {
        renderComposer(statusCounts);
        await openChart();
        expect(chartBar()).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(screen.getByRole('button', { name: /queries/i }));
        expect(chartBar()).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByText('Sources')).toBeInTheDocument();
        await openChart();
        expect(screen.queryByText('Sources')).not.toBeInTheDocument();
    });
});

describe('composer displayed node', () => {
    const ordersResults = resultsOf(
        {
            status: { reference: 'status', type: 'string' },
            n: { reference: 'n', type: 'number' },
        },
        [{ status: 'completed', n: 3 }],
    );
    const amountsResults = resultsOf(
        { avg_amount: { reference: 'avg_amount', type: 'number' } },
        [{ avg_amount: 12.5 }],
    );
    const resultsByQuery: Record<string, ReturnType<typeof resultsOf>> = {
        query: statusResults,
        'orders-query': ordersResults,
        'amounts-query': amountsResults,
    };

    const renderComposer = (run: Partial<typeof composerRun> = composerRun) => {
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
        mocks.query.mockReturnValue({ ...composerRun, ...run });
        mocks.rows.mockImplementation(
            (_project: string, queryUuid: string | undefined) =>
                queryUuid === undefined
                    ? { ...statusResults, rows: [], columns: undefined }
                    : resultsByQuery[queryUuid],
        );
        return renderPanel(<AiArtifactPanel artifact={artifact} />);
    };

    const expandPipeline = () =>
        fireEvent.click(screen.getByRole('button', { name: /queries/i }));

    it('displays a node result from List mode with its title and a way back', async () => {
        renderComposer();
        expandPipeline();
        fireEvent.click(
            screen.getByRole('button', { name: 'Display Average amount' }),
        );
        // Other nodes open as a table of their own columns.
        expect(
            screen.getByRole('columnheader', { name: 'Avg amount' }),
        ).toBeInTheDocument();
        // Header and pipeline row both name the node.
        expect(screen.getAllByText('Average amount')).toHaveLength(2);
        expect(screen.queryByText('Orders vs amounts')).not.toBeInTheDocument();
        expect(
            document.getElementById('composer-pipeline-node-amounts'),
        ).toHaveAttribute('data-displayed', 'true');

        fireEvent.click(screen.getByRole('button', { name: 'Back to result' }));
        expect(screen.getByText('Orders vs amounts')).toBeInTheDocument();
        expect(
            screen.getByRole('columnheader', { name: 'Status' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Back to result' }),
        ).not.toBeInTheDocument();
    });

    it('displays a node result from Graph mode', async () => {
        renderComposer();
        expandPipeline();
        fireEvent.click(screen.getByRole('radio', { name: 'Graph' }));
        fireEvent.click(screen.getByLabelText('Display Orders by status'));
        expect(
            screen.getByRole('columnheader', { name: 'Status' }),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText('Display Orders by status'),
        ).toHaveAttribute('data-displayed', 'true');
    });

    it('resets to the terminal node when a new version opens', async () => {
        const { rerender } = renderComposer();
        expandPipeline();
        fireEvent.click(
            screen.getByRole('button', { name: 'Display Average amount' }),
        );
        expect(screen.getAllByText('Average amount')).toHaveLength(2);
        rerender(
            <AiArtifactPanel
                artifact={{ ...artifact, versionUuid: 'another-version' }}
            />,
        );
        expect(screen.getByText('Orders vs amounts')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Back to result' }),
        ).not.toBeInTheDocument();
    });

    it('keeps nodes inert and reads no result while the run starts', async () => {
        renderComposer({ data: undefined, isLoading: true });
        expandPipeline();
        expect(
            screen.queryAllByRole('button', { name: /^Display / }),
        ).toHaveLength(0);
        expect(screen.getByText('Average amount')).toBeInTheDocument();
        expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
        expect(mocks.rows.mock.calls.every(([, queryUuid]) => !queryUuid)).toBe(
            true,
        );
    });

    it("shows each node's status in the run", async () => {
        nodeStatusesResponse([
            { queryUuid: 'orders-query', status: QueryHistoryStatus.READY },
            {
                queryUuid: 'amounts-query',
                status: QueryHistoryStatus.EXECUTING,
            },
            { queryUuid: 'query', status: QueryHistoryStatus.PENDING },
        ]);
        renderComposer();
        expandPipeline();
        const row = (nodeId: string) =>
            within(
                document.getElementById(`composer-pipeline-node-${nodeId}`)!,
            );
        expect(await row('orders').findByLabelText('Completed')).toBeVisible();
        expect(row('amounts').getByLabelText('Running')).toBeVisible();
        expect(row('joined').getByLabelText('Queued')).toBeVisible();
    });

    it("shows a failed node's error on its row and in the chart area", async () => {
        nodeStatusesResponse([
            { queryUuid: 'orders-query', status: QueryHistoryStatus.READY },
            {
                queryUuid: 'amounts-query',
                status: QueryHistoryStatus.ERROR,
                error: 'column "amount" does not exist',
            },
            { queryUuid: 'query', status: QueryHistoryStatus.ERROR },
        ]);
        resultsByQuery['amounts-query'] = {
            ...amountsResults,
            rows: [],
            columns: undefined,
            error: { error: { message: 'column "amount" does not exist' } },
        } as unknown as ReturnType<typeof resultsOf>;
        renderComposer();
        expandPipeline();
        const amountsRow = within(
            document.getElementById('composer-pipeline-node-amounts')!,
        );
        expect(await amountsRow.findByLabelText('Failed')).toBeVisible();
        expect(
            amountsRow.getByText('column "amount" does not exist'),
        ).toBeVisible();
        fireEvent.click(
            screen.getByRole('button', { name: 'Display Average amount' }),
        );
        expect(
            screen.getByText('This result could not be loaded'),
        ).toBeInTheDocument();
        expect(
            screen.getAllByText('column "amount" does not exist'),
        ).toHaveLength(2);
        expect(
            screen.getByRole('button', { name: 'Back to result' }),
        ).toBeInTheDocument();
    });

    it('shows a refused run in the chart area', async () => {
        renderComposer({
            data: undefined,
            error: {
                status: 'error',
                error: {
                    name: 'ForbiddenError',
                    statusCode: 403,
                    message:
                        'Pipelines with warehouse SQL are not available in embedded AI agents',
                    data: {},
                },
            } as unknown as null,
        });
        expect(
            screen.getByText('This result could not be loaded'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Pipelines with warehouse SQL are not available in embedded AI agents',
            ),
        ).toBeInTheDocument();
    });
});

describe('composer per-node viz switcher', () => {
    const ordersResults = resultsOf(
        {
            status: { reference: 'status', type: 'string' },
            n: { reference: 'n', type: 'number' },
        },
        [
            { status: 'completed', n: 3 },
            { status: 'returned', n: 1 },
        ],
    );
    const joinedResults = resultsOf(
        {
            day: { reference: 'day', type: 'date' },
            total: { reference: 'total', type: 'number' },
        },
        [
            { day: '2024-01-01', total: 3 },
            { day: '2024-01-02', total: 1 },
        ],
    );
    const resultsByQuery: Record<string, ReturnType<typeof resultsOf>> = {
        query: joinedResults,
        'orders-query': ordersResults,
        'amounts-query': statusResults,
    };

    const renderComposer = () => {
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
        mocks.query.mockReturnValue(composerRun);
        mocks.rows.mockImplementation(
            (_project: string, queryUuid: string | undefined) =>
                queryUuid === undefined
                    ? { ...statusResults, rows: [], columns: undefined }
                    : resultsByQuery[queryUuid],
        );
        return renderPanel(<AiArtifactPanel artifact={artifact} />);
    };
    const display = (title: string) =>
        fireEvent.click(
            screen.getByRole('button', { name: `Display ${title}` }),
        );
    it('opens other nodes as tables and keeps their switch on screen only', async () => {
        renderComposer();
        chooseKind('bar');
        fireEvent.click(screen.getByRole('button', { name: /queries/i }));

        display('Orders by status');
        expect(
            screen.getByRole('columnheader', { name: 'Status' }),
        ).toBeInTheDocument();
        chooseKind('line');
        expect(selectedKind()).toBe('line');

        // A single number column has nothing to chart against.
        display('Average amount');
        expect(kindRadios()).toHaveLength(0);

        display('Orders by status');
        expect(selectedKind()).toBe('line');
        fireEvent.click(screen.getByRole('button', { name: 'Back to result' }));
        expect(selectedKind()).toBe('bar');
        expect(mocks.saveVizConfig).not.toHaveBeenCalledWith(
            expect.objectContaining({
                intent: expect.objectContaining({ defaultVizType: 'line' }),
            }),
        );
    });
});

describe('sql artifact viz switcher', () => {
    const renderSql = (results: ReturnType<typeof resultsOf>) => {
        mocks.artifact.mockReturnValue({
            data: {
                artifactType: 'chart',
                chartConfig: { source: 'sql', sql: 'select 1', limit: 500 },
                savedSqlUuid: null,
            },
            isLoading: false,
            error: null,
            refetch: mocks.retry,
        });
        mocks.query.mockReturnValue({
            data: {
                source: 'sql',
                type: AiResultType.TABLE_RESULT,
                metadata: { title: 'Orders per day' },
                query: { queryUuid: 'sql-query' },
                sql: 'select 1',
                limit: 500,
            },
            isLoading: false,
            error: null,
            refetch: mocks.retry,
        });
        mocks.rows.mockReturnValue(results);
        return renderPanel(<AiArtifactPanel artifact={artifact} />);
    };

    const chooseSqlViz = (kind: string) =>
        fireEvent.click(
            screen
                .getAllByRole('radio')
                .find((radio) => radio.getAttribute('value') === kind)!,
        );

    it('opens a date + number answer as a table and can switch to a line chart', () => {
        renderSql(
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
        expect(checkedViz()).toBe('table');
        expect(vizRadios()).toEqual(expect.arrayContaining(['table', 'line']));
        expect(
            screen.getByRole('columnheader', { name: 'Day' }),
        ).toBeInTheDocument();
        chooseSqlViz('line');
        expect(checkedViz()).toBe('line');
        expect(screen.getByText('Orders per day')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'SQL artifact actions' }),
        ).toBeInTheDocument();
    });

    it('keeps a table-only answer as a table without a switcher', () => {
        renderSql(statusResults);
        expect(vizRadios()).toHaveLength(0);
        expect(
            screen.getByRole('columnheader', { name: 'Status' }),
        ).toBeInTheDocument();
    });
});

describe('artifact panel agent identity recovery', () => {
    it.each(['artifact', 'thread', 'query', 'rows'] as const)(
        'shows a compact connect prompt for a typed refusal from %s',
        (source) => {
            const refusal = new AiAccessRefusedError(
                AiAccessRefusalReason.NEEDS_SIGN_IN,
            );
            const original = mocks[source]();
            mocks[source].mockReturnValue({
                ...original,
                error: { status: 'error', error: refusal },
            });
            renderPanel(<AiArtifactPanel artifact={artifact} />);
            expect(
                screen.getByText(
                    'Connect your agent to your warehouse to run this.',
                ),
            ).toBeVisible();
            expect(
                screen.getByRole('button', { name: 'Connect agent' }),
            ).toBeEnabled();
            expect(
                screen.queryByText('Could not load the visualization.'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText(/not authorized to interact/),
            ).not.toBeInTheDocument();
        },
    );
});

describe('alternate artifact visualization identity recovery', () => {
    const error = {
        status: 'error' as const,
        error: new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN),
    };

    it('shows the connection prompt for an inline chart refusal', () => {
        mocks.query.mockReturnValue({ ...mocks.query(), error, isError: true });
        renderWithProviders(
            <AiChartVisualization
                {...artifact}
                artifactData={mocks.artifact().data}
                message={mocks.thread().data.messages[0]}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeVisible();
        expect(
            screen.queryByText(/Something went wrong/),
        ).not.toBeInTheDocument();
    });

    it('shows the connection prompt for a dashboard chart refusal', () => {
        mocks.query.mockReturnValue({ ...mocks.query(), error, isError: true });
        renderWithProviders(
            <AiDashboardVisualizationItem
                {...artifact}
                visualization={
                    { title: 'Monthly orders' } as ComponentProps<
                        typeof AiDashboardVisualizationItem
                    >['visualization']
                }
                message={mocks.thread().data.messages[0]}
                index={0}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeVisible();
    });

    it('shows the connection prompt for composer results instead of an error', () => {
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
        mocks.query.mockReturnValue(composerRun);
        mocks.rows.mockReturnValue({ ...statusResults, error });
        renderPanel(<AiArtifactPanel artifact={artifact} />);
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeVisible();
        expect(
            screen.queryByText('This result could not be loaded'),
        ).not.toBeInTheDocument();
    });
});

describe('inline artifact result routing', () => {
    it.each([
        { enabled: true, isLoading: false, isEmbed: false },
        { enabled: false, isLoading: false, isEmbed: false },
        { enabled: undefined, isLoading: true, isEmbed: false },
        { enabled: true, isLoading: false, isEmbed: true },
        { enabled: false, isLoading: false, isEmbed: true },
        { enabled: undefined, isLoading: true, isEmbed: true },
    ])(
        'routes every owner inline row consumer with identity=$enabled, loading=$isLoading, embed=$isEmbed',
        ({ enabled, isLoading, isEmbed }) => {
            mocks.isEmbedded.mockReturnValue(isEmbed);
            mocks.fastDecisions.mockImplementation((flag: FeatureFlags) =>
                flag === FeatureFlags.AgentIdentity
                    ? {
                          data: enabled === undefined ? undefined : { enabled },
                          isLoading,
                      }
                    : { data: { enabled: true }, isLoading: false },
            );
            renderWithProviders(
                <AiArtifactPanel artifact={artifact} variant="inline" />,
            );
            expect(screen.getByTestId('chart')).toBeInTheDocument();
            expect(mocks.rows).toHaveBeenCalled();
            for (const args of mocks.rows.mock.calls) {
                expect(args).toEqual([
                    'project',
                    isLoading && !isEmbed ? undefined : 'query',
                    undefined,
                    enabled && !isEmbed
                        ? '/projects/project/aiAgents/agent/artifacts/artifact/versions/version/query-results?queryUuid=query&cached=false'
                        : null,
                ]);
            }
        },
    );

    it.each([
        { enabled: true, isEmbed: false },
        { enabled: false, isEmbed: false },
        { enabled: true, isEmbed: true },
    ])(
        'fetches inline rows over HTTP after flag resolution with identity=$enabled, embed=$isEmbed',
        async ({ enabled, isEmbed }) => {
            const { useInfiniteQueryResults } = await vi.importActual<
                typeof QueryResultsHooks
            >('../../../../../hooks/useQueryResults');
            mocks.rows.mockImplementation(useInfiniteQueryResults);
            mocks.isEmbedded.mockReturnValue(isEmbed);
            mocks.fastDecisions.mockImplementation((flag: FeatureFlags) =>
                flag === FeatureFlags.AgentIdentity
                    ? { data: undefined, isLoading: true }
                    : { data: { enabled: true }, isLoading: false },
            );
            vi.mocked(lightdashApi).mockResolvedValue({
                queryUuid: 'query',
                status: QueryHistoryStatus.READY,
                rows: [],
                columns: {},
                page: 1,
                pageSize: 500,
                totalPageCount: 1,
                nextPage: undefined,
                previousPage: undefined,
                totalResults: 0,
                metadata: {
                    performance: {
                        initialQueryExecutionMs: 0,
                        resultsPageExecutionMs: 0,
                        queueTimeMs: null,
                    },
                    preAggregate: null,
                },
                pivotDetails: null,
            } satisfies ReadyQueryResultsPage);
            const queryClient = new QueryClient({
                defaultOptions: { queries: { retry: false } },
            });
            const panel = (
                <QueryClientProvider client={queryClient}>
                    <AiArtifactPanel artifact={artifact} variant="inline" />
                </QueryClientProvider>
            );
            const { rerender } = renderWithProviders(panel);
            if (isEmbed) {
                await waitFor(() => expect(lightdashApi).toHaveBeenCalled());
            } else {
                expect(lightdashApi).not.toHaveBeenCalled();
            }
            mocks.fastDecisions.mockImplementation((flag: FeatureFlags) => ({
                data: {
                    enabled:
                        flag === FeatureFlags.AgentIdentity ? enabled : true,
                },
                isLoading: false,
            }));
            rerender(
                <QueryClientProvider client={queryClient}>
                    <AiArtifactPanel artifact={artifact} variant="inline" />
                </QueryClientProvider>,
            );
            await waitFor(() => expect(lightdashApi).toHaveBeenCalled());
            for (const [request] of vi.mocked(lightdashApi).mock.calls) {
                expect(request).toMatchObject({
                    method: 'GET',
                    url:
                        enabled && !isEmbed
                            ? '/projects/project/aiAgents/agent/artifacts/artifact/versions/version/query-results?queryUuid=query&cached=false&page=1&pageSize=500'
                            : '/projects/project/query/query?page=1&pageSize=500',
                });
                if (!enabled || isEmbed) expect(request.version).toBe('v2');
            }
        },
    );

    it('starts scoped inline reads only after the identity flag resolves', () => {
        mocks.fastDecisions.mockImplementation((flag: FeatureFlags) =>
            flag === FeatureFlags.AgentIdentity
                ? { data: undefined, isLoading: true }
                : { data: { enabled: true }, isLoading: false },
        );
        const { rerender } = renderWithProviders(
            <AiArtifactPanel artifact={artifact} variant="inline" />,
        );
        expect(mocks.rows).toHaveBeenCalled();
        expect(
            mocks.rows.mock.calls.every((args) => args[1] === undefined),
        ).toBe(true);
        mocks.rows.mockClear();
        mocks.fastDecisions.mockReturnValue({
            data: { enabled: true },
            isLoading: false,
        });
        rerender(<AiArtifactPanel artifact={artifact} variant="inline" />);
        expect(mocks.rows).toHaveBeenCalled();
        for (const args of mocks.rows.mock.calls) {
            expect(args).toEqual([
                'project',
                'query',
                undefined,
                '/projects/project/aiAgents/agent/artifacts/artifact/versions/version/query-results?queryUuid=query&cached=false',
            ]);
        }
    });
});
