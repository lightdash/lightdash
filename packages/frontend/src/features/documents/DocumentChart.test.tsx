import {
    ChartType,
    MergeJoinType,
    type DocumentExploreChartContent,
    type DocumentSemanticChartContent,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import DocumentChart from './DocumentChart';
import { DocumentExportStatusContext } from './documentExportStatus';

const mocks = vi.hoisted(() => ({
    query: {
        error: undefined as unknown,
        data: {} as unknown,
        isFetching: false,
    },
    chartQuery: vi.fn(),
    canExplore: true,
    authoringEnabled: true,
    explore: vi.fn(),
    visualization: vi.fn(),
}));

vi.mock('./useCanManageSqlRunner', () => ({
    useCanManageSqlRunner: () => false,
}));
vi.mock('../../hooks/useContextMenuPermissions', () => ({
    useContextMenuPermissions: () => ({ canViewExplore: mocks.canExplore }),
}));
vi.mock('../../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => mocks.authoringEnabled,
}));
vi.mock('./DocumentChartExploreButton', () => ({
    default: (props: unknown) => {
        mocks.explore(props);
        return <button>Explore from here</button>;
    },
}));

vi.mock('./useDocument', () => ({
    useDocumentChartQuery: (...args: unknown[]) => {
        mocks.chartQuery(...args);
        return mocks.query;
    },
}));
vi.mock('../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: () => ({}),
}));
vi.mock('../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({}),
}));
vi.mock('../../hooks/useResizeObserver', () => ({
    useResizeObserver: () => [undefined, { width: 400, height: 300 }],
}));
vi.mock('../../components/MetricQueryData/MetricQueryDataProvider', () => ({
    default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock(
    '../../components/LightdashVisualization/VisualizationProvider',
    () => ({
        default: ({ children }: { children: ReactNode }) => children,
    }),
);
vi.mock('../../components/LightdashVisualization', () => ({
    default: (props: unknown) => {
        mocks.visualization(props);
        return <div>Visualization</div>;
    },
}));

type ChartFixture = { type: 'chart'; content: DocumentExploreChartContent };

const semanticCell: {
    type: 'chart';
    content: DocumentSemanticChartContent;
} = {
    type: 'chart',
    content: {
        source: 'semantic',
        chart: {
            name: 'Orders',
            description: 'Daily order volume',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [],
                metrics: [],
                filters: {},
                sorts: [],
                tableCalculations: [],
                limit: 100,
            },
            chartConfig: { type: ChartType.TABLE },
        },
    },
};

const renderChart = (cell: ChartFixture = semanticCell, showTitle = true) => {
    return render(
        <MantineProvider env="test">
            <DocumentChart
                showTitle={showTitle}
                projectUuid="project"
                spaceUuid="space"
                documentUuid="document"
                versionUuid="version"
                chartId="c2"
                content={cell.content}
            />
        </MantineProvider>,
    );
};

describe('Document chart titles', () => {
    beforeEach(() => {
        mocks.query.error = undefined;
        mocks.query.data = {};
        mocks.query.isFetching = false;
        mocks.chartQuery.mockClear();
        mocks.canExplore = true;
        mocks.authoringEnabled = true;
        mocks.explore.mockClear();
    });

    test('renders the chart title inside its frame while preserving the accessible figure name', () => {
        renderChart();
        const title = screen.getByText('Orders');
        const figure = screen.getByRole('figure', { name: 'Orders' });
        expect(figure.parentElement).toContainElement(title);
        expect(
            screen.getByRole('figure', { name: 'Orders' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Visualization')).toBeInTheDocument();
    });

    test('queries the chart id within its immutable document version', () => {
        renderChart();
        expect(mocks.chartQuery).toHaveBeenCalledWith(
            'project',
            'document',
            'version',
            'c2',
        );
    });

    test('does not repeat the editor cell title when the frame title is hidden', () => {
        renderChart(semanticCell, false);
        expect(screen.queryByText('Orders')).not.toBeInTheDocument();
        expect(screen.getByText('Daily order volume')).toBeInTheDocument();
        expect(
            screen.getByRole('figure', { name: 'Orders' }),
        ).toBeInTheDocument();
    });

    test('offers exploration when query context and Explore permission are available', () => {
        renderChart();
        expect(
            screen.getByRole('button', { name: 'Explore from here' }),
        ).toBeInTheDocument();
    });

    test('hands off the normalized runtime query and parameter values without changing the cell', () => {
        const metricQuery = {
            ...semanticCell.content.chart.metricQuery,
            limit: 50,
        };
        const usedParametersValues = { currency: 'GBP' };
        mocks.query.data = { metricQuery, usedParametersValues };
        const before = structuredClone(semanticCell);
        renderChart();
        expect(mocks.explore).toHaveBeenCalledWith({
            projectUuid: 'project',
            documentUuid: 'document',
            chart: {
                ...semanticCell.content.chart,
                metricQuery,
                parameters: usedParametersValues,
                tableConfig: { columnOrder: [] },
            },
        });
        expect(semanticCell).toEqual(before);
    });

    test('omits exploration for merge charts rather than dropping merge context', () => {
        renderChart({
            type: 'chart',
            content: {
                source: 'merge',
                chart: {
                    ...semanticCell.content.chart,
                    merge: {
                        primarySourceId: 'a',
                        sources: [{ id: 'a', kind: 'chart' }],
                        joinKey: [],
                        joinType: MergeJoinType.LEFT,
                        tableCalculations: [],
                    },
                },
            },
        });
        expect(
            screen.queryByRole('button', { name: 'Explore from here' }),
        ).not.toBeInTheDocument();
    });

    test('offers exploration for a custom chart type', () => {
        renderChart({
            type: 'chart',
            content: {
                source: 'semantic',
                chart: {
                    ...semanticCell.content.chart,
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: {
                            dataAppVizUuid: 'viz-1',
                            dataAppVizSlug: 'grouped-bars',
                            dataAppVizVersion: 2,
                            fieldMapping: { category: 'orders_status' },
                        },
                    },
                },
            },
        });
        expect(
            screen.getByRole('button', { name: 'Explore from here' }),
        ).toBeInTheDocument();
    });

    test.each(['permission', 'phone', 'loading', 'refreshing'])(
        'omits exploration without %s support',
        (restriction) => {
            mocks.canExplore = restriction !== 'permission';
            mocks.authoringEnabled = restriction !== 'phone';
            if (restriction === 'loading') {
                mocks.query.data = undefined;
            }
            mocks.query.isFetching = restriction === 'refreshing';
            renderChart();
            expect(
                screen.queryByRole('button', { name: 'Explore from here' }),
            ).not.toBeInTheDocument();
        },
    );

    test('retains framed query errors', () => {
        mocks.query.error = { error: { message: 'Query failed' } };
        renderChart();
        expect(
            screen.getByText(
                'The live data for this chart could not be loaded.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText('Visualization')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Explore from here' }),
        ).not.toBeInTheDocument();
    });

    test.each(['loading', 'error', 'success'])(
        'shows the title without the description in reading mode while %s',
        (state) => {
            if (state === 'loading') {
                mocks.query.data = undefined;
            }
            if (state === 'error') {
                mocks.query.error = { error: { message: 'Query failed' } };
            }
            renderChart();
            expect(screen.getAllByText('Orders')).toHaveLength(1);
            expect(
                screen.queryByText('Daily order volume'),
            ).not.toBeInTheDocument();
        },
    );

    test('does not advertise an unavailable Explore action for warehouse query limits', () => {
        mocks.query.error = {
            error: { message: 'Query exceeded resource limits' },
        };
        renderChart();
        expect(
            screen.getByText('This chart exceeds the warehouse query limit.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/Open it in Explore/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /retry/i }),
        ).not.toBeInTheDocument();
    });
});

describe('Document charts printed to PDF', () => {
    const exportStatus = { markReady: vi.fn(), markErrored: vi.fn() };
    const renderForExport = () =>
        render(
            <MantineProvider env="test">
                <DocumentExportStatusContext.Provider value={exportStatus}>
                    <DocumentChart
                        projectUuid="project"
                        spaceUuid="space"
                        documentUuid="document"
                        versionUuid="version"
                        chartId="c2"
                        content={semanticCell.content}
                    />
                </DocumentExportStatusContext.Provider>
            </MantineProvider>,
        );
    beforeEach(() => {
        mocks.query.error = undefined;
        mocks.query.data = {};
        mocks.visualization.mockClear();
        exportStatus.markReady.mockClear();
        exportStatus.markErrored.mockClear();
    });

    test('reports its chart once the visualization has drawn or failed', () => {
        renderForExport();
        const [props] = mocks.visualization.mock.lastCall as [
            { onScreenshotReady: () => void; onScreenshotError: () => void },
        ];
        props.onScreenshotReady();
        expect(exportStatus.markReady).toHaveBeenCalledExactlyOnceWith('c2');
        props.onScreenshotError();
        expect(exportStatus.markErrored).toHaveBeenCalledExactlyOnceWith('c2');
    });

    test('prints a failed query as an explicit error, without controls', () => {
        mocks.query.error = { error: { message: 'Query failed' } };
        renderForExport();
        expect(
            screen.getByText(
                'The live data for this chart could not be loaded.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Retry' }),
        ).not.toBeInTheDocument();
        expect(exportStatus.markErrored).toHaveBeenCalledWith('c2');
    });

    test('leaves out the Explore action', () => {
        renderForExport();
        expect(
            screen.queryByRole('button', { name: 'Explore from here' }),
        ).not.toBeInTheDocument();
    });
});
